// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/rules.py, one section of it (see the section list
// at the top of that file).  Filled in by phase 5 of
// docs/typescript-engine-plan.md; the base classes shared by every section
// stay in ../rules.ts.
//
// This file holds opener's rebids (after a one-level opening and after 2C),
// responder's rebids, fourth suit forcing and its responses, and the second
// negative: python/z3b/rules.py lines 780 to 1573.

// cspell:ignore Fouth Ingberman Ingberman's menetioned

import { Call, compareCalls } from "../../core/call";
import { SUITS } from "../../core/suit";
import {
  Constraint,
  ConstraintAnd,
  ConstraintNot,
  ConstraintOr,
  HelpSuitGameTryStrength,
  MaxLengthInLastContractSuit,
  MaxLengthInPartnersLastSuit,
  MinimumCombinedLength,
  MinimumCombinedPoints,
  MinimumCombinedSupportPoints,
  MinLength,
  minorRaiseBeforeNotrump,
  minorRaiseWithFive,
  Stopper,
  StoppersInUnbidSuits,
  SupportForPartnerLastBid,
  TwoOfTheTopThree,
} from "../constraints";
import type { History } from "../history";
import {
  balanced,
  clubs,
  diamonds,
  exprForSuit,
  hearts,
  NO_CONSTRAINTS,
  points,
  positions,
  semiBalanced,
  singletons,
  spades,
  stopperExprForSuit,
  threeOfTheTopFiveClubsOrBetter,
  threeOfTheTopFiveDiamondsOrBetter,
  threeOfTheTopFiveHeartsOrBetter,
  threeOfTheTopFiveSpadesOrBetter,
  voids,
} from "../model";
import {
  annotations,
  DidBidSuit,
  ForcedToBid,
  HasBid,
  HaveFit,
  InvertedPrecondition,
  JumpFromLastContract,
  JumpFromPartnerLastBid,
  LastBidHasAnnotation,
  LastBidHasSuit,
  LastBidWas,
  LastContractSuitBidBy,
  Level,
  MaxShownLength,
  NotJumpFromLastContract,
  NotJumpFromPartnerLastBid,
  Opened,
  OneLevelSuitedOpeningBook,
  PassedHand,
  Precondition,
  RaiseOfPartnersLastSuit,
  RebidFirstSuit,
  RebidSameSuit,
  StrongTwoClubOpeningBook,
  SuitLowerThanMyLastSuit,
  UnbidSuit,
} from "../preconditions";
import { Cheapest, Highest, Longest } from "../prefer";
import { categories, Rule, rule, type RuleClass } from "../rule_compiler";
import {
  JumpShift,
  OpenerRebid,
  RebidAfterOneLevelOpen,
  suitPreference,
} from "../rules";
import { type Expr, z3 } from "../z3";
import {
  newMinorWithFive,
  newSuitPurpose,
  pointsForSoundNotrumpBidAtLevel,
  SufficientCombinedPoints,
} from "../natural";

// --- Opener's rebids ----------------------------------------------------

export class NotrumpJumpRebid extends RebidAfterOneLevelOpen {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    conditionalPurposes: [[semiBalanced, "BalancedLimit"]], // a hand without a singleton tells its strength here
    // See KBB's NotrumpJumpRebid for discussion of cases for this bid.
    // Unclear how this is affected by competition?
    annotations: annotations.NotrumpSystemsOn,
    // FIXME: Does this only apply over minors?  What about 1H P 1S P 2N?
    preconditions: new JumpFromLastContract(1),
    callNames: "2N",
    sharedConstraints: [points.ge(18), points.le(19), balanced],
  });
}

/**
 * Partner is a passed hand, so his new-suit response is not forcing: with a minimum
 * opening (12 or less, a third- or fourth-seat light one), fewer than four cards in his
 * suit and no good six-card suit of our own to rebid, opener passes (from play: P on
 * K5.J86532.K6.AJ8 after P P P 1D P 1S; 2C, not P, on AQT854.7.AJ98.J3 after P P 1C P 1S).
 * Gadget category: the pass owns the call only for these hands; other hands rebid as
 * usual.
 */
export class PassPassedHandResponse extends RebidAfterOneLevelOpen {
  static override dsl = rule({
    purpose: "Enough", // game is out of reach opposite a passed hand: the auction has found its level
    category: categories.Gadget,
    preconditions: [
      new PassedHand(positions.Partner),
      new LastBidHasSuit(positions.Partner),
      new LastBidWas(positions.RHO, "P"),
      // A NEW suit only: partner's raise of our suit also matched, and this Gadget then
      // owned the pass with a meaning no 13+ opener fits -- opener had NO call over
      // P P 1H P 2H (2026-08-31, autobid-for-none).
      new InvertedPrecondition(new LastContractSuitBidBy(positions.Me)),
    ],
    callNames: "P",
    sharedConstraints: [
      points.le(12),
      new MaxLengthInLastContractSuit(3),
      // No six-card suit worth rebidding (three of the top five): J86532 is not one.
      z3.Not(
        z3.Or(
          z3.And(clubs.ge(6), threeOfTheTopFiveClubsOrBetter),
          z3.And(diamonds.ge(6), threeOfTheTopFiveDiamondsOrBetter),
          z3.And(hearts.ge(6), threeOfTheTopFiveHeartsOrBetter),
          z3.And(spades.ge(6), threeOfTheTopFiveSpadesOrBetter),
        ),
      ),
    ],
  });
}

export class RebidOneNotrumpByOpener extends RebidAfterOneLevelOpen {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    preconditions: new InvertedPrecondition(
      new LastBidWas(positions.Partner, "P"),
    ),
    callNames: "1N",
    // No shape test: the booklet's 1N rebid is a balanced minimum (p52 h3), but from play the
    // author's lines rebid 1N with a singleton when every suit rebid would be a worse lie
    // (A9863.QJT7.8.KJ6 after P 1C P 1H P; AK742.A.T972.Q63 after 1C P 1S P).
    sharedConstraints: NO_CONSTRAINTS,
  });
}

export class NotrumpInvitationByOpener extends RebidAfterOneLevelOpen {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    conditionalPurposes: [[semiBalanced, "BalancedLimit"]], // a hand without a singleton tells its strength here
    preconditions: [new NotJumpFromLastContract(), new HaveFit()],
    // If we're not balanced, than we'd have a HelpSuitGameTry to use instead.
    callNames: "2N",
    sharedConstraints: [points.ge(16), points.le(17), balanced],
  });
}

export class NewOneLevelMajorByOpener extends RebidAfterOneLevelOpen {
  static override dsl = rule({
    purpose: "MajorDiscovery",
    preconditions: new UnbidSuit(),
    // FIXME: Should this prefer Hearts over Spades: 1C P 1D P 1H with 4-4 in majors?
    // If partner is expected to prefer 4-card majors over minors then 1H seems impossible?
    sharedConstraints: new MinLength(4),
    callNames: ["1H", "1S"],
    prefer: [], // up the line
  });
}

const reverseStrength = z3.And(points.ge(16), points.le(18)); // nineteen jumps

/**
 * A reverse is on: a four-card suit above the one we opened, biddable at the two level
 * without a jump, with 16-18 (ReverseByOpener).  Such a hand reverses rather than bidding a
 * lower new suit.
 */
export class ReverseAvailable extends Constraint {
  expr(history: History, call: Call): Expr {
    void call;
    const mine = history.me.lastCall!.strain!;
    const suits: Expr[] = [];
    for (const s of SUITS) {
      const two = Call.fromLevelAndStrain(2, s);
      if (
        s.index <= mine.index ||
        !history.callHistory.isLegalCall(two) ||
        !history.isUnbidSuit(s)
      ) {
        continue;
      }
      const lastContract = history.callHistory.lastContract();
      if (lastContract && compareCalls(two, lastContract) < 0) {
        continue;
      }
      suits.push(exprForSuit(s).ge(4));
    }
    if (!suits.length) {
      return z3.BoolVal(false);
    }
    return z3.And(z3.Or(suits), reverseStrength);
  }
}

export class SecondSuitFromOpener extends RebidAfterOneLevelOpen {
  static override dsl = rule({
    preconditions: [
      new NotJumpFromLastContract(),
      new UnbidSuit(),
      new InvertedPrecondition(new HaveFit()),
    ],
  });
}

export class NewSuitByOpener extends SecondSuitFromOpener {
  static override dsl = rule({
    purpose: newSuitPurpose,
    conditionalPurposes: newMinorWithFive,
    preconditions: new SuitLowerThanMyLastSuit(),
    // If you're 4.4.0.5 and the bidding goes 1S P 1H P, do you prefer 2C or 2D?
    constraints: {
      "2C": NO_CONSTRAINTS,
      "2D": NO_CONSTRAINTS,
      "2H": NO_CONSTRAINTS,
      // 2S would necessarily be a reverse, or a jump shift, and is not covered by this rule.

      "3C": new MinimumCombinedPoints(25),
      "3D": new MinimumCombinedPoints(25),
      "3H": new MinimumCombinedPoints(25),
      // 3S would necessarily be a reverse, or a jump shift, and is not covered by this rule.
    },
    // Up to 18 (nineteen jumps) and no reverse to make (a higher four-card suit with 16+).
    sharedConstraints: [
      new MinLength(4),
      points.le(18),
      new ConstraintNot(new ReverseAvailable()),
    ],
    prefer: [new Cheapest("2H", "3H"), new Cheapest("2C", "2D", "3C", "3D")], // a major first, the minors up the line
  });
}

const reversePreconditions: readonly Precondition[] = [
  new InvertedPrecondition(new SuitLowerThanMyLastSuit()),
  new LastBidHasSuit(positions.Me),
  new UnbidSuit(),
  new NotJumpFromLastContract(),
];

export class MinimumResponseToLimitRaise extends OpenerRebid {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.LimitRaise,
    ),
  });
}

export class PassResponseToLimitRaise extends MinimumResponseToLimitRaise {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    callNames: "P",
    sharedConstraints: [balanced, points.le(14)],
  });
}

export class GameAccept extends MinimumResponseToLimitRaise {
  static override dsl = rule({
    purpose: "Game",
    preconditions: new RaiseOfPartnersLastSuit(),
    callNames: ["4H", "4S"],
    sharedConstraints: new ConstraintOr(points.ge(15), z3.Not(balanced)), // the pass below shows a balanced minimum
  });
}

export class ReverseByOpener extends SecondSuitFromOpener {
  static override dsl = rule({
    purpose: "Discovery",
    preconditions: reversePreconditions,
    annotations: annotations.OpenerReverse,
    sharedConstraints: [new MinLength(4), reverseStrength],
    callNames: ["2D", "2H", "2S"],
    prefer: [new Longest("2D", "2H", "2S"), new Cheapest("2D", "2H", "2S")], // the longer suit, else up the line
  });
}

export class ForcedMinimumResponseToOpenerReverse extends Rule {
  static override dsl = rule({
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.OpenerReverse),
      new ForcedToBid(),
    ],
  });
}

// Also known as Ingberman 2NT
export class Lebensohl extends ForcedMinimumResponseToOpenerReverse {
  static override dsl = rule({
    purpose: "Forced", // the relay is what is left when a five-card major cannot be rebid
    callNames: "2N",
    // Ingberman's 2N: a weak hand asking opener to rebid his first suit, not notrump (implies Artificial).
    annotations: annotations.Lebensohl,
    // The weak response: up to 7 hcp (p62 h7 has 6; "less than about 8 HCP and game does not
    // look promising", p62).  Priorities imply we have no major to rebid.
    sharedConstraints: points.le(7),
  });
}

/**
 * Opener's reply to the 2N over his reverse (p64): rebid the first suit, which partner will
 * pass or correct to the second.  Opener with 19+ "is not bound to comply" (the 5440 monster
 * bids 4H); that continuation is not modelled.  Gadget category: the 2N is artificial and the
 * natural rules have no reading of it.
 */
export class RebidFirstSuitAfterLebensohl extends Rule {
  static override dsl = rule({
    purpose: "Answer",
    category: categories.Gadget,
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.Lebensohl),
      new RebidFirstSuit(),
    ],
    callNames: ["3C", "3D", "3H"],
    sharedConstraints: NO_CONSTRAINTS,
    forcing: false,
  });
}

export class ForcedMajorRebid extends ForcedMinimumResponseToOpenerReverse {
  static override dsl = rule({
    purpose: "RebidSuit", // a fifth card is rebid before raising a minor or relaying
    conditionalPurposes: [[new MinLength(6), "RebidLongMajor"]], // six cards: rebid before the fourth suit
    // We have a minimum hand, so we never menetioned a 2-level suit before this one.
    callNames: ["2H", "2S"],
    // Five cards and no more than a minimum: with 10-11 and six the three-level rebid says so.
    sharedConstraints: [new MinLength(5), points.le(9)],
    prefer: [],
  });
}

export class ResponseToOpenerReverse extends Rule {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.OpenerReverse,
    ),
  });
}

/**
 * Responder's raise of one of opener's suits over the reverse with 8+ hcp: "all other
 * rebids by responder show about 8 or more HCP and, as partner has shown a 17-count or
 * better, are game forcing.  Such bids are natural" (p65).  Four cards for the reverse suit
 * (opener's second suit may be four), three for the first suit (a simple preference with a
 * weak hand goes through the 2N, so this one shows values).
 */
export class GameForcingRaiseAfterOpenerReverse extends ResponseToOpenerReverse {
  static override dsl = rule({
    callNames: ["3C", "3D", "3H", "3S"],
    preconditions: new DidBidSuit(positions.Partner),
    sharedConstraints: points.ge(8),
    forcing: true,
    prefer: [],
  });
}

export class RaiseOfReverseSuit extends GameForcingRaiseAfterOpenerReverse {
  static override dsl = rule({
    purpose: "Support",
    preconditions: new RaiseOfPartnersLastSuit(),
    sharedConstraints: new MinLength(4),
  });
}

export class RaiseOfFirstSuitAfterReverse extends GameForcingRaiseAfterOpenerReverse {
  static override dsl = rule({
    purpose: "Support",
    preconditions: new InvertedPrecondition(new RaiseOfPartnersLastSuit()),
    sharedConstraints: [new MinLength(3), new MaxLengthInPartnersLastSuit(3)], // with four in the reverse suit, raise that
  });
}

// Over a reverse the weak hand's Ingberman 2N comes before a natural part score (p62 h7: 2N,
// not a 3C preference on a 6-count); with 8+ the raise of a major is the game force to make,
// and with a minor fit 3N comes first when it is available (p65: 4D over 1D-1S; 2H says "no
// desire to play 3NT").

export class SupportPartnerSuit extends RebidAfterOneLevelOpen {
  static override dsl = rule({
    preconditions: [
      new InvertedPrecondition(new RebidSameSuit()),
      new RaiseOfPartnersLastSuit(),
    ],
  });
}

const supportPartnerMajorSuitCalls = ["2H", "2S", "3H", "3S", "4H", "4S"];

export class SupportPartnerMajorSuit extends SupportPartnerSuit {
  static override dsl = rule({
    purpose: "SupportMajors",
    callNames: supportPartnerMajorSuitCalls,
    constraints: {
      "3H 3S": new MinimumCombinedSupportPoints(22),
      "4H 4S": new MinimumCombinedSupportPoints(25),
    },
    sharedConstraints: new MinimumCombinedLength(8),
    prefer: [new Highest(...supportPartnerMajorSuitCalls)], // the highest level the hand is worth
  });
}

export class RebidOriginalSuitByOpener extends RebidAfterOneLevelOpen {
  static override dsl = rule({
    preconditions: [
      new LastBidHasAnnotation(positions.Me, annotations.OneLevelSuitOpening),
      new RebidSameSuit(),
    ],
  });
}

export class MinimumRebidOriginalSuitByOpener extends RebidOriginalSuitByOpener {
  static override dsl = rule({
    preconditions: new NotJumpFromLastContract(),
  });
}

export class UnforcedRebidOriginalSuitByOpener extends MinimumRebidOriginalSuitByOpener {
  static override dsl = rule({
    purpose: "RebidSuit",
    conditionalPurposes: [[new MinLength(6), "RebidLongMinimum"]], // a sixth card is worth showing
    preconditions: new InvertedPrecondition(new ForcedToBid()),
    // The three level, e.g. after a reverse (1C P 1S P 2D P 2S P: 3C, p63), ranks below a new
    // suit (its own priority; the two-level calls keep this rule as theirs).
    callNames: ["2C", "2D", "2H", "2S", "3C", "3D", "3H", "3S"],
    sharedConstraints: new MinLength(6),
    // At the two level a minimum (sixteen jumps, nineteen bids the game); at the three level,
    // over partner's raise, an invitation.
    constraints: {
      "2C 2D 2H 2S": points.le(15),
      "3C 3D 3H 3S": points.le(18),
    },
    prefer: [],
  });
}

// Opener's two-level rebid of a five-card suit with a singleton or void: the booklet's 2N
// rebid is balanced (p53 h13: 2S on KQJ87.3.74.AQT98, not 2N), so with shortness the suit
// rebid outranks the non-jump 2N it would otherwise lose to.

/**
 * 1N is no longer a legal call (partner responded at 1N or above): the limited suit
 * rebid takes its place.
 */
export class OneNotrumpNotAvailable extends Constraint {
  expr(history: History, call: Call): Expr {
    void call;
    return z3.BoolVal(!history.callHistory.isLegalCall(Call.fromString("1N")));
  }
}

export class ForcedRebidOriginalSuitByOpener extends MinimumRebidOriginalSuitByOpener {
  static override dsl = rule({
    purpose: "Forced",
    conditionalPurposes: [
      [new ConstraintAnd(new MinLength(6), points.le(15)), "RebidLongMinimum"], // a minimum with a sixth card rebids it
      // A five-card suit rebid with shortness limits the hand like a notrump rebid would,
      // when 1N is no longer available (OneNotrumpNotAvailable); a natural 2N comes later.
      [
        new ConstraintAnd(
          singletons.add(voids).ge(1),
          new OneNotrumpNotAvailable(),
        ),
        "CharacterizeStrength",
      ],
    ],
    preconditions: new ForcedToBid(),
    // At the three level (partner's forcing new suit was itself at the three level, e.g. over a
    // weak jump overcall) the rebid promises six; before that opener had no call at all there.
    constraints: {
      "2C 2D 2H 2S": new MinLength(5),
      "3C 3D 3H 3S": new MinLength(6),
    },
    prefer: [],
  });
}

export class UnsupportedRebid extends RebidOriginalSuitByOpener {
  static override dsl = rule({
    preconditions: new MaxShownLength(positions.Partner, 0),
  });
}

// With a solid six-card minor, 19+ and stoppers, 3N is the game to bid, not 4m (p54 h21).

export class InvitationalUnsupportedRebidByOpener extends UnsupportedRebid {
  static override dsl = rule({
    purpose: "RebidSuit",
    conditionalPurposes: [[new MinLength(6), "RebidLong"]], // a sixth card is worth showing first
    preconditions: new JumpFromLastContract(),
    sharedConstraints: [new MinLength(6), points.ge(16), points.le(18)], // 19+ bids the game
    callNames: ["3C", "3D", "3H", "3S"],
    prefer: [],
  });
}

// Mentioned as "double jump rebid his own suit", p56.
// Only thing close to an example is h19, p56 which has sufficient HCP for a game (even if not fit).
export class GameForcingUnsupportedRebidByOpener extends UnsupportedRebid {
  static override dsl = rule({
    purpose: "Game", // the jump to game in our six-card major (the Game preference puts it above 3N)
    preconditions: new JumpFromLastContract(),
    // I doubt we want to jump to game w/o support from our partner.  He's shown 6 points...
    // Maybe this is for extremely unbalanced hands, like 7+?
    // p54 h19: 4H with 19+ and a six-card major, even opposite a 1N response.
    sharedConstraints: [new MinLength(6), points.ge(19)],
    callNames: ["4C", "4D", "4H", "4S"],
    prefer: [],
  });
}

export class HelpSuitGameTry extends RebidAfterOneLevelOpen {
  static override dsl = rule({
    purpose: "SupportMajors",
    preconditions: [
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.Partner, annotations.LimitRaise),
      ), // opposite a limit raise: accept or pass
      new NotJumpFromLastContract(),
      new HaveFit(),
      new UnbidSuit(),
    ],
    // Minimum: 1C,2C,2D, Max: 1C,3C,3S
    callNames: Call.suitedNamesBetween("2D", "3S"),
    // Descriptive not placement bid hence points instead of MinimumCombinedPoints.
    sharedConstraints: [
      new MinLength(4),
      new Stopper(),
      points.ge(16),
      new HelpSuitGameTryStrength(),
    ],
    prefer: [],
  });
}

// After a negative double the cuebid (19+, every strain still open) outranks a jump shift (19+).

// JumpShiftByOpener lives in ../rules.ts (the exemplar of the JumpShift mixin).

// --- Opener's rebids after 2C -------------------------------------------

export class OpenerRebidAfterStrongTwoClubs extends OpenerRebid {
  static override dsl = rule({
    preconditions: new LastBidWas(positions.Me, "2C"),
    // This could also alternatively use annotations.StrongTwoClubOpening
  });
}

export class NotrumpRebidOverTwoClubs extends OpenerRebidAfterStrongTwoClubs {
  static override dsl = rule({
    purpose: "EnterNotrumpSystem",
    annotations: annotations.NotrumpSystemsOn,
    // These bids are only systematic after a 2D response from partner.
    preconditions: new LastBidWas(positions.Partner, "2D"),
    // 25-27 opens 3N directly, so the rebid bands are 22-24 / 28-29 / 30-31 (booklet).
    constraints: {
      "2N": z3.And(points.ge(22), points.le(24)),
      "3N": z3.And(points.ge(28), points.le(29)),
      "4N": points.ge(30),
    },
    sharedConstraints: balanced,
    prefer: [],
  });
}

const openerSuitedRebidsAfterTwoClubs = suitPreference(
  Call.suitedNamesBetween("2H", "4C"),
);

/** Some suit has seven cards with two of the top three honours: the 2C opener jumps in it. */
export class SolidSevenCardSuitSomewhere extends Constraint {
  expr(history: History, call: Call): Expr {
    void call;
    return z3.Or(
      SUITS.map((s) =>
        z3.And(
          exprForSuit(s).ge(7),
          new TwoOfTheTopThree().expr(history, Call.fromLevelAndStrain(3, s)),
        ),
      ),
    );
  }
}

export class OpenerSuitedRebidAfterStrongTwoClubs extends OpenerRebidAfterStrongTwoClubs {
  static override dsl = rule({
    purpose: "MajorDiscovery",
    preconditions: [new UnbidSuit(), new NotJumpFromLastContract()],
    // This maxes out at 4C -> 2C P 3D P 4C
    // If the opponents are competing we're just gonna double them anyway.
    // FIXME: This should either have NoMajorFit(), or have priorities separated
    // so that we prefer to support our partner's major before bidding our own new minor.
    // A seven-card suit with two of the top three honours jumps instead (in that suit).
    sharedConstraints: [
      new MinLength(5),
      new ConstraintNot(new SolidSevenCardSuitSomewhere()),
    ],
    callNames: openerSuitedRebidsAfterTwoClubs.callNames,
    prefer: openerSuitedRebidsAfterTwoClubs,
  });
}

export class OpenerSuitedJumpRebidAfterStrongTwoClubs extends OpenerRebidAfterStrongTwoClubs {
  static override dsl = rule({
    purpose: "MajorDiscovery",
    preconditions: [new UnbidSuit(), new JumpFromLastContract(1)],
    // This maxes out at 4C -> 2C P 3D P 5C, but I'm not sure we need to cover that case?
    // If we have self-supporting suit why jump all the way to 5C?  Why not Blackwood in preparation for slam?
    callNames: Call.suitedNamesBetween("3H", "5C"),
    sharedConstraints: [new MinLength(7), new TwoOfTheTopThree()],
    prefer: [],
  });
}

// --- Responder's rebids -------------------------------------------------

export class ResponderRebid extends Rule {
  static override dsl = rule({
    preconditions: [new Opened(positions.Partner), new HasBid(positions.Me)],
  });
}

export class OneLevelOpeningResponderRebid extends ResponderRebid {
  static override dsl = rule({
    preconditions: new OneLevelSuitedOpeningBook(),
  });
}

export class ResponderSuitRebid extends OneLevelOpeningResponderRebid {
  static override dsl = rule({
    preconditions: new RebidSameSuit(),
  });
}

export class RebidResponderSuitByResponder extends ResponderSuitRebid {
  static override dsl = rule({
    purpose: "RebidSuit",
    conditionalPurposes: [[new MinLength(6), "RebidLongMinimum"]], // a weak rebid of a sixth card
    preconditions: [
      new InvertedPrecondition(new RaiseOfPartnersLastSuit()),
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.Partner, annotations.OpenerReverse),
      ),
    ],
    callNames: ["2D", "2H", "2S"],
    sharedConstraints: [new MinLength(6), points.ge(6), points.le(9)], // a weak rebid; 10-11 jumps, more bids game
  });
}

/**
 * After our fourth-suit-forcing call and opener's reply, the rebid of our first suit at
 * the three level shows six cards and is forcing (p76 h2).
 */
export class RebidOwnSuitAfterFourthSuitForcing extends ResponderRebid {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: [
      new LastBidHasAnnotation(positions.Me, annotations.FourthSuitForcing),
      new DidBidSuit(positions.Me),
      new InvertedPrecondition(new RebidSameSuit()),
      // Not when opener's reply just supported the suit: then the natural raise/game applies.
      new InvertedPrecondition(new RaiseOfPartnersLastSuit()),
    ],
    callNames: ["3C", "3D", "3H", "3S"],
    sharedConstraints: new MinLength(6),
    forcing: true,
  });
}

/**
 * After our jump shift (game forcing, slam invitational) the raise of opener's major
 * shows the fit the jump shift was leading to (p41 h23: 3C "followed by a spade raise";
 * h24: 3D, "again followed by support for spades").  Opener's rebid of his suit is raised
 * to game; the slam try comes later (over 4S opener bids on with extras).  Owns the raise
 * in this auction so that the natural slam bids do not jump to 6N over the fit.
 */
export class RaiseAfterJumpShiftResponse extends ResponderRebid {
  static override dsl = rule({
    purpose: "Support",
    conditionalPurposes: [
      [minorRaiseBeforeNotrump, "SupportMinorWithFour"],
      [minorRaiseWithFive, "SupportMinorWithFive"],
    ], // see constraints.minor_raise_before_notrump
    preconditions: [
      new LastBidHasAnnotation(positions.Me, annotations.JumpShiftResponse),
      new RaiseOfPartnersLastSuit(),
    ],
    callNames: ["4H", "4S"],
    sharedConstraints: new MinLength(3),
  });
}

export class ThreeLevelSuitRebidByResponder extends ResponderSuitRebid {
  static override dsl = rule({
    purpose: "RebidSuit",
    conditionalPurposes: [[new MinLength(6), "RebidLong"]], // a sixth card is worth showing first
    preconditions: [
      new InvertedPrecondition(new RaiseOfPartnersLastSuit()),
      new MaxShownLength(positions.Partner, 0),
      new MaxShownLength(positions.Me, 5),
    ],
    callNames: ["3C", "3D", "3H", "3S"],
    constraints: { "3H 3S": points.le(12) }, // a major rebid invites (10-12); with more the game is bid
    // FIXME: Page 74 says "second round jump bid of partner's major is normally a game force".
    // Seems we should promise a bit more than just 10hcp here, or partner will be left guessing?
    // FIXME: We should want 3o5 or better?  Partner may just leave us here...
    sharedConstraints: [new MinLength(6), points.ge(10)],
  });
}

/**
 * 1x P 1N P 2y P: responder's new suit at the two level is a weak six-card suit to play
 * (p71 h12), not forcing.  Before this rule responder could only pass or sign off in
 * opener's suit.
 */
export class WeakNewSuitAfterOneNotrumpResponse extends OneLevelOpeningResponderRebid {
  static override dsl = rule({
    purpose: "Discovery",
    preconditions: [
      new LastBidWas(positions.Me, "1N"),
      new LastBidHasSuit(positions.Partner),
      // Not over opener's reverse: there a five-card major is ForcedMajorRebid (forcing to bid,
      // the two rules would otherwise tie for the call).
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.Partner, annotations.OpenerReverse),
      ),
      new UnbidSuit(),
      new Level(2),
    ],
    callNames: ["2D", "2H", "2S"],
    sharedConstraints: [new MinLength(6), points.le(9)],
    forcing: false,
  });
}

/**
 * Responder's preference for one of opener's suits with up to 11.  Without a stopper in an
 * unbid suit it limits the hand before a notrump part score does (p73 h18: 2S on
 * KJ643.9863.A9.K9, 11 with diamonds unstopped, rather than 2N; from play: 2C on
 * KQT4.AT96.632.T8 rather than 1N).  With the unbid suits stopped a notrump part score says
 * it better (1N, not 2D, on K953.972.T986.A9 with clubs stopped), and the preference is the
 * forced minimum when no notrump call is possible (the base purpose, above the default
 * pass).
 */
export class ResponderSignoffInPartnersSuit extends OneLevelOpeningResponderRebid {
  static override dsl = rule({
    purpose: "Forced",
    conditionalPurposes: [
      [new ConstraintNot(new StoppersInUnbidSuits()), "CharacterizeStrength"],
    ],
    preconditions: [
      new InvertedPrecondition(new RaiseOfPartnersLastSuit()),
      // z3 is often smart enough to know that partner has 3 in a suit
      // when re-bidding 1N, but that doesn't mean our (unforced) bid
      // of that new suit would be a sign-off!
      // FIXME: Perhaps this should required ForcedToBid()?
      new DidBidSuit(positions.Partner),
    ],
    callNames: ["2C", "2D", "2H", "2S"],
    sharedConstraints: [new MinimumCombinedLength(7), points.le(11)],
    prefer: [],
  });
}

// class ResponderSignoffInMinorGame(ResponderRebid):
//     preconditions = [
//         PartnerHasAtLeastLengthInSuit(3),
//         InvertedPrecondition(RebidSameSuit())
//     ]
//     constraints = {
//         '5C': MinimumCombinedPoints(25),
//         '5D': MinimumCombinedPoints(25),
//     }
//     shared_constraints = [MinimumCombinedLength(8), NoMajorFit()]

/**
 * Responder's 2N rebid invites 3N: a good 10 to 12 with the stoppers a notrump bid needs
 * (p70 h7: KJ64.652.KT.A754, 11; p71 h11: QJ4.T42.K9.A8765, 10).  This rule owns the 2N in
 * responder's rebid auctions (one rule per call), so a 9-count takes a preference and a
 * 13-count bids game; over opener's reverse the 2N is the Ingberman relay instead.
 */
export class ResponderNotrumpInvitation extends OneLevelOpeningResponderRebid {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    conditionalPurposes: [[semiBalanced, "BalancedLimit"]], // a hand without a singleton tells its strength here
    preconditions: [
      new NotJumpFromLastContract(),
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.Partner, annotations.OpenerReverse),
      ),
    ],
    callNames: "2N",
    sharedConstraints: [
      points.ge(10),
      points.le(12),
      new StoppersInUnbidSuits(),
    ],
  });
}

export class ResponderReverse extends OneLevelOpeningResponderRebid {
  static override dsl = rule({
    purpose: "Discovery",
    preconditions: reversePreconditions,
    // Min: 1C,1D,2C,2H, Max: 1S,2D,2S,3H
    callNames: Call.suitedNamesBetween("2H", "3H"),
    sharedConstraints: [new MinLength(4), points.ge(12)],
  });
}

export class JumpShiftResponderRebid extends JumpShift(
  OneLevelOpeningResponderRebid,
) {
  static override dsl = rule({
    purpose: "GameForce",
    // Smallest: 1D,1H,1S,3C
    // Largest: 1S,2H,3C,4D (anything above 4D is game)
    callNames: Call.suitedNamesBetween("3C", "4D"),
    // 16+: with 14-15 responder reverses or bids 3N instead (p71 h13, p72 h15); the jump shift
    // is the slam-suggesting rebid.
    sharedConstraints: [new MinLength(4), points.ge(16)],
    preconditions: new InvertedPrecondition(
      new LastBidHasAnnotation(positions.Me, annotations.NegativeDouble),
    ), // after our negative double the cuebid is the game force
    prefer: [],
  });
}

// --- Fourth suit forcing ------------------------------------------------

export class FourthSuitForcingPrecondition extends Precondition {
  fits(history: History, call: Call): boolean {
    void call;
    if (history.annotations.includes(annotations.FourthSuitForcing)) {
      return false;
    }
    return (
      history.us.bidSuits.length === 3 && history.them.bidSuits.length === 0
    );
  }
}

export class SufficientPointsForFourthSuitForcing extends Constraint {
  expr(history: History, call: Call): Expr {
    return points.ge(
      Math.max(
        0,
        pointsForSoundNotrumpBidAtLevel[call.level!]! -
          history.partner.minPoints,
      ),
    );
  }
}

// No need for ordering because at most one is available at any time.

export class FourthSuitForcing extends Rule {
  static override dsl = rule({
    category: categories.Gadget,
    preconditions: [
      new LastBidHasSuit(positions.Partner),
      new FourthSuitForcingPrecondition(),
      new UnbidSuit(),
    ],
    annotations: annotations.FourthSuitForcing,
    // A general one-round force ("in keeping with SAYC guidelines, employ it as a one-round
    // force", p74); it says nothing about the fourth suit (p75 h2: "the fourth suit says
    // nothing about hearts").  A hand that can bid the notrump game itself does (ordering).
    sharedConstraints: new SufficientPointsForFourthSuitForcing(),
  });
}

// Fourth suit forcing with four-card support for opener's second suit and only invitational
// values: raise the suit instead (p73 h20).  Its own enum, not a member of fourth_suit_forcing,
// so that it can sit below the natural part scores while fourth_suit_forcing stays above them.

// Fourth suit forcing with the fourth suit stopped: with 12+ (24 combined) the ask is still
// right (p71 h10 with KJ642 in the fourth suit; p76 h4: "3NT could be in trouble off the top",
// find the 5-3 fit first), but a hand that can bid the notrump game bids it instead, and a
// 10-11 count with a stopper invites in notrump rather than asks (ordering below); its own
// enum for the same reason as above.

export class NonJumpFourthSuitForcing extends FourthSuitForcing {
  // Without a stopper in the fourth suit the ask comes first; with one, a game in notrump is
  // bid when it fits and the ask comes before a limit bid; with support for partner's suit
  // the raise and the limit bids are better.
  static override dsl = rule({
    purpose: "Miscellaneous",
    // Without a stopper in the fourth suit the bid asks for one; with a stopper and game values
    // it waits behind a natural game; with four-card support for opener's second suit and a
    // weak hand it is neither (Miscellaneous).
    conditionalPurposes: [
      [
        new ConstraintAnd(
          new ConstraintNot(
            new ConstraintAnd(new SupportForPartnerLastBid(4), points.le(12)),
          ),
          new ConstraintNot(new Stopper()),
        ),
        "Ask",
      ],
      [
        new ConstraintAnd(
          new ConstraintNot(
            new ConstraintAnd(new SupportForPartnerLastBid(4), points.le(12)),
          ),
          new MinimumCombinedPoints(24),
        ),
        "AskLater",
      ],
    ],
    preconditions: new NotJumpFromPartnerLastBid(),
    // Smallest: 1D,1H,1S,2C
    // Largest: 1H,2D,3C,3S
    // The unconditional priority is the lowest one (a rule keeps every priority it can reach, so
    // the demoted cases must be the default); without four-card support for opener's second
    // suit, or with game-going values, the call has its stopped or unstopped fourth-suit rank.
    callNames: ["2C", "2D", "2H", "2S", "3C", "3D", "3H", "3S"],
    prefer: [],
  });
}

// We'd rather explore for NT than rebid a 5-card major, but with
// six or more, we prefer the major.

export class TwoSpadesJumpFourthSuitForcing extends FourthSuitForcing {
  static override dsl = rule({
    purpose: "Ask",
    preconditions: new JumpFromPartnerLastBid(1),
    callNames: "2S",
    prefer: [],
  });
}

/** At most max_length cards in the first suit partner bid. */
export class MaxLengthInPartnersFirstSuit extends Constraint {
  readonly maxLength: number;

  constructor(maxLength: number) {
    super();
    this.maxLength = maxLength;
  }

  expr(history: History, call: Call): Expr {
    void call;
    const suits = [...history.partner.walk]
      .filter(
        (view) =>
          view.lastCall !== null &&
          view.lastCall.strain !== null &&
          SUITS.includes(view.lastCall.strain),
      )
      .map((view) => view.lastCall!.strain!);
    if (!suits.length) {
      return NO_CONSTRAINTS;
    }
    return exprForSuit(suits[suits.length - 1]).le(this.maxLength);
  }
}

export class ResponseToFourthSuitForcing extends Rule {
  static override dsl = rule({
    category: categories.Gadget,
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.FourthSuitForcing,
    ),
  });
}

export class StopperInFouthSuit extends Constraint {
  expr(history: History, call: Call): Expr {
    void call;
    const strain = history.partner.lastCall!.strain!;
    return stopperExprForSuit(strain);
  }
}

export class NotrumpResponseToFourthSuitForcing extends ResponseToFourthSuitForcing {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new NotJumpFromLastContract(),
    callNames: ["2N", "3N"],
    sharedConstraints: new StopperInFouthSuit(),
    prefer: [],
    constraints: { "2N": points.le(14) }, // a minimum; with more the jump to 3N
  });
}

export class NotrumpJumpResponseToFourthSuitForcing extends ResponseToFourthSuitForcing {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new JumpFromLastContract(),
    callNames: "3N",
    sharedConstraints: [new StopperInFouthSuit(), points.ge(15)],
    prefer: [],
  });
}

export class DelayedSupportResponseToFourthSuitForcing extends ResponseToFourthSuitForcing {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: [
      new NotJumpFromLastContract(),
      new DidBidSuit(positions.Partner),
      // This is our first mention of this suit for it to be "delayed support".
      new InvertedPrecondition(new DidBidSuit(positions.Me)),
    ],
    callNames: Call.suitedNamesBetween("2D", "4H"),
    // Three-card support without a stopper in the fourth suit (with one, notrump).
    sharedConstraints: [
      new MinimumCombinedLength(7),
      new ConstraintNot(new StopperInFouthSuit()),
    ],
    prefer: [],
  });
}

export class RebidResponseToFourthSuitForcing extends ResponseToFourthSuitForcing {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: [
      new NotJumpFromLastContract(),
      new DidBidSuit(positions.Me),
    ],
    // FIXME: The higher call should show additional length in that suit.
    callNames: Call.suitedNamesBetween("2D", "4H"),
    sharedConstraints: NO_CONSTRAINTS,
    fallback: 1, // the rebid says nothing more: no stopper, no delayed support
  });
}

/** Raising the fourth suit: four cards there without a stopper (with one, notrump). */
export class FourthSuitResponseToFourthSuitForcing extends ResponseToFourthSuitForcing {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: [new NotJumpFromLastContract(), new UnbidSuit()],
    callNames: Call.suitedNamesBetween("3C", "4S"),
    // Four cards there, no stopper (with one, notrump), and no three-card support for
    // partner's first suit (with it, the delayed support).
    sharedConstraints: [
      new MinLength(4),
      new SufficientCombinedPoints(),
      new ConstraintNot(new StopperInFouthSuit()),
      new MaxLengthInPartnersFirstSuit(2),
    ],
    prefer: [],
  });
}

// FIXME: We should add an OpenerRebid of 3N over 2C P 2N P to show a minimum 22-24 HCP
// instead of jumping to 5N which just wastes bidding space.
// This is not covered in the book or the SAYC pdf.

// --- The second negative ------------------------------------------------

/**
 * After 2C - 2D - 2x - 3C (the second negative: 0-2 hcp, no fit) opener is not forced, but
 * the 3C is artificial so a pass is not available either (p94).
 */
export class RebidAfterSecondNegative extends Rule {
  static override dsl = rule({
    preconditions: [
      new StrongTwoClubOpeningBook(),
      new Opened(positions.Me),
      new LastBidHasSuit(positions.Me), // after a 2N rebid partner's 3C is Stayman, not the second negative
      new LastBidWas(positions.Partner, "3C"),
      new LastBidWas(positions.RHO, "P"),
    ],
    forcing: false,
  });
}

export class RebidSuitAfterSecondNegative extends RebidAfterSecondNegative {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new RebidSameSuit(),
    callNames: ["3D", "3H", "3S"],
    sharedConstraints: new MinLength(6),
  });
}

export class SecondNegative extends ResponderRebid {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: [
      new StrongTwoClubOpeningBook(),
      new LastBidWas(positions.Me, "2D"),
      new LastBidWas(positions.RHO, "P"),
      new LastBidHasSuit(positions.Partner),
    ],
    callNames: "3C",
    // Denies a fit, shows a max of 3 hcp
    sharedConstraints: points.lt(3),
    annotations: annotations.Artificial,
  });
}

/** The concrete rules of this section, by name (see sayc.ts). */
export const RULE_CLASSES: Readonly<Record<string, RuleClass>> = {
  NotrumpJumpRebid,
  PassPassedHandResponse,
  RebidOneNotrumpByOpener,
  NotrumpInvitationByOpener,
  NewOneLevelMajorByOpener,
  NewSuitByOpener,
  PassResponseToLimitRaise,
  GameAccept,
  ReverseByOpener,
  Lebensohl,
  RebidFirstSuitAfterLebensohl,
  ForcedMajorRebid,
  RaiseOfReverseSuit,
  RaiseOfFirstSuitAfterReverse,
  SupportPartnerMajorSuit,
  UnforcedRebidOriginalSuitByOpener,
  ForcedRebidOriginalSuitByOpener,
  InvitationalUnsupportedRebidByOpener,
  GameForcingUnsupportedRebidByOpener,
  HelpSuitGameTry,
  NotrumpRebidOverTwoClubs,
  OpenerSuitedRebidAfterStrongTwoClubs,
  OpenerSuitedJumpRebidAfterStrongTwoClubs,
  RebidResponderSuitByResponder,
  RebidOwnSuitAfterFourthSuitForcing,
  RaiseAfterJumpShiftResponse,
  ThreeLevelSuitRebidByResponder,
  WeakNewSuitAfterOneNotrumpResponse,
  ResponderSignoffInPartnersSuit,
  ResponderNotrumpInvitation,
  ResponderReverse,
  JumpShiftResponderRebid,
  NonJumpFourthSuitForcing,
  TwoSpadesJumpFourthSuitForcing,
  NotrumpResponseToFourthSuitForcing,
  NotrumpJumpResponseToFourthSuitForcing,
  DelayedSupportResponseToFourthSuitForcing,
  RebidResponseToFourthSuitForcing,
  FourthSuitResponseToFourthSuitForcing,
  RebidSuitAfterSecondNegative,
  SecondNegative,
};
