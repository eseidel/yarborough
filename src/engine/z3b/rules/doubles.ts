// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/rules.py, one section of it (see the section list
// at the top of that file).  Filled in by phase 5 of
// docs/typescript-engine-plan.md; the base classes shared by every section
// stay in ../rules.ts.
//
// Takeout doubles: the doubles themselves (direct, balancing, reopening, over a
// preempt), the responses to a takeout double, and the doubler's rebids.

// cspell:ignore Cuebid cuebids overcallable Techincally

import { Call } from "../../core/call";
import {
  ConstraintAnd,
  ConstraintOr,
  LightSupportForUnbidSuits,
  LongestSuitExceptOpponentSuits,
  MaxLengthInLastContractSuit,
  MaxLengthInUnbidMajors,
  MaxLengthInUnbidSuits,
  MinLength,
  MinLengthInLastContractSuit,
  ReopeningSupport,
  ShortnessInASuitTheyBid,
  StopperInRHOSuit,
  StoppersInOpponentsSuits,
  SupportForPartnersSuits,
  SupportForSuitsOtherThanLastContract,
  SupportForUnbidSuits,
  TwoOfTheTopThree,
} from "../constraints";
import {
  atMostOneFiveCardSuit,
  balanced,
  clubs,
  diamonds,
  hearts,
  points,
  positions,
  semiBalanced,
  spades,
  threeOfTheTopFiveHeartsOrBetter,
  threeOfTheTopFiveSpadesOrBetter,
} from "../model";
import {
  AndPrecondition,
  annotations,
  CueBid,
  EitherPrecondition,
  HasBid,
  InvertedPrecondition,
  JumpFromLastContract,
  JumpFromPartnerLastBid,
  LastBidHasAnnotation,
  LastBidHasLevel,
  LastBidHasSuit,
  LastBidWas,
  LastBidWasBelowGame,
  LastBidWasGameOrAbove,
  Level,
  MaxLevel,
  NotJumpFromLastContract,
  Opened,
  OpeningBidWas,
  RaiseOfPartnersLastSuit,
  SuitUnbidByOpponents,
  TheyOpened,
  TheyRaisedToTwoAndStopped,
  UnbidSuit,
  UnbidSuitCountRange,
} from "../preconditions";
import { Cheapest, HigherSuit, Highest, Longest } from "../prefer";
import { Rule, rule, type RuleClass } from "../rule_compiler";
import { z3 } from "../z3";

// The overcall section of rules.py owns these three preconditions (they sit above this
// section in the Python module); until that section is ported they are declared here.

// The pass-out seat over the opponents' one-level opening that died (1D P P), p140-142.
const balancingPrecondition = new AndPrecondition(
  new LastBidHasAnnotation(positions.LHO, annotations.Opening),
  new LastBidWas(positions.Partner, "P"),
  new LastBidWas(positions.RHO, "P"),
);

// Balancing after their raised partscore dies: 1D P 2D P P or 1H P 2H P P (p140-142).
// Either opponent may have opened: 1D P 2C P 2D P P is opener's own rebid dying at the two
// level, the same balancing spot as a raise (from play, 2026-08-29).
const twoLevelBalancingPrecondition = new AndPrecondition(
  new TheyOpened(),
  new TheyRaisedToTwoAndStopped(),
  new InvertedPrecondition(new HasBid(positions.Me)),
  new InvertedPrecondition(new HasBid(positions.Partner)),
);

// The pass-out seat over a dying two-level suit contract in the opponents' 1N auction
// (the last contract is always LHO's bid there).  Named so standard takeout doubles can
// exclude it, the way they exclude balancing_precondition.
const notrumpAuctionPassoutPrecondition = new AndPrecondition(
  new TheyOpened(),
  new OpeningBidWas("1N"),
  new LastBidHasSuit(positions.LHO),
  new LastBidHasLevel(positions.LHO, 2),
  new LastBidWas(positions.Partner, "P"),
  new LastBidWas(positions.RHO, "P"),
  new InvertedPrecondition(new HasBid(positions.Me)),
);

// --- Takeout doubles ----------------------------------------------------

export class TakeoutDouble extends Rule {
  static override dsl = rule({
    callNames: "X",
    preconditions: [
      new LastBidHasSuit(),
      new InvertedPrecondition(new HasBid(positions.Partner)),
      new InvertedPrecondition(new LastBidWas(positions.Me, "X")),
      // A double of RHO's artificial bid (Stayman, a transfer) is lead-directing, not takeout.
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.RHO, annotations.Artificial),
      ),
      // LastBidWasNaturalSuit(),
      // LastBidWasBelowGame(),
      new UnbidSuitCountRange(2, 3),
    ],
    annotations: annotations.TakeoutDouble,
    // Shape and strength are specific to the seat: see the subclasses.
    explanation:
      "Either support for all unbid suits or a hand too strong to overcall.",
  });
}

// Too strong to overcall (double first, then bid): 18+, unless we hold four of their suit
// and a 5-card suit of our own, which we overcall instead.
export const tooStrongToOvercall = new ConstraintAnd(
  points.ge(18),
  new ConstraintOr(
    new MaxLengthInLastContractSuit(3),
    new MaxLengthInUnbidSuits(4),
  ),
);

export const takeoutDoubleAfterPreemptPrecondition = new AndPrecondition(
  new EitherPrecondition(
    new LastBidHasAnnotation(positions.RHO, annotations.Preemptive),
    // FIXME: This shouldn't apply when LHO preempts and RHO shows points!
    new LastBidHasAnnotation(positions.LHO, annotations.Preemptive),
  ),
  new InvertedPrecondition(new HasBid(positions.Me)),
);

export class OvercallTakeoutDouble extends TakeoutDouble {
  static override dsl = rule({
    // FIXME: Do we need to exclude takeout double rebids by responder?
    preconditions: new InvertedPrecondition(new Opened(positions.Me)),
  });
}

// A five-card major we would overcall: five or more with three of the top five honors.
export const overcallableFiveCardMajor = z3.Or(
  z3.And(hearts.ge(5), threeOfTheTopFiveHeartsOrBetter),
  z3.And(spades.ge(5), threeOfTheTopFiveSpadesOrBetter),
);

export class OneLevelTakeoutDouble extends OvercallTakeoutDouble {
  static override dsl = rule({
    purpose: "Ask",
    preconditions: [
      new Level(1),
      new InvertedPrecondition(takeoutDoubleAfterPreemptPrecondition),
      new InvertedPrecondition(balancingPrecondition),
    ],
    // Shape with 11+, or 10 with at most a singleton in one of their suits (p115 h6: 10 with a
    // heart void; p118 h9: 10 with a singleton club and 5-5 in the unbid suits after 1C P 1D),
    // or too strong to overcall.  A five-card major good enough to overcall (three of the top
    // five) is overcalled, not doubled (p118 h10); a ragged five-card major with 4-4 in the
    // other suits still doubles (p115 h6: J9874), and so does a five-card minor.
    sharedConstraints: new ConstraintOr(
      new ConstraintAnd(
        new SupportForUnbidSuits(),
        z3.Not(overcallableFiveCardMajor),
        new ConstraintOr(
          points.ge(11),
          new ConstraintAnd(points.ge(10), new ShortnessInASuitTheyBid()),
        ),
      ),
      tooStrongToOvercall,
    ),
  });
}

export class TwoLevelTakeoutDouble extends OvercallTakeoutDouble {
  static override dsl = rule({
    purpose: "Ask",
    preconditions: [
      new Level(2),
      new InvertedPrecondition(takeoutDoubleAfterPreemptPrecondition),
      new InvertedPrecondition(balancingPrecondition),
      new InvertedPrecondition(notrumpAuctionPassoutPrecondition),
      new InvertedPrecondition(twoLevelBalancingPrecondition),
    ],
    // 12+ (was 15: a gap-filling constant stricter than the booklet's "opening values with shape";
    // measured 2026-08-27 on 150k deals: 12 gains the doubling side +0.05 MP%, 17 loses -0.02)
    sharedConstraints: new ConstraintOr(
      new ConstraintAnd(new SupportForUnbidSuits(), points.ge(12)),
      tooStrongToOvercall,
    ),
  });
}

export const standardTakeoutDoubles: ReadonlySet<RuleClass> = new Set([
  OneLevelTakeoutDouble,
  TwoLevelTakeoutDouble,
]);

export class TakeoutDoubleAfterPreempt extends OvercallTakeoutDouble {
  static override dsl = rule({
    purpose: "Ask",
    // Takeout only below game: doubles of opening bids at game or higher are penalty
    // (booklet; the reference stops takeout at 4D), and a 0-count advancer was being
    // FORCED to bid 5C over 4S X P (round-18 review, A2).
    preconditions: [
      takeoutDoubleAfterPreemptPrecondition,
      new LastBidWasBelowGame(),
    ],
    sharedConstraints: new ConstraintOr(
      new ConstraintAnd(new LightSupportForUnbidSuits(), points.ge(12)),
      points.ge(17),
    ),
  });
}

/**
 * Doubles are takeout over opening partscore bids and penalty over opening bids at
 * game or higher (booklet), 3N included.  Deliberately NOT a TakeoutDouble: advancer
 * passes with nothing instead of being forced to advance.
 */
export class PenaltyDoubleOfGameOpening extends Rule {
  static override dsl = rule({
    purpose: "Penalize",
    preconditions: [
      new LastBidHasAnnotation(positions.RHO, annotations.Opening),
      new LastBidWasGameOrAbove(),
      new InvertedPrecondition(new HasBid(positions.Partner)),
    ],
    callNames: "X",
    sharedConstraints: points.ge(15),
  });
}

/**
 * "The bid of 2NT over a weak two-bid shows the equivalent of a strong notrump opener"
 * (p107): 15-20 balanced with a stopper in their suit and no five-card suit (the harness's
 * KT98.KQ2.AK4.KQT, a 20-count, bids 2N over 2S; p108: AT6.KJ864.A4.A42, 16 with five
 * diamonds, doubles).  Owns the 2N over a weak two, where the unusual 2N is off.
 */
export class TwoNotrumpOvercallOfWeakTwo extends Rule {
  static override dsl = rule({
    purpose: "EnterNotrumpSystem",
    preconditions: [
      new LastBidHasAnnotation(positions.RHO, annotations.Preemptive),
      new LastBidHasLevel(positions.RHO, 2),
      new InvertedPrecondition(new HasBid(positions.Partner)),
    ],
    callNames: "2N",
    sharedConstraints: [
      points.ge(15),
      points.le(20),
      balanced,
      new StopperInRHOSuit(),
      z3.And(clubs.le(4), diamonds.le(4), hearts.le(4), spades.le(4)),
    ],
    annotations: annotations.NotrumpSystemsOn,
  });
}

export class BalancingDouble extends OvercallTakeoutDouble {
  static override dsl = rule({
    purpose: "Ask",
    preconditions: [
      new Level(1),
      balancingPrecondition,
      new InvertedPrecondition(takeoutDoubleAfterPreemptPrecondition),
    ],
    // Light shape with 8+ (with a 5-card major we overcall it instead; a minor defers to the
    // double), or 16+: too strong to balance with a suit (p142).
    sharedConstraints: new ConstraintOr(
      new ConstraintAnd(
        new LightSupportForUnbidSuits(),
        points.ge(8),
        new MaxLengthInUnbidMajors(4),
      ),
      z3.And(points.ge(16), atMostOneFiveCardSuit), // 5-5 balances with the suit
    ),
  });
}

export class ReopeningDouble extends TakeoutDouble {
  static override dsl = rule({
    purpose: "Penalize", // reopening protects partner's penalty pass before anything else
    // These only apply when partner hasn't mentioned a suit, right?
    preconditions: [
      new Opened(positions.Me),
      // Above 2S X, seems we need more than opening points?
      new MaxLevel(2),
    ],
    // Having 17+ points is not a sufficient reason to takeout later in the auction.
    // Short in their suit (a doubleton will do: partner may pass for penalties); 3-3 in the
    // unbid suits is enough here (p136-137), unlike the direct-seat double.
    sharedConstraints: new ReopeningSupport(),
  });
}

/**
 * The opponents opened 1N and their auction is dying at a two-level suit partscore
 * (1N-P-2H-P-P, or 1N-P-2D-P-2H-P-P after a transfer): the pass-out seat doubles for
 * takeout.  Previously no rule ever contested these auctions (and when the 2-level
 * response is natural, TwoLevelTakeoutDouble claiming the same X at the same category
 * made the call selector drop the call entirely).
 */
export class BalancingDoubleAfterNotrumpAuction extends Rule {
  static override dsl = rule({
    purpose: "Ask",
    callNames: "X",
    preconditions: [
      notrumpAuctionPassoutPrecondition,
      new InvertedPrecondition(new HasBid(positions.Partner)),
    ],
    annotations: annotations.TakeoutDouble,
    sharedConstraints: [
      points.ge(11),
      new SupportForSuitsOtherThanLastContract(),
      new MaxLengthInLastContractSuit(2),
    ],
  });
}

// Response indicates longest suit (excepting opponent's) with 3+ cards support.
// Cheapest level indicates < 10 points.
// NT indicates a stopper in opponent's suit.  1N: 6-10, 2N: 11-12, 3N: 13-16
// Jump bid indicates 10-12 points (normal invitational values)
// cue-bid in opponent's suit is a 13+ michaels-like bid.
export class ResponseToTakeoutDouble extends Rule {
  static override dsl = rule({
    // RHO passed (we are forced to bid) or bid a suit (a free bid, p120: no longer forced,
    // so the suit bids need values; the notrump bids, the cuebid and the penalty pass still
    // need RHO's pass).
    preconditions: [
      new EitherPrecondition(
        new LastBidWas(positions.RHO, "P"),
        new LastBidHasSuit(positions.RHO),
      ),
      new LastBidHasAnnotation(positions.Partner, annotations.TakeoutDouble),
    ],
  });
}

/**
 * Partner's takeout (or reopening / balancing) double is passed for penalties with five
 * or more of their suit and some values (p145, h20).
 */
export class PenaltyPassOfTakeoutDouble extends ResponseToTakeoutDouble {
  static override dsl = rule({
    purpose: "Penalize",
    preconditions: new LastBidWas(positions.RHO, "P"),
    callNames: "P",
    // Six of their suit with 8+, or five with 9+ (a weak five-bagger and 8 advances instead).
    sharedConstraints: new ConstraintOr(
      new ConstraintAnd(new MinLengthInLastContractSuit(6), points.ge(8)),
      new ConstraintAnd(new MinLengthInLastContractSuit(5), points.ge(9)),
    ),
  });
}

export class NotrumpResponseToTakeoutDouble extends ResponseToTakeoutDouble {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    preconditions: [
      new LastBidWas(positions.RHO, "P"),
      new NotJumpFromLastContract(),
    ],
    constraints: {
      "1N": points.ge(6),
      "2N": points.ge(11),
      "3N": points.ge(13),
    },
    sharedConstraints: [balanced, new StoppersInOpponentsSuits()],
    prefer: [new Highest("1N", "2N", "3N")], // the highest the hand is worth: 6-10, 11-12, 13+
  });
}

// FIXME: This could probably be handled by suited to play if we could get the priorities right!
export class JumpNotrumpResponseToTakeoutDouble extends ResponseToTakeoutDouble {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    conditionalPurposes: [[semiBalanced, "BalancedLimit"]], // a hand without a singleton tells its strength here
    preconditions: [
      new LastBidWas(positions.RHO, "P"),
      new JumpFromLastContract(),
    ],
    constraints: {
      "2N": points.ge(11),
      "3N": points.ge(13),
    },
    sharedConstraints: [balanced, new StoppersInOpponentsSuits()],
    prefer: [new Highest("2N", "3N")],
  });
}

// Need conditional priorities to disambiguate cases like being 1.4.4.4 with 0 points after 1C X P
// Similarly after 1H X P, with 4 spades and 4 clubs, but with xxxx spades and AKQx clubs, do we bid clubs or spades?
// The tables run to the cheapest call over the highest doubled contract (a 4S preempt):
// over P 3D X P the spade advance is 3S, over 4S X P the club advance is 5C.  Before
// 2026-08-31 the spade row stopped at 2S and clubs at 3C, so advancer of a doubled
// three-level preempt had no call at all in those suits.
// (The Python assigns call_names twice; the suit-ordered list below is the one that counts,
// the superseded one was ['2C', '3C', '4C', '5C', '1D', ..., '4S'].)
const suitResponseToTakeoutDoubleCalls = [
  "1D",
  "1H",
  "1S",
  "2C",
  "2D",
  "2H",
  "2S",
  "3C",
  "3D",
  "3H",
  "3S",
  "4C",
  "4D",
  "4H",
  "4S",
  "5C",
  "5D",
  "5H",
];

export class SuitResponseToTakeoutDouble extends ResponseToTakeoutDouble {
  static override dsl = rule({
    preconditions: [new SuitUnbidByOpponents(), new NotJumpFromLastContract()],
    // FIXME: Why is the min-length constraint necessary?
    sharedConstraints: [new MinLength(3), new LongestSuitExceptOpponentSuits()],
    callNames: suitResponseToTakeoutDoubleCalls,
    // A four-card suit before a three-card one, the higher suit first.
    prefer: [
      [suitResponseToTakeoutDoubleCalls, new MinLength(4), HigherSuit],
      new HigherSuit(...suitResponseToTakeoutDoubleCalls),
    ],
  });
}

/** RHO passed: we must bid, with nothing if need be. */
export class ForcedSuitResponseToTakeoutDouble extends SuitResponseToTakeoutDouble {
  static override dsl = rule({
    purpose: "Forced",
    preconditions: new LastBidWas(positions.RHO, "P"),
  });
}

/**
 * RHO bid over partner's double (1D X 1H): a non-jump suit is a free bid showing some
 * values (p120 h21: 1S on 9 hcp), a little more at the three level; with nothing we pass.
 */
export class FreeSuitResponseToTakeoutDouble extends SuitResponseToTakeoutDouble {
  static override dsl = rule({
    purpose: "Discovery",
    preconditions: new LastBidHasSuit(positions.RHO),
    constraints: {
      "1D 1H 1S 2C 2D 2H 2S": z3.And(points.ge(6), points.le(9)), // ten jumps
      "3C 3D 3H 3S": z3.And(points.ge(8), points.le(9)),
      "4C 4D 4H 4S": points.ge(10),
      "5C 5D 5H": points.ge(12),
    },
  });
}

// Jumps are invitational and stop at the THREE level: over a doubled two-level contract
// the old 4-level entries put 10-counts (sometimes with 3-card suits) in game.  Strong
// advances over a doubled preempt go through the cuebid instead.
// (Again two assignments in the Python; the superseded one was
// ['3C', '2D', '3D', '2H', '3H', '2S', '3S'].)
const jumpSuitResponseToTakeoutDoubleCalls = [
  "2D",
  "2H",
  "2S",
  "3C",
  "3D",
  "3H",
  "3S",
];

export class JumpSuitResponseToTakeoutDouble extends ResponseToTakeoutDouble {
  static override dsl = rule({
    purpose: "Discovery",
    preconditions: [new SuitUnbidByOpponents(), new JumpFromLastContract(1)],
    // You can have 10 points, but no stopper in opponents suit and only a 3 card suit to bid.
    // 1C X P, xxxx.Axx.Kxx.Kxx
    sharedConstraints: [
      new MinLength(3),
      new LongestSuitExceptOpponentSuits(),
      points.ge(10),
    ],
    callNames: jumpSuitResponseToTakeoutDoubleCalls,
    prefer: [
      [jumpSuitResponseToTakeoutDoubleCalls, new MinLength(4), HigherSuit],
      new HigherSuit(...jumpSuitResponseToTakeoutDoubleCalls),
    ],
  });
}

export class CuebidResponseToTakeoutDouble extends ResponseToTakeoutDouble {
  static override dsl = rule({
    purpose: "Ask",
    preconditions: [
      new LastBidWas(positions.RHO, "P"),
      new CueBid(positions.LHO),
      new NotJumpFromLastContract(),
    ],
    // Through 4S so the cuebid exists over a doubled three-level preempt (4D over P 3D X P).
    callNames: Call.suitedNamesBetween("2C", "4S"),
    // A cuebid of their suit shows nothing in it.
    annotations: annotations.Artificial,
    // FIXME: 4+ in the available majors?
    sharedConstraints: [points.ge(13), new SupportForPartnersSuits()],
    prefer: [],
  });
}

// NOTE: I don't think we're going to end up needing most of these.
export class RebidAfterTakeoutDouble extends Rule {
  static override dsl = rule({
    // FIXME: These only apply after a minimum (non-jump?) response from partner.
    preconditions: new LastBidHasAnnotation(
      positions.Me,
      annotations.TakeoutDouble,
    ),
    sharedConstraints: points.ge(17),
  });
}

export class PassAfterTakeoutDouble extends Rule {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    preconditions: [
      new LastBidHasAnnotation(positions.Me, annotations.TakeoutDouble),
      new LastBidWas(positions.LHO, "P"), // If LHO bid up, we don't necessarily have < 17hcp.
      new LastBidWas(positions.RHO, "P"),
    ],
    callNames: "P",
    sharedConstraints: points.lt(17),
  });
}

export class RaiseAfterTakeoutDouble extends RebidAfterTakeoutDouble {
  static override dsl = rule({
    purpose: "Support",
    conditionalPurposes: [[new MinLength(4), "SupportMinorWithFour"]], // four-card support for a minor before notrump (the double already showed the majors)
    preconditions: [
      new LastBidWas(positions.RHO, "P"),
      new RaiseOfPartnersLastSuit(),
      new NotJumpFromLastContract(),
    ],
    // Min: 1C X 1D P 2D, Max: 2S X P 3H P 4H
    // FIXME: Game doesn't seem like a raise here?
    callNames: ["2D", "2H", "2S", "3C", "3D", "3H", "3S", "4C", "4D", "4H"],
    sharedConstraints: [new MinLength(4), points.le(18)], // the jump raise shows 19+
    prefer: [],
  });
}

export class JumpRaiseAfterTakeoutDouble extends RebidAfterTakeoutDouble {
  static override dsl = rule({
    purpose: "Support",
    conditionalPurposes: [[new MinLength(4), "SupportMinorWithFour"]], // four-card support for a minor before notrump (the double already showed the majors)
    preconditions: [
      new RaiseOfPartnersLastSuit(),
      new JumpFromPartnerLastBid(1),
    ],
    // Min: 1C X 1D P 3D, Max: 2S X P 3D P 5D
    // FIXME: Game doesn't seem like a raise here?
    callNames: [
      "2D",
      "2H",
      "2S",
      "3C",
      "3D",
      "3H",
      "3S",
      "4C",
      "4D",
      "4H",
      "4S",
      "5C",
      "5D",
    ],
    sharedConstraints: [new MinLength(4), points.ge(19)],
    prefer: [],
    // With more the doubler cuebids before raising a minor to game; a major game is the goal.
    constraints: {
      "3C 4C 5C 2D 3D 4D 5D": points.le(20),
    },
  });
}

const newSuitAfterTakeoutDoubleCalls = [
  "1D",
  "1H",
  "1S",
  "2C",
  "2D",
  "2H",
  "2S",
  "3C",
  "3D",
  "3H",
  "3S",
];

export class NewSuitAfterTakeoutDouble extends RebidAfterTakeoutDouble {
  static override dsl = rule({
    purpose: "RebidLong", // the double denied a five-card suit: showing one comes before a limit bid
    preconditions: [
      new UnbidSuit(),
      new NotJumpFromLastContract(),
      // FIXME: Remove !RaiseOfPartnersLastSuit once SuitResponseToTakeoutDouble implies 4+ (even though it
      // only needs 3+ to make the bid).  Promising only 3 is currently confusing UnbidSuit.
      new InvertedPrecondition(new RaiseOfPartnersLastSuit()),
    ],
    // Min: 1C X XX P P 1D, Max: 3C X P 3H P 3S
    callNames: newSuitAfterTakeoutDoubleCalls,
    sharedConstraints: [new MinLength(5), points.le(20)], // the jump shows 21+
    prefer: [
      new Longest(...newSuitAfterTakeoutDoubleCalls),
      new Cheapest("1S", "2S", "3S"),
      new Cheapest("1H", "2H", "3H"),
      new Cheapest("1D", "2D", "3D"),
      new Cheapest("2C", "3C"),
    ],
  });
}

const jumpNewSuitAfterTakeoutDoubleCalls = [
  "2D",
  "2H",
  "2S",
  "3C",
  "3D",
  "3H",
  "3S",
  "4C",
  "4D",
  "4H",
  "4S",
  "5C",
  "5D",
];

export class JumpNewSuitAfterTakeoutDouble extends RebidAfterTakeoutDouble {
  static override dsl = rule({
    purpose: "RebidLong", // six cards and 21+: the jump says it
    preconditions: [
      new UnbidSuit(),
      new JumpFromLastContract(1),
      // FIXME: Remove !RaiseOfPartnersLastSuit once SuitResponseToTakeoutDouble implies 4+ (even though it
      // only needs 3+ to make the bid).  Promising only 3 is currently confusing UnbidSuit.
      new InvertedPrecondition(new RaiseOfPartnersLastSuit()),
    ],
    // Min: 1C X XX P 2D, Max: 2S X P 3C 5D
    // FIXME: Jumping straight to game seems less useful than a cuebid would?
    callNames: jumpNewSuitAfterTakeoutDoubleCalls,
    sharedConstraints: [
      new MinLength(6),
      new TwoOfTheTopThree(),
      points.ge(21),
    ],
    prefer: [
      new Longest(...jumpNewSuitAfterTakeoutDoubleCalls),
      new Cheapest("2S", "3S", "4S"),
      new Cheapest("2H", "3H", "4H"),
      new Cheapest("2D", "3D", "4D", "5D"),
      new Cheapest("3C", "4C", "5C"),
    ],
  });
}

export class NotrumpAfterTakeoutDouble extends RebidAfterTakeoutDouble {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    constraints: {
      "1N": z3.And(points.ge(18), points.le(20)),
      // 2N depends on whether it is a jump.
      "3N": points.ge(23), // FIXME: Techincally means 9+ tricks.
    },
    // 1N cannot require stoppers, or we have a hole (18 hcp, no 5-card suit, no support for
    // partner has to have something to bid): with their suits stopped the notrump call
    // describes the hand (BalancedLimit); without, a raise or a cuebid comes first.
    conditionalPurposesPerCall: {
      "1N": [[new StoppersInOpponentsSuits(), "BalancedLimit"]],
      "3N": [[new StoppersInOpponentsSuits(), "BalancedLimit"]],
    },
    prefer: [],
  });
}

export class NonJumpTwoNotrumpAfterTakeoutDouble extends RebidAfterTakeoutDouble {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    preconditions: new NotJumpFromLastContract(),
    callNames: "2N",
    sharedConstraints: [
      points.ge(19),
      points.le(22),
      new StoppersInOpponentsSuits(),
    ], // 23+ bids the game
    prefer: [],
  });
}

export class JumpTwoNotrumpAfterTakeoutDouble extends RebidAfterTakeoutDouble {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    conditionalPurposes: [[semiBalanced, "BalancedLimit"]], // a hand without a singleton tells its strength here
    preconditions: new JumpFromLastContract(),
    callNames: "2N",
    sharedConstraints: [
      points.ge(21),
      points.le(22),
      new StoppersInOpponentsSuits(),
    ], // 23+ bids the game
    prefer: [],
  });
}

export class CueBidAfterTakeoutDouble extends RebidAfterTakeoutDouble {
  static override dsl = rule({
    purpose: "Ask", // too strong for a limited call: a major game, or a six-card suit, still comes first
    preconditions: [
      new NotJumpFromLastContract(),
      // The Cuebid here is defined as RHO's opening bid, not whatever their most recent one may be.
      new CueBid(positions.RHO, true),
    ],
    // Min: 1C X 1D P 2C, unclear what Max should be?
    // 1S X 2H 3D P 3S?  Should we go higher?
    callNames: Call.suitedNamesBetween("2C", "3S"),
    // A cuebid of their suit shows nothing in it.
    annotations: annotations.Artificial,
    // The book says "with slam interest".  Unclear what that means for constraints.
    sharedConstraints: points.ge(21),
    prefer: [],
  });
}

export class TakeoutDoubleAfterTakeoutDouble extends RebidAfterTakeoutDouble {
  static override dsl = rule({
    purpose: "AskLater",
    callNames: "X",
    preconditions: [
      new LastBidWas(positions.Partner, "P"),
      new MaxLevel(2),
      new LastBidHasSuit(),
    ],
    // Doubling a second time shows both 17+ and shortness in the last bid contract.
    // We're asking partner to pick a suit, any suit but don't let them have it.
    sharedConstraints: [points.ge(17), new MaxLengthInLastContractSuit(1)],
    prefer: [],
  });
}

/** The concrete rules of this section, by name (see sayc.ts). */
export const RULE_CLASSES: Readonly<Record<string, RuleClass>> = {
  OneLevelTakeoutDouble,
  TwoLevelTakeoutDouble,
  TakeoutDoubleAfterPreempt,
  PenaltyDoubleOfGameOpening,
  TwoNotrumpOvercallOfWeakTwo,
  BalancingDouble,
  ReopeningDouble,
  BalancingDoubleAfterNotrumpAuction,
  PenaltyPassOfTakeoutDouble,
  NotrumpResponseToTakeoutDouble,
  JumpNotrumpResponseToTakeoutDouble,
  ForcedSuitResponseToTakeoutDouble,
  FreeSuitResponseToTakeoutDouble,
  JumpSuitResponseToTakeoutDouble,
  CuebidResponseToTakeoutDouble,
  PassAfterTakeoutDouble,
  RaiseAfterTakeoutDouble,
  JumpRaiseAfterTakeoutDouble,
  NewSuitAfterTakeoutDouble,
  JumpNewSuitAfterTakeoutDouble,
  NotrumpAfterTakeoutDouble,
  NonJumpTwoNotrumpAfterTakeoutDouble,
  JumpTwoNotrumpAfterTakeoutDouble,
  CueBidAfterTakeoutDouble,
  TakeoutDoubleAfterTakeoutDouble,
};
