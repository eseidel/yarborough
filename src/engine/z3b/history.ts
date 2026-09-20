// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The interface of the interpreted auction that the DSL reads: what
// python/z3b/bidder.py's History, PositionView and GroupView expose to the
// constraints, the preconditions, the forcing oracle, the rule compiler and
// the adapter.  Types only; bidder.ts holds the History that implements
// them.  Names are the Python names in camelCase, including the "private"
// `_walkHistoryFor`, `_hasShownSuit` and `_historyAfterLastCallFor` that
// constraints.py and forcing.py reach into.

import type { Call } from "../core/call";
import type { CallHistory } from "../core/callhistory";
import type { Strain } from "../core/suit";
import type { EnumValue } from "./enum";

/**
 * What the auction remembers of the rule that explained a call: the part of a
 * CompiledRule (rule_compiler.ts) the forcing oracle and the bidder read.
 */
export interface RuleView {
  readonly name: string;
  readonly forcing: boolean | null;
  readonly requiresPlanning: boolean;
}

export interface PositionView {
  readonly history: History;
  /** A value of `model.positions`. */
  readonly position: EnumValue;
  /** This position's view of every earlier round, latest first (`walk`). */
  readonly walk: Iterable<PositionView>;
  /** Every annotation of this position's calls, latest call first. */
  readonly annotations: readonly EnumValue[];
  readonly lastCall: Call | null;
  readonly annotationsForLastCall: readonly EnumValue[];
  readonly ruleForLastCall: RuleView | null;
  readonly minPoints: number;
  readonly maxPoints: number;
  couldHaveMorePointsThan(points: number): boolean;
  minLength(suit: Strain): number;
  maxLength(suit: Strain): number;
  readonly isBalanced: boolean;
  /** Lists in suit order, not sets: constraints iterate them into z3 expressions. */
  readonly unbidSuits: readonly Strain[];
  readonly bidSuits: readonly Strain[];
}

export interface GroupView {
  readonly history: History;
  /** Values of `model.positions`. */
  readonly positions: readonly EnumValue[];
  readonly annotations: readonly EnumValue[];
  readonly unbidSuits: readonly Strain[];
  readonly bidSuits: readonly Strain[];
  readonly minPoints: number;
}

export interface History {
  readonly callHistory: CallHistory;
  /** `CallExplorer().possible_calls_over(call_history)` (a set in Python). */
  readonly legalCalls: ReadonlySet<Call>;
  /** Every annotation of every call so far, latest call first. */
  readonly annotations: readonly EnumValue[];
  /** The annotations of every call so far, in auction order. */
  annotationsByCall(): EnumValue[][];
  annotationsForPosition(position: EnumValue): readonly EnumValue[];
  annotationsForLastCall(position: EnumValue): readonly EnumValue[];
  lastCallForPosition(position: EnumValue): Call | null;
  ruleForLastCall(position: EnumValue): RuleView | null;
  minLengthForPosition(position: EnumValue, suit: Strain): number;
  maxLengthForPosition(position: EnumValue, suit: Strain): number;
  isBalancedForPosition(position: EnumValue): boolean;
  minPointsForPosition(position: EnumValue): number;
  maxPointsForPosition(position: EnumValue): number;
  couldHaveMorePointsThan(position: EnumValue, points: number): boolean;
  /** Which of us (Me or Partner) bid `strain` naturally first, or null. */
  firstNaturalBidder(strain: Strain): EnumValue | null;
  bidSuitNaturally(strain: Strain, position: EnumValue): boolean;
  isBidSuit(suit: Strain, position: EnumValue): boolean;
  isUnbidSuit(suit: Strain): boolean;
  readonly unbidSuits: readonly Strain[];
  readonly lastContract: Call | null;
  readonly rho: PositionView;
  readonly me: PositionView;
  readonly partner: PositionView;
  readonly lho: PositionView;
  readonly us: GroupView;
  readonly them: GroupView;
  readonly everyone: GroupView;
  viewFor(position: EnumValue): PositionView;
  /** The histories after each of `position`'s calls, latest first. */
  _walkHistoryFor(position: EnumValue): Iterable<History>;
  /** The history right after `position`'s latest call (this one for RHO), or null. */
  _historyAfterLastCallFor(position: EnumValue): History | null;
  /**
   * Whether `position` has shown `suit`: a BidX annotation, or four cards
   * certain after its last call (`contractsOnly`: its last contract call).
   */
  _hasShownSuit(
    suit: Strain,
    position: EnumValue,
    contractsOnly: boolean,
  ): boolean;
}
