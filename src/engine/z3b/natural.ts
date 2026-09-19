// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/natural.py: natural bids, passes and the law of
// total tricks.  Phase 5 of docs/typescript-engine-plan.md fills in the
// rules; DefaultPass is here as the exemplar of a pass rule.

import { NO_CONSTRAINTS } from "./model";
import { ForcedToBid, InvertedPrecondition } from "./preconditions";
import { categories, Rule, rule, type RuleClass } from "./rule_compiler";

export const pointsForSoundSuitedBidAtLevel: (number | null)[] = [
  //  0   1   2   3   4   5   6   7
  null,
  16,
  19,
  22,
  25,
  28,
  33,
  37,
];

// A notrump grand slam wants 37 HIGH-CARD points (the slam chapter, p156: "notrump slams require power -- generally
// 32+ HCP for a small slam and 37 HCP for a grand slam").  Partner's minimum here is total
// points, and whenever partner has shown a five-card suit it carries a length point that takes
// no trick in notrump, so the entry is 38: 37 high cards plus that point.  Opposite a balanced
// partner (a 1N opener's minimum has no length) it is a point strict, and those hands reach a
// grand through Gerber or a quantitative raise anyway.
export const pointsForSoundNotrumpBidAtLevel: (number | null)[] = [
  //  0   1   2   3   4   5   6   7
  null,
  19,
  22,
  25,
  28,
  30,
  33,
  38,
];

export class DefaultPass extends Rule {
  static override dsl = rule({
    purpose: "Forced",
    preconditions: new InvertedPrecondition(new ForcedToBid()),
    callNames: "P",
    sharedConstraints: NO_CONSTRAINTS,
    category: categories.DefaultPass,
    prefer: [],
    fallback: 1, // the pass of last resort: any forced minimum call comes first
  });
}

/** The concrete rules of this module, by name (see sayc.ts). */
export const RULE_CLASSES: Readonly<Record<string, RuleClass>> = {
  DefaultPass,
};
