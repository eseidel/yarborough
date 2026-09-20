// cspell:ignore deepcopy unhashable maxlen
// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/bidder.py: the bidding kernel.  The solver pool,
// the interpreted auction (History and its position and group views), the
// rule selector, the possible-call ordering, the bidder, the interpreter and
// its history cache.  Same classes, same methods in camelCase, same order of
// operations and the same solver searches (bounds and predicates), so the
// answers are the Python's answers.
//
// Two things the Python does implicitly are explicit here:
//
// - Solver release.  A Python History is a context manager: `with
//   interpreter.create_history(calls) as history:` returns the solvers of
//   the four positions' latest histories to the pool on exit.  Here that is
//   `history.release()`, and `Interpreter.withHistory(calls, fn)` (or
//   `withHistory(history, fn)`) runs `fn` and releases in a `finally`.  An
//   adapter that creates a History must release it the same way, or every
//   request borrows fresh solvers from the pool.
// - Printing.  The Python `print`s its warnings (a category tie that drops a
//   call, a collision, a call no rule can make) and its `explain` trace to
//   stdout, and the harness captures that text.  Here they go to a log sink
//   (`setBidderLog`); the default is `console.log`.
//
// `@memoized` in the Python is a per-instance cache; here each memoized
// member keeps its own field or Map on the instance, and `_solver` keeps the
// decorator's `take` semantics (`_takeSolver`: compute if needed, then forget).

import { assert } from "../core/assert";
import { Call, compareCalls, sortCalls } from "../core/call";
import { CallExplorer } from "../core/callexplorer";
import { CallHistory } from "../core/callhistory";
import type { Hand } from "../core/hand";
import { type Strain, SUITS } from "../core/suit";
import type { EnumValue } from "./enum";
import type {
  GroupView as GroupViewInterface,
  History as HistoryInterface,
  PositionView as PositionViewInterface,
} from "./history";
import * as model from "./model";
import { exprForSuit, isCertain, isPossible, positions } from "./model";
import { annotations, didBidAnnotation } from "./preconditions";
import { printedForm } from "./printed";
import type { Priority } from "./purposes";
import type { CompiledRule, PriorityOrdering } from "./rule_compiler";
import { type BiddingSystem, StandardAmericanYellowCard } from "./sayc";
import { type Expr, type Solver, z3 } from "./z3";

// --- the log sink ---------------------------------------------------------

/** Where the kernel's `print` lines go (one call per line, no newline). */
export type BidderLog = (line: string) => void;

const defaultBidderLog: BidderLog = (line) => console.log(line);
let bidderLog: BidderLog = defaultBidderLog;

/**
 * Redirects the kernel's `print` lines (WARNING, COLLISION and the `explain`
 * trace) to `sink`, or back to `console.log` for null.  Returns the previous
 * sink so a caller can restore it.
 */
export function setBidderLog(sink: BidderLog | null): BidderLog {
  const previous = bidderLog;
  bidderLog = sink ?? defaultBidderLog;
  return previous;
}

/** Python's `print`, to the sink. */
function pyPrint(line: string): void {
  bidderLog(line);
}

/** Python's `str(list_of_str)`: `['1H', '2C']`. */
function pyStrList(values: readonly string[]): string {
  return `[${values.map((value) => `'${value}'`).join(", ")}]`;
}

/** Python's `str(list)` of objects whose repr is `x.repr()`: `[A, B]`. */
function pyReprList(values: readonly { repr(): string }[]): string {
  return `[${values.map((value) => value.repr()).join(", ")}]`;
}

/** Python's `str(tuple)` of the same: `(A, B)`, and `(A,)` for one. */
function pyReprTuple(values: readonly { repr(): string }[]): string {
  const inner = values.map((value) => value.repr()).join(", ");
  return values.length === 1 ? `(${inner},)` : `(${inner})`;
}

/** Python's `%` on a possibly negative number. */
function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

// --- the solver pool -------------------------------------------------------

/** The constraints one call adds: one expression, or a list (empty at the root). */
export type HistoryConstraints = Expr | readonly Expr[];

function addConstraints(solver: Solver, constraints: HistoryConstraints): void {
  if (Array.isArray(constraints)) {
    solver.add(...(constraints as readonly Expr[]));
  } else {
    solver.add(constraints as Expr);
  }
}

export class SolverPool {
  private readonly _pool: Solver[] = [];

  private _ensureSolver(): void {
    if (this._pool.length) {
      return;
    }
    const solver = z3.SolverFor("QF_LIA");
    solver.add(model.axioms);
    this._pool.push(solver);
  }

  restore(solver: Solver): void {
    solver.pop();
    this._pool.push(solver);
  }

  borrow(): Solver {
    this._ensureSolver();
    const solver = this._pool.pop()!;
    solver.push();
    return solver;
  }

  // This cannot be memoized, or we would leak a solver on every call if
  // the caller fails to restore it, or worse, corrupt the solver if they do.
  borrowSolverForHand(hand: Hand): Solver {
    const solver = this.borrow();
    solver.add(model.exprForHand(hand));
    return solver;
  }

  /** How many solvers are idle in the pool (for tests of the release protocol). */
  get idle(): number {
    return this._pool.length;
  }
}

export const _solverPool = new SolverPool();

// Intra-bid priorities, first phase, "interpretation priorities", like "natural, conventional" (possibly should be called types?) These select which "1N" meaning is correct.
// Inter-bid priorities, "which do you look at first" -- these order preference between "1H, vs. 1S"
// Tie-breaker-priorities -- planner stage, when 2 bids match which we make.

// --- the views ---------------------------------------------------------------

export class GroupView implements GroupViewInterface {
  readonly history: History;
  readonly positions: readonly EnumValue[];

  constructor(history: History, positions: readonly EnumValue[]) {
    this.history = history;
    this.positions = positions;
  }

  get annotations(): readonly EnumValue[] {
    return this.positions.flatMap((position) =>
      this.history.annotationsForPosition(position),
    );
  }

  // Lists in suit order, not sets: constraints iterate them into z3 expressions.
  get unbidSuits(): readonly Strain[] {
    const bidSuits = this.bidSuits;
    return SUITS.filter((suit) => !bidSuits.includes(suit));
  }

  get bidSuits(): readonly Strain[] {
    return SUITS.filter((suit) =>
      this.positions.some((position) => this.history.isBidSuit(suit, position)),
    );
  }

  get minPoints(): number {
    let total = 0;
    for (const position of this.positions) {
      total += this.history.minPointsForPosition(position);
    }
    return total;
  }
}

export class PositionView implements PositionViewInterface {
  readonly history: History;
  readonly position: EnumValue;

  constructor(history: History, position: EnumValue) {
    this.history = history;
    this.position = position;
  }

  get walk(): Iterable<PositionView> {
    const position = this.position;
    let history: History | null = this.history;
    return {
      *[Symbol.iterator]() {
        while (history) {
          yield new PositionView(history, position);
          history = history._fourCallsAgo;
        }
      },
    };
  }

  get annotations(): readonly EnumValue[] {
    return this.history.annotationsForPosition(this.position);
  }

  get lastCall(): Call | null {
    return this.history.lastCallForPosition(this.position);
  }

  // FIXME: We could hang annotations off of the Call object, but currently
  // Call is from the old system.
  get annotationsForLastCall(): readonly EnumValue[] {
    return this.history.annotationsForLastCall(this.position);
  }

  get ruleForLastCall(): CompiledRule | null {
    return this.history.ruleForLastCall(this.position);
  }

  get minPoints(): number {
    return this.history.minPointsForPosition(this.position);
  }

  get maxPoints(): number {
    return this.history.maxPointsForPosition(this.position);
  }

  couldHaveMorePointsThan(points: number): boolean {
    return this.history.couldHaveMorePointsThan(this.position, points);
  }

  minLength(suit: Strain): number {
    return this.history.minLengthForPosition(this.position, suit);
  }

  maxLength(suit: Strain): number {
    return this.history.maxLengthForPosition(this.position, suit);
  }

  get isBalanced(): boolean {
    return this.history.isBalancedForPosition(this.position);
  }

  // Lists in suit order, not sets: constraints iterate them into z3 expressions.
  get unbidSuits(): readonly Strain[] {
    const bidSuits = this.bidSuits;
    return SUITS.filter((suit) => !bidSuits.includes(suit));
  }

  get bidSuits(): readonly Strain[] {
    return SUITS.filter((suit) => this.history.isBidSuit(suit, this.position));
  }
}

// --- History -------------------------------------------------------------------

export interface HistoryOptions {
  previousHistory?: History | null;
  call?: Call | null;
  annotations?: Iterable<EnumValue> | null;
  constraints?: HistoryConstraints | null;
  rule?: CompiledRule | null;
  callHistory?: CallHistory | null;
}

// This class is immutable.
export class History implements HistoryInterface {
  // FIXME: Unclear if Rule should be stored on History at all.
  // call_history: for a root History, an EMPTY CallHistory carrying the dealer and
  // vulnerability of the auction being interpreted (defaults to North, none vulnerable).
  readonly _previousHistory: History | null;
  readonly _annotationsForLastCall: readonly EnumValue[];
  readonly _constraintsForLastCall: HistoryConstraints;
  readonly _ruleForLastCall: CompiledRule | null;
  readonly callHistory: CallHistory;

  // The per-instance caches of the Python's @memoized members.
  private _legalCalls: ReadonlySet<Call> | undefined;
  private readonly _historyAfterLastCallForCache = new Map<
    number,
    History | null
  >();
  private _solverCache: Solver | undefined;
  private readonly _minLengthCache = new Map<number, number>();
  private readonly _maxLengthCache = new Map<number, number>();
  private _isBalancedCache: boolean | undefined;
  private _minPointsCache: number | undefined;
  private _maxPointsCache: number | undefined;
  private readonly _morePointsThanCache = new Map<number, boolean>();
  private readonly _isBidSuitCache = new Map<string, boolean>();
  private readonly _isUnbidSuitCache = new Map<number, boolean>();

  constructor(options: HistoryOptions = {}) {
    const {
      previousHistory = null,
      call = null,
      annotations = null,
      constraints = null,
      rule = null,
      callHistory = null,
    } = options;
    this._previousHistory = previousHistory;
    const annotationList = annotations ? [...annotations] : [];
    this._annotationsForLastCall = annotationList;
    this._constraintsForLastCall = constraints !== null ? constraints : [];
    this._ruleForLastCall = rule;
    if (this._previousHistory) {
      this.callHistory = History._copyCallHistory(
        this._previousHistory.callHistory,
      );
    } else if (callHistory !== null) {
      assert(
        callHistory.calls.length === 0,
        "a root History starts with an empty CallHistory",
      );
      this.callHistory = History._copyCallHistory(callHistory);
    } else {
      this.callHistory = new CallHistory();
    }
    if (call) {
      this.callHistory.calls.push(call);
    }
  }

  static _copyCallHistory(callHistory: CallHistory): CallHistory {
    // Not deepcopy: that would clone the Position/Call singletons (dealer identity breaks).
    return new CallHistory(
      [...callHistory.calls],
      callHistory.dealer,
      callHistory.vulnerability,
    );
  }

  extendWith(
    call: Call,
    annotations: Iterable<EnumValue>,
    constraints: HistoryConstraints,
    rule: CompiledRule | null,
  ): History {
    return new History({
      previousHistory: this,
      call,
      annotations,
      constraints,
      rule,
    });
  }

  get legalCalls(): ReadonlySet<Call> {
    this._legalCalls ??= new Set(
      new CallExplorer().possibleCallsOver(this.callHistory),
    );
    return this._legalCalls;
  }

  _previousPosition(position: EnumValue): EnumValue {
    return positions.at(mod(position.index - 1, 4));
  }

  _historyAfterLastCallFor(position: EnumValue): History | null {
    const cached = this._historyAfterLastCallForCache.get(position.index);
    if (cached !== undefined) {
      return cached;
    }
    if (position.index === positions.RHO.index) {
      this._historyAfterLastCallForCache.set(position.index, this);
      return this;
    }
    let result: History | null = null;
    if (this._previousHistory) {
      result = this._previousHistory._historyAfterLastCallFor(
        this._previousPosition(position),
      );
    }
    this._historyAfterLastCallForCache.set(position.index, result);
    return result;
  }

  /**
   * Python's `__exit__`: returns the solver of each position's latest
   * history to the pool (computing one first where none was needed, as the
   * Python's `take` does).  Call it once the History is no longer queried;
   * `withHistory` does it in a `finally`.
   */
  release(): void {
    for (const position of positions) {
      const previousHistory = this._historyAfterLastCallFor(position);
      if (!previousHistory) {
        continue;
      }
      _solverPool.restore(previousHistory._takeSolver());
    }
  }

  /**
   * Returns the solver this history alone holds, if it borrowed one, without
   * touching the ancestors that `release` walks.
   *
   * A branch history -- one an adapter extends off an interpreted auction to
   * read what a call would mean, and then drops -- cannot be `release`d: the
   * three other positions' latest histories are the ancestors the auction it
   * branched from still owns, and would be restored twice.  The Python drops
   * the branch on the floor and its garbage collector frees the solver; here
   * the pool has to be told, or a request that interprets thirty calls leaks
   * thirty solvers into the wasm heap.
   */
  releaseBranch(): void {
    if (this._solverCache === undefined) {
      return;
    }
    _solverPool.restore(this._takeSolver());
  }

  /** `@memoized _solver`: the solver holding this position's constraints so far. */
  _solver(): Solver {
    if (this._solverCache === undefined) {
      const previousHistory = this._fourCallsAgo;
      const solver = previousHistory
        ? previousHistory._takeSolver()
        : _solverPool.borrow();
      addConstraints(solver, this._constraintsForLastCall);
      this._solverCache = solver;
    }
    return this._solverCache;
  }

  /** `_solver.take()`: the memoized solver, forgotten by this history. */
  _takeSolver(): Solver {
    const solver = this._solver();
    this._solverCache = undefined;
    return solver;
  }

  get _fourCallsAgo(): History | null {
    const history =
      this._previousHistory &&
      this._previousHistory._previousHistory &&
      this._previousHistory._previousHistory._previousHistory &&
      this._previousHistory._previousHistory._previousHistory._previousHistory;
    if (!history) {
      return null;
    }
    return history;
  }

  *_walkHistoryFor(position: EnumValue): Generator<History> {
    let history = this._historyAfterLastCallFor(position);
    while (history) {
      yield history;
      history = history._fourCallsAgo;
    }
  }

  *_walkAnnotationsFor(position: EnumValue): Generator<readonly EnumValue[]> {
    for (const history of this._walkHistoryFor(position)) {
      yield history._annotationsForLastCall;
    }
  }

  /**
   * The annotations of every call so far, in auction order (an empty list for a call the
   * interpreter could not explain).
   */
  annotationsByCall(): EnumValue[][] {
    const result: EnumValue[][] = [];
    for (const history of this._walkHistory()) {
      if (history._previousHistory !== null) {
        result.push([...history._annotationsForLastCall]);
      }
    }
    result.reverse();
    return result;
  }

  annotationsForLastCall(position: EnumValue): readonly EnumValue[] {
    const history = this._historyAfterLastCallFor(position);
    if (!history) {
      return [];
    }
    return history._annotationsForLastCall;
  }

  lastCallForPosition(position: EnumValue): Call | null {
    const history = this._historyAfterLastCallFor(position);
    if (!history) {
      return null;
    }
    return history.callHistory.lastCall;
  }

  ruleForLastCall(position: EnumValue): CompiledRule | null {
    const history = this._historyAfterLastCallFor(position);
    if (!history) {
      return null;
    }
    return history._ruleForLastCall;
  }

  constraintsForLastCall(position: EnumValue): HistoryConstraints | null {
    const history = this._historyAfterLastCallFor(position);
    if (!history) {
      return null;
    }
    return history._constraintsForLastCall;
  }

  annotationsForPosition(position: EnumValue): readonly EnumValue[] {
    return [...this._walkAnnotationsFor(position)].flat();
  }

  *_walkHistory(): Generator<History> {
    yield this;
    if (this._previousHistory) {
      yield* this._previousHistory._walkHistory();
    }
  }

  *_walkAnnotations(): Generator<readonly EnumValue[]> {
    for (const history of this._walkHistory()) {
      yield history._annotationsForLastCall;
    }
  }

  get annotations(): readonly EnumValue[] {
    return [...this._walkAnnotations()].flat();
  }

  isConsistent(position: EnumValue, constraints: Expr | null = null): boolean {
    const expr = constraints !== null ? constraints : z3.BoolVal(true);
    const history = this._historyAfterLastCallFor(position);
    if (!history) {
      const solver = _solverPool.borrow();
      const result = isPossible(solver, expr);
      _solverPool.restore(solver);
      return result;
    }
    return history._solveForConsistency(expr);
  }

  // can't memoize due to unhashable parameter
  _solveForConsistency(constraints: Expr): boolean {
    return isPossible(this._solver(), constraints);
  }

  _solveForMinLength(suit: Strain): number {
    const cached = this._minLengthCache.get(suit.index);
    if (cached !== undefined) {
      return cached;
    }
    const solver = this._solver();
    const suitExpr = exprForSuit(suit);
    let result = 0;
    for (let length = 0; length < 13; length++) {
      if (isPossible(solver, suitExpr.eq(length))) {
        result = length;
        break;
      }
    }
    this._minLengthCache.set(suit.index, result);
    return result;
  }

  minLengthForPosition(position: EnumValue, suit: Strain): number {
    const history = this._historyAfterLastCallFor(position);
    if (history) {
      return history._solveForMinLength(suit);
    }
    return 0;
  }

  _solveForMaxLength(suit: Strain): number {
    const cached = this._maxLengthCache.get(suit.index);
    if (cached !== undefined) {
      return cached;
    }
    const solver = this._solver();
    const suitExpr = exprForSuit(suit);
    let result = 0;
    for (let length = 13; length > 0; length--) {
      if (isPossible(solver, suitExpr.eq(length))) {
        result = length;
        break;
      }
    }
    this._maxLengthCache.set(suit.index, result);
    return result;
  }

  maxLengthForPosition(position: EnumValue, suit: Strain): number {
    const history = this._historyAfterLastCallFor(position);
    if (history) {
      return history._solveForMaxLength(suit);
    }
    return 13;
  }

  _solveForIsBalanced(): boolean {
    this._isBalancedCache ??= isCertain(this._solver(), model.balanced);
    return this._isBalancedCache;
  }

  isBalancedForPosition(position: EnumValue): boolean {
    const history = this._historyAfterLastCallFor(position);
    if (history) {
      return history._solveForIsBalanced();
    }
    return false;
  }

  _lowerBound(
    predicate: (value: number) => boolean,
    lo: number,
    hi: number,
  ): number {
    if (lo === hi) {
      return hi;
    }
    assert(lo < hi);
    const pos = Math.floor((lo + hi) / 2);
    if (predicate(pos)) {
      return this._lowerBound(predicate, lo, pos);
    }
    return this._lowerBound(predicate, pos + 1, hi);
  }

  /** Which of us (Me or Partner) bid `strain` naturally first, or null. */
  firstNaturalBidder(strain: Strain): EnumValue | null {
    let first: EnumValue | null = null;
    let firstLength: number | null = null;
    for (const position of [positions.Me, positions.Partner]) {
      for (const history of this._walkHistoryFor(position)) {
        const call = history.callHistory.lastCall;
        if (call === null) {
          continue;
        }
        const natural =
          (call.isContract() &&
            call.strain === strain &&
            !history._annotationsForLastCall.includes(
              annotations.Artificial,
            )) ||
          history._supportedSuit() === strain;
        if (!natural) {
          continue;
        }
        const length = history.callHistory.calls.length;
        if (firstLength === null || length < firstLength) {
          first = position;
          firstLength = length;
        }
      }
    }
    return first;
  }

  /**
   * Has `position` agreed `strain`: a natural (non-Artificial) contract call in it, or a
   * call annotated SupportsPartnersSuit while partner's last suit was `strain`?
   */
  bidSuitNaturally(strain: Strain, position: EnumValue): boolean {
    for (const history of this._walkHistoryFor(position)) {
      const call = history.callHistory.lastCall;
      if (call === null) {
        continue;
      }
      if (
        call.isContract() &&
        call.strain === strain &&
        !history._annotationsForLastCall.includes(annotations.Artificial)
      ) {
        return true;
      }
      if (history._supportedSuit() === strain) {
        return true;
      }
    }
    return false;
  }

  /** The suit the last call agreed by annotation (SupportsPartnersSuit), else null. */
  _supportedSuit(): Strain | null {
    if (
      !this._annotationsForLastCall.includes(annotations.SupportsPartnersSuit)
    ) {
      return null;
    }
    const partnersCall = this.lastCallForPosition(positions.LHO); // the caller's partner
    if (
      partnersCall !== null &&
      partnersCall.isContract() &&
      SUITS.includes(partnersCall.strain!)
    ) {
      return partnersCall.strain;
    }
    return null;
  }

  /**
   * The value of the last caller's hand for what partner will bid on.  Before a fit is
   * known that is hcp plus length points; a natural bid of a suit partner has bid naturally
   * agrees it, and the hand is revalued in support points for that suit instead (the
   * booklet: do not count both long-suit points and support points in the same hand).
   */
  get _pointsShownByLastCall(): Expr {
    const call = this.callHistory.lastCall; // made by RHO, whose partner is LHO
    const supported = this._supportedSuit();
    if (supported !== null) {
      return model.supportPointsExprForSuit(supported);
    }
    if (
      call !== null &&
      call.isContract() &&
      SUITS.includes(call.strain!) &&
      !this._annotationsForLastCall.includes(annotations.Artificial) &&
      this.bidSuitNaturally(call.strain!, positions.LHO)
    ) {
      return model.supportPointsExprForSuit(call.strain!);
    }
    return model.playingPoints;
  }

  _solveForMinPoints(): number {
    if (this._minPointsCache !== undefined) {
      return this._minPointsCache;
    }
    const solver = this._solver();
    const pointsExpr = this._pointsShownByLastCall;
    // "<=" keeps the predicate monotone for the binary search: a hand with exactly N
    // points may be impossible while N-1 and N+1 are not.
    const predicate = (points: number) =>
      isPossible(solver, pointsExpr.le(points));
    let result: number;
    if (predicate(0)) {
      result = 0;
    } else {
      result = this._lowerBound(predicate, 1, 60);
    }
    this._minPointsCache = result;
    return result;
  }

  minPointsForPosition(position: EnumValue): number {
    const history = this._historyAfterLastCallFor(position);
    if (history) {
      return history._solveForMinPoints();
    }
    return 0;
  }

  _solveForMaxPoints(): number {
    if (this._maxPointsCache !== undefined) {
      return this._maxPointsCache;
    }
    // High-card points: the ceilings (MaximumCombinedPoints, the "game is remote" passes)
    // are written in hcp, while min_points is the total the hand has shown.
    const solver = this._solver();
    let result = 0;
    for (let cap = 37; cap > 0; cap--) {
      if (isPossible(solver, model.points.eq(cap))) {
        result = cap;
        break;
      }
    }
    this._maxPointsCache = result;
    return result;
  }

  maxPointsForPosition(position: EnumValue): number {
    const history = this._historyAfterLastCallFor(position);
    if (history) {
      return history._solveForMaxPoints();
    }
    return 37;
  }

  _solveForMorePointsThan(points: number): boolean {
    const cached = this._morePointsThanCache.get(points);
    if (cached !== undefined) {
      return cached;
    }
    const result = isPossible(this._solver(), model.points.ge(points));
    this._morePointsThanCache.set(points, result);
    return result;
  }

  couldHaveMorePointsThan(position: EnumValue, points: number): boolean {
    const history = this._historyAfterLastCallFor(position);
    if (history) {
      return history._solveForMorePointsThan(points);
    }
    return true;
  }

  /**
   * The history right after this position's most recent bid of a contract, skipping
   * its passes, doubles and redoubles (null when it has never bid a contract).
   */
  _historyAfterLastContractCallFor(position: EnumValue): History | null {
    let history = this._historyAfterLastCallFor(position);
    while (history) {
      const lastCall = history.callHistory.lastCall;
      if (lastCall && lastCall.isContract()) {
        return history;
      }
      // The same player's previous call is four calls back.
      for (let step = 0; step < 4; step++) {
        history = history ? history._previousHistory : null;
      }
    }
    return null;
  }

  _hasShownSuit(
    suit: Strain,
    position: EnumValue,
    contractsOnly: boolean,
  ): boolean {
    // Look for the annotation of bidding a suit.
    if (
      this.annotationsForPosition(position).includes(didBidAnnotation(suit))
    ) {
      return true;
    }
    const previousHistory = contractsOnly
      ? this._historyAfterLastContractCallFor(position)
      : this._historyAfterLastCallFor(position);
    if (!previousHistory) {
      return false;
    }
    // Check for the a length of 4 or more.
    return isCertain(previousHistory._solver(), exprForSuit(suit).ge(4));
  }

  isBidSuit(suit: Strain, position: EnumValue): boolean {
    const key = `${suit.index}:${position.index}`;
    const cached = this._isBidSuitCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const result = this._hasShownSuit(suit, position, false);
    this._isBidSuitCache.set(key, result);
    return result;
  }

  isUnbidSuit(suit: Strain): boolean {
    const cached = this._isUnbidSuitCache.get(suit.index);
    if (cached !== undefined) {
      return cached;
    }
    // A suit our side has shown, by bidding it or by a double that promises it (partner's
    // negative double shows the unbid major: we raise it, we do not "bid" it), is not
    // unbid.  A suit an opponent has only promised with a double is still unbid for us:
    // after 1C P 1D X opener may bid 1H or 1S (the double promised both majors, and
    // before this opener could only rebid 1N).
    const result = !positions.values.some((position) =>
      this._hasShownSuit(
        suit,
        position,
        position === positions.LHO || position === positions.RHO,
      ),
    );
    this._isUnbidSuitCache.set(suit.index, result);
    return result;
  }

  get unbidSuits(): readonly Strain[] {
    return SUITS.filter((suit) => this.isUnbidSuit(suit));
  }

  get lastContract(): Call | null {
    return this.callHistory.lastContract();
  }

  get rho(): PositionView {
    return new PositionView(this, positions.RHO);
  }

  get me(): PositionView {
    return new PositionView(this, positions.Me);
  }

  get partner(): PositionView {
    return new PositionView(this, positions.Partner);
  }

  get lho(): PositionView {
    return new PositionView(this, positions.LHO);
  }

  get us(): GroupView {
    return new GroupView(this, [positions.Me, positions.Partner]);
  }

  get them(): GroupView {
    return new GroupView(this, [positions.LHO, positions.RHO]);
  }

  get everyone(): GroupView {
    return new GroupView(this, positions.values);
  }

  viewFor(position: EnumValue): PositionView {
    return new PositionView(this, position);
  }
}

/**
 * Python's `with history: ...`: runs `fn` and releases the history's solvers
 * afterwards, whether or not `fn` threw.
 */
export function withHistory<T>(
  history: History,
  fn: (history: History) => T,
): T {
  try {
    return fn(history);
  } finally {
    history.release();
  }
}

// --- PossibleCalls ---------------------------------------------------------------

export type CallAndPriority = [Call, Priority];

export class PossibleCalls {
  readonly ordering: PriorityOrdering;
  readonly _callsAndPriorities: CallAndPriority[] = [];

  constructor(ordering: PriorityOrdering) {
    this.ordering = ordering;
  }

  addCallWithPriority(call: Call, priority: Priority): void {
    this._callsAndPriorities.push([call, priority]);
  }

  _isDominated(
    priority: Priority,
    maximalCallsAndPriorities: readonly CallAndPriority[],
  ): boolean {
    // First check to see if any existing call is larger than this one.
    for (const [, maxPriority] of maximalCallsAndPriorities) {
      if (this.ordering.lt(priority, maxPriority)) {
        return true;
      }
    }
    return false;
  }

  priorityForCall(call: Call): Priority {
    // FIXME: There must be a nicer way to do this.
    return this._callsAndPriorities.filter((pair) =>
      pair[0].equals(call),
    )[0][1];
  }

  maximalCallsAndPriorities(): CallAndPriority[] {
    let maximalCallsAndPriorities: CallAndPriority[] = [];
    // The ordering is not transitive (a strain of None compares with neither strain, and
    // only a deeper fallback or one rule's own key orders equal strains), so the maximal
    // set depends on the order the calls are visited: always Call order, each call's
    // variants in the order meaning_of yields them (the sort is stable).
    const sorted = [...this._callsAndPriorities].sort((a, b) =>
      compareCalls(a[0], b[0]),
    );
    for (const [call, priority] of sorted) {
      if (this._isDominated(priority, maximalCallsAndPriorities)) {
        continue;
      }
      maximalCallsAndPriorities = maximalCallsAndPriorities.filter(
        (maxCallMaxPriority) =>
          !this.ordering.lt(maxCallMaxPriority[1], priority),
      );
      maximalCallsAndPriorities.push([call, priority]);
    }
    // Two variants of one call never tie: the call is the same whichever variant fits.
    const firstByCall: CallAndPriority[] = [];
    for (const pair of maximalCallsAndPriorities) {
      if (firstByCall.every((seen) => !pair[0].equals(seen[0]))) {
        firstByCall.push(pair);
      }
    }
    return firstByCall;
  }
}

// --- CallSelection and Bidder ---------------------------------------------------

/** `(calls, rules, priorities)` when the choice was not ordered. */
export type Collision = readonly [
  readonly Call[],
  readonly CompiledRule[],
  readonly Priority[],
];

// CallSelection exposes similar information to a History object, but not connected in a History chain.
// It also comes from the *bidding* process and thus can contain more information (since it had access to the hand).
export class CallSelection {
  readonly call: Call;
  readonly ruleSelector: RuleSelector;
  readonly collision: Collision | null;

  constructor(
    call: Call,
    ruleSelector: RuleSelector,
    collision: Collision | null = null,
  ) {
    this.call = call;
    this.ruleSelector = ruleSelector;
    this.collision = collision; // (calls, rules, priorities) when the choice was not ordered
  }

  get rule(): CompiledRule | null {
    return this.ruleSelector.ruleForCall(this.call);
  }
}

/** The key `_production_order` gives a call: a bid, then a double or redouble, then a pass. */
export function _productionOrder(call: Call): [number, Call] {
  return [
    call.isContract() ? 0 : call.isDouble() || call.isRedouble() ? 1 : 2,
    call,
  ];
}

/** Python's comparison of two `_production_order` tuples. */
export function compareProductionOrder(a: Call, b: Call): number {
  const [rankA, callA] = _productionOrder(a);
  const [rankB, callB] = _productionOrder(b);
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return compareCalls(callA, callB);
}

/** Python's `min(calls, key=_production_order)`: the first of the least. */
function minByProductionOrder(calls: readonly Call[]): Call {
  let best = calls[0];
  for (const call of calls.slice(1)) {
    if (compareProductionOrder(call, best) < 0) {
      best = call;
    }
  }
  return best;
}

export class Bidder {
  readonly system: BiddingSystem;

  constructor() {
    // Assuming SAYC for all sides.
    this.system = StandardAmericanYellowCard;
  }

  callSelectionFor(
    hand: Hand,
    callHistory: CallHistory,
    expectedCall: Call | null = null,
  ): CallSelection | null {
    return new Interpreter().withHistory(callHistory, (history) => {
      // Select highest-intra-bid-priority (category) rules for all possible bids
      const ruleSelector = new RuleSelector(this.system, history, expectedCall);

      // Compute inter-bid priorities (priority) for each using the hand.
      const possibleCalls = ruleSelector.possibleCallsForHand(
        hand,
        expectedCall,
      );
      let maximalCallsAndPriorities = possibleCalls.maximalCallsAndPriorities();
      // We don't currently support tie-breaking priorities, but we do have some bids that
      // we don't make without a planner.
      const noPlanningFilter = (callPriorityTuple: CallAndPriority) =>
        !ruleSelector.ruleForCall(callPriorityTuple[0])!.requiresPlanning;
      // Sorted by call name so the WARNING below reads the same on every Python
      // (set order of the maximal calls depends on the string hash, which changed
      // between versions); with one call the order is moot.
      maximalCallsAndPriorities = maximalCallsAndPriorities
        .filter(noPlanningFilter)
        .sort((a, b) =>
          a[0].name < b[0].name ? -1 : a[0].name > b[0].name ? 1 : 0,
        );
      if (!maximalCallsAndPriorities.length) {
        return null; // If we failed to find any call, this is an error.
      }
      let maximalCalls = maximalCallsAndPriorities.map((pair) => pair[0]);
      const maximalPriorities = maximalCallsAndPriorities.map(
        (pair) => pair[1],
      );
      let collision: Collision | null = null;
      if (maximalCalls.length !== 1) {
        // A collision: two rules of one purpose both fit and nothing orders them.  That
        // is a defect in the rules (their meanings should not both admit this hand);
        // the choice here is deterministic and logged, never a semantics partner can
        // read.  A bid before a double before a pass, the cheapest first.
        const rules = maximalCalls.map(
          (call) => ruleSelector.ruleForCall(call)!,
        );
        collision = [[...maximalCalls], rules, [...maximalPriorities]];
        pyPrint(
          `COLLISION: calls ${pyStrList(maximalCalls.map((call) => call.name))} rules ${pyReprList(rules)} priorities ${pyReprTuple(maximalPriorities)}`,
        );
        maximalCalls = [minByProductionOrder(maximalCalls)];
      }

      const call = maximalCalls[0];
      return new CallSelection(call, ruleSelector, collision);
    });
  }

  findCallFor(
    hand: Hand,
    callHistory: CallHistory,
    expectedCall: Call | null = null,
  ): Call | null {
    const callSelection = this.callSelectionFor(
      hand,
      callHistory,
      expectedCall,
    );
    if (!callSelection) {
      return null;
    }
    return callSelection.call;
  }
}

// --- RuleSelector ---------------------------------------------------------------

/** A call several rules claimed at the best category: none of them owns it. */
export interface DroppedCall {
  readonly call: Call;
  readonly category: EnumValue;
  readonly rules: readonly CompiledRule[];
}

export class RuleSelector {
  readonly system: BiddingSystem;
  readonly history: HistoryInterface;
  readonly explain: boolean;
  readonly expectedCall: Call | null;

  private _callToRuleCache: Map<Call, CompiledRule> | undefined;
  private _droppedCalls: DroppedCall[] = [];
  private readonly _constraintsForCallCache = new Map<Call, Expr>();

  constructor(
    system: BiddingSystem,
    history: HistoryInterface,
    expectedCall: Call | null = null,
    explain = false,
  ) {
    this.system = system;
    assert(system.rules.length);
    this.history = history;
    this.explain = explain;
    this.expectedCall = expectedCall;
    this._checkForMissingRule();
  }

  _checkForMissingRule(): void {
    if (!this.expectedCall) {
      return;
    }
    if (this.ruleForCall(this.expectedCall)) {
      return;
    }
    pyPrint(`WARNING: No rule can make: ${this.expectedCall.name}`);
  }

  /** The rule of the best category for each legal call, in Call order. */
  get _callToRule(): ReadonlyMap<Call, CompiledRule> {
    if (this._callToRuleCache !== undefined) {
      return this._callToRuleCache;
    }
    const maximal = new Map<Call, [EnumValue, CompiledRule[]]>();
    for (const rule of this.system.rules) {
      for (const [category, call] of rule.callsOver(
        this.history,
        this.expectedCall,
      )) {
        if (!this.history.callHistory.isLegalCall(call)) {
          continue;
        }

        const current = maximal.get(call);
        if (!current) {
          maximal.set(call, [category, [rule]]);
        } else {
          const [existingCategory, existingRules] = current;

          // FIXME: It's lame that enum's < is backwards.
          if (category.lt(existingCategory)) {
            if (this.explain && call.equals(this.expectedCall)) {
              pyPrint(
                `${rule.name} is higher category than (${existingCategory.repr()}, ${pyReprList(existingRules)})`,
              );
            }
            maximal.set(call, [category, [rule]]);
          } else if (category === existingCategory) {
            existingRules.push(rule);
          }
        }
      }
    }

    const result = new Map<Call, CompiledRule>();
    const dropped: DroppedCall[] = [];
    // Call order: constraints_for_call negates the other calls in this order, so the
    // meaning of a call must not depend on which rule happened to claim a call first.
    for (const call of sortCalls([...maximal.keys()])) {
      const [category, rules] = maximal.get(call)!;
      if (rules.length > 1) {
        pyPrint(
          `WARNING: Multiple rules have maximal category (${category.repr()}) for ${call.name}: ${pyReprList(rules)} over: ${this.history.callHistory.callsString()}`,
        );
        dropped.push({ call, category, rules });
      } else {
        result.set(call, rules[0]);
      }
    }
    this._droppedCalls = dropped;
    this._callToRuleCache = result;
    return result;
  }

  /**
   * The calls `_call_to_rule` left without a rule because several rules tied
   * at the best category.
   */
  get droppedCalls(): readonly DroppedCall[] {
    void this._callToRule;
    return this._droppedCalls;
  }

  ruleForCall(call: Call): CompiledRule | null {
    // The map is keyed by the Call singletons; `new Pass()` is equal but not identical.
    return this._callToRule.get(Call.fromString(call.name)) ?? null;
  }

  constraintsForCall(call: Call): Expr {
    call = Call.fromString(call.name);
    const cached = this._constraintsForCallCache.get(call);
    if (cached !== undefined) {
      return cached;
    }
    const situations: Expr[] = [];
    const rule = this.ruleForCall(call)!;
    for (const [priority, z3Meaning] of rule.meaningOf(this.history, call)) {
      const situationalExprs = [z3Meaning];
      for (const [unmadeCall, unmadeRule] of this._callToRule) {
        if (unmadeRule.requiresPlanning) {
          continue; // never bid without a planner, so never "not bid" either
        }
        for (const [unmadePriority, unmadeZ3Meaning] of unmadeRule.meaningOf(
          this.history,
          unmadeCall,
        )) {
          if (this.system.priorityOrdering.lt(priority, unmadePriority)) {
            if (this.explain && call.equals(this.expectedCall)) {
              pyPrint(
                `Adding negation ${unmadeRule.name} (${unmadeCall.name}) to ${rule.name}:`,
              );
              // The Python prints z3's pretty form; this is the sexpr (debugging only).
              pyPrint(` ${printedForm(z3.simplify(z3.Not(unmadeZ3Meaning)))}`);
            }
            situationalExprs.push(z3.Not(unmadeZ3Meaning));
          }
        }
      }
      situations.push(z3.And(situationalExprs));
    }

    const result = z3.Or(situations);
    this._constraintsForCallCache.set(call, result);
    return result;
  }

  possibleCallsForHand(hand: Hand, expectedCall: Call | null): PossibleCalls {
    const possibleCalls = new PossibleCalls(this.system.priorityOrdering);
    const solver = _solverPool.borrowSolverForHand(hand);
    // legal_calls is a set: visit it in Call order (see maximal_calls_and_priorities).
    for (const call of sortCalls([...this.history.legalCalls])) {
      const rule = this.ruleForCall(call);
      if (!rule || rule.requiresPlanning) {
        continue; // planning rules are interpreted when bid, never chosen
      }

      for (const [priority, z3Meaning] of rule.meaningOf(this.history, call)) {
        if (isPossible(solver, z3Meaning)) {
          possibleCalls.addCallWithPriority(call, priority);
        } else if (call.equals(expectedCall)) {
          // The Python prints z3's pretty form; this is the sexpr (debugging only).
          pyPrint(`${rule.name} does not fit hand: ${printedForm(z3Meaning)}`);
        }
      }
    }
    _solverPool.restore(solver);
    return possibleCalls;
  }
}

// --- Interpreter and its cache ---------------------------------------------------

export class InconsistentHistoryException extends Error {
  readonly annotations: readonly EnumValue[] | null;
  readonly constraints: Expr | null;
  readonly rule: CompiledRule | null;

  constructor(
    annotations: readonly EnumValue[] | null = null,
    constraints: Expr | null = null,
    rule: CompiledRule | null = null,
  ) {
    super("InconsistentHistoryException");
    this.name = "InconsistentHistoryException";
    this.annotations = annotations;
    this.constraints = constraints;
    this.rule = rule;
  }
}

// Keyed by dealer + calls: the same calls dealt by a different seat are a different auction
// (who bid what), even though SAYC itself reads nothing from the dealer.  Vulnerability is
// deliberately not in the key: no rule reads it, and it would only cut cache hits.
export class HistoryCache {
  /** Python's `collections.deque(maxlen=size_limit)`: append drops the oldest. */
  readonly lru: [string, History][] = [];
  readonly sizeLimit: number;

  // FIXME: size_limit has not been tuned at all.
  constructor(sizeLimit = 100) {
    this.sizeLimit = sizeLimit;
  }

  // A key is a prefix of another only when its calls are a prefix of the other's: calls are
  // space-separated and the only call names sharing a prefix, X and XX, are never both legal
  // at the same point of an auction.
  static _key(callHistory: CallHistory): string {
    return callHistory.dealer.char + "|" + callHistory.callsString();
  }

  /**
   * Returns (history, remaining_calls): the longest cached History that is a prefix of
   * call_history, and the calls still to be interpreted on top of it.
   */
  lookup(callHistory: CallHistory): [History, Call[]] {
    const emptyKey = HistoryCache._key(callHistory.copyWithPartialHistory(0));
    const wantedKey = HistoryCache._key(callHistory);
    let bestMatch = "";
    let bestHistory: History | null = null;
    for (const [key, history] of this.lru) {
      if (key.length > bestMatch.length && wantedKey.startsWith(key)) {
        bestMatch = key;
        bestHistory = history;
      }
    }

    if (bestMatch.length > emptyKey.length) {
      const callsMatched = (bestMatch.match(/ /g)?.length ?? 0) + 1;
      return [bestHistory!, callHistory.calls.slice(callsMatched)];
    }

    const root = new History({
      callHistory: callHistory.copyWithPartialHistory(0),
    });
    return [root, [...callHistory.calls]];
  }

  add(history: History): void {
    this.lru.push([HistoryCache._key(history.callHistory), history]);
    while (this.lru.length > this.sizeLimit) {
      this.lru.shift();
    }
  }
}

export const historyCache = new HistoryCache();

export class Interpreter {
  readonly system: BiddingSystem;

  constructor() {
    // Assuming SAYC for all sides.
    this.system = StandardAmericanYellowCard;
  }

  extendHistory(history: History, call: Call, explain = false): History {
    if (explain) {
      pyPrint(call.name);
    }

    const expectedCall = explain ? call : null;
    const selector = new RuleSelector(
      this.system,
      history,
      expectedCall,
      explain,
    );

    const rule = selector.ruleForCall(call);
    if (!rule) {
      throw new InconsistentHistoryException();
    }

    const annotations = [...rule.annotationsForCall(call)];
    if (explain) {
      pyPrint(`Selected ${rule.name} for ${call.name}:`);
    }
    const constraints = selector.constraintsForCall(call);
    if (!history.isConsistent(positions.Me, constraints)) {
      throw new InconsistentHistoryException(annotations, constraints, rule);
    }

    const newHistory = history.extendWith(call, annotations, constraints, rule);
    historyCache.add(newHistory);
    return newHistory;
  }

  /**
   * The interpreted auction.  The caller owns its solvers: call
   * `history.release()` when done, or use `withHistory`.
   */
  createHistory(callHistory: CallHistory, explain = false): History {
    const lookup = historyCache.lookup(callHistory);
    let history = lookup[0];
    const remainingCalls = lookup[1];
    for (const call of remainingCalls) {
      try {
        history = this.extendHistory(history, call, explain);
      } catch (error) {
        if (!(error instanceof InconsistentHistoryException)) {
          throw error;
        }
        if (explain) {
          pyPrint(
            `WARNING: History is not consistent, ignoring ${call.name} from ${error.rule ? error.rule.repr() : "None"}`,
          );
          // The Python prints z3's pretty form; this is the sexpr (debugging only).
          pyPrint(error.constraints ? printedForm(error.constraints) : "None");
        }
        history = history.extendWith(call, [], model.NO_CONSTRAINTS, null);
      }
    }
    return history;
  }

  /**
   * Python's `with interpreter.create_history(call_history) as history:`:
   * interprets the auction, runs `fn` on it and releases its solvers.
   */
  withHistory<T>(
    callHistory: CallHistory,
    fn: (history: History) => T,
    explain = false,
  ): T {
    return withHistory(this.createHistory(callHistory, explain), fn);
  }
}
