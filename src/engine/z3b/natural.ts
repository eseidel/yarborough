// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/natural.py: the natural suited and notrump bids, the
// passes (the game and the slam are remote, the law of total tricks) and the
// helper constraints and preconditions they need.  The declaration convention
// is the header comment of rule_compiler.ts.
//
// cspell:ignore notrump preempting

import { assert } from "../core/assert";
import { Call } from "../core/call";
import { NOTRUMP, SUITS } from "../core/suit";
import {
  Constraint,
  ConstraintAnd,
  MaximumCombinedPoints,
  MaximumCombinedPointsOppositeMinimum,
  MinimumCombinedLength,
  MinLength,
  minorRaiseBeforeNotrump,
  minorRaiseWithFive,
  NotEnoughForGame,
  StoppersInOpponentsSuits,
} from "./constraints";
import type { History } from "./history";
import {
  balanced,
  exprForSuit,
  NO_CONSTRAINTS,
  points,
  positions,
  supportPointsExprForSuit,
} from "./model";
import {
  annotations,
  ForcedToBid,
  HaveFit,
  InvertedPrecondition,
  LastBidHasAnnotation,
  LastBidHasStrain,
  LastBidHasSuit,
  LastBidWas,
  LastBidWasBelowGame,
  LastBidWasBelowSlam,
  LastBidWasGameOrAbove,
  PartnerHasAtLeastLengthInSuit,
  Precondition,
} from "./preconditions";
import { Highest, LowestLevel } from "./prefer";
import {
  categories,
  type ConditionalPurpose,
  Rule,
  rule,
  type RuleClass,
} from "./rule_compiler";
import type { Expr } from "./z3";

export function copyDict<T>(
  d: Readonly<Record<string, T>>,
  keys: readonly string[],
): Record<string, T | null> {
  return Object.fromEntries(keys.map((key) => [key, d[key] ?? null]));
}

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

export class WeHaveShownMorePointsThanThem extends Precondition {
  fits(history: History, call: Call): boolean {
    void call;
    return history.us.minPoints > history.them.minPoints;
  }
}

/**
 * Partner's minimum (total points: with length or, after a raise, support points) plus this
 * hand's high-card points reach the table's number -- the booklet's own arithmetic for the hand
 * that has not revalued (a raise counts support points through MinimumCombinedSupportPoints).
 */
export class SufficientCombinedPoints extends Constraint {
  tables(): [(number | null)[], (number | null)[]] {
    return [pointsForSoundSuitedBidAtLevel, pointsForSoundNotrumpBidAtLevel];
  }

  expr(history: History, call: Call): Expr {
    const strain = call.strain!;
    const [suited, notrump] = this.tables();
    let minPoints: number | null;
    if (strain === NOTRUMP) {
      minPoints = notrump[call.level!];
    } else {
      assert(
        SUITS.includes(strain),
        `${strain} not in ${SUITS.map((s) => String(s)).join(", ")}`,
      );
      minPoints = suited[call.level!];
    }
    const implied = Math.max(0, minPoints! - history.partner.minPoints);
    // Once both hands have agreed a suit the fit is known and shortness counts on both
    // sides: the bid is valued in support points for that suit, the way partner reads it.
    // A first raise stays on hcp plus length (the corpus: 3H, not 4H, on nine with a
    // doubleton after Stayman).
    if (
      SUITS.includes(strain) &&
      call.level! <= 5 &&
      history.bidSuitNaturally(strain, positions.Partner) &&
      history.bidSuitNaturally(strain, positions.Me)
    ) {
      return supportPointsExprForSuit(strain).ge(implied);
    }
    return points.ge(implied);
  }
}

export class SufficientCombinedLength extends MinimumCombinedLength {
  constructor() {
    super(8);
  }

  override expr(history: History, call: Call): Expr {
    const strain = call.strain!;
    if (strain === NOTRUMP) {
      return NO_CONSTRAINTS;
    }
    return super.expr(history, call);
  }
}

export class LengthSatisfiesLawOfTotalTricks extends Constraint {
  expr(history: History, call: Call): Expr {
    // Written forward: level = partner_min + my_min - 6
    const myCount = call.level! + 6 - history.partner.minLength(call.strain!);
    return exprForSuit(call.strain!).ge(myCount);
  }
}

export function _naturalSuitedPossible(call: Call): string[] {
  if (call.level! >= 6) {
    return ["Slam"];
  }
  if (
    call.level === 5 ||
    (call.level === 4 && "HS".includes(call.strain!.char))
  ) {
    return "HS".includes(call.strain!.char)
      ? ["Game", "SupportMajors"]
      : ["Game"];
  }
  return ["RebidSuit", "Support", "AskLater", "Discovery"];
}

/**
 * A natural suit bid is a slam or a game at those levels; below game it raises
 * partner's suit, rebids our own, or discovers a new one.
 */
export function naturalSuitedPurpose(history: History, call: Call): string {
  if (call.level! >= 6) {
    return "Slam";
  }
  const game =
    call.level === 5 || (call.level === 4 && "HS".includes(call.strain!.char));
  const first = history.firstNaturalBidder(call.strain!);
  if (first === positions.Me) {
    return game ? "Game" : "RebidSuit"; // our own suit, whether or not partner raised it
  }
  if (
    first === positions.Partner &&
    "HS".includes(call.strain!.char) &&
    call.level! <= 4
  ) {
    return "SupportMajors"; // raising partner's major to game is still support: it beats exploring
  }
  if (game) {
    return "Game"; // a minor game competes with 3N as a game
  }
  if (first === positions.Partner) {
    return "SupportMinors";
  }
  if (
    SUITS.some(
      (s) =>
        history.bidSuitNaturally(s, positions.Me) &&
        history.bidSuitNaturally(s, positions.Partner),
    )
  ) {
    return "AskLater"; // a new suit once we have agreed one is a try, not a search for a fit
  }
  return "Discovery";
}

/**
 * A new suit is discovery; a four-card minor shown at the two level or above waits
 * behind a six-card rebid (a fifth card promotes it, see the rules' conditional purposes).
 */
export function newSuitPurpose(history: History, call: Call): string {
  void history;
  if ("HS".includes(call.strain!.char)) {
    return "MajorDiscovery";
  }
  if (call.level === 1) {
    return "MinorDiscovery";
  }
  return "MinorDiscoveryWithFour";
}

export const newMinorWithFive: readonly ConditionalPurpose[] = [
  [new MinLength(5), "MinorDiscovery", "MinorDiscoveryWithFour"],
];

export function naturalNotrumpPurpose(history: History, call: Call): string {
  void history;
  if (call.level! >= 6) {
    return "Slam";
  }
  if (call.level === 3) {
    return "Game";
  }
  return "CharacterizeStrength";
}

/** The law raises partner's suit to the level of the fit; anything else is competing. */
export function lawOfTotalTricksPurpose(history: History, call: Call): string {
  if (history.bidSuitNaturally(call.strain!, positions.Partner)) {
    return "Support";
  }
  return "Compete";
}

export class Natural extends Rule {
  static override dsl = rule({
    category: categories.Natural,
  });
}

export class SoundNaturalBid extends Natural {
  static override dsl = rule({
    sharedConstraints: [
      new SufficientCombinedLength(),
      new SufficientCombinedPoints(),
    ],
  });
}

// A natural suit bid: the slam the hand is worth (the higher first), else a game, else the
// lowest sufficient level, the higher suit within a level.
export const naturalSuitedPreference = [
  new Highest(...Call.suitedNamesBetween("6C", "7S")),
  new LowestLevel("4H", "4S", "5C", "5D"),
  new LowestLevel(
    ...Call.suitedNamesBetween("2C", "5S").filter(
      (name) => !["4H", "4S", "5C", "5D"].includes(name),
    ),
  ),
];

/**
 * A natural suit bid: a raise of partner's suit, a rebid of our own, a new suit, a game
 * or a slam.  The backstop of its purposes: any convention that applies says more.
 */
export class NaturalSuited extends SoundNaturalBid {
  static override dsl = rule({
    purpose: naturalSuitedPurpose,
    // see constraints.minorRaiseBeforeNotrump
    conditionalPurposes: [
      [minorRaiseBeforeNotrump, "SupportMinorWithFour", "SupportMinors"],
      [minorRaiseWithFive, "SupportMinorWithFive", "SupportMinors"],
    ],
    fallback: 1,
    preconditions: [
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.Partner, annotations.Preemptive),
      ),
      new WeHaveShownMorePointsThanThem(),
      new PartnerHasAtLeastLengthInSuit(1),
    ],
    callNames: Call.suitedNamesBetween("2C", "7S"),
    prefer: naturalSuitedPreference,
  });
}

export class LawOfTotalTricks extends Rule {
  static override dsl = rule({
    purpose: lawOfTotalTricksPurpose,
    conditionalPurposes: [
      [new MinLength(4), "SupportMinorWithFour", "SupportMinors"],
    ],
    preconditions: [
      // FIXME: This should only apply over weak bids (only when NaturalSuited does not)?
      new PartnerHasAtLeastLengthInSuit(1),
      // A backup for competitive auctions, not a way past partner's signoff.
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.Partner, annotations.Signoff),
      ),
    ],
    callNames: Call.suitedNamesBetween("2C", "5D"),
    sharedConstraints: new LengthSatisfiesLawOfTotalTricks(),
    fallback: 2, // the backup raise: when neither a convention's raise nor a natural raise applies
    // a game, else the level of the fit
    prefer: [
      new Highest("4H", "4S", "5C", "5D"),
      new Highest(...Call.suitedNamesBetween("2C", "5D")),
    ],
    category: categories.LawOfTotalTricks,
  });
}

export class SufficientStoppers extends Constraint {
  _isJump(lastContract: Call | null, call: Call): boolean {
    if (!lastContract) {
      return call.level! > 1;
    }
    assert(call.strain === NOTRUMP);
    if (lastContract.strain === NOTRUMP) {
      return call.level! > lastContract.level! + 1;
    }
    return call.level! > lastContract.level!;
  }

  expr(history: History, call: Call): Expr {
    if (
      this._isJump(history.lastContract, call) &&
      !history.partner.isBalanced
    ) {
      // Python passes the call too; the constraint ignores it.
      return new StoppersInOpponentsSuits().expr(history);
    }
    return NO_CONSTRAINTS;
  }
}

export class NaturalNotrump extends SoundNaturalBid {
  static override dsl = rule({
    purpose: naturalNotrumpPurpose,
    // A balanced hand's invitational 2N is its limit bid, before a raise of a minor or a suit
    // rebid; with shape those come first.
    conditionalPurposesPerCall: {
      "2N": [
        [
          new ConstraintAnd(balanced, new NotEnoughForGame()),
          "BalancedLimit",
          "CharacterizeStrength",
        ],
      ],
    },
    preconditions: new WeHaveShownMorePointsThanThem(),
    callNames: Call.notrumpNamesBetween("1N", "7N"),
    sharedConstraints: new SufficientStoppers(),
    fallback: 1, // the backstop of its purposes: any convention's notrump call says more
    // The slam the hand is worth, else the lowest sufficient level (the Game preference
    // tells a stopped 3N from an unstopped one).
    prefer: [
      new Highest("6N", "7N"),
      new LowestLevel("1N", "2N", "3N", "4N", "5N"),
    ],
  });
}

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

export class NaturalPass extends Rule {
  static override dsl = rule({
    preconditions: [
      new LastBidWas(positions.RHO, "P"),
      // Natural passes do not apply when preempting.
      new WeHaveShownMorePointsThanThem(),
      new InvertedPrecondition(new ForcedToBid()),
    ],
    callNames: "P",
    category: categories.NaturalPass,
  });
}

export class NaturalPassWithFit extends NaturalPass {
  static override dsl = rule({
    preconditions: [
      new LastBidHasSuit(positions.Partner),
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.Partner, annotations.Artificial),
      ),
      new HaveFit(),
    ],
    sharedConstraints: new MinimumCombinedLength(7, true),
  });
}

export class SuitGameIsRemote extends NaturalPassWithFit {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    preconditions: new LastBidWasBelowGame(),
    // FIXME: Shouldn't this be support points?
    sharedConstraints: new MaximumCombinedPoints(24),
    prefer: [],
    fallback: 2, // passing is what is left when no natural bid applies either
  });
}

export class SuitSlamIsRemote extends NaturalPassWithFit {
  static override dsl = rule({
    purpose: "Enough",
    preconditions: [
      new LastBidWasGameOrAbove(),
      new LastBidWasBelowSlam(),
      new InvertedPrecondition(
        new LastBidHasStrain(positions.Partner, NOTRUMP),
      ),
    ],
    sharedConstraints: new MaximumCombinedPointsOppositeMinimum(32),
    prefer: [],
    fallback: 2, // passing is what is left when no natural bid applies either
  });
}

export class NotrumpSlamIsRemote extends NaturalPass {
  static override dsl = rule({
    // passing 3N is choosing a game: only a major game (the Game preference) is better
    purpose: "Game",
    preconditions: [
      new LastBidHasStrain(positions.Partner, NOTRUMP),
      new LastBidWasGameOrAbove(),
      new LastBidWasBelowSlam(),
      // Partner's 5N (pick a slam / grand slam invitation) is forcing: never pass it.
      new InvertedPrecondition(new LastBidWas(positions.Partner, "5N")),
    ],
    sharedConstraints: new MaximumCombinedPointsOppositeMinimum(32),
    prefer: [],
    fallback: 2, // passing is what is left when no natural bid applies either
  });
}

/** The concrete rules of this module, by name (see sayc.ts). */
export const RULE_CLASSES: Readonly<Record<string, RuleClass>> = {
  NaturalSuited,
  LawOfTotalTricks,
  NaturalNotrump,
  DefaultPass,
  SuitGameIsRemote,
  SuitSlamIsRemote,
  NotrumpSlamIsRemote,
};
