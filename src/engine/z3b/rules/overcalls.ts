// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/rules.py, one section of it (see the section list
// at the top of that file).  Filled in by phase 5 of
// docs/typescript-engine-plan.md; the base classes shared by every section
// stay in ../rules.ts.
//
// Overcalls and advances: the direct and balancing seats, the 1N overcall,
// balancing over a raise, Michaels cuebids and Unusual 2N with their
// responses and preferences.

// cspell:ignore fromkeys AQJT ambigious

import { Call } from "../../core/call";
import { HEARTS, MAJORS, SPADES } from "../../core/suit";
import {
  Constraint,
  ConstraintAnd,
  ConstraintNot,
  ConstraintOr,
  LongestOfPartnersSuits,
  MaximumSupportPointsForPartnersLastSuit,
  MaximumSupportPointsForSuitOfCall,
  MaxLengthInLastContractSuit,
  MaxLengthInPartnersLastSuit,
  MinimumSupportPointsForPartnersLastSuit,
  MinimumSupportPointsForSuitOfCall,
  MinLength,
  MinLengthInLastContractSuit,
  minorRaiseBeforeNotrump,
  minorRaiseWithFive,
  partnerMinorRaiseBeforeNotrump,
  partnerMinorRaiseWithFive,
  StopperInRHOSuit,
  StoppersInOpponentsSuits,
  SupportForPartnerLastBid,
  SupportForSuitsOtherThanLastContract,
  ThreeOfTheTopFiveInLastContractSuit,
  ThreeOfTheTopFiveOrBetter,
  TwoOfTheTopThree,
  Unusual2NShape,
  VoidOrAceKingInLastContractSuit,
} from "../constraints";
import type { History } from "../history";
import {
  atMostOneFiveCardSuit,
  balanced,
  clubs,
  diamonds,
  exprForSuit,
  hearts,
  highCardPoints,
  NO_CONSTRAINTS,
  points,
  positions,
  spades,
  twoOfTheTopFiveClubs,
  twoOfTheTopFiveDiamonds,
  twoOfTheTopFiveHearts,
  twoOfTheTopFiveSpades,
} from "../model";
import {
  AndPrecondition,
  annotations,
  CueBid,
  DidBidSuit,
  EitherPrecondition,
  HasBid,
  InvertedPrecondition,
  JumpFromLastContract,
  LastBidHasAnnotation,
  LastBidHasLevel,
  LastBidHasStrain,
  LastBidHasSuit,
  LastBidWas,
  LastBidWasBelowGame,
  LastContractSuitBidBy,
  NotJumpFromLastContract,
  OpeningBidWas,
  RaiseOfPartnersLastSuit,
  RebidSameSuit,
  TheyOpened,
  TheyRaisedToTwoAndStopped,
  UnbidSuit,
  UnbidSuitCountRange,
} from "../preconditions";
import { Highest } from "../prefer";
import { tuple } from "../py";
import {
  categories,
  type MixinBase,
  Rule,
  rule,
  type RuleClass,
} from "../rule_compiler";
import { partnerSuitSupportPurpose, suitPreference } from "../rules";
import { type Expr, z3 } from "../z3";

export class DirectOvercall extends Rule {
  static override dsl = rule({
    preconditions: new EitherPrecondition(
      new LastBidHasAnnotation(positions.RHO, annotations.Opening),
      new AndPrecondition(
        new LastBidHasAnnotation(positions.LHO, annotations.Opening),
        new LastBidWas(positions.Partner, "P"),
        new InvertedPrecondition(new LastBidWas(positions.RHO, "P")),
      ),
    ),
  });
}

export const balancingPrecondition = new AndPrecondition(
  new LastBidHasAnnotation(positions.LHO, annotations.Opening),
  new LastBidWas(positions.Partner, "P"),
  new LastBidWas(positions.RHO, "P"),
);

export class BalancingOvercall extends Rule {
  static override dsl = rule({
    preconditions: balancingPrecondition,
  });
}

export class StandardDirectOvercall extends DirectOvercall {
  static override dsl = rule({
    preconditions: [
      new LastBidHasSuit(positions.RHO),
      new NotJumpFromLastContract(),
      new UnbidSuit(),
    ],
    sharedConstraints: [
      new MinLength(5),
      new ThreeOfTheTopFiveOrBetter(),
      // With 4 cards in RHO's suit, we're likely to be doubled -- unless we are too strong
      // to pass and too long in their suit to double (18+: overcall anyway).
      new ConstraintOr(new MaxLengthInLastContractSuit(3), points.ge(18)),
    ],
    annotations: annotations.StandardOvercall,
    forcing: false, // We're limited by the fact that we didn't double.  Partner is allowed to pass.
  });
}

export class OneLevelStandardOvercall extends StandardDirectOvercall {
  static override dsl = rule({
    purpose: "MajorDiscovery",
    sharedConstraints: points.ge(8),
    callNames: ["1D", "1H", "1S"],
    // A five-card major before a minor, the longer major first, spades with five-five.
    prefer: [["1H", hearts.gt(spades)], "1S", "1H", "1D"],
  });
}

// This is replaced by Cappelletti for now.  We could do that with a category instead.
// class DirectNotrumpDouble(DirectOvercall):
//     preconditions = LastBidWas(positions.RHO, '1N')
//     call_names = 'X'
//     shared_constraints = z3.And(points >= 15, points <= 17, balanced)

export class TwoLevelStandardOvercall extends StandardDirectOvercall {
  static override dsl = rule({
    purpose: "Discovery",
    // 10+, or 9 with "a substantial suit or excellent distribution -- two five-card suits, for
    // example" (p99): a six-card suit (the shared three-of-the-top-five applies) or 5-5.
    sharedConstraints: new ConstraintOr(
      points.ge(10),
      new ConstraintAnd(points.ge(9), new MinLength(6)),
      new ConstraintAnd(
        points.ge(9),
        new MinLength(5),
        z3.Not(atMostOneFiveCardSuit),
      ),
    ),
    callNames: ["2C", "2D", "2H", "2S"],
    // A major before a minor, the longer suit first, the higher of two equal suits.
    prefer: [
      ["2H", hearts.gt(spades)],
      "2S",
      "2H",
      ["2C", clubs.gt(diamonds)],
      "2D",
      "2C",
    ],
  });
}

export class ResponseToStandardOvercall extends Rule {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.StandardOvercall,
    ),
  });
}

// This is nearly identical to TheLaw, it just notes that you have 6 points.
// All it does is cause one test to fail.  It may not be worth having.
export class RaiseResponseToStandardOvercall extends ResponseToStandardOvercall {
  static override dsl = rule({
    purpose: "Support",
    // see constraints.minor_raise_before_notrump
    conditionalPurposes: [
      [minorRaiseBeforeNotrump, "SupportMinorWithFour"],
      [minorRaiseWithFive, "SupportMinorWithFive"],
    ],
    preconditions: [
      new RaiseOfPartnersLastSuit(),
      new NotJumpFromLastContract(),
    ],
    callNames: Call.suitedNamesBetween("2D", "3S"),
    sharedConstraints: [
      new SupportForPartnerLastBid(3),
      new MaxLengthInPartnersLastSuit(3), // with four the jump raise is preemptive (p101 h9), the cuebid a limit raise
      points.ge(6),
      new MaximumSupportPointsForPartnersLastSuit(10), // the cuebid shows 11+
    ],
  });
}

export class CuebidResponseToStandardOvercall extends ResponseToStandardOvercall {
  static override dsl = rule({
    purpose: partnerSuitSupportPurpose,
    // see constraints.minor_raise_before_notrump
    conditionalPurposes: [
      [partnerMinorRaiseBeforeNotrump, "SupportMinorWithFour", "SupportMinors"],
      [partnerMinorRaiseWithFive, "SupportMinorWithFive", "SupportMinors"],
    ],
    preconditions: [new CueBid(positions.LHO), new NotJumpFromLastContract()],
    callNames: Call.suitedNamesBetween("2C", "3H"),
    sharedConstraints: [
      new SupportForPartnerLastBid(3),
      new MinimumSupportPointsForPartnersLastSuit(11),
    ],
    // A cuebid of their suit shows nothing in it; it agrees partner's suit, so its eleven
    // are read as support points there and the natural games can add them up.
    annotations: [
      annotations.Artificial,
      annotations.CuebidAdvance,
      annotations.SupportsPartnersSuit,
    ],
  });
}

// The natural game (SufficientCombinedPoints over the eleven the cuebid promised) when the
// combined support points are there, else the extras jump, else the cheapest rebid.

/**
 * Overcaller's reply to the cuebid advance (a limit raise or better of our suit,
 * p137, structured like ResponseToJordan): the natural game in our suit when the
 * combined support points reach it, a jump with extras short of that, otherwise the
 * cheapest rebid of it, which advancer passes holding only the limit raise and raises
 * with more (NaturalSuited, valued in support points).  Before 2026-09-01 no rule
 * covered ANY call here and the overcaller was stuck (autobid-for-none: the cuebid is
 * forcing, so even the pass is unavailable).
 */
export class RebidAfterCuebidResponseToOvercall extends Rule {
  static override dsl = rule({
    category: categories.Gadget,
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.CuebidAdvance),
      new RebidSameSuit(),
    ],
  });
}

const minimumRebidAfterCuebidResponseCalls = [
  "2D",
  "2H",
  "2S",
  "3C",
  "3D",
  "3H",
  "3S",
  "4C",
  "4D",
];

export class MinimumRebidAfterCuebidResponse extends RebidAfterCuebidResponseToOvercall {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new NotJumpFromLastContract(),
    callNames: minimumRebidAfterCuebidResponseCalls,
    sharedConstraints: new MaximumSupportPointsForSuitOfCall(14), // fifteen jumps
    // dict.fromkeys(call_names, annotations.Signoff)
    annotationsPerCall: {
      "2D 2H 2S 3C 3D 3H 3S 4C 4D": annotations.Signoff,
    },
    forcing: false,
    prefer: [],
  });
}

/**
 * The single-jump rebid of our suit: extra values, still short of bidding game
 * ourselves.
 */
export class ExtrasRebidAfterCuebidResponse extends RebidAfterCuebidResponseToOvercall {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new JumpFromLastContract(1),
    callNames: ["3C", "3D", "3H", "3S", "4C", "4D"],
    // Fifteen support points: opposite the cuebid's eleven that is short of the table's
    // game (25 for a major, 28 for a minor); advancer's natural raise adds up from a maximum.
    sharedConstraints: new MinimumSupportPointsForSuitOfCall(15),
    // In a major, 16 opposite the cuebid's 10 is the game; in a minor it is still an invitation.
    constraints: {
      "3H 3S": new MaximumSupportPointsForSuitOfCall(15),
      "3C 3D 4C 4D": new MaximumSupportPointsForSuitOfCall(16),
    },
    // dict.fromkeys(call_names, annotations.Signoff)
    annotationsPerCall: {
      "3C 3D 3H 3S 4C 4D": annotations.Signoff,
    },
    forcing: false,
    prefer: [],
  });
}

export class NewSuitResponseToStandardOvercall extends ResponseToStandardOvercall {
  static override dsl = rule({
    purpose: "Discovery",
    preconditions: [
      new TheyOpened(),
      new LastBidHasAnnotation(positions.Partner, annotations.StandardOvercall),
      new NotJumpFromLastContract(),
      new UnbidSuit(),
    ],
    callNames: Call.suitedNamesBetween("1H", "3S"),
    // Advancer's new suit is not forcing: 8+ with a good five-card suit (p101 h9-h11 cuebid
    // with 11+; the new suit is the constructive alternative).  Before this it was read as
    // forcing and needed the points for partner's rebid.
    sharedConstraints: [new MinLength(5), new TwoOfTheTopThree(), points.ge(8)],
    forcing: false,
  });
}

/** Doubles of the opponents' artificial bids are lead-directing (p124). */
export class LeadDirectingDouble extends Rule {
  static override dsl = rule({
    callNames: "X",
    preconditions: [
      new LastBidHasAnnotation(positions.RHO, annotations.Artificial),
      new LastBidHasSuit(positions.RHO),
    ],
    // Implies Artificial; the forcing oracle knows partner may pass it.
    annotations: annotations.LeadDirectingDouble,
  });
}

/**
 * "Doubles of artificial bids are lead-directing" (p124): a double of Stayman, a transfer,
 * a strong 2C, a waiting 2D, a splinter, a cuebid of our suit and the like asks for the lead
 * of the suit named, five or more with three of the top five honors (p124 h30, h31).  Only
 * when the suit named is not one our side has shown: a double of their cuebid of our suit
 * (Michaels over our opening) is about values, not the lead.  Not above game (the contract
 * is settled; doubles there are penalty).  The response to an ace-ask has its own holding
 * requirement in the rule below, which outranks this one.
 */
export class LeadDirectingDoubleOfArtificialSuitBid extends LeadDirectingDouble {
  static override dsl = rule({
    purpose: "Penalize",
    preconditions: [
      new LastBidWasBelowGame(),
      new InvertedPrecondition(new LastContractSuitBidBy(positions.Me)),
      new InvertedPrecondition(new LastContractSuitBidBy(positions.Partner)),
    ],
    sharedConstraints: [
      new MinLengthInLastContractSuit(5),
      new ThreeOfTheTopFiveInLastContractSuit(),
    ],
  });
}

/**
 * A double of the response to Blackwood or Gerber asks for that suit: a void (for the
 * ruff) or the ace and king (p124 h32).  Gadget category: the more specific meaning wins
 * over the general five-card holding (two rules of one category for one call drop it).
 */
export class LeadDirectingDoubleOfAceAskingResponse extends LeadDirectingDouble {
  static override dsl = rule({
    purpose: "Penalize",
    category: categories.Gadget,
    preconditions: new EitherPrecondition(
      new LastBidHasAnnotation(positions.LHO, annotations.Blackwood),
      new LastBidHasAnnotation(positions.LHO, annotations.Gerber),
    ),
    sharedConstraints: new VoidOrAceKingInLastContractSuit(),
  });
}

export const leadDirectingDoubles: ReadonlySet<RuleClass> = new Set([
  LeadDirectingDoubleOfArtificialSuitBid,
  LeadDirectingDoubleOfAceAskingResponse,
]);

export class DirectOvercall1N extends DirectOvercall {
  static override dsl = rule({
    purpose: "EnterNotrumpSystem",
    callNames: "1N",
    sharedConstraints: [
      points.ge(15),
      points.le(18),
      balanced,
      new StopperInRHOSuit(),
    ],
    annotations: annotations.NotrumpSystemsOn,
  });
}

export class BalancingOvercallOverSuitedOpen extends BalancingOvercall {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(
      positions.LHO,
      annotations.OneLevelSuitOpening,
    ),
  });
}

// Balancing after their raised partscore dies: 1D P 2D P P or 1H P 2H P P (p140-142).
// Either opponent may have opened: 1D P 2C P 2D P P is opener's own rebid dying at the two
// level, the same balancing spot as a raise (from play, 2026-08-29).
export const twoLevelBalancingPrecondition = new AndPrecondition(
  new TheyOpened(),
  new TheyRaisedToTwoAndStopped(),
  new InvertedPrecondition(new HasBid(positions.Me)),
  new InvertedPrecondition(new HasBid(positions.Partner)),
);

export const twoLevelBalancingSuits = suitPreference(["2H", "2S", "3C", "3D"]);

export class BalancingSuitedOvercallOverRaise extends Rule {
  static override dsl = rule({
    purpose: "Compete",
    preconditions: [
      twoLevelBalancingPrecondition,
      new NotJumpFromLastContract(),
      new UnbidSuit(),
    ],
    callNames: twoLevelBalancingSuits.callNames,
    prefer: twoLevelBalancingSuits,
    sharedConstraints: [
      points.ge(7),
      new MinLength(5),
      new MaxLengthInLastContractSuit(3),
    ],
    forcing: false,
  });
}

export class BalancingDoubleOverRaise extends Rule {
  static override dsl = rule({
    purpose: "Ask",
    preconditions: twoLevelBalancingPrecondition,
    callNames: "X",
    annotations: annotations.TakeoutDouble,
    sharedConstraints: [
      points.ge(9),
      new SupportForSuitsOtherThanLastContract(),
      new MaxLengthInLastContractSuit(2),
    ],
  });
}

export class BalancingNotrumpOvercall extends BalancingOvercallOverSuitedOpen {
  static override dsl = rule({
    purpose: "EnterNotrumpSystem",
    constraints: {
      "1N": z3.And(points.ge(12), points.le(14)),
      "2N": z3.And(points.ge(19), points.le(21)),
    },
    sharedConstraints: [balanced, new StoppersInOpponentsSuits()], // Only RHO has a suit.
    annotations: annotations.NotrumpSystemsOn,
    prefer: [],
  });
}

export const balancingSuitedOvercalls = suitPreference([
  "1D",
  "1H",
  "1S",
  "2C",
  "2D",
  "2H",
  "2S",
]);

export class BalancingSuitedOvercall extends BalancingOvercallOverSuitedOpen {
  static override dsl = rule({
    purpose: "Compete",
    preconditions: [new NotJumpFromLastContract(), new UnbidSuit()],
    constraints: {
      "1D 1H 1S": points.ge(5),
      "2C 2D 2H 2S": points.ge(7),
    },
    callNames: balancingSuitedOvercalls.callNames,
    prefer: balancingSuitedOvercalls,
    sharedConstraints: [
      new MinLength(5),
      new ThreeOfTheTopFiveOrBetter(),
      // Even when balancing, we should not have strength in their suit.
      new MaxLengthInLastContractSuit(3),
    ],
    annotations: annotations.BalancingOvercall,
    forcing: false, // We're limited by the fact that we didn't double.  Partner is allowed to pass.
  });
}

export class ResponseToBalancingOvercall extends Rule {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.BalancingOvercall,
    ),
  });
}

/**
 * Advancing a balancing suited overcall (p144): partner balanced on a hand up to a king
 * lighter than a direct overcall, so the single raise is 7-11 and the jump raise 12-14 with
 * four trumps (h16-h18).  Without these the advance was left to the Law of Total Tricks.
 */
export class RaiseResponseToBalancingOvercall extends ResponseToBalancingOvercall {
  static override dsl = rule({
    preconditions: new RaiseOfPartnersLastSuit(),
    sharedConstraints: new SupportForPartnerLastBid(3),
  });
}

export class SingleRaiseResponseToBalancingOvercall extends RaiseResponseToBalancingOvercall {
  static override dsl = rule({
    purpose: "Support",
    // see constraints.minor_raise_before_notrump
    conditionalPurposes: [
      [minorRaiseBeforeNotrump, "SupportMinorWithFour"],
      [minorRaiseWithFive, "SupportMinorWithFive"],
    ],
    preconditions: new NotJumpFromLastContract(),
    callNames: Call.suitedNamesBetween("2D", "3S"),
    sharedConstraints: z3.And(points.ge(7), points.le(11)),
    prefer: [],
  });
}

export class JumpRaiseResponseToBalancingOvercall extends RaiseResponseToBalancingOvercall {
  static override dsl = rule({
    purpose: "Support",
    preconditions: new JumpFromLastContract(1),
    callNames: Call.suitedNamesBetween("3D", "4S"),
    sharedConstraints: [
      z3.And(points.ge(12), points.le(14)),
      new SupportForPartnerLastBid(4),
    ],
    prefer: [],
  });
}

/**
 * Notrump over partner's balancing suited overcall (p144): 1N 9-12, 2N 12-14, 3N 15+,
 * with a stopper in their suit and tolerance for partner's.
 */
export class NotrumpResponseToBalancingOvercall extends ResponseToBalancingOvercall {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    constraints: {
      "1N": z3.And(points.ge(9), points.le(11)), // twelve invites with 2N
      "2N": z3.And(points.ge(12), points.le(14)),
      "3N": points.ge(15),
    },
    sharedConstraints: [
      new StoppersInOpponentsSuits(),
      new SupportForPartnerLastBid(2),
    ],
    prefer: [new Highest("1N", "2N", "3N")], // the highest the hand is worth
  });
}

export const balancingJumpSuitedOvercalls = suitPreference(
  Call.suitedNamesBetween("2D", "3H"),
);

// A preempt is for less than an opening hand.  An opening preempt is for a hand that would not
// open at the one level (the opening rule for the seat); a weak jump overcall is for at most
// eleven high card points, however long the suit.
// (preempt_weak_opening lives in ../rules.ts, with the preempts that read it.)
export const preemptWeakOvercall = highCardPoints.le(11);

export class BalancingJumpSuitedOvercall extends BalancingOvercallOverSuitedOpen {
  static override dsl = rule({
    purpose: "Preempt",
    conditionalPurposes: [[preemptWeakOvercall, "PreemptWeak"]],
    preconditions: [new JumpFromLastContract(1), new UnbidSuit()],
    callNames: balancingJumpSuitedOvercalls.callNames,
    prefer: balancingJumpSuitedOvercalls,
    sharedConstraints: [
      points.ge(12),
      new MinLength(6),
      new ThreeOfTheTopFiveOrBetter(),
      // Even when balancing, we should not have strength in their suit.
      new MaxLengthInLastContractSuit(3),
    ],
    forcing: false, // We're limited by the fact that we didn't double.  Partner is allowed to pass.
  });
}

export function MichaelsCuebid<B extends MixinBase>(Base: B) {
  return class MichaelsCuebid extends Base {
    static override dsl = rule({
      preconditions: [
        new NotJumpFromLastContract(),
        new InvertedPrecondition(new UnbidSuit()),
        // Michaels is only on if the opponents have only bid one suit.
        new UnbidSuitCountRange(3, 3),
      ],
      // FIXME: 3S may force partner to bid 4H with possibly 0 points!
      // The weak range needs suit quality -- two of the top five in both suits (standard
      // practice, agreed 2026-08-29; p104 h1 passes with T8753/JT432, h5 overcalls 1S with
      // Q9863 spades; h2 cuebids with QT984, h4 with QT9865); the strong range is judged by
      // strength alone.
      constraints: {
        "2C 2D 3C 3D": z3.And(
          hearts.ge(5),
          spades.ge(5),
          z3.Or(
            points.ge(15),
            z3.And(twoOfTheTopFiveHearts, twoOfTheTopFiveSpades),
          ),
        ),
        "2H 3H": z3.And(
          spades.ge(5),
          z3.Or(clubs.ge(5), diamonds.ge(5)),
          z3.Or(
            points.ge(15),
            z3.And(
              twoOfTheTopFiveSpades,
              z3.Or(
                z3.And(clubs.ge(5), twoOfTheTopFiveClubs),
                z3.And(diamonds.ge(5), twoOfTheTopFiveDiamonds),
              ),
            ),
          ),
        ),
        "2S 3S": z3.And(
          hearts.ge(5),
          z3.Or(clubs.ge(5), diamonds.ge(5)),
          z3.Or(
            points.ge(15),
            z3.And(
              twoOfTheTopFiveHearts,
              z3.Or(
                z3.And(clubs.ge(5), twoOfTheTopFiveClubs),
                z3.And(diamonds.ge(5), twoOfTheTopFiveDiamonds),
              ),
            ),
          ),
        ),
      },
      annotations: annotations.MichaelsCuebid,
      // Mini-maxi (p103, the booklet's recommendation): weak or very strong; the middle range
      // 13-14 overcalls and shows the second suit later (p105 h7 bids 1S on a 13-count 5-5).
      sharedConstraints: z3.Or(
        z3.And(points.ge(6), points.le(12)),
        points.ge(15),
      ),
    });
  };
}

export class DirectMichaelsCuebid extends MichaelsCuebid(DirectOvercall) {
  static override dsl = rule({
    purpose: "TwoSuiter",
    preconditions: new CueBid(positions.RHO),
  });
}

export class BalancingMichaelsCuebid extends MichaelsCuebid(BalancingOvercall) {
  static override dsl = rule({
    purpose: "TwoSuiter",
    preconditions: new CueBid(positions.LHO),
  });
}

// The sandwich seat: LHO opened a suit, partner passed, RHO responded 1N.  A rule desert
// before 2026-08-29; the cuebid of opener's suit is still Michaels (p105 h9: 2D over 1D P 1N
// with the majors) and a suit overcall is natural and sound (from play: 2D on KJ9.AK832.T987.5,
// 2H on AJ8.T9.AQJT9.KQT).
export const sandwichPrecondition = new AndPrecondition(
  new LastBidHasAnnotation(positions.LHO, annotations.Opening),
  new LastBidHasSuit(positions.LHO),
  new LastBidWas(positions.Partner, "P"),
  new LastBidWas(positions.RHO, "1N"),
);

export class SandwichMichaelsCuebid extends MichaelsCuebid(Rule) {
  static override dsl = rule({
    purpose: "TwoSuiter",
    preconditions: [sandwichPrecondition, new CueBid(positions.LHO)],
  });
}

/**
 * A natural overcall in the sandwich seat: 11+ with a good five-card suit (both
 * opponents have shown values, so it is sounder than a direct overcall).
 */
export class SandwichOvercall extends Rule {
  static override dsl = rule({
    purpose: "Compete",
    preconditions: [
      sandwichPrecondition,
      new NotJumpFromLastContract(),
      new UnbidSuit(),
    ],
    callNames: ["2C", "2D", "2H", "2S"],
    sharedConstraints: [
      new MinLength(5),
      new ThreeOfTheTopFiveOrBetter(),
      points.ge(11),
    ],
    // A major before a minor, the longer suit first, the higher of two equal suits.
    prefer: [
      ["2H", hearts.gt(spades)],
      "2S",
      "2H",
      ["2C", clubs.gt(diamonds)],
      "2D",
      "2C",
    ],
    annotations: annotations.StandardOvercall,
    forcing: false,
  });
}

export class MichaelsMinorRequest extends Rule {
  static override dsl = rule({
    purpose: "Planned",
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.MichaelsCuebid),
      // The minor is only ambigious if the cuebid was a major.
      new LastBidHasStrain(positions.Partner, tuple(...MAJORS)),
      new NotJumpFromLastContract(),
    ],
    requiresPlanning: true,
    callNames: ["2N", "4C", "4N"],
    annotations: annotations.MichaelsMinorRequest,
    sharedConstraints: NO_CONSTRAINTS,
  });
}

export class ResponseToMichaelsMinorRequest extends Rule {
  static override dsl = rule({
    // FIXME: Should this be on if RHO bid?
    // If RHO bid the other minor is it already obvious which we have?
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.MichaelsMinorRequest,
    ),
  });
}

export class SuitResponseToMichaelsMinorRequest extends ResponseToMichaelsMinorRequest {
  static override dsl = rule({
    purpose: "Forced",
    preconditions: new NotJumpFromLastContract(),
    callNames: ["3C", "3D", "4D", "5C", "5D"],
    sharedConstraints: new MinLength(5),
  });
}

/**
 * The jump reply to the minor request shows the maximum Michaels hand (15+, the strong
 * range of mini-maxi; standard practice, agreed 2026-08-29): 4C on K9874.3.AQ.AKQ72 after
 * P 1H 2H P 2N.  A minimum names the minor at the three level.
 */
export class JumpSuitResponseToMichaelsMinorRequest extends ResponseToMichaelsMinorRequest {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new JumpFromLastContract(1),
    callNames: ["4C", "4D"],
    sharedConstraints: [new MinLength(5), points.ge(15)],
  });
}

/**
 * Advancer's 3C over a major-suit Michaels cuebid: at most two cards in the major partner
 * showed (hearts over their spades, spades over their hearts) and a weak hand.
 */
export class NoFitForMichaelsMajor extends Constraint {
  expr(history: History, call: Call): Expr {
    void call;
    const shown = history.partner.lastCall!.strain === SPADES ? HEARTS : SPADES;
    return z3.And(exprForSuit(shown).le(2), points.le(9));
  }
}

export const michaelsMinorPreferenceHand = new NoFitForMichaelsMajor();

/**
 * Advancer's 3C over a major-suit Michaels cuebid (hearts or spades plus an unknown minor):
 * no fit for the major, weak, willing to play in partner's minor -- pass-or-correct.
 */
export class MichaelsMinorPreference extends Rule {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.MichaelsCuebid),
      new LastBidHasStrain(positions.Partner, tuple(...MAJORS)),
      new LastBidWas(positions.RHO, "P"),
    ],
    callNames: "3C",
    sharedConstraints: michaelsMinorPreferenceHand,
    annotations: annotations.Artificial,
  });
}

/** Partner's 3C was pass-or-correct: pass with clubs, correct to 3D with diamonds (p104 h6). */
export class CorrectMichaelsMinor extends Rule {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: [
      new LastBidHasAnnotation(positions.Me, annotations.MichaelsCuebid),
      new LastBidWas(positions.Partner, "3C"),
      new LastBidWas(positions.RHO, "P"),
    ],
    callNames: "3D",
    sharedConstraints: diamonds.ge(5),
  });
}

export class PassResponseToMichaelsMinorRequest extends ResponseToMichaelsMinorRequest {
  static override dsl = rule({
    purpose: "Answer",
    // The book doesn't cover this, but if 4C was the minor request, lets interpret a pass
    // as meaning "I have clubs" and am weak (game is already remote).
    preconditions: new LastBidWas(positions.Partner, "4C"),
    callNames: "P",
    sharedConstraints: clubs.ge(5),
  });
}

// FIXME: Missing Jump responses to Michael's minor request.
// They're used for showing that we're a big michaels.

export class ForcedResponseToMichaelsCuebid extends Rule {
  static override dsl = rule({
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.MichaelsCuebid),
      new LastBidWas(positions.RHO, "P"),
    ],
  });
}

// Shared by both michaels and Unusual 2N
export function SimplePreference<B extends MixinBase>(Base: B) {
  return class SimplePreference extends Base {
    static override dsl = rule({
      preconditions: [
        new DidBidSuit(positions.Partner),
        new NotJumpFromLastContract(),
      ],
      sharedConstraints: [new MinLength(2), new LongestOfPartnersSuits()],
    });
  };
}

export const michaelsPreferences = suitPreference(
  Call.suitedNamesBetween("2H", "4H"),
);

export class MichaelsSimplePreferenceResponse extends SimplePreference(
  ForcedResponseToMichaelsCuebid,
) {
  static override dsl = rule({
    purpose: "Answer", // partner asked for a preference
    // Min: 1C 2C P 2H, Max: 2S 3S 4H
    callNames: michaelsPreferences.callNames,
    prefer: michaelsPreferences,
    sharedConstraints: new ConstraintNot(michaelsMinorPreferenceHand), // that hand bids 3C
  });
}

export class Unusual2N extends Rule {
  static override dsl = rule({
    purpose: "TwoSuiter",
    preconditions: [
      // Unusual2N only exists immediately after RHO opens.
      new LastBidHasAnnotation(positions.RHO, annotations.Opening),
      new EitherPrecondition(
        new LastBidHasAnnotation(
          positions.RHO,
          annotations.OneLevelSuitOpening,
        ),
        // FIXME: We should probably only do this when vulnerability is favorable or with more points?
        new LastBidHasAnnotation(
          positions.RHO,
          annotations.StrongTwoClubOpening,
        ),
      ),
    ],
    callNames: "2N",
    // FIXME: We should consider doing mini-max unusual 2N now that we can!
    sharedConstraints: [new Unusual2NShape(), points.ge(6)],
    annotations: annotations.Unusual2N,
    explanation: "5-5 or better in the two lowest unbid suits.",
  });
}

export class ForcedResponseToUnusual2N extends Rule {
  static override dsl = rule({
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.Unusual2N),
      new LastBidWas(positions.RHO, "P"),
    ],
  });
}

export const unusual2NPreferences = suitPreference(["3C", "3D", "3H"]);

export class Unusual2NSimplePreferenceResponse extends SimplePreference(
  ForcedResponseToUnusual2N,
) {
  static override dsl = rule({
    purpose: "Answer", // partner asked for a preference
    // Min: 1D 2N P 3C, Max: 1D 2N P 3H
    callNames: unusual2NPreferences.callNames,
    prefer: unusual2NPreferences,
  });
}

export const twoSuitedDirectOvercalls: ReadonlySet<RuleClass> = new Set([
  DirectMichaelsCuebid,
  // The sandwich-seat cuebid ranks with the direct one (above a single-suit overcall, a
  // takeout double and a weak jump; before this it tied with passing).
  SandwichMichaelsCuebid,
  Unusual2N,
]);

// The pass-out seat over a dying two-level suit contract in the opponents' 1N auction
// (the last contract is always LHO's bid there).  Named so standard takeout doubles can
// exclude it, the way they exclude balancing_precondition.
export const notrumpAuctionPassoutPrecondition = new AndPrecondition(
  new TheyOpened(),
  new OpeningBidWas("1N"),
  new LastBidHasSuit(positions.LHO),
  new LastBidHasLevel(positions.LHO, 2),
  new LastBidWas(positions.Partner, "P"),
  new LastBidWas(positions.RHO, "P"),
  new InvertedPrecondition(new HasBid(positions.Me)),
);

/** The concrete rules of this section, by name (see sayc.ts). */
export const RULE_CLASSES: Readonly<Record<string, RuleClass>> = {
  OneLevelStandardOvercall,
  TwoLevelStandardOvercall,
  RaiseResponseToStandardOvercall,
  CuebidResponseToStandardOvercall,
  MinimumRebidAfterCuebidResponse,
  ExtrasRebidAfterCuebidResponse,
  NewSuitResponseToStandardOvercall,
  LeadDirectingDoubleOfArtificialSuitBid,
  LeadDirectingDoubleOfAceAskingResponse,
  DirectOvercall1N,
  BalancingSuitedOvercallOverRaise,
  BalancingDoubleOverRaise,
  BalancingNotrumpOvercall,
  BalancingSuitedOvercall,
  SingleRaiseResponseToBalancingOvercall,
  JumpRaiseResponseToBalancingOvercall,
  NotrumpResponseToBalancingOvercall,
  BalancingJumpSuitedOvercall,
  DirectMichaelsCuebid,
  BalancingMichaelsCuebid,
  SandwichMichaelsCuebid,
  SandwichOvercall,
  MichaelsMinorRequest,
  SuitResponseToMichaelsMinorRequest,
  JumpSuitResponseToMichaelsMinorRequest,
  MichaelsMinorPreference,
  CorrectMichaelsMinor,
  PassResponseToMichaelsMinorRequest,
  MichaelsSimplePreferenceResponse,
  Unusual2N,
  Unusual2NSimplePreferenceResponse,
};
