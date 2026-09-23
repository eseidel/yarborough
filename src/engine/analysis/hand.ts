// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Why the bidder makes the call it makes with one hand, and why it does not
// make each of the others.
//
// The bidder already separates every legal call into four piles before it
// chooses (bidder.ts, `Bidder.callSelectionFor`): the calls no rule makes
// here, the calls only a plan makes, the calls whose meaning the hand fails,
// and the calls it could make, of which `PossibleCalls` keeps the ones no
// other call beats.  This reads the same piles back, and for the last two
// says what decided it:
//
// - A call the hand could make lost to a better one under `PriorityOrdering`,
//   whose four clauses (purpose, the purpose's strain, fallback, the rule's
//   own prefer list) are the only things that order two calls.  The reason
//   is the clause that decided it, and for the prefer list, the entry.
// - A call the hand fails is tested against the hand one fact at a time: its
//   shape, then its point count with that shape, then its honors.  Relaxing
//   the rest of the hand is what makes the numbers the hand's own: a raise
//   counted in support points, or an opening by the rule of twenty, asks a
//   different number of high-card points of a 5-4 hand than of a 4-3-3-3
//   one, and it is that number a player can check against the cards.
//
// Nothing here changes a call: the bidder is asked exactly what it is asked
// when it bids.

import type { Call } from "../core/call";
import { CallExplorer } from "../core/callexplorer";
import type { CallHistory } from "../core/callhistory";
import type { Hand } from "../core/hand";
import { SUITS, type Strain } from "../core/suit";
import {
  _solverPool,
  Bidder,
  type CallSelection,
  Interpreter,
  RuleSelector,
} from "../z3b/bidder";
import * as model from "../z3b/model";
import * as prefer from "../z3b/prefer";
import type { Priority } from "../z3b/purposes";
import type { CompiledRule, PriorityOrdering } from "../z3b/rule_compiler";
import { type Expr, type Solver, z3 } from "../z3b/z3";

/** How a hand stands with one legal call. */
export type CallFit =
  // the call the bidder makes with this hand
  | "chosen"
  // a call the hand can make, beaten by a better one
  | "possible"
  // a call whose rule the hand does not satisfy
  | "unfit"
  // a call its rule makes only by plan (Blackwood, Gerber): never chosen here
  | "planned"
  // a call no SAYC rule makes at this point
  | "no_rule";

/**
 * One requirement of a call the hand does not meet.  Bounds are what the
 * call's rule allows, with the rest of the hand held as it is where that is
 * possible (see the file comment); a bound of 0 or 13 (37 for points) is no
 * bound at all.
 */
export type Miss =
  | {
      kind: "points";
      min: number;
      max: number;
      actual: number;
      // the bounds hold for this hand's shape and are narrower than the
      // rule's own (a rule of twenty, support points): "with this shape"
      with_shape: boolean;
    }
  | { kind: "length"; suit: string; min: number; max: number; actual: number }
  // the rule wants a balanced hand, and the suit lengths are each allowed
  | { kind: "balanced" }
  // the lengths are each allowed, but not together, and not for balance
  | { kind: "shape" }
  // the shape and the points are right: the honors are not (a stopper, the
  // quality of a suit); `suit` when one suit's honors are the whole problem
  | { kind: "honors"; suit: string | null };

/** The entry of a rule's prefer list (prefer.ts) that ordered two calls. */
export interface PreferEntry {
  kind:
    | "longest" // the longest of the named suits
    | "highest" // the highest level the hand is worth
    | "higher_suit" // the higher suit first
    | "lowest_level" // the lowest level first
    | "named" // the calls in the order the rule lists them
    | "conditional" // the named calls, when the hand meets a condition
    | "unnamed"; // calls the list does not name: the cheapest first
  /** The call names the entry names, in its own order. */
  calls: string[];
}

/** Why the bidder made a different call from one this hand could make. */
export interface Preference {
  /**
   * The clause of `PriorityOrdering.lt` that decided it:
   * `purpose` -- the better call is for a more important purpose;
   * `strain` -- the same purpose, which prefers the better call's strain;
   * `fallback` -- this call is its rule's last resort;
   * `rule` -- one rule makes both and its prefer list ranks the other first;
   * `tie` -- nothing orders the two, and the bidder took the other by its
   * fixed tie-break (a bid, then a double, then a pass; the cheapest first).
   */
  kind: "purpose" | "strain" | "fallback" | "rule" | "tie";
  /** The call that beat this one. */
  over: string;
  /** This call's purpose and the better call's (purposes.ts ORDER). */
  purpose: string;
  over_purpose: string;
  /** For `rule`: the entry that ranked the better call. */
  entry: PreferEntry | null;
}

export interface CallVerdict {
  fit: CallFit;
  /** For `unfit`: what the hand misses, the point count first. */
  misses: Miss[];
  /** For `possible`: why the bidder made another call instead. */
  preference: Preference | null;
}

export interface HandVerdicts {
  selection: CallSelection | null;
  /** By call name, for every legal call. */
  calls: Map<string, CallVerdict>;
}

const MAX_HCP = 37;

const HONOR_RANKS = "AKQJT";
const HONOR_VARS: Record<string, readonly Expr[]> = {
  C: [
    model.aceOfClubs,
    model.kingOfClubs,
    model.queenOfClubs,
    model.jackOfClubs,
    model.tenOfClubs,
  ],
  D: [
    model.aceOfDiamonds,
    model.kingOfDiamonds,
    model.queenOfDiamonds,
    model.jackOfDiamonds,
    model.tenOfDiamonds,
  ],
  H: [
    model.aceOfHearts,
    model.kingOfHearts,
    model.queenOfHearts,
    model.jackOfHearts,
    model.tenOfHearts,
  ],
  S: [
    model.aceOfSpades,
    model.kingOfSpades,
    model.queenOfSpades,
    model.jackOfSpades,
    model.tenOfSpades,
  ],
};

function lengthsOf(hand: Hand): Expr {
  return z3.And(
    SUITS.map((suit) => model.exprForSuit(suit).eq(hand.lengthOfSuit(suit))),
  );
}

function honorsOf(hand: Hand, suit: Strain): Expr[] {
  const cards = hand.cardsInSuit(suit);
  return HONOR_VARS[suit.char].map((honor, index) =>
    honor.eq(cards.includes(HONOR_RANKS[index]) ? 1 : 0),
  );
}

/**
 * The least and the most `expr` can be, in [lo, hi], with what `solver`
 * holds.  Bisected, so it is the hull: exact wherever the allowed values are
 * an interval, which the point counts and suit lengths of a rule are.
 */
export function _boundsOf(
  solver: Solver,
  expr: Expr,
  lo: number,
  hi: number,
): [number, number] {
  let low = lo;
  let high = hi;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (model.isPossible(solver, expr.le(middle))) high = middle;
    else low = middle + 1;
  }
  const min = low;
  low = min;
  high = hi;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (model.isPossible(solver, expr.ge(middle))) low = middle;
    else high = middle - 1;
  }
  return [min, low];
}

/**
 * What `hand` misses of `meaning`, which it does not satisfy.
 *
 * Empty when no hand at all satisfies the meaning here (the rule cannot be
 * bid, whatever the cards), which is nothing a player could fix.
 */
export function _missesFor(meaning: Expr, hand: Hand, call: Call): Miss[] {
  const solver = _solverPool.borrow();
  try {
    solver.add(meaning);
    if (solver.check() !== "sat") return [];

    const misses: Miss[] = [];
    const lengths = lengthsOf(hand);
    const hcp = hand.highCardPoints();
    const pointsFact = model.highCardPoints.eq(hcp);
    const shapeFits = model.isPossible(solver, lengths);

    // The points, with this hand's shape where the shape is allowed.
    const general = _boundsOf(solver, model.highCardPoints, 0, MAX_HCP);
    let [min, max] = general;
    if (shapeFits) {
      solver.push();
      solver.add(lengths);
      [min, max] = _boundsOf(solver, model.highCardPoints, 0, MAX_HCP);
      solver.pop();
    }
    if (hcp < min || hcp > max) {
      const withShape = min !== general[0] || max !== general[1];
      misses.push({
        kind: "points",
        min,
        max,
        actual: hcp,
        with_shape: withShape,
      });
    }

    if (!shapeFits) {
      const lengthMisses: Miss[] = [];
      for (const suit of SUITS) {
        const actual = hand.lengthOfSuit(suit);
        const [least, most] = _boundsOf(solver, model.exprForSuit(suit), 0, 13);
        if (actual < least || actual > most) {
          lengthMisses.push({
            kind: "length",
            suit: suit.char,
            min: least,
            max: most,
            actual,
          });
        }
      }
      // The suit the call names is the one a player looks at first.
      const named = call.strain?.char;
      lengthMisses.sort(
        (a, b) =>
          Number(b.kind === "length" && b.suit === named) -
          Number(a.kind === "length" && a.suit === named),
      );
      misses.push(...lengthMisses);
      if (!lengthMisses.length) {
        const wantsBalance = !model.isPossible(solver, z3.Not(model.balanced));
        misses.push({ kind: wantsBalance ? "balanced" : "shape" });
      }
      return misses;
    }

    if (misses.length) return misses;

    // Shape and points each fit: what is left is the honors.  One suit is the
    // whole problem when freeing its honors (and so the point count they add
    // up to) is enough.
    solver.add(lengths);
    if (!model.isPossible(solver, pointsFact)) return misses;
    const suits = SUITS.filter((free) =>
      model.isPossible(
        solver,
        z3.And(
          SUITS.filter((suit) => suit !== free).flatMap((suit) =>
            honorsOf(hand, suit),
          ),
        ),
      ),
    );
    misses.push({
      kind: "honors",
      suit: suits.length === 1 ? suits[0].char : null,
    });
    return misses;
  } finally {
    _solverPool.restore(solver);
  }
}

function _entryOf(rule: CompiledRule, index: number): PreferEntry {
  const entries = prefer._normalize(rule.field("prefer") ?? []);
  if (index >= entries.length) return { kind: "unnamed", calls: [] };
  const entry = entries[index];
  const calls = [...entry.names];
  if (entry instanceof prefer.Longest) return { kind: "longest", calls };
  if (entry instanceof prefer.Highest) return { kind: "highest", calls };
  if (entry instanceof prefer.HigherSuit) return { kind: "higher_suit", calls };
  if (entry instanceof prefer.LowestLevel) {
    return { kind: "lowest_level", calls };
  }
  if (entry instanceof prefer.Conditional)
    return { kind: "conditional", calls };
  return { kind: "named", calls };
}

/** Which clause of `PriorityOrdering.lt` ranks `better` above `worse`. */
export function _preferenceKind(
  worse: Priority,
  better: Priority,
): Preference["kind"] {
  if (worse.rank !== better.rank) return "purpose";
  if (
    worse.strain !== better.strain &&
    worse.strain !== null &&
    better.strain !== null
  ) {
    return "strain";
  }
  if (worse.fallback !== better.fallback) return "fallback";
  return "rule";
}

/** Why `call`, which the hand can make at `priority`, was not the bid. */
function _preferenceFor(
  call: Call,
  priority: Priority,
  fitting: ReadonlyMap<string, Priority>,
  selection: CallSelection | null,
  ordering: PriorityOrdering,
): Preference | null {
  const chosen = selection?.call ?? null;
  // The chosen call when it beats this one, else the first call that does:
  // the ordering is not transitive, so a call can lose to another possible
  // call without losing to the one the bidder made.
  let over: string | null = null;
  const chosenPriority = chosen ? fitting.get(chosen.name) : undefined;
  if (chosenPriority && ordering.lt(priority, chosenPriority)) {
    over = chosen!.name;
  } else {
    for (const [name, other] of fitting) {
      if (name !== call.name && ordering.lt(priority, other)) {
        over = name;
        break;
      }
    }
  }
  if (over === null) {
    // Not beaten at all: it tied with the chosen call, and the bidder's fixed
    // tie-break picked the other.
    const collided = selection?.collision?.[0].some((c) => c.equals(call));
    if (!collided || !chosen || !chosenPriority) return null;
    return {
      kind: "tie",
      over: chosen.name,
      purpose: priority.purpose,
      over_purpose: chosenPriority.purpose,
      entry: null,
    };
  }
  const better = fitting.get(over)!;
  const kind = _preferenceKind(priority, better);
  return {
    kind,
    over,
    purpose: priority.purpose,
    over_purpose: better.purpose,
    entry:
      kind === "rule" && better.rule
        ? _entryOf(better.rule as CompiledRule, better.key[0])
        : null,
  };
}

/** Every legal call over `callHistory`, weighed against `hand`. */
export function analyseHand(
  hand: Hand,
  callHistory: CallHistory,
): HandVerdicts {
  const bidder = new Bidder();
  const selection = bidder.callSelectionFor(hand, callHistory);
  const ordering = bidder.system.priorityOrdering;
  const verdicts = new Map<string, CallVerdict>();

  new Interpreter().withHistory(callHistory, (history) => {
    const selector = new RuleSelector(bidder.system, history, null);
    const calls = new CallExplorer().possibleCallsOver(callHistory);
    const meanings = new Map<string, [CompiledRule, [Priority, Expr][]]>();
    const fitting = new Map<string, Priority>();

    // One solver holds the hand for every call: `borrowSolverForHand` adds
    // the hand's facts each time it is called.
    const handSolver = _solverPool.borrowSolverForHand(hand);
    try {
      for (const call of calls) {
        const rule = selector.ruleForCall(call);
        if (!rule) continue;
        const variants = [...rule.meaningOf(history, call)];
        meanings.set(call.name, [rule, variants]);
        if (rule.requiresPlanning) continue;
        // Every variant that fits is a way to make the call; the bidder
        // weighs the call at the best of them.
        const fits = variants
          .filter(([, meaning]) => model.isPossible(handSolver, meaning))
          .map(([priority]) => priority);
        const best = fits.find(
          (priority) => !fits.some((other) => ordering.lt(priority, other)),
        );
        if (best) fitting.set(call.name, best);
      }
    } finally {
      _solverPool.restore(handSolver);
    }

    for (const call of calls) {
      const entry = meanings.get(call.name);
      let verdict: CallVerdict;
      if (selection && call.equals(selection.call)) {
        verdict = { fit: "chosen", misses: [], preference: null };
      } else if (!entry) {
        verdict = { fit: "no_rule", misses: [], preference: null };
      } else if (entry[0].requiresPlanning) {
        verdict = { fit: "planned", misses: [], preference: null };
      } else if (fitting.has(call.name)) {
        verdict = {
          fit: "possible",
          misses: [],
          preference: _preferenceFor(
            call,
            fitting.get(call.name)!,
            fitting,
            selection,
            ordering,
          ),
        };
      } else {
        const variants = entry[1].map(([, meaning]) => meaning);
        const meaning = variants.length === 1 ? variants[0] : z3.Or(variants);
        verdict = {
          fit: "unfit",
          misses: variants.length ? _missesFor(meaning, hand, call) : [],
          preference: null,
        };
      }
      verdicts.set(call.name, verdict);
    }
  });

  return { selection, calls: verdicts };
}
