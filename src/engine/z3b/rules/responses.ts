// cspell:ignore Reponse hackish jumpshift jumpshifts stiff stopperless
// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/rules.py, one section of it (see the section list
// at the top of that file): responder's calls over a one-level suit opening
// (raises, the notrump responses, new suits, Jacoby 2N and its answers, the
// negative double and its answers) and the responses to the strong 2C.
// The base classes shared by every section stay in ../rules.ts.

import { assert } from "../../core/assert";
import { Call } from "../../core/call";
import { MAJORS, MINORS, SUITS } from "../../core/suit";
import {
  Constraint,
  ConstraintAnd,
  ConstraintNot,
  ConstraintOr,
  MaxLength,
  MaxLengthInHigherUnbidMajors,
  MaximumCombinedLength,
  MaximumSupportPointsForPartnersLastSuit,
  MinLength,
  MinLengthInLastContractSuit,
  MinLengthInPartnersLastSuit,
  MinimumCombinedLength,
  MinimumCombinedPoints,
  MinimumCombinedSupportPoints,
  MinimumSupportPointsForPartnersLastSuit,
  minorRaiseBeforeNotrump,
  minorRaiseWithFive,
  OpponentsSilent,
  partnerMinorRaiseBeforeNotrump,
  partnerMinorRaiseWithFive,
  StoppersInOpponentsSuits,
  SupportForPartnerLastBid,
  ThreeOfTheTopFiveInLastContractSuit,
  ThreeOfTheTopFiveOrBetter,
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
  voids,
} from "../model";
import {
  annotations,
  CueBid,
  EitherPrecondition,
  InvertedPrecondition,
  JumpFromLastContract,
  LastBidHasAnnotation,
  LastBidHasLevel,
  LastBidHasStrain,
  LastBidHasSuit,
  LastBidWas,
  LastBidWasBelowGame,
  Level,
  NotJumpFromLastContract,
  Opened,
  PartnerHasAtLeastLengthInSuit,
  RaiseOfPartnersLastSuit,
  RebidSameSuit,
  UnbidSuit,
} from "../preconditions";
import { Cheapest, Highest, Longest } from "../prefer";
import { tuple } from "../py";
import { categories, Rule, rule, type RuleClass } from "../rule_compiler";
import {
  JumpShift,
  partnerSuitSupportPurpose,
  Response,
  ResponseToOneLevelSuitedOpen,
} from "../rules";
import { type Expr, z3 } from "../z3";
import { newMinorWithFive, newSuitPurpose } from "../natural";

// --- Responses to a suit opening ----------------------------------------

/**
 * 1x - (weak jump overcall) - 3y: a new suit at the three level, forcing (the jump took away
 * the two level; the negative double covers the four-card hands).  Before this rule partner's
 * 3y had no meaning and opener no call.
 */
export class NewSuitAtTheThreeLevelOverJumpOvercall extends ResponseToOneLevelSuitedOpen {
  static override dsl = rule({
    purpose: "Discovery",
    preconditions: [
      new LastBidHasAnnotation(positions.RHO, annotations.Preemptive),
      new UnbidSuit(),
      new NotJumpFromLastContract(),
      new Level(3),
    ],
    callNames: ["3C", "3D", "3H", "3S"],
    sharedConstraints: [new MinLength(5), new MinimumCombinedPoints(25)],
    forcing: true,
  });
}

/**
 * A new major at the one level over their overcall: the hands with the negative double's
 * shape (four-four over 1D, exactly four spades over 1H) double instead (p129).
 * Uncontested, or where no negative double is available, no constraint.
 */
export class NoNegativeDoubleShape extends Constraint {
  expr(history: History): Expr {
    const rho = history.rho.lastCall;
    if (
      rho === null ||
      history.rho.annotationsForLastCall.includes(annotations.Artificial)
    ) {
      return NO_CONSTRAINTS;
    }
    const shape = negativeDoubleShape(history);
    return shape === null ? NO_CONSTRAINTS : z3.Not(shape);
  }
}

/**
 * The negative double denies a five-card major worth bidding: at the two level our
 * longest suit with the values for a two-level response (p129: 2H, not a double, on
 * Q832.QT.AQT93.K4 over 1D 1S); over a jump overcall, at the three level with 25 combined
 * (NewSuitAtTheThreeLevelOverJumpOvercall).
 */
export class NoNewMajorAtTheTwoLevel extends Constraint {
  expr(history: History): Expr {
    const excluded: Expr[] = [];
    for (const major of MAJORS) {
      if (
        [...positions].some((position) => history.isBidSuit(major, position))
      ) {
        continue;
      }
      if (history.callHistory.isLegalCall(Call.fromLevelAndStrain(2, major))) {
        excluded.push(
          z3.And(
            longestSuit(exprForSuit(major)),
            new MinimumCombinedPoints(22).expr(history),
          ),
        );
      } else if (
        history.callHistory.isLegalCall(Call.fromLevelAndStrain(3, major))
      ) {
        excluded.push(
          z3.And(
            exprForSuit(major).ge(5),
            new MinimumCombinedPoints(25).expr(history),
          ),
        );
      }
    }
    if (!excluded.length) {
      return NO_CONSTRAINTS;
    }
    return z3.Not(z3.Or(excluded));
  }
}

export class OneLevelNewSuitResponse extends Rule {
  static override dsl = rule({
    purpose: "MajorDiscovery",
    // If partner opened, regardless of the bidding, its always only 6 points to mention a new suit at the one level.
    preconditions: [
      new Opened(positions.Partner),
      new InvertedPrecondition(new LastBidWas(positions.Partner, "X")),
    ], // over partner's reopening double the double's answers apply
    sharedConstraints: points.ge(6),
    constraints: {
      "1D": diamonds.ge(4),
      "1H": [hearts.ge(4), new NoNegativeDoubleShape()],
      "1S": [spades.ge(4), new NoNegativeDoubleShape()],
    },
    prefer: [
      ["1H", z3.And(hearts.ge(5), hearts.gt(spades))], // the longer five-card major
      ["1S", spades.ge(5)], // five spades (five-five: spades)
      ["1H", hearts.ge(5)],
      ["1D", z3.Or(hearts.eq(4), spades.eq(4))], // up the line: diamonds before a four-card major
      "1H",
      "1S",
      "1D",
    ],
  });
}

/**
 * The FREE 1N over RHO's overcall promises a stopper in their suit (round-18 review,
 * B12: the uncontested 1N promises none, and that doctrine was leaking into competition
 * -- a stopperless 1N over 1D 1S).  Uncontested, no constraint.
 */
export class StopperWhenTheyOvercalled extends Constraint {
  expr(history: History): Expr {
    const lastCall = history.rho.lastCall;
    if (
      lastCall &&
      lastCall.strain !== null &&
      SUITS.includes(lastCall.strain)
    ) {
      return new StoppersInOpponentsSuits().expr(history);
    }
    return NO_CONSTRAINTS;
  }
}

// Up to 12: the 2N and 3N responses to a minor start at 13, and over a major the hands above
// 12 have a new suit, a limit raise, Jacoby 2N or 3N.  Shared with the pass over their
// overcall, which yields to this call.
export const oneNotrumpResponseHand = new ConstraintAnd(
  points.ge(6),
  points.le(12),
  new StopperWhenTheyOvercalled(),
);

export class OneNotrumpResponse extends ResponseToOneLevelSuitedOpen {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    callNames: "1N",
    sharedConstraints: oneNotrumpResponseHand,
  });
}

export class RaiseResponse extends ResponseToOneLevelSuitedOpen {
  static override dsl = rule({
    preconditions: [
      new RaiseOfPartnersLastSuit(),
      new LastBidHasAnnotation(positions.Partner, annotations.Opening),
    ],
  });
}

export const singleRaiseStrength = [
  new MinimumCombinedSupportPoints(18),
  // Truly limited: at 10 support points the limit raise applies, and a hand under the limit
  // raise's 6-hcp floor raises here whatever its support points (the void-and-five hands).
  new ConstraintOr(
    new MaximumSupportPointsForPartnersLastSuit(9),
    points.le(5),
  ),
];

// A single raise of 1D promises four diamonds (p48 h9: 2D on KJ63); a raise of 1C, which may be
// a three-card suit, and the limit raises of either minor want five ("a 3D limit raise can be
// based on four diamonds, but it is best to have five or more", p48 h8); a raise of a major
// promises the eight-card fit.

const raiseCallNames = [
  "2C",
  "2D",
  "2H",
  "2S",
  "3C",
  "3D",
  "3H",
  "3S",
  "4H",
  "4S",
];

/**
 * Responder's raise of the opening suit: a single raise with 6-9 support points, a limit
 * raise with 10-12 (truly limited: above 12 a new suit or Jacoby 2N), and with five trumps
 * and fewer than ten high the jump to game in a major (p37-38, p38 h13).  Over their takeout
 * double the raises change meaning: RaiseOverTakeoutDouble.
 */
export class Raise extends RaiseResponse {
  static override dsl = rule({
    purpose: "Support",
    conditionalPurposes: [
      [minorRaiseBeforeNotrump, "SupportMinorWithFour"],
      [minorRaiseWithFive, "SupportMinorWithFive"],
    ], // see constraints.minor_raise_before_notrump
    preconditions: new InvertedPrecondition(
      new LastBidHasAnnotation(positions.RHO, annotations.TakeoutDouble),
    ),
    callNames: raiseCallNames,
    annotationsPerCall: { "3C 3D 3H 3S": annotations.LimitRaise },
    constraints: {
      "2C": [new MinimumCombinedLength(8), singleRaiseStrength],
      "2D": [new MinLength(4), singleRaiseStrength],
      "2H 2S": [new MinimumCombinedLength(8), singleRaiseStrength],
      "3C 3D 3H 3S": [
        new MinimumCombinedLength(8),
        points.ge(6),
        new MinimumCombinedSupportPoints(22),
        new MaximumSupportPointsForPartnersLastSuit(12),
      ],
      "4H 4S": [new MinimumCombinedLength(10), points.lt(10)],
    },
    prefer: [new Highest(...raiseCallNames)], // the highest raise the hand is worth
  });
}

/**
 * Responder's raises over their takeout double (p122-123): a single raise is 6-9 with
 * three trumps (the eight-card fit and no more), the jump raise is preemptive with four
 * trumps and fewer than ten, 2N (Jordan) is a limit raise or better, and with five trumps
 * and fewer than ten high the jump to game keeps its meaning (p122 h25).
 */
export class RaiseOverTakeoutDouble extends ResponseToOneLevelSuitedOpen {
  static override dsl = rule({
    purpose: "Support",
    purposesPerCall: { "2N": partnerSuitSupportPurpose },
    conditionalPurposesPerCall: {
      "2C 2D 3C 3D": [
        [minorRaiseBeforeNotrump, "SupportMinorWithFour"],
        [minorRaiseWithFive, "SupportMinorWithFive"],
      ],
      "2N": [
        [
          partnerMinorRaiseBeforeNotrump,
          "SupportMinorWithFour",
          "SupportMinors",
        ],
        [partnerMinorRaiseWithFive, "SupportMinorWithFive", "SupportMinors"],
      ],
    },
    preconditions: [
      new LastBidHasAnnotation(positions.RHO, annotations.TakeoutDouble),
      new LastBidHasAnnotation(positions.Partner, annotations.Opening),
    ],
    preconditionsPerCall: {
      "2C 2D 2H 2S 3C 3D 3H 3S 4H 4S": new RaiseOfPartnersLastSuit(),
    },
    callNames: [
      "2C",
      "2D",
      "2H",
      "2S",
      "2N",
      "3C",
      "3D",
      "3H",
      "3S",
      "4H",
      "4S",
    ],
    annotationsPerCall: { "2N": annotations.Jordan },
    constraints: {
      "2C": [
        new MinimumCombinedLength(8),
        new MaximumCombinedLength(8),
        singleRaiseStrength,
      ],
      "2D": [
        new MinLength(4),
        new MaximumCombinedLength(8),
        singleRaiseStrength,
      ],
      "2H 2S": [
        new MinimumCombinedLength(8),
        new MaximumCombinedLength(8),
        singleRaiseStrength,
      ],
      "2N": [
        new MinimumCombinedLength(8, true),
        new MinimumCombinedSupportPoints(22, true),
      ],
      "3C 3D 3H 3S": [
        new MinimumCombinedLength(9),
        new MaximumSupportPointsForPartnersLastSuit(9),
      ],
      "4H 4S": [new MinimumCombinedLength(10), points.lt(10)],
    },
    prefer: [
      new Highest("4H", "4S"),
      "2N",
      new Cheapest("3C", "3D", "3H", "3S"),
      new Cheapest("2C", "2D", "2H", "2S"),
    ],
  });
}

export class ThreeNotrumpMajorResponse extends ResponseToOneLevelSuitedOpen {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    conditionalPurposes: [
      [new ConstraintAnd(semiBalanced, new OpponentsSilent()), "BalancedLimit"],
    ], // over an overcall the negative double comes first
    preconditions: new LastBidHasStrain(positions.Partner, tuple(...MAJORS)),
    callNames: "3N",
    // This is a very specific range per page 43.
    // With 27+ points, do we need to worry about stoppers in RHO's suit?
    sharedConstraints: [
      balanced,
      points.ge(15),
      points.le(17),
      new MaxLengthInHigherUnbidMajors(3),
    ], // with a four-card major biddable at the one level, bid it
  });
}

export class NotrumpResponseToMinorOpen extends ResponseToOneLevelSuitedOpen {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    conditionalPurposes: [
      [
        z3.And(
          z3.And(voids.eq(0), singletons.eq(0)),
          hearts.le(3),
          spades.le(3),
        ),
        "BalancedLimit",
      ],
    ], // no singleton and no four-card major to show first
    preconditions: [
      new LastBidHasStrain(positions.Partner, tuple(...MINORS)),
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.RHO, annotations.TakeoutDouble),
      ),
    ],
    constraints: {
      "2N": z3.And(points.ge(13), points.le(15)),
      // The book says 16-18 for this bid, but with 4.3.3.3 after 1C we have no choice
      // at high enough point levels we'll just start bidding slams directly.  Until then 3N is what we have.
      "3N": z3.And(points.ge(16)),
    },
    sharedConstraints: balanced,
  });
}

// Game when the combined support points are there, else the cheapest rebid.

/**
 * Opener's reply to Jordan (a limit raise or better over their takeout double, p123):
 * game in the agreed major with more than a minimum, otherwise the cheapest rebid of it.
 * Gadget category: the natural rules would read the 2N as notrump.
 */
export class ResponseToJordan extends Rule {
  static override dsl = rule({
    purpose: "Answer",
    category: categories.Gadget,
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.Jordan),
      new RebidSameSuit(),
    ],
    constraints: {
      "3C 3D 3H 3S": NO_CONSTRAINTS,
      "4H 4S": new MinimumCombinedSupportPoints(25),
      "5C 5D": new MinimumCombinedSupportPoints(28),
    },
    // The minimum rebid may be passed (partner raises to game with more than a limit raise).
    annotationsPerCall: {
      "3C 3D 3H 3S": annotations.Signoff,
    },
    forcing: false,
    prefer: [new Highest("3C", "3D", "3H", "3S", "4H", "4S", "5C", "5D")], // game with more than a minimum
  });
}

/**
 * Partner declined our invitation with a minimum signoff: we already said everything,
 * so pass.  Gadget: the natural passes demand combined-point guarantees a limited hand
 * opposite a wide signoff cannot show -- the Jordan 2N bidder (11-12) had NO call at all
 * over opener's 3H (autobid-for-none, 2026-08-31).
 */
export class PassAfterSignoff extends Rule {
  static override dsl = rule({
    purpose: "Forced", // unconstrained: any reason to bid on comes first
    category: categories.Gadget,
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.Signoff),
      new LastBidWas(positions.RHO, "P"),
      new LastBidWasBelowGame(),
    ],
    callNames: "P",
    sharedConstraints: NO_CONSTRAINTS,
  });
}

export class ResponseAfterRHOTakeoutDouble extends ResponseToOneLevelSuitedOpen {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(
      positions.RHO,
      annotations.TakeoutDouble,
    ),
  });
}

export class RedoubleResponseAfterRHOTakeoutDouble extends ResponseAfterRHOTakeoutDouble {
  static override dsl = rule({
    purpose: "BalancedLimit",
    callNames: "XX",
    sharedConstraints: new MinimumCombinedPoints(22),
  });
}

/**
 * Over their takeout double a new suit at the two level is natural and weak with a
 * five-plus suit, 6-9 (round-18 review, A4; the reference's non-forcing 6-10 reading) --
 * the uncontested 10+ forcing meaning is off.  The 10+ hands start with a redouble: the
 * booklet calls the bid invitational but its own p122 h23 redoubles with 11 even holding
 * five diamonds, so the weak reading is the consistent one.
 */
export class NewSuitAtTheTwoLevelAfterRHODouble extends ResponseAfterRHOTakeoutDouble {
  static override dsl = rule({
    purpose: "Discovery",
    preconditions: [new UnbidSuit(), new NotJumpFromLastContract()],
    callNames: ["2C", "2D", "2H", "2S"],
    sharedConstraints: [new MinLength(5), points.ge(6), points.le(9)],
    forcing: false,
  });
}

export class JumpShiftResponseToOpenAfterRHODouble extends JumpShift(
  ResponseAfterRHOTakeoutDouble,
) {
  static override dsl = rule({
    purpose: "GameForce",
    callNames: Call.suitedNamesBetween("2D", "3H"),
    sharedConstraints: [points.ge(5), new MinLength(6), new TwoOfTheTopThree()],
  });
}

// A new suit at the two level: with a five-card suit that is at least as long as every other
// suit, bid it -- the higher of two five-card suits first (1S P: 2H on 5 hearts and 5 diamonds),
// the longer suit first with 6-5.  A four-card minor is bid up the line (2C before 2D) and only
// when no five-card suit qualifies.  Majors always need five.

/** The suit has five or more cards and no other suit is longer. */
export function longestSuit(suitExpr: Expr): Expr {
  return z3.And(
    suitExpr.ge(5),
    ...[clubs, diamonds, hearts, spades]
      .filter((other) => other !== suitExpr)
      .map((other) => suitExpr.ge(other)),
  );
}

export class NewSuitAtTheTwoLevel extends ResponseToOneLevelSuitedOpen {
  static override dsl = rule({
    purpose: newSuitPurpose,
    conditionalPurposes: newMinorWithFive,
    preconditions: [
      new UnbidSuit(),
      new NotJumpFromLastContract(),
      // Over their takeout double the call is invitational with a five-plus suit, not
      // the uncontested 10+ force: NewSuitAtTheTwoLevelAfterRHODouble.
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.RHO, annotations.TakeoutDouble),
      ),
    ],
    callNames: ["2C", "2D", "2H", "2S"],
    constraints: {
      "2C": clubs.ge(4),
      "2D": diamonds.ge(4),
      "2H": longestSuit(hearts),
      "2S": longestSuit(spades),
    },
    // A five-card suit at least as long as every other, the higher first (1S P: 2H on five
    // hearts and five diamonds); a four-card minor up the line, and only when no five-card
    // suit qualifies.  Majors always need five.
    prefer: [
      "2S",
      "2H",
      ["2D", longestSuit(diamonds)],
      ["2C", longestSuit(clubs)],
      "2C",
      "2D",
    ],
    sharedConstraints: new MinimumCombinedPoints(22),
  });
}

export class ResponseToMajorOpen extends ResponseToOneLevelSuitedOpen {
  static override dsl = rule({
    preconditions: [
      new LastBidHasStrain(positions.Partner, tuple(...MAJORS)),
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.Partner, annotations.Artificial),
      ),
    ],
  });
}

export class PassResponseToSuitedOpen extends ResponseToOneLevelSuitedOpen {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    preconditions: new LastBidWas(positions.RHO, "P"),
    callNames: "P",
    // SuitGameIsRemote would imply that we have < 4 hcp, but conventionally we may pass with 5 hcp.
    // To avoid creating a hole, we if we don't have either 6 hcp or 6 support points we may pass.
    sharedConstraints: new ConstraintOr(
      new MaximumSupportPointsForPartnersLastSuit(5),
      points.le(5),
    ),
  });
}

// Due to the Or above, we need to order PassResponseToSuitedOpen relative to raises and game jumps.

/**
 * Responder can bid 1N over their overcall: it is legal, and the hand has the values and
 * the stopper (OneNotrumpResponse).
 */
export class OneNotrumpResponseAvailable extends Constraint {
  expr(history: History, call: Call): Expr {
    if (!history.callHistory.isLegalCall(Call.fromString("1N"))) {
      return z3.BoolVal(false);
    }
    return oneNotrumpResponseHand.expr(history, call);
  }
}

/**
 * Responder's pass after RHO overcalls a suit at the one or two level.  With nothing to
 * say (up to 9 hcp; every stronger hand has a call) it is just a pass.  With five or more of
 * their suit with three of the top five honors and 10+ it is a trap pass (p130 h6, p137,
 * p138): we cannot double for penalties, so we pass and wait for opener's reopening double,
 * which we will pass.  One rule with both meanings so that the pass has a rule for every
 * hand in the auction (a pass rule claims the call for the whole auction).
 */
export class PassResponseOverOvercall extends ResponseToOneLevelSuitedOpen {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    preconditions: [
      new LastBidHasSuit(positions.RHO),
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.RHO, annotations.Artificial),
      ),
      new EitherPrecondition(
        new LastBidHasLevel(positions.RHO, 1),
        new LastBidHasLevel(positions.RHO, 2),
      ),
    ],
    callNames: "P",
    sharedConstraints: new ConstraintOr(
      new ConstraintAnd(
        new MinLengthInLastContractSuit(5),
        new ThreeOfTheTopFiveInLastContractSuit(),
        points.ge(10),
      ),
      new ConstraintAnd(
        points.le(9),
        new ConstraintNot(new OneNotrumpResponseAvailable()),
      ), // with 6-9 and a stopper, 1N
    ),
    conditionalPurposes: [
      [
        new ConstraintAnd(
          new MinLengthInLastContractSuit(5),
          new ThreeOfTheTopFiveInLastContractSuit(),
          points.ge(10),
        ),
        "Penalize",
      ],
    ],
    prefer: [],
  });
}

export class Jacoby2N extends ResponseToMajorOpen {
  // With four trumps the forcing raise comes first; with three a new suit is shown first
  // (the game-forcing raise then ranks with a slam try, above a natural slam: the order below).
  static override dsl = rule({
    purpose: "Slam",
    conditionalPurposes: [
      [new MinLengthInPartnersLastSuit(4), "SupportMajors"],
    ], // with four trumps the fit is found: support
    preconditions: new LastBidWas(positions.RHO, "P"),
    callNames: "2N",
    sharedConstraints: [
      // The book says 14+, but this needs to be 13 hcp or there is a hole above limit raise.
      points.ge(13),
      // FIXME: We should use a conditional priority to make Jacoby2N with only
      // 3-card trump support lower priority than mentioning a new suit.
      new SupportForPartnerLastBid(3),
    ],
    annotations: annotations.Jacoby2N,
    prefer: [],
  });
}

/**
 * A five-card suit with three of the top five honours other than the suit we opened:
 * the jump to four of it answers Jacoby 2N (p40).
 */
export class SolidSideSuit extends Constraint {
  expr(history: History): Expr {
    const mine = history.me.lastCall!.strain;
    return z3.Or(
      SUITS.filter((s) => s !== mine).map((s) =>
        z3.And(
          exprForSuit(s).ge(5),
          new ThreeOfTheTopFiveOrBetter().expr(
            history,
            Call.fromLevelAndStrain(4, s),
          ),
        ),
      ),
    );
  }
}

export class ResponseToJacoby2N extends Rule {
  // Bids above 4NT are either natural or covered by other conventions.
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.Jacoby2N,
    ),
    category: categories.Gadget,
  });
}

/**
 * Opener's shape answers to Jacoby 2N (p40): a jump to four of a five-card side suit with
 * three of the top five honours, else three of a suit with a singleton or void (the solid
 * suit first: 4D, not 3C, on 8.KQJ72.AJ973.K9 after 1H P 2N P).
 */
export class ShapeResponseToJacoby2N extends ResponseToJacoby2N {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new InvertedPrecondition(new RebidSameSuit()),
    callNames: ["3C", "3D", "3H", "3S", "4C", "4D", "4H", "4S"],
    constraints: {
      "3C 3D 3H 3S": new MaxLength(1),
      "4C 4D 4H 4S": [new MinLength(5), new ThreeOfTheTopFiveOrBetter()],
    },
    annotationsPerCall: { "3C 3D 3H 3S": annotations.Artificial },
    prefer: [
      new Cheapest("4C", "4D", "4H", "4S"),
      new Cheapest("3C", "3D", "3H", "3S"),
    ],
  });
}

/** Three of the agreed major: 18+ with no singleton or void to show (p40). */
export class SlamResponseToJacoby2N extends ResponseToJacoby2N {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new RebidSameSuit(),
    callNames: ["3C", "3D", "3H", "3S"],
    sharedConstraints: [
      points.ge(18),
      singletons.eq(0),
      voids.eq(0),
      new ConstraintNot(new SolidSideSuit()),
    ],
    prefer: [],
  });
}

/** Game in the agreed major: nothing else to say. */
export class MinimumResponseToJacoby2N extends ResponseToJacoby2N {
  static override dsl = rule({
    purpose: "Answer",
    fallback: 1,
    preconditions: new RebidSameSuit(),
    callNames: ["4C", "4D", "4H", "4S"],
    sharedConstraints: NO_CONSTRAINTS,
  });
}

/** 3N: 16-17 with no singleton or void (p40; the booklet's 15-17). */
export class NotrumpResponseToJacoby2N extends ResponseToJacoby2N {
  static override dsl = rule({
    purpose: "Answer",
    callNames: "3N",
    sharedConstraints: [
      points.ge(16),
      points.le(17),
      singletons.eq(0),
      voids.eq(0),
      new ConstraintNot(new SolidSideSuit()),
    ],
    prefer: [],
  });
}

export class JumpShiftResponseToOpen extends JumpShift(
  ResponseToOneLevelSuitedOpen,
) {
  static override dsl = rule({
    purpose: "GameForce",
    preconditions: new InvertedPrecondition(
      new LastBidHasAnnotation(positions.RHO, annotations.TakeoutDouble),
    ),

    // Jumpshifts must be below game and are off in competition so
    // 1S P 3H is the highest available response jumpshift.
    callNames: Call.suitedNamesBetween("2D", "3H"),
    // FIXME: Shouldn't this be MinHighCardPoints?
    sharedConstraints: [points.ge(19), new MinLength(5)],
    annotations: annotations.JumpShiftResponse,
  });
}

// The negative double's shape by the opening and the overcall (p129): both majors over a
// minor overcall, the other major (four exactly) over a major, the minors over their major.
export const NEGATIVE_DOUBLE_SHAPES: Readonly<Record<string, Expr>> = {
  "1C 1D": z3.And(hearts.ge(4), spades.ge(4)),
  "1C 1H": spades.eq(4),
  // After a minor opening, "two places to play" means the unbid major with
  // EITHER minor as the second place (the unbid one or support for opener's),
  // and a five-card unbid major qualifies on its own (round-18 review, A3: the
  // old rows hard-required the unbid minor, freezing out the booklet's hands).
  "1C 1S": z3.Or(
    z3.And(hearts.ge(4), z3.Or(diamonds.ge(3), clubs.ge(3))),
    hearts.ge(5),
  ),
  "1C 2D": z3.And(hearts.ge(4), spades.ge(4)),
  "1C 2H": z3.Or(
    z3.And(spades.ge(4), z3.Or(diamonds.ge(3), clubs.ge(3))),
    spades.ge(5),
  ),
  "1C 2S": z3.Or(
    z3.And(hearts.ge(4), z3.Or(diamonds.ge(3), clubs.ge(3))),
    hearts.ge(5),
  ),
  "1D 1H": spades.eq(4),
  "1D 1S": z3.Or(
    z3.And(hearts.ge(4), z3.Or(clubs.ge(3), diamonds.ge(3))),
    hearts.ge(5),
  ),
  "1D 2C": z3.And(hearts.ge(4), spades.ge(4)),
  "1D 2H": z3.Or(
    z3.And(spades.ge(4), z3.Or(clubs.ge(3), diamonds.ge(3))),
    spades.ge(5),
  ),
  "1D 2S": z3.Or(
    z3.And(hearts.ge(4), z3.Or(clubs.ge(3), diamonds.ge(3))),
    hearts.ge(5),
  ),
  "1H 1S": z3.And(clubs.ge(3), diamonds.ge(3)), // Probably promises 4+ in both minors?
  "1H 2C": z3.And(diamonds.ge(3), spades.ge(4)),
  "1H 2D": z3.And(clubs.ge(3), spades.ge(4)),
  "1H 2S": z3.And(clubs.ge(3), diamonds.ge(3)),
  "1S 2C": z3.And(diamonds.ge(3), hearts.ge(4)),
  "1S 2D": z3.And(clubs.ge(3), hearts.ge(4)),
  "1S 2H": z3.And(clubs.ge(3), diamonds.ge(3)),
};

/**
 * The negative double's shape in this auction, or None when there is no such double
 * (partner's last call is not a one-level suit opening, or RHO's is not a suit overcall).
 */
export function negativeDoubleShape(history: History): Expr | null {
  const partner = history.partner.lastCall;
  const rho = history.rho.lastCall;
  if (partner === null || rho === null) {
    return null;
  }
  const key = `${partner.name} ${rho.name}`;
  return Object.hasOwn(NEGATIVE_DOUBLE_SHAPES, key)
    ? NEGATIVE_DOUBLE_SHAPES[key]
    : null;
}

export class ShapeForNegativeDouble extends Constraint {
  expr(history: History): Expr {
    const shape = negativeDoubleShape(history);
    assert(
      shape !== null,
      `no negative double in ${history.callHistory.callsString()}`,
    );
    return shape;
  }
}

export class NegativeDouble extends ResponseToOneLevelSuitedOpen {
  static override dsl = rule({
    callNames: "X",
    preconditions: [
      new LastBidHasAnnotation(
        positions.Partner,
        annotations.OneLevelSuitOpening,
      ),
      new LastBidHasSuit(positions.Partner),
      new LastBidHasSuit(positions.RHO),
      // A hackish way to make sure Partner and RHO did not bid the same suit.
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.RHO, annotations.Artificial),
      ),
    ],
    sharedConstraints: [
      new ShapeForNegativeDouble(),
      new NoNewMajorAtTheTwoLevel(),
    ],
    annotations: annotations.NegativeDouble,
  });
}

export class OneLevelNegativeDouble extends NegativeDouble {
  static override dsl = rule({
    purpose: "MajorDiscovery",
    preconditions: new LastBidHasLevel(positions.RHO, 1),
    sharedConstraints: points.ge(6),
  });
}

export class TwoLevelNegativeDouble extends NegativeDouble {
  static override dsl = rule({
    purpose: "MajorDiscovery",
    preconditions: new LastBidHasLevel(positions.RHO, 2),
    sharedConstraints: points.ge(8),
  });
}

// The negative double (four cards in the unbid major) comes first; the three-level new suit is for
// hands without it (1C 2H: 4-4-5 doubles, a six-card club suit bids 3C).

// aka OpenerRebidAfterNegativeDouble.
export class ResponseToNegativeDouble extends Rule {
  static override dsl = rule({
    category: categories.Gadget, // FIXME: Is this right?
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.NegativeDouble,
    ),
  });
}

export class CuebidReponseToNegativeDouble extends ResponseToNegativeDouble {
  static override dsl = rule({
    purpose: "GameForce",
    preconditions: [new CueBid(positions.LHO), new NotJumpFromLastContract()],
    // Min: 1C 1D X P 2D, Max: 1C 2S X 3S
    // Unclear if a cuebid of 2D ever makes sense since
    // we'll know they're 4-4 in the majors and can choose between a minor game and NT?
    callNames: Call.suitedNamesBetween("2D", "3S"),
    sharedConstraints: points.ge(19),
    // A cuebid of their suit shows nothing in it.
    annotations: annotations.Artificial,
  });
}

export class NewSuitResponseToNegativeDouble extends ResponseToNegativeDouble {
  static override dsl = rule({
    purpose: newSuitPurpose,
    conditionalPurposes: newMinorWithFive,
    preconditions: [new NotJumpFromLastContract(), new UnbidSuit()],
    // Min: 1C 1D X P 1H, Max: 1C 2S X P 3H
    callNames: Call.suitedNamesBetween("1H", "3H"),
    sharedConstraints: new MinLength(4),
  });
}

export class RaiseResponseToNegativeDouble extends ResponseToNegativeDouble {
  static override dsl = rule({
    purpose: "Support",
    conditionalPurposes: [
      [minorRaiseBeforeNotrump, "SupportMinorWithFour"],
      [minorRaiseWithFive, "SupportMinorWithFive"],
    ], // see constraints.minor_raise_before_notrump
    preconditions: [
      new PartnerHasAtLeastLengthInSuit(4),
      new NotJumpFromLastContract(),
    ],
    // Min: 1C 1D X P 1H, Max: 1C 2S X P 3H
    callNames: ["1H", "1S", "2C", "2D", "2H", "2S", "3C", "3D", "3H"],
    prefer: [],
    sharedConstraints: [new MinimumCombinedLength(8), points.le(15)], // the jump raise shows 16+
  });
}

// FIXME: Should this be a forced-only response?  Should the unforced variant show points? stoppers?
export class NotrumpResponseToNegativeDouble extends ResponseToNegativeDouble {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    preconditions: new NotJumpFromLastContract(),
    // A minimum: with 16+ the jump 2N (or 3N) says so; the natural 4N and 5N are slam tries.
    constraints: { "1N": points.le(15), "2N": points.le(19) },
    sharedConstraints: balanced,
  });
}

export class JumpResponseToNegativeDouble extends ResponseToNegativeDouble {
  static override dsl = rule({
    preconditions: new JumpFromLastContract(1),
    sharedConstraints: points.ge(16),
  });
}

export class JumpRaiseResponseToNegativeDouble extends JumpResponseToNegativeDouble {
  static override dsl = rule({
    purpose: "Support",
    conditionalPurposes: [
      [minorRaiseBeforeNotrump, "SupportMinorWithFour"],
      [minorRaiseWithFive, "SupportMinorWithFive"],
    ], // see constraints.minor_raise_before_notrump
    preconditions: [new PartnerHasAtLeastLengthInSuit(4)],
    // Min: 1C 1D X P 2H, Max: 1C 2S X P 4H
    callNames: ["2H", "2S", "3C", "3D", "3H", "3S", "4C", "4D", "4H"],
    sharedConstraints: new MinimumCombinedLength(8),
    prefer: [],
  });
}

export class JumpNotrumpResponseToNegativeDouble extends JumpResponseToNegativeDouble {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    conditionalPurposes: [[semiBalanced, "BalancedLimit"]], // a hand without a singleton tells its strength here
    callNames: "2N",
    // If this bid promised balanced, it would be exactly 18, as otherwise
    // we would have opened 1N if we were balanced.
    // But we still shouldn't have any voids.  With a void we should be jumping to some suit.
    // If this bid had no constraints, then minor jump raises are impossible.
    // No singleton either (a jump to 2N with a stiff spade was made on A.AQ94.KJT95.Q53); the
    // booklet's 2N hands are 5-4-2-2 shapes too, so z3b's `balanced` (one doubleton) is too strict.
    sharedConstraints: new MinLength(2, SUITS),
    prefer: [],
  });
}

export class CueBidRebidAfterNegativeDouble extends Rule {
  static override dsl = rule({
    purpose: "GameForce",
    preconditions: [
      new LastBidHasAnnotation(positions.Me, annotations.NegativeDouble),
      // If we understood better what kind of hand this bid was trying to show, we might be able to cuebid after NT.
      new LastBidHasSuit(positions.Partner),
      // I don't think there are any artificial responses to NegativeDoubles, or we should check !artificial here?
      // The Cuebid here is defined as RHO's opening bid, not whatever their most recent one may be.
      new CueBid(positions.RHO, true),
    ],
    // Min: 1D 1H X P 2C P 2H, Max: 1H 2S X P 3D P 3S
    // A cuebid of their suit shows nothing in it.
    annotations: annotations.Artificial,
    callNames: Call.suitedNamesBetween("2H", "3S"),
    // Shows slam interest, but in which suit?
    sharedConstraints: new MinimumSupportPointsForPartnersLastSuit(15), // How big should this really be?
  });
}

// --- Responses to 2C ----------------------------------------------------

export class ResponseToStrongTwoClubs extends Response {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.StrongTwoClubOpening,
    ),
  });
}

/** 2D waiting: no positive response to make (p92 h8). */
export class WaitingResponseToStrongTwoClubs extends ResponseToStrongTwoClubs {
  static override dsl = rule({
    purpose: "Answer",
    fallback: 1,
    callNames: "2D",
    sharedConstraints: NO_CONSTRAINTS,
    annotations: annotations.Artificial,
  });
}

export const twoClubsPositiveSuit = new ConstraintAnd(
  new MinLength(5),
  new TwoOfTheTopThree(),
);

/**
 * Some suit has five cards with two of the top three honours: a positive suit response
 * to 2C (p92 h5).
 */
export class PositiveSuitSomewhere extends Constraint {
  expr(history: History): Expr {
    return z3.Or(
      SUITS.map((s) =>
        twoClubsPositiveSuit.expr(history, Call.fromLevelAndStrain(3, s)),
      ),
    );
  }
}

const suitResponseToStrongTwoClubsCalls = ["2H", "2S", "3C", "3D"];

export class SuitResponseToStrongTwoClubs extends ResponseToStrongTwoClubs {
  static override dsl = rule({
    purpose: "Answer",
    callNames: suitResponseToStrongTwoClubsCalls,
    sharedConstraints: [twoClubsPositiveSuit, points.ge(8)],
    prefer: [
      new Longest(...suitResponseToStrongTwoClubsCalls),
      new Cheapest(...suitResponseToStrongTwoClubsCalls),
    ],
  });
}

/** 2N: 8+ with no suit worth a positive response (p92 h7). */
export class NotrumpResponseToStrongTwoClubs extends ResponseToStrongTwoClubs {
  static override dsl = rule({
    purpose: "Answer",
    callNames: "2N",
    sharedConstraints: [
      points.ge(8),
      new ConstraintNot(new PositiveSuitSomewhere()),
    ],
    prefer: [],
  });
}

/** The concrete rules of this section, by name (see sayc.ts). */
export const RULE_CLASSES: Readonly<Record<string, RuleClass>> = {
  CueBidRebidAfterNegativeDouble,
  CuebidReponseToNegativeDouble,
  Jacoby2N,
  JumpNotrumpResponseToNegativeDouble,
  JumpRaiseResponseToNegativeDouble,
  JumpShiftResponseToOpen,
  JumpShiftResponseToOpenAfterRHODouble,
  MinimumResponseToJacoby2N,
  NewSuitAtTheThreeLevelOverJumpOvercall,
  NewSuitAtTheTwoLevel,
  NewSuitAtTheTwoLevelAfterRHODouble,
  NewSuitResponseToNegativeDouble,
  NotrumpResponseToJacoby2N,
  NotrumpResponseToMinorOpen,
  NotrumpResponseToNegativeDouble,
  NotrumpResponseToStrongTwoClubs,
  OneLevelNegativeDouble,
  OneLevelNewSuitResponse,
  OneNotrumpResponse,
  PassAfterSignoff,
  PassResponseOverOvercall,
  PassResponseToSuitedOpen,
  Raise,
  RaiseOverTakeoutDouble,
  RaiseResponseToNegativeDouble,
  RedoubleResponseAfterRHOTakeoutDouble,
  ResponseToJordan,
  ShapeResponseToJacoby2N,
  SlamResponseToJacoby2N,
  SuitResponseToStrongTwoClubs,
  ThreeNotrumpMajorResponse,
  TwoLevelNegativeDouble,
  WaitingResponseToStrongTwoClubs,
};
