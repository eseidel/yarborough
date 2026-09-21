// cspell:ignore issubclass
// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/yarborough_z3b.py: the JSON-friendly z3b operations the
// browser worker calls.  Same function names in camelCase, same order of
// operations, and the same JSON shapes -- the keys the frontend parses
// (src/bridge/engine-results.ts) keep their Python spelling (`call_name`,
// `knowledge_string`, `partner_suits`), and so do the error messages.
//
// Three things the Python does implicitly are explicit here:
//
// - Solvers.  Every `with Interpreter().create_history(...) as history:` is
//   an `Interpreter.withHistory(...)`, so the four positions' solvers go back
//   to the pool.  The branch histories this extends off an interpreted
//   auction -- one per call whose meaning is read -- are dropped on the floor
//   in Python and freed by its garbage collector; here each is passed to
//   `History.releaseBranch` in a `finally`, or a request that interprets
//   thirty calls leaks thirty solvers into the wasm heap.
// - Exception types.  Python catches `(AssertionError, TypeError,
//   ValueError)` around the core parsers, which in TypeScript are all plain
//   `Error`s, so the `catch` here is unfiltered.  Where Python catches
//   `InconsistentHistoryException` this catches exactly that and rethrows
//   anything else.
// - The `_selectionForBoard` seam.  python/tests/test_yarborough_z3b.py
//   patches the module attribute; here `setSelectionForBoard` swaps it and
//   hands back the previous one, as `setBidderLog` does for the kernel.
//
// The module has no DOM and no Node API, so it runs in a module worker and in
// Vitest alike.

import * as categories from "./categories";
import type { CategoryPath } from "./categories";
import { Board } from "./core/board";
import { type Call, Pass } from "./core/call";
import { CallExplorer } from "./core/callexplorer";
import { CallHistory } from "./core/callhistory";
import { Hand } from "./core/hand";
import { Position } from "./core/position";
import { type Strain, SUITS } from "./core/suit";
import * as leads from "./leads";
import {
  Bidder,
  type History,
  InconsistentHistoryException,
  Interpreter,
  type PositionView,
  RuleSelector,
  _solverPool,
} from "./z3b/bidder";
import { SAYCForcingOracle } from "./z3b/forcing";
import { exprForSuit, isPossible, points } from "./z3b/model";
import { annotations } from "./z3b/preconditions";
import type { EnumValue } from "./z3b/enum";
import { mro, type RuleClass } from "./z3b/rule_compiler";
import * as rules from "./z3b/rules";
import type { Expr, Solver } from "./z3b/z3";

/** Raised when a frontend request cannot be represented by z3b. */
export class BiddingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BiddingInputError";
  }
}

/** Raised when a requested practice focus cannot be generated in time. */
export class FocusGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FocusGenerationError";
  }
}

// Bound rejection sampling so a browser request cannot run indefinitely.
export const MAX_FOCUS_ATTEMPTS = 5_000;

const _VULNERABILITIES: Record<string, string> = {
  None: "None",
  NS: "N-S",
  "N-S": "N-S",
  EW: "E-W",
  "E-W": "E-W",
  Both: "Both",
};

const _FOCUS_RULES: Record<string, RuleClass> = {
  Notrump: rules.NotrumpOpening,
  Preempt: rules.PreemptiveOpen,
  Strong2C: rules.StrongTwoClubs,
};

// --- what the adapter reads of the kernel ---------------------------------

/**
 * What the adapter reads of a `CompiledRule`.  `z3b.CompiledRule` satisfies
 * it; the structural type is what lets the tests inject the fakes
 * python/tests/test_yarborough_z3b.py builds by hand.
 */
export interface AdapterRule {
  readonly name: string;
  readonly dslRule: RuleClass;
  explanationForBid(call: Call): string | null;
}

/** What the adapter reads of a `CallSelection`. */
export interface AdapterSelection {
  readonly call: Call | null;
  readonly rule: AdapterRule | null;
}

/** A source of boards: `Board.random`, or a test's fixed deal. */
export type BoardFactory = () => Board;

const defaultBoardFactory: BoardFactory = () => Board.random();

function _requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new BiddingInputError(`${field} must be a string`);
  }
  return value;
}

export function _normalizeVulnerability(vulnerability: string): string {
  const normalized = _VULNERABILITIES[vulnerability];
  if (normalized === undefined) {
    throw new BiddingInputError(
      `vulnerability must be one of ${Object.keys(_VULNERABILITIES).join(", ")}`,
    );
  }
  return normalized;
}

export function _callHistory(
  calls: unknown,
  dealer: unknown,
  vulnerability: unknown,
): CallHistory {
  const callsString = _requireString(calls, "calls");
  const dealerChar = _requireString(dealer, "dealer").toUpperCase();
  if (!["N", "E", "S", "W"].includes(dealerChar)) {
    throw new BiddingInputError("dealer must be one of N, E, S, W");
  }
  const vulnerabilityName = _normalizeVulnerability(
    _requireString(vulnerability, "vulnerability"),
  );
  try {
    return CallHistory.fromString(callsString, dealerChar, vulnerabilityName);
  } catch {
    throw new BiddingInputError(`invalid call history: ${callsString}`);
  }
}

export function _board(identifier: unknown): Board {
  const identifierString = _requireString(identifier, "identifier");
  try {
    return Board.fromIdentifier(identifierString);
  } catch {
    throw new BiddingInputError(
      `invalid board identifier: ${identifierString}`,
    );
  }
}

export function _selectionForBoard(board: Board): AdapterSelection | null {
  const history = board.callHistory;
  if (history.isComplete()) {
    throw new BiddingInputError(
      "cannot select a call after the auction is complete",
    );
  }
  const position = history.positionToCall();
  return new Bidder().callSelectionFor(board.deal.handFor(position), history);
}

/** The seam `patch.object(api, "_selection_for_board")` patches in Python. */
export type SelectionForBoard = (board: Board) => AdapterSelection | null;

let selectionForBoard: SelectionForBoard = _selectionForBoard;

/**
 * Replaces the selection step (null restores `_selectionForBoard`) and
 * returns the previous one, so a test can put it back.
 */
export function setSelectionForBoard(
  replacement: SelectionForBoard | null,
): SelectionForBoard {
  const previous = selectionForBoard;
  selectionForBoard = replacement ?? _selectionForBoard;
  return previous;
}

type Range = readonly [min: number, max: number];

/**
 * What the serializer reads of a position view; `z3b`'s `PositionView`
 * satisfies it.
 */
export interface ConstraintsView {
  readonly minPoints: number;
  readonly maxPoints: number;
  minLength(suit: Strain): number;
  maxLength(suit: Strain): number;
}

/** Serializes a position view's hand constraints into human-readable text. */
export class ConstraintsSerializer {
  static readonly MAX_HCP_PER_HAND = 37;
  static readonly EMPTY_HCP_RANGE: Range = [
    0,
    ConstraintsSerializer.MAX_HCP_PER_HAND,
  ];

  private readonly _hcpRange: Range;
  private readonly _suitLengthRanges: readonly Range[];

  constructor(positionView: ConstraintsView) {
    this._hcpRange = [positionView.minPoints, positionView.maxPoints];
    this._suitLengthRanges = SUITS.map(
      (suit): Range => [
        positionView.minLength(suit),
        positionView.maxLength(suit),
      ],
    );
  }

  private _stringForRange(rangeTuple: Range, globalMax: number): string {
    const [minValue, maxValue] = rangeTuple;
    if (minValue === maxValue) {
      return String(minValue);
    }
    if (minValue === 0 && maxValue >= globalMax) {
      return "?";
    }
    if (maxValue >= globalMax) {
      return `${minValue}+`;
    }
    return `${minValue}-${maxValue}`;
  }

  private _prettyStringForSuit(
    suit: Strain,
    maxSuitLengthToShow: number | null = null,
  ): string | null {
    maxSuitLengthToShow = maxSuitLengthToShow || 6;
    const suitString = this._stringForRange(
      this._suitLengthRanges[suit.index],
      maxSuitLengthToShow,
    );
    if (suitString === "?") {
      return null;
    }
    return suitString + suit.char;
  }

  exploreString(): string {
    const empty = ConstraintsSerializer.EMPTY_HCP_RANGE;
    if (
      this._hcpRange[0] === empty[0] &&
      this._hcpRange[1] === empty[1] &&
      this._suitLengthRanges.filter(
        (range) => range[0] === 0 && range[1] === 13,
      ).length === 4
    ) {
      return "?";
    }
    const suitStrings = SUITS.map((suit) =>
      this._prettyStringForSuit(suit),
    ).filter((suitString): suitString is string => Boolean(suitString));
    const prettyString = `${this._stringForRange(
      this._hcpRange,
      ConstraintsSerializer.MAX_HCP_PER_HAND,
    )} hcp`;
    if (suitStrings.length) {
      return `${prettyString}, ${suitStrings.join(" ")}`;
    }
    return prettyString;
  }
}

export function _formatRuleName(ruleName: string | null): string | null {
  if (!ruleName) {
    return null;
  }
  return categories.formatRuleName(ruleName);
}

export function _knowledgeString(
  positionView: PositionView,
  interpreter: Interpreter,
): string {
  const exploreString = new ConstraintsSerializer(positionView).exploreString();
  const annotationsWhitelist = new Set<EnumValue>([
    annotations.Artificial,
    annotations.NotrumpSystemsOn,
  ]);
  const annotationsForLastCall = new Set(
    positionView.annotationsForLastCall.filter((annotation) =>
      annotationsWhitelist.has(annotation),
    ),
  );
  let prettyString: string;
  if (annotationsForLastCall.size) {
    prettyString = `${exploreString} ${
      // Enum order: a set of annotations iterates in an order no port can reproduce.
      [...annotationsForLastCall]
        .sort((a, b) => a.index - b.index)
        .map((a) => String(a))
        .join(", ")
    }`;
  } else {
    prettyString = exploreString;
  }

  if (positionView.ruleForLastCall) {
    let partnerFuture: History | null = null;
    try {
      partnerFuture = interpreter.extendHistory(
        positionView.history,
        new Pass(),
      );
      if (new SAYCForcingOracle().forcedToBid(partnerFuture)) {
        prettyString += " Forcing";
      }
    } catch (error) {
      if (!(error instanceof InconsistentHistoryException)) {
        throw error;
      }
    } finally {
      // A branch the interpreted auction does not own: see `releaseBranch`.
      partnerFuture?.releaseBranch();
    }
  }
  return prettyString.trim();
}

/** What `get_suggested_call` returns, and the shape `_selection_result` builds. */
export interface SelectionResult {
  call_name: string;
  rule_name: string | null;
  description: string | null;
  knowledge_string: string | null;
  category: CategoryPath | null;
}

export function _selectionResult(
  selection: AdapterSelection | null,
  knowledgeString: string | null = null,
  category: CategoryPath | null = null,
): SelectionResult {
  if (!selection || !selection.call) {
    return {
      call_name: "P",
      rule_name: null,
      description: null,
      knowledge_string: null,
      category,
    };
  }

  const rule = selection.rule;
  return {
    call_name: selection.call.name,
    rule_name: rule ? _formatRuleName(rule.name) : null,
    description: rule ? rule.explanationForBid(selection.call) : null,
    knowledge_string: knowledgeString,
    category,
  };
}

/** The three-level category of the call `selection` makes (see categories.ts). */
export function _categoryForSelection(
  selection: AdapterSelection | null,
  history: CallHistory,
): CategoryPath {
  const rule = selection && selection.call ? selection.rule : null;
  return categories.categoryFor(rule ? rule.name : null, history);
}

/** Return the z3b recommendation for the player to act. */
export function getNextCall(identifier: unknown): string {
  return _selectionResult(selectionForBoard(_board(identifier))).call_name;
}

/** Return a z3b recommendation and its available explanation. */
export function getSuggestedCall(identifier: unknown): SelectionResult {
  const board = _board(identifier);
  const selection = selectionForBoard(board);
  const category = _categoryForSelection(selection, board.callHistory);
  if (!selection || !selection.call) {
    return _selectionResult(null, null, category);
  }

  let knowledgeString: string | null = null;
  const interpreter = new Interpreter();
  try {
    knowledgeString = interpreter.withHistory(board.callHistory, (history) => {
      const extendedHistory = interpreter.extendHistory(
        history,
        selection.call!,
      );
      try {
        return _knowledgeString(extendedHistory.rho, interpreter);
      } finally {
        // A branch the interpreted auction does not own: see `releaseBranch`.
        extendedHistory.releaseBranch();
      }
    });
  } catch (error) {
    if (!(error instanceof InconsistentHistoryException)) {
      throw error;
    }
    knowledgeString = null;
  }

  return _selectionResult(selection, knowledgeString, category);
}

/** One legal next call, as `get_call_interpretations` describes it. */
export interface CallInterpretation {
  call_name: string;
  rule_name: string | null;
  description: string | null;
  knowledge_string: string | null;
}

/** Return rule metadata for every legal next call in an auction. */
export function getCallInterpretations(
  calls: unknown,
  dealer: unknown,
  vulnerability: unknown,
): CallInterpretation[] {
  const callHistory = _callHistory(calls, dealer, vulnerability);
  if (callHistory.isComplete()) {
    return [];
  }

  const interpretations: CallInterpretation[] = [];
  const interpreter = new Interpreter();
  interpreter.withHistory(callHistory, (history) => {
    for (const call of new CallExplorer().possibleCallsOver(callHistory)) {
      let rule = null;
      let knowledgeString: string | null = null;
      let extendedHistory: History | null = null;
      try {
        extendedHistory = interpreter.extendHistory(history, call);
        rule = extendedHistory.rho.ruleForLastCall;
        knowledgeString = _knowledgeString(extendedHistory.rho, interpreter);
      } catch (error) {
        if (!(error instanceof InconsistentHistoryException)) {
          throw error;
        }
      } finally {
        // A branch the interpreted auction does not own: see `releaseBranch`.
        extendedHistory?.releaseBranch();
      }

      interpretations.push({
        call_name: call.name,
        rule_name: rule ? _formatRuleName(rule.name) : null,
        description: rule !== null ? rule.explanationForBid(call) : null,
        knowledge_string: knowledgeString,
      });
    }
  });
  return interpretations;
}

/** Python's `issubclass`: `cls` is `base` or descends from it. */
function _isSubclass(cls: RuleClass, base: RuleClass): boolean {
  return mro(cls).includes(base);
}

export function _matchesFocus(
  selection: AdapterSelection | null,
  focus: string,
): boolean {
  if (focus === "Random") {
    return true;
  }
  if (!selection || !selection.rule) {
    return false;
  }
  const expectedRule = _FOCUS_RULES[focus];
  if (expectedRule === undefined) {
    // Python's KeyError: `generate_filtered_board` validates the focus first.
    throw new Error(focus);
  }
  return _isSubclass(selection.rule.dslRule, expectedRule);
}

/** Generate a focused board or fail after at most `maxAttempts` tries. */
export function generateFilteredBoard(
  focus: unknown,
  boardFactory: BoardFactory = defaultBoardFactory,
  maxAttempts: number = MAX_FOCUS_ATTEMPTS,
): string {
  const focusName = _requireString(focus, "focus");
  if (focusName !== "Random" && !Object.hasOwn(_FOCUS_RULES, focusName)) {
    throw new BiddingInputError(`unknown practice focus: ${focusName}`);
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new BiddingInputError("max_attempts must be a positive integer");
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const board = boardFactory();
    if (
      focusName === "Random" ||
      _matchesFocus(selectionForBoard(board), focusName)
    ) {
      return board.identifier;
    }
  }

  throw new FocusGenerationError(
    `could not generate a ${focusName} practice board after ${maxAttempts} attempts`,
  );
}

export const MAX_ADAPTIVE_ATTEMPTS = 10;

export function _targets(value: unknown): string[][] {
  if (!Array.isArray(value) || !value.length) {
    throw new BiddingInputError(
      "targets must be a non-empty list of category paths",
    );
  }
  const targets: string[][] = [];
  for (const path of value as unknown[]) {
    if (
      !Array.isArray(path) ||
      !path.length ||
      !path.every((level) => typeof level === "string" && level)
    ) {
      throw new BiddingInputError(
        "each target must be a non-empty list of strings",
      );
    }
    targets.push([...(path as string[])]);
  }
  return targets;
}

/** True when `category` sits under any target path (prefix match). */
export function _matchesTarget(
  category: readonly string[],
  targets: readonly (readonly string[])[],
): boolean {
  return targets.some(
    (target) =>
      category.length >= target.length &&
      target.every((level, index) => category[index] === level),
  );
}

/** A board the adaptive generator found, and the category that matched. */
export interface AdaptiveBoard {
  identifier: string;
  category: CategoryPath;
}

/**
 * A board whose auction, bid by the engine throughout, asks `position` for a
 * call in one of the target categories.
 *
 * Bids random boards out with the engine until one of `position`'s calls falls
 * under a target, or `maxAttempts` boards have been tried.  Returns
 * {identifier, category} for the board found (the category being the matching
 * call's), or null when the attempts ran out, so the caller can ask again
 * without holding the worker for long.  See docs/progress-plan.md, section 4.
 */
export function generateAdaptiveBoard(
  targets: unknown,
  maxAttempts: unknown = 3,
  position: unknown = "S",
  boardFactory: BoardFactory = defaultBoardFactory,
): AdaptiveBoard | null {
  const targetPaths = _targets(targets);
  if (
    !Number.isInteger(maxAttempts) ||
    !(
      1 <= (maxAttempts as number) &&
      (maxAttempts as number) <= MAX_ADAPTIVE_ATTEMPTS
    )
  ) {
    throw new BiddingInputError(
      `max_attempts must be an integer from 1 to ${MAX_ADAPTIVE_ATTEMPTS}`,
    );
  }
  const positionChar = _requireString(position, "position").toUpperCase();
  if (!["N", "E", "S", "W"].includes(positionChar)) {
    throw new BiddingInputError("position must be one of N, E, S, W");
  }

  const bidder = new Bidder();
  for (let attempt = 0; attempt < (maxAttempts as number); attempt += 1) {
    const board = boardFactory();
    const identifier = board.identifier;
    const history = board.callHistory;
    while (!history.isComplete()) {
      const caller = history.positionToCall();
      const selection = bidder.callSelectionFor(
        board.deal.handFor(caller),
        history,
      );
      if (caller.char === positionChar) {
        const category = _categoryForSelection(selection, history);
        if (_matchesTarget(category, targetPaths)) {
          return { identifier, category };
        }
      }
      const call = selection && selection.call ? selection.call : new Pass();
      history.calls.push(call);
    }
  }
  return null;
}

/** Simulate a full autobidder auction for a board until complete. */
export function getFullAutobid(identifier: unknown): string[] {
  const board = _board(identifier);
  const bidder = new Bidder();
  while (!board.callHistory.isComplete()) {
    const position = board.callHistory.positionToCall();
    const hand = board.deal.handFor(position);
    const selection = bidder.callSelectionFor(hand, board.callHistory);
    const call = selection && selection.call ? selection.call : new Pass();
    board.callHistory.calls.push(call);
  }
  return board.callHistory.calls.map((c) => c.name);
}

/** The opening lead, as `get_opening_lead` reports it. */
export interface OpeningLead {
  leader: string;
  card: string;
  reason: string;
  partner_suits: string[];
  their_suits: string[];
}

export function _openingLeadForBoard(board: Board): OpeningLead {
  const history = board.callHistory;
  if (!history.isComplete()) {
    throw new BiddingInputError("the auction is not complete");
  }
  if (history.isPassout()) {
    throw new BiddingInputError("the board was passed out");
  }
  const contract = history.lastContract()!;
  const declarer = history.declarer()!;
  const leader = Position.fromIndex((declarer.index + 1) % 4);
  const artificial = new Interpreter().withHistory(history, (interpreted) =>
    interpreted
      .annotationsByCall()
      .map((callAnnotations) =>
        callAnnotations.includes(annotations.Artificial),
      ),
  );
  const [partnerSuits, theirSuits] = leads.bidSuits(
    history.calls.map((call) => call.name),
    history.dealer.index,
    leader.index,
    artificial,
  );
  const hand = board.deal.handFor(leader).shdcDotString();
  const [card, reason] = leads.choose(
    hand,
    contract.name[1],
    partnerSuits,
    theirSuits,
  );
  return {
    leader: leader.char,
    card,
    reason,
    partner_suits: partnerSuits,
    their_suits: theirSuits,
  };
}

/**
 * The textbook opening lead against the contract a completed auction reached.
 *
 * Returns the leader ("W"), the card ("D4": suit then rank), why, and the
 * suits the lead was chosen around: partner's natural suits and the declaring
 * side's.
 */
export function getOpeningLead(identifier: unknown): OpeningLead {
  return _openingLeadForBoard(_board(identifier));
}

// --- the hand-aware analysis ----------------------------------------------
//
// `get_call_interpretations` above answers "what would SAYC mean by each of
// these calls", which is all Explore could ask without a hand.  With one it
// can ask the question a player actually has -- "which of these is my bid,
// and what is wrong with the others" -- and z3b already separates the four
// answers internally; nothing exposed them.

/** How a hand stands with one legal call. */
export type CallFit = "chosen" | "possible" | "unfit" | "no_rule";

/** The least and the most of one quantity a rule leaves possible. */
export type Bounds = [min: number, max: number];

/** What a call asks of the hand that makes it. */
export interface CallRequirements {
  hcp: Bounds;
  /** Length bounds per suit, in `Suit::ALL` order (clubs through spades). */
  suit_lengths: Bounds[];
}

/** The one requirement a hand misses, of the call it cannot make. */
export interface UnfitReason {
  kind: "hcp_low" | "hcp_high" | "suit_short" | "suit_long";
  /** The suit's char for a length miss; null for a point-count miss. */
  suit: string | null;
  /** What the call asks for. */
  shown: number;
  /** What the hand holds. */
  actual: number;
}

/** One legal call, weighed against a particular hand. */
export interface HandCallAnalysis {
  call_name: string;
  rule_name: string | null;
  description: string | null;
  knowledge_string: string | null;
  fit: CallFit;
  /** The rule's own bounds, on the calls the hand fails; null otherwise. */
  requirements: CallRequirements | null;
  unfit_reason: UnfitReason | null;
}

/** What `get_hand_analysis` returns. */
export interface HandAnalysis {
  /** The call z3b makes with this hand, or null when no rule fits it. */
  call_name: string | null;
  category: CategoryPath | null;
  calls: HandCallAnalysis[];
}

const _MAX_HCP = ConstraintsSerializer.MAX_HCP_PER_HAND;

/**
 * The smallest value in [lo, hi] that a model of `solver` gives `expr`.
 *
 * `expr <= n` is satisfiable for every n at or above that value and for none
 * below it, so the predicate is monotone and bisection finds the edge.
 */
export function _lowerBoundOf(
  solver: Solver,
  expr: Expr,
  lo: number,
  hi: number,
): number {
  let low = lo;
  let high = hi;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (isPossible(solver, expr.le(middle))) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

/** The largest value in [lo, hi] a model of `solver` gives `expr`. */
export function _upperBoundOf(
  solver: Solver,
  expr: Expr,
  lo: number,
  hi: number,
): number {
  let low = lo;
  let high = hi;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (isPossible(solver, expr.ge(middle))) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

function _boundsOf(solver: Solver, expr: Expr, lo: number, hi: number): Bounds {
  return [
    _lowerBoundOf(solver, expr, lo, hi),
    _upperBoundOf(solver, expr, lo, hi),
  ];
}

function _widen(into: Bounds | null, next: Bounds): Bounds {
  return into === null
    ? next
    : [Math.min(into[0], next[0]), Math.max(into[1], next[1])];
}

/**
 * What a rule's meanings ask of the hand that makes the call: the points and
 * the suit lengths they leave possible, widened over the rule's variants,
 * since a hand need satisfy only one of them.
 *
 * These are the raw meanings the bidder tests a hand against, not the
 * constraints the interpreted auction carries, which also negate the meaning
 * of every call the rules would have preferred.  Only the raw bounds can say
 * a hand misses a requirement without attributing to the rule something it
 * never asked for.
 */
export function _requirementsFor(
  meanings: readonly Expr[],
): CallRequirements | null {
  let hcp: Bounds | null = null;
  const suitLengths: (Bounds | null)[] = SUITS.map(() => null);
  const solver = _solverPool.borrow();
  try {
    for (const meaning of meanings) {
      solver.push();
      try {
        solver.add(meaning);
        if (solver.check() !== "sat") {
          continue; // a variant no hand satisfies asks nothing of this one
        }
        hcp = _widen(hcp, _boundsOf(solver, points, 0, _MAX_HCP));
        for (const suit of SUITS) {
          suitLengths[suit.index] = _widen(
            suitLengths[suit.index],
            _boundsOf(solver, exprForSuit(suit), 0, 13),
          );
        }
      } finally {
        solver.pop();
      }
    }
  } finally {
    _solverPool.restore(solver);
  }
  if (hcp === null) {
    return null;
  }
  return { hcp, suit_lengths: suitLengths.map((bounds) => bounds ?? [0, 13]) };
}

/**
 * The requirement `hand` misses, named the way a player would name it: the
 * point count first, since it rules out most calls at a glance, then the
 * suit the call itself names, then the largest shortfall.
 *
 * Null when the hand is inside every bound -- the rule then turned the hand
 * down on something finer than points and shape (a stopper, a holding, the
 * cards in one suit), which these bounds cannot see and must not guess at.
 */
export function _unfitReason(
  requirements: CallRequirements | null,
  hand: Hand,
  call: Call,
): UnfitReason | null {
  if (!requirements) {
    return null;
  }
  const hcp = hand.highCardPoints();
  if (hcp < requirements.hcp[0]) {
    return {
      kind: "hcp_low",
      suit: null,
      shown: requirements.hcp[0],
      actual: hcp,
    };
  }
  if (hcp > requirements.hcp[1]) {
    return {
      kind: "hcp_high",
      suit: null,
      shown: requirements.hcp[1],
      actual: hcp,
    };
  }

  const misses: UnfitReason[] = [];
  for (const suit of SUITS) {
    const [minimum, maximum] = requirements.suit_lengths[suit.index];
    const length = hand.lengthOfSuit(suit);
    if (length < minimum) {
      misses.push({
        kind: "suit_short",
        suit: suit.char,
        shown: minimum,
        actual: length,
      });
    } else if (length > maximum) {
      misses.push({
        kind: "suit_long",
        suit: suit.char,
        shown: maximum,
        actual: length,
      });
    }
  }
  if (!misses.length) {
    return null;
  }
  const named = call.strain
    ? misses.find((miss) => miss.suit === call.strain!.char)
    : undefined;
  if (named) {
    return named;
  }
  return misses.reduce((worst, miss) =>
    Math.abs(miss.shown - miss.actual) > Math.abs(worst.shown - worst.actual)
      ? miss
      : worst,
  );
}

export function _hand(hand: unknown): Hand {
  const handString = _requireString(hand, "hand");
  let parsed: Hand;
  try {
    parsed = Hand.fromCdhsString(handString.toUpperCase());
  } catch {
    // `Hand` rejects a card value it does not know and a hand that is not
    // thirteen cards, but not the same card named twice.
    throw new BiddingInputError(`invalid hand: ${handString}`);
  }
  const named = new Set(
    parsed.cardsBySuitIndex.flatMap((cards, index) =>
      [...cards].map((card) => `${index}${card}`),
    ),
  );
  if (named.size !== 13) {
    throw new BiddingInputError(`invalid hand: ${handString}`);
  }
  return parsed;
}

/**
 * Every legal next call, weighed against `hand`.
 *
 * `hand` is a C.D.H.S dot string, the notation the rest of the repository
 * uses.  Each call comes back with the interpretation
 * `get_call_interpretations` gives it and with how the hand stands with it:
 * the call z3b picks, a call the hand could make that z3b passed over, a
 * call whose rule the hand fails, or a call no SAYC rule makes here.  The
 * calls the hand fails also carry what their rule asks for and the one
 * requirement the hand misses, so the frontend can say which.
 */
export function getHandAnalysis(
  hand: unknown,
  calls: unknown,
  dealer: unknown,
  vulnerability: unknown,
): HandAnalysis {
  const callHistory = _callHistory(calls, dealer, vulnerability);
  const playerHand = _hand(hand);
  if (callHistory.isComplete()) {
    return { call_name: null, category: null, calls: [] };
  }

  const bidder = new Bidder();
  const selection = bidder.callSelectionFor(playerHand, callHistory);
  const chosen = selection ? selection.call : null;
  const category = _categoryForSelection(selection, callHistory);

  const analyses: HandCallAnalysis[] = [];
  const interpreter = new Interpreter();
  interpreter.withHistory(callHistory, (history) => {
    const selector = new RuleSelector(bidder.system, history, null);
    // One solver holds the hand for the whole list: every call asks it the
    // same question, and `borrowSolverForHand` adds the hand's 52 equalities
    // each time it is called.
    const handSolver = _solverPool.borrowSolverForHand(playerHand);
    try {
      for (const call of new CallExplorer().possibleCallsOver(callHistory)) {
        let interpretedRule = null;
        let knowledgeString: string | null = null;
        let extendedHistory: History | null = null;
        try {
          extendedHistory = interpreter.extendHistory(history, call);
          interpretedRule = extendedHistory.rho.ruleForLastCall;
          knowledgeString = _knowledgeString(extendedHistory.rho, interpreter);
        } catch (error) {
          if (!(error instanceof InconsistentHistoryException)) {
            throw error;
          }
        } finally {
          // A branch the interpreted auction does not own: see `releaseBranch`.
          extendedHistory?.releaseBranch();
        }

        const rule = selector.ruleForCall(call);
        const meanings = rule
          ? [...rule.meaningOf(history, call)].map(([, meaning]) => meaning)
          : [];
        const fits = meanings.some((meaning) =>
          isPossible(handSolver, meaning),
        );

        let fit: CallFit;
        if (chosen && call.equals(chosen)) {
          fit = "chosen";
        } else if (!rule) {
          fit = "no_rule";
        } else if (fits) {
          fit = "possible";
        } else {
          fit = "unfit";
        }

        // Only a call the hand fails needs its rule's own bounds, and each
        // set costs ten bisections; the rest are described well enough by
        // the knowledge string Explore already shows.
        const requirements =
          fit === "unfit" ? _requirementsFor(meanings) : null;

        analyses.push({
          call_name: call.name,
          rule_name: interpretedRule
            ? _formatRuleName(interpretedRule.name)
            : null,
          description: interpretedRule
            ? interpretedRule.explanationForBid(call)
            : null,
          knowledge_string: knowledgeString,
          fit,
          requirements,
          unfit_reason: _unfitReason(requirements, playerHand, call),
        });
      }
    } finally {
      _solverPool.restore(handSolver);
    }
  });

  return { call_name: chosen ? chosen.name : null, category, calls: analyses };
}

/** Dispatch an RPC request after validating its primitive JSON shape. */
export function dispatch(method: unknown, args: unknown): unknown {
  const methodName = _requireString(method, "method");
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new BiddingInputError("arguments must be an object");
  }
  const argumentsRecord = args as Record<string, unknown>;
  // Python's `dict.get(key, fallback)`: a key that is present but null stays null.
  const argument = (key: string, fallback: unknown = null): unknown =>
    Object.hasOwn(argumentsRecord, key) ? argumentsRecord[key] : fallback;

  if (methodName === "get_next_call") {
    return getNextCall(argument("identifier"));
  }
  if (methodName === "get_suggested_call") {
    return getSuggestedCall(argument("identifier"));
  }
  if (methodName === "get_call_interpretations") {
    return getCallInterpretations(
      argument("calls"),
      argument("dealer"),
      argument("vulnerability"),
    );
  }
  if (methodName === "generate_filtered_board") {
    return generateFilteredBoard(argument("focus"));
  }
  if (methodName === "get_full_autobid") {
    return getFullAutobid(argument("identifier"));
  }
  if (methodName === "generate_adaptive_board") {
    return generateAdaptiveBoard(
      argument("targets"),
      argument("max_attempts", 3),
      argument("position", "S"),
    );
  }
  if (methodName === "get_opening_lead") {
    return getOpeningLead(argument("identifier"));
  }
  if (methodName === "get_hand_analysis") {
    return getHandAnalysis(
      argument("hand"),
      argument("calls"),
      argument("dealer"),
      argument("vulnerability"),
    );
  }
  throw new BiddingInputError(`unknown engine method: ${methodName}`);
}

/** Execute a JSON RPC request and return a JSON response string. */
export function dispatchJson(requestJson: unknown): string {
  let request: unknown;
  const text = _requireString(requestJson, "request_json");
  try {
    request = JSON.parse(text);
  } catch {
    throw new BiddingInputError("request_json must contain valid JSON");
  }
  if (
    typeof request !== "object" ||
    request === null ||
    Array.isArray(request)
  ) {
    throw new BiddingInputError("request_json must contain an object");
  }
  const requestRecord = request as Record<string, unknown>;
  // `json.dumps(None)` is "null", so a result of undefined would be wrong here.
  return JSON.stringify(
    dispatch(
      Object.hasOwn(requestRecord, "method") ? requestRecord.method : null,
      Object.hasOwn(requestRecord, "arguments")
        ? requestRecord.arguments
        : null,
    ) ?? null,
  );
}
