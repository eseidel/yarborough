// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/purposes.py.
//
// Purposes: why a player makes a call, and which reason wins when a hand has several.
//
// Every rule declares a purpose (Rule.purpose, or per call, or conditionally on the hand).
// The bidder compares two possible calls by purpose first; then, within a purpose that prefers
// a strain (PREFERENCES: a major game before notrump before a minor game), by strain; then by
// fallback level (Rule.fallback: the call when nothing more specific of that purpose fits loses
// to every rule of the purpose that is not one); then, among one rule's own calls, by the
// rule's preference (Rule.prefer, prefer.ts: the longest suit, up the line, the highest level
// the hand is worth).  Two rules of one purpose are otherwise incomparable: their meanings, or
// preconditions, must not both admit one hand.  The interpretation of a call negates every
// possible call the hand did not make that the bidder would have preferred, so the ranges
// partner reads and the choices the bidder makes come from one ordering.
//
// The order, best first, is documented against each name in ORDER below.
// "Support", "Discovery", "RebidLong" and "RebidLongMinimum" are shorthands resolved by the suit
// of the call.

import { assert } from "../core/assert";
import type { Call } from "../core/call";
import type { Constraint } from "./constraints";

export const ORDER: readonly string[] = [
  // a call the bidder only makes by plan (Blackwood, Gerber, a feature ask):
  // never chosen here, and read on its own meaning when partner makes it
  "Planned",
  // partner asked; answering is not optional
  "Answer",
  // a balanced hand in a notrump range opens or overcalls notrump
  "EnterNotrumpSystem",
  // too strong for anything but the game force (the strong 2C, a jump shift)
  "GameForce",
  // their suit is ours to defend (a penalty pass, a reopening double)
  "Penalize",
  // the auction has found its level: pass
  "Enough",
  // raise partner's major: the eight-card major fit is the goal
  "SupportMajors",
  // show two suits at once when the shape is there
  "TwoSuiter",
  // a six-card major worth a jump or a three-level rebid, or the doubler's
  // five-card suit, is shown before a limit bid or an ask
  "RebidLongMajor",
  // a balanced hand tells its strength in a limited notrump call
  "BalancedLimit",
  // a long suit worth an invitation is shown before asking or relaying
  "LongSuitInvitation",
  // less than an opening hand (no rule of twenty) with a long suit preempts
  "PreemptWeak",
  // a question comes before a statement: Stayman with four-four or
  // five-four, a takeout double, fourth suit forcing
  "Ask",
  // bid a major we may fit (any new suit at the one level: up the line)
  "MajorDiscovery",
  // bid a minor we may fit
  "MinorDiscovery",
  // five-card support for partner's minor is raised once no new suit is
  // worth showing, with any strength
  "SupportMinorWithFive",
  // a minimum rebid of a six-card major, once no five-card suit is worth
  // showing
  "RebidLongMajorMinimum",
  // a four-card minor at the two level or above
  "MinorDiscoveryWithFour",
  // a natural slam (a major, a minor, then notrump: the Slam preference),
  // and the forcing raises that look for one
  "Slam",
  // a six-card minor is rebid, with a jump or without, once no new suit is
  // worth showing
  "RebidLongMinor",
  // four-card support for partner's minor, short of game values, comes
  // before an invitational notrump
  "SupportMinorWithFour",
  // a natural game once nothing is left to explore (a major, then notrump
  // with stoppers, then a minor); a raise to game in partner's suit is support
  "Game",
  // an ask the shape does not call for yet (Stayman without a second
  // major, fourth suit forcing with the suit stopped), and a new suit once
  // a fit is agreed: before a limit bid, after a game
  "AskLater",
  // limit the hand: a notrump call, a pass, a suit rebid with shortness
  "CharacterizeStrength",
  // raise partner's minor
  "SupportMinors",
  // rebid our suit: a fifth card after a reverse, a sixth otherwise
  "RebidSuit",
  // obstruct with a long suit
  "Preempt",
  // keep the auction alive in the balancing seat
  "Compete",
  // everything else: garbage Stayman, fourth suit forcing with support
  "Miscellaneous",
  // the minimum call a forcing auction obliges when nothing better fits
  "Forced",
];

export const RANK: ReadonlyMap<string, number> = new Map(
  ORDER.map((name, index) => [name, index]),
);

export const BY_SUIT: Readonly<Record<string, readonly [string, string]>> = {
  Support: ["SupportMajors", "SupportMinors"],
  Discovery: ["MajorDiscovery", "MinorDiscovery"],
  RebidLong: ["RebidLongMajor", "RebidLongMinor"],
  RebidLongMinimum: ["RebidLongMajorMinimum", "RebidLongMinor"],
};

/** A declared purpose for a call: the shorthands pick major or minor by the call's suit. */
export function resolve(purpose: string, call: Call): string {
  if (Object.hasOwn(BY_SUIT, purpose)) {
    const [major, minor] = BY_SUIT[purpose];
    return call.strain !== null && "HS".includes(call.strain.char)
      ? major
      : minor;
  }
  assert(RANK.has(purpose), `unknown purpose ${JSON.stringify(purpose)}`);
  return purpose;
}

// A purpose may prefer a strain: the only ordering between rules of one purpose.  Each entry
// is the strains it names, optionally with a condition (a name resolved by rule_compiler
// through CONDITIONS); a call meeting an earlier entry is better.  A notrump game with the
// opponents' suits stopped comes before a minor game; without the stop it is the last resort.
export const PREFERENCES: Readonly<
  Record<string, readonly (readonly [string, string | null])[]>
> = {
  Game: [
    ["HS", null],
    ["N", "stopped"],
    ["CD", null],
    ["N", null],
  ],
  Slam: [
    ["HS", null],
    ["CD", null],
    ["N", null],
  ],
};
// Named conditions the preferences may use; filled in by the module that owns the constraint.
export const CONDITIONS: Map<string, Constraint> = new Map();

/**
 * (rank, condition name) pairs for a call under its purpose's strain preference: one
 * per entry that names the call's strain (a pass takes the strain of the contract it
 * passes, the caller resolves that).  No preference: one unranked variant.
 */
export function strainVariants(
  purpose: string,
  call: Call,
): [number | null, string | null][] {
  const preference = Object.hasOwn(PREFERENCES, purpose)
    ? PREFERENCES[purpose]
    : undefined;
  if (!preference || preference.length === 0 || call.strain === null) {
    return [[null, null]];
  }
  const strain = call.strain;
  const variants: [number | null, string | null][] = [];
  preference.forEach(([strains, condition], rank) => {
    if (strains.includes(strain.char)) {
      variants.push([rank, condition]);
    }
  });
  assert(
    variants.length > 0,
    `${call.name} has no place in the ${purpose} preference`,
  );
  return variants;
}

/** What `Priority.rule` holds: enough of a compiled rule to compare and print. */
export interface PriorityRule {
  readonly name: string;
}

/** The `key` of a Priority: a `prefer` rank (entry index, tie index). */
export type PriorityKey = readonly [number, number];

/**
 * A rule's priority for one variant of a call: its purpose, the purpose's strain
 * preference (a rank, or null), the rule, the rule's own key (a `prefer` rank) and the
 * rule's fallback level.  rule_compiler.PriorityOrdering compares them.
 */
export class Priority {
  readonly purpose: string;
  readonly rule: PriorityRule | null;
  readonly key: PriorityKey;
  readonly strain: number | null;
  readonly fallback: number;

  constructor(
    purpose: string,
    options: {
      rule?: PriorityRule | null;
      key?: PriorityKey;
      strain?: number | null;
      fallback?: number;
    } = {},
  ) {
    assert(RANK.has(purpose), `unknown purpose ${JSON.stringify(purpose)}`);
    this.purpose = purpose;
    this.rule = options.rule ?? null;
    this.key = options.key ?? [0, 0];
    this.strain = options.strain ?? null;
    this.fallback = options.fallback ?? 0;
  }

  get rank(): number {
    return RANK.get(this.purpose)!;
  }

  /** Python's `__eq__`: the same fields, the rule by identity. */
  equals(other: Priority): boolean {
    return (
      this.purpose === other.purpose &&
      this.rule === other.rule &&
      this.key[0] === other.key[0] &&
      this.key[1] === other.key[1] &&
      this.strain === other.strain &&
      this.fallback === other.fallback
    );
  }

  /** Python's `__repr__`, which the fixtures record: `Game/strain1/Rule[0, 1]/fallback1`. */
  repr(): string {
    const parts = [this.purpose];
    if (this.strain !== null) {
      parts.push(`strain${this.strain}`);
    }
    parts.push(
      `${this.rule === null ? "None" : this.rule.name}[${this.key[0]}, ${this.key[1]}]`,
    );
    if (this.fallback) {
      parts.push(`fallback${this.fallback}`);
    }
    return parts.join("/");
  }

  toString(): string {
    return this.repr();
  }
}
