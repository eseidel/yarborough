// cspell:ignore artifical transfered
// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/rules.py, one section of it (see the section list
// at the top of that file).  Filled in by phase 5 of
// docs/typescript-engine-plan.md; the base classes shared by every section
// stay in ../rules.ts.
//
// Notrump responses: NotrumpResponse, Stayman and its responses, the Jacoby
// transfers and their acceptance, the quantitative 4N and the rebids after a
// transfer.

import type { Call } from "../../core/call";
import { DIAMONDS, HEARTS, MAJORS, SPADES } from "../../core/suit";
import {
  Constraint,
  ConstraintAnd,
  ConstraintNot,
  ConstraintOr,
  MinimumCombinedPoints,
  MinLength,
  MinLengthInLastContractSuit,
  SupportForTransferOverInterference,
  ThreeOfTheTopFiveInLastContractSuit,
  TwoOfTheTopThree,
} from "../constraints";
import type { History } from "../history";
import {
  aFiveCardSuit,
  clubs,
  diamonds,
  exprForSuit,
  hearts,
  NO_CONSTRAINTS,
  points,
  positions,
  spades,
} from "../model";
import { pointsForSoundNotrumpBidAtLevel } from "../natural";
import {
  annotations,
  EitherPrecondition,
  InvertedPrecondition,
  JumpFromLastContract,
  JumpFromPartnerLastBid,
  LastBidHasAnnotation,
  LastBidHasStrain,
  LastBidHasSuit,
  LastBidWas,
  NotJumpFromLastContract,
  NotJumpFromPartnerLastBid,
  RaiseOfPartnersLastSuit,
} from "../preconditions";
import { Cheapest, Highest } from "../prefer";
import { tuple } from "../py";
import { categories, Rule, rule, type RuleClass } from "../rule_compiler";
import { type Expr, z3 } from "../z3";

export class NotrumpResponse extends Rule {
  static override dsl = rule({
    category: categories.NotrumpSystem,
    preconditions: [
      // 1N overcalls have systems on too, partner does not have to have opened
      new LastBidHasAnnotation(positions.Partner, annotations.NotrumpSystemsOn),
    ],
  });
}

export class NotrumpGameInvitation extends NotrumpResponse {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    // This is an explicit descriptive rule, not a ToPlay rule.
    // ToPlay is 7-9, but 7 points isn't in game range.
    // Opposite 15-17: 9+, or 8 with a 5-card suit; a flat 8 passes (p6, h2).  Opposite a
    // balancing 1N (12-14) the combined 23 needs 9+ anyway.
    constraints: {
      "2N": new ConstraintOr(
        new MinimumCombinedPoints(24),
        new ConstraintAnd(
          new MinimumCombinedPoints(23),
          z3.Or(aFiveCardSuit, points.ge(9)),
        ),
      ),
    },
    prefer: [],
  });
}

export class NotrumpGameAccept extends NotrumpResponse {
  static override dsl = rule({
    purpose: "Game",
    // This is an explicit descriptive rule, not a ToPlay rule.
    // FIXME: p13, h30 suggests we should make this jump with 7 in a minor topped by the AK.
    constraints: { "3N": new MinimumCombinedPoints(25) },
    prefer: [],
  });
}

export const twoClubStaymanConstraint = new ConstraintAnd(
  new MinimumCombinedPoints(23),
  z3.Or(hearts.ge(4), spades.ge(4)),
);

export const fourFiveStaymanConstraint = new ConstraintAnd(
  new MinimumCombinedPoints(23),
  z3.Or(z3.And(hearts.eq(4), spades.eq(5)), z3.And(hearts.eq(5), spades.eq(4))),
);

export const minorGameForceStaymanConstraints = z3.And(
  points.ge(13),
  z3.Or(clubs.ge(5), diamonds.ge(5)),
);

// 2C is a very special snowflake and can lead into many sequences, thus it gets its own class.
export class TwoLevelStayman extends NotrumpResponse {
  static override dsl = rule({
    purpose: "Miscellaneous", // garbage Stayman is what is left for a weak hand; the asks are promoted below
    conditionalPurposes: [
      [
        new ConstraintAnd(
          z3.And(z3.Or(hearts.eq(4), spades.eq(4)), hearts.le(5), spades.le(5)),
          twoClubStaymanConstraint,
        ),
        "Ask",
      ], // four-four: ask; a six-card major transfers
      [fourFiveStaymanConstraint, "Ask"], // five-four: ask
      [minorGameForceStaymanConstraints, "Ask"],
    ],
    annotations: annotations.Stayman,
    callNames: "2C",

    sharedConstraints: new ConstraintOr(
      minorGameForceStaymanConstraints,
      twoClubStaymanConstraint,
      // Garbage stayman is a trade-off.  The fewer points you have the less likely
      // your partner will make 1N.  2D with only 6 is better than 1N with only 18 points.
      z3.And(
        spades.ge(3),
        hearts.ge(3),
        z3.Or(diamonds.ge(5), z3.And(diamonds.ge(4), points.le(3))),
      ),
    ),
    prefer: [],
  });
}

export class BasicStayman extends NotrumpResponse {
  static override dsl = rule({
    annotations: annotations.Stayman,
    sharedConstraints: [z3.Or(hearts.ge(4), spades.ge(4))],
    prefer: [],
  });
}

export class ThreeLevelStayman extends BasicStayman {
  static override dsl = rule({
    purpose: "AskLater",
    conditionalPurposes: [[z3.Or(hearts.eq(4), spades.eq(4)), "Ask"]], // four-four or five-four: ask; one long major: transfer
    preconditions: new NotJumpFromPartnerLastBid(),
    callNames: "3C",
    sharedConstraints: new MinimumCombinedPoints(25),
  });
}

export class StolenTwoClubStayman extends BasicStayman {
  static override dsl = rule({
    purpose: "AskLater",
    conditionalPurposes: [[z3.Or(hearts.eq(4), spades.eq(4)), "Ask"]], // four-four or five-four: ask; one long major: transfer
    preconditions: new LastBidWas(positions.RHO, "2C"),
    callNames: "X",
    sharedConstraints: new MinimumCombinedPoints(23),
  });
}

export class StolenThreeClubStayman extends BasicStayman {
  static override dsl = rule({
    purpose: "AskLater",
    conditionalPurposes: [[z3.Or(hearts.eq(4), spades.eq(4)), "Ask"]], // four-four or five-four: ask; one long major: transfer
    preconditions: new LastBidWas(positions.RHO, "3C"),
    callNames: "X",
    sharedConstraints: new MinimumCombinedPoints(25),
  });
}

export class NotrumpTransferResponse extends NotrumpResponse {
  static override dsl = rule({
    annotations: annotations.Transfer,
  });
}

/**
 * A transfer to a five-card major: the longer major; with five-five, hearts first with a
 * weak hand and spades first with game values (p11 h20).
 */
export class JacobyTransfer extends NotrumpTransferResponse {
  static override dsl = rule({
    purpose: "MajorDiscovery",
    preconditions: new NotJumpFromPartnerLastBid(),
    callNames: ["2D", "3D", "4D", "2H", "3H", "4H"],
    constraints: {
      "2D 3D 4D": hearts.ge(5),
      "2H 3H 4H": spades.ge(5),
    },
    prefer: [
      [["2D", "3D", "4D"], hearts.gt(spades)],
      [["2H", "3H", "4H"], spades.gt(hearts)],
      [["2H", "3H", "4H"], z3.And(hearts.eq(spades), points.ge(10))],
      new Cheapest("2D", "3D", "4D"),
      new Cheapest("2H", "3H", "4H"),
    ],
  });
}

export class TwoSpadesRelay extends NotrumpTransferResponse {
  static override dsl = rule({
    purpose: "Ask",
    preconditions: new InvertedPrecondition(new LastBidWas(positions.RHO, "X")), // over their double the redouble transfers
    constraints: {
      "2S": z3.And(
        z3.Or(diamonds.ge(6), clubs.ge(6)),
        hearts.le(3),
        spades.le(3),
        points.le(7),
      ), // weak; with a four-card major, Stayman
    },
    prefer: [],
  });
}

/**
 * Invites opener to bid 6N if at a maximum, otherwise pass: the notrump slam number is
 * reached opposite partner's maximum but not opposite the minimum (a hand that reaches it
 * opposite the minimum bids the slam itself).
 */
export class QuantitativeFourNotrumpJumpConstraint extends Constraint {
  slamPoints(): number {
    return pointsForSoundNotrumpBidAtLevel[6]!;
  }

  expr(history: History): Expr {
    const slam = this.slamPoints();
    return z3.And(
      points.add(history.partner.maxPoints).ge(slam),
      points.add(history.partner.minPoints).lt(slam),
    );
  }
}

export class QuantitativeFourNotrumpJump extends NotrumpResponse {
  static override dsl = rule({
    purpose: "Slam", // a slam invitation outranks the game accept it would otherwise negate
    callNames: "4N",
    preconditions: new JumpFromLastContract(),
    sharedConstraints: new QuantitativeFourNotrumpJumpConstraint(),
    annotations: annotations.QuantitativeFourNotrumpJump,
    prefer: [],
  });
}

export class ResponseToQuantitativeFourNotrump extends Rule {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.QuantitativeFourNotrumpJump,
    ),
    constraints: {
      // This is only needed to make the P vs. 5N decision, 6N == 17 is provided by NaturalNotrump.
      P: points.eq(15),
      "5N": points.eq(16),
    },
  });
}

export const doubledTransferRedoubleHand = new ConstraintAnd(
  new MinLengthInLastContractSuit(5),
  new ThreeOfTheTopFiveInLastContractSuit(),
);

/**
 * RHO doubled partner's transfer and we hold five good cards in the doubled suit: the
 * redouble (p18 h43).  Undoubled, no such hand.
 */
export class RedoubleHandOverDoubledTransfer extends Constraint {
  expr(history: History, call: Call): Expr {
    const rho = history.rho.lastCall;
    if (rho === null || !rho.isDouble()) {
      return z3.BoolVal(false);
    }
    return doubledTransferRedoubleHand.expr(history, call);
  }
}

export class AcceptTransfer extends Rule {
  static override dsl = rule({
    category: categories.Relay,
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.Transfer),
      // Relative to the last contract, so that 1N P 2D (2S) 3H is the plain completion.
      new NotJumpFromLastContract(),
    ],
    sharedConstraints: new SupportForTransferOverInterference(),
    fallback: 1, // completing the transfer is what is left when no better answer fits
    // FIXME: Should these generically be artifical?  Is a double of a transfer accept lead-directing?
  });
}

export class AcceptTransferToHearts extends AcceptTransfer {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidHasStrain(positions.Partner, DIAMONDS),
    callNames: ["2H", "3H"],
  });
}

export class AcceptTransferToSpades extends AcceptTransfer {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidHasStrain(positions.Partner, HEARTS),
    callNames: ["2S", "3S"],
  });
}

export class AcceptTransferToClubs extends AcceptTransfer {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidHasStrain(positions.Partner, SPADES),
    callNames: "3C",
    // We aren't actually showing clubs, so maybe a double is lead-directing and thus this is artificial?
    annotations: annotations.Artificial,
  });
}

export class SuperAcceptTransfer extends Rule {
  static override dsl = rule({
    category: categories.Relay,
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.Transfer),
      new JumpFromPartnerLastBid(1),
      // Over a suit overcall the three-level completion is the plain accept (three cards,
      // see AcceptTransfer), not a super-accept; two Relay rules claiming one call would drop it.
      new InvertedPrecondition(new LastBidHasSuit(positions.RHO)),
    ],
    // FIXME: This should use support points, but MinimumSupportPointsForPartnersLastSuit will be confused by the transfer.
    sharedConstraints: [
      points.ge(17),
      new ConstraintNot(new RedoubleHandOverDoubledTransfer()),
    ],
    prefer: [],
  });
}

export class SuperAcceptTransferToHearts extends SuperAcceptTransfer {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidHasStrain(positions.Partner, DIAMONDS),
    callNames: "3H",
    sharedConstraints: hearts.ge(4),
  });
}

export class SuperAcceptTransferToSpades extends SuperAcceptTransfer {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidHasStrain(positions.Partner, HEARTS),
    callNames: "3S",
    sharedConstraints: spades.ge(4),
  });
}

/**
 * RHO doubled partner's transfer to a major (1N P 2H X): with three or more of partner's
 * major opener completes the transfer as usual (AcceptTransfer), with a doubleton he passes
 * (p17 h46) and with five good cards in the doubled suit he redoubles (p18 h43).
 */
export class OpenerOverDoubledTransfer extends Rule {
  static override dsl = rule({
    category: categories.Relay,
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.Transfer),
      new LastBidHasStrain(positions.Partner, tuple(DIAMONDS, HEARTS)),
      new LastBidWas(positions.RHO, "X"),
    ],
  });
}

export class PassDoubledTransferToHearts extends OpenerOverDoubledTransfer {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidHasStrain(positions.Partner, DIAMONDS),
    callNames: "P",
    sharedConstraints: [
      hearts.le(2),
      new ConstraintNot(new RedoubleHandOverDoubledTransfer()),
    ],
    prefer: [],
  });
}

export class PassDoubledTransferToSpades extends OpenerOverDoubledTransfer {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidHasStrain(positions.Partner, HEARTS),
    callNames: "P",
    sharedConstraints: [
      spades.le(2),
      new ConstraintNot(new RedoubleHandOverDoubledTransfer()),
    ],
    prefer: [],
  });
}

export class RedoubleDoubledTransfer extends OpenerOverDoubledTransfer {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidHasStrain(
      positions.Partner,
      tuple(DIAMONDS, HEARTS),
    ),
    callNames: "XX",
    sharedConstraints: doubledTransferRedoubleHand,
    prefer: [],
  });
}

/**
 * Our transfer was doubled and opener did not complete it (he passed with a doubleton or
 * redoubled with the doubled suit): with a weak hand we bid our major ourselves; stronger
 * hands rebid as after a completed transfer.
 */
export class CompleteOwnTransferAfterDouble extends Rule {
  static override dsl = rule({
    category: categories.Relay,
    preconditions: [
      new LastBidHasAnnotation(positions.Me, annotations.Transfer),
      new LastBidWas(positions.LHO, "X"),
      new EitherPrecondition(
        new LastBidWas(positions.Partner, "P"),
        new LastBidWas(positions.Partner, "XX"),
      ),
      new LastBidWas(positions.RHO, "P"),
    ],
    sharedConstraints: points.le(7),
    prefer: [],
  });
}

export class CompleteOwnTransferToHeartsAfterDouble extends CompleteOwnTransferAfterDouble {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidHasStrain(positions.Me, DIAMONDS),
    callNames: "2H",
  });
}

export class CompleteOwnTransferToSpadesAfterDouble extends CompleteOwnTransferAfterDouble {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidHasStrain(positions.Me, HEARTS),
    callNames: "2S",
  });
}

export class ResponseAfterTransferToClubs extends Rule {
  static override dsl = rule({
    purpose: "Answer",
    category: categories.Relay, // Is this right?
    preconditions: [
      new LastBidWas(positions.Partner, "3C"),
      new LastBidHasAnnotation(positions.Me, annotations.Transfer),
    ],
    constraints: {
      P: clubs.ge(6),
      "3D": diamonds.ge(6),
    },
    prefer: [],
  });
}

export class RebidAfterJacobyTransfer extends Rule {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(positions.Me, annotations.Transfer),
    // Our initial transfer could have been with 0 points, rebidding shows points.
    sharedConstraints: points.ge(8),
  });
}

/**
 * After a completed transfer, 2N invites with 8-9 (p6); without this rule the natural 2N
 * read 7-9 and opener's game acceptance needed a point too many.
 */
export class NotrumpRebidAfterJacobyTransfer extends RebidAfterJacobyTransfer {
  static override dsl = rule({
    purpose: "CharacterizeStrength",
    callNames: "2N",
    sharedConstraints: points.le(9),
  });
}

// FIXME: We need this over higher-level transfers as well to replace the NaturalSuited responses.
export class SpadesRebidAfterHeartsTransfer extends RebidAfterJacobyTransfer {
  static override dsl = rule({
    purpose: "MajorDiscovery",
    preconditions: new LastBidWas(positions.Me, "2D"),
    // FIXME: We should not need to manually cap 2S.  We can infer that we have < 10 or we would have transfered to hearts first.
    // FIXME: If we had a 6-5 we would raise directly to game instead of bothering to mention the other major?
    constraints: { "2S": z3.And(spades.ge(5), points.ge(8), points.le(9)) },
  });
}

export class HeartsRebidAfterSpadesTransfer extends RebidAfterJacobyTransfer {
  static override dsl = rule({
    purpose: "MajorDiscovery",
    preconditions: new LastBidWas(positions.Me, "2H"),
    constraints: {
      // A 3H rebid shows slam interest.  Currently assuming that's 13+?
      // Maybe the 3H bid requires_planning?
      "3H": points.ge(13),
      // A jump to 4H and partner choses 4H or 4S, no slam interest. p11
      "4H": points.ge(10),
    },
    sharedConstraints: hearts.ge(5),
    prefer: [],
  });
}

/**
 * After the transfer is completed, the raise to game shows a six-card major and 8+ (p6 h1:
 * 4S on K74.9.J98.KJT742; p11 h21: 4H on 97.A2.KJ9832.J76 -- "bid 2D then raise to 4H";
 * Texas transfers are "not strictly part of SAYC").  With 7 the raise to three invites.
 */
export class GameRaiseAfterJacobyTransfer extends RebidAfterJacobyTransfer {
  static override dsl = rule({
    sharedConstraints: new MinLength(6),
  });
}

export class GameRaiseAfterTransferToHearts extends GameRaiseAfterJacobyTransfer {
  static override dsl = rule({
    purpose: "Support",
    preconditions: new LastBidWas(positions.Partner, "2H"),
    callNames: "4H",
  });
}

export class GameRaiseAfterTransferToSpades extends GameRaiseAfterJacobyTransfer {
  static override dsl = rule({
    purpose: "Support",
    preconditions: new LastBidWas(positions.Partner, "2S"),
    callNames: "4S",
  });
}

export const gameRaisesAfterTransfer = new Set([
  GameRaiseAfterTransferToHearts,
  GameRaiseAfterTransferToSpades,
]);

export class NewMinorRebidAfterJacobyTransfer extends RebidAfterJacobyTransfer {
  static override dsl = rule({
    purpose: "MinorDiscovery",
    callNames: ["3C", "3D"],
    // Minors are not worth mentioning after a jacoby transfer unless we have 5 of them and game-going values.
    // FIXME: It seems like this should imply some number of honors in the bid suit, but there may be times
    // when we have 5+ spot cards in a minor and this looks better than bidding 3N.
    sharedConstraints: [new MinLength(5), new MinimumCombinedPoints(25)],
  });
}

export class StaymanResponse extends Rule {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.Stayman,
    ),
    category: categories.NotrumpSystem,
  });
}

/**
 * RHO overcalled Stayman in a major: four cards there are shown by the double, not by
 * bidding the other major.
 */
export class NoStolenMajor extends Constraint {
  expr(history: History): Expr {
    const rho = history.rho.lastCall;
    if (rho === null || rho.strain === null || !MAJORS.includes(rho.strain)) {
      return NO_CONSTRAINTS;
    }
    return exprForSuit(rho.strain).le(3);
  }
}

export class NaturalStaymanResponse extends StaymanResponse {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new NotJumpFromPartnerLastBid(),
    constraints: {
      "2H 3H": hearts.ge(4),
      "2S 3S": spades.ge(4),
    },
    sharedConstraints: new NoStolenMajor(), // over their overcall of a major, four of it is the double
    prefer: [], // four-four: hearts (up the line)
  });
}

export const staymanRedoubleHand = clubs.ge(5);

/** RHO doubled Stayman and we hold five clubs: the redouble (p17 h38). */
export class RedoubleHandOverDoubledStayman extends Constraint {
  expr(history: History): Expr {
    const rho = history.rho.lastCall;
    if (rho === null || !rho.isDouble()) {
      return z3.BoolVal(false);
    }
    return staymanRedoubleHand;
  }
}

export class PassStaymanResponse extends StaymanResponse {
  static override dsl = rule({
    purpose: "Answer",
    callNames: "P",
    // Over their double or overcall (p17 h37-39), or over partner's Stayman double of their 2C.
    preconditions: new EitherPrecondition(
      new InvertedPrecondition(new LastBidWas(positions.RHO, "P")),
      new LastBidWas(positions.Partner, "X"),
    ),
    sharedConstraints: [
      hearts.le(3),
      spades.le(3),
      new ConstraintNot(new RedoubleHandOverDoubledStayman()),
    ], // no major to show, no redouble
    prefer: [],
  });
}

export class DiamondStaymanResponse extends StaymanResponse {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: [
      new NotJumpFromPartnerLastBid(),
      // If RHO called a new suit or doubled, pass takes on this meaning.
      new LastBidWas(positions.RHO, "P"),
    ],
    callNames: ["2D", "3D"],
    sharedConstraints: NO_CONSTRAINTS,
    annotations: annotations.Artificial,
    fallback: 1, // no major to show
  });
}

// FIXME: There must be a simpler way to write history-variant rules like this.
// FIXME: This whole rule feels like a special-case penalty double?
export class StolenHeartStaymanResponse extends StaymanResponse {
  static override dsl = rule({
    constraints: { X: hearts.ge(4) },
    // The double stands in for the Stayman response RHO's bid took away.
    annotations: annotations.Artificial,
    prefer: [],
  });
}

export class StolenTwoHeartStaymanResponse extends StolenHeartStaymanResponse {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidWas(positions.RHO, "2H"),
  });
}

export class StolenThreeHeartStaymanResponse extends StolenHeartStaymanResponse {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidWas(positions.RHO, "3H"),
  });
}

export class StolenSpadeStaymanResponse extends StaymanResponse {
  static override dsl = rule({
    constraints: { X: spades.ge(4) },
    // The double stands in for the Stayman response RHO's bid took away.
    annotations: annotations.Artificial,
    prefer: [],
  });
}

export class StolenTwoSpadeStaymanResponse extends StolenSpadeStaymanResponse {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidWas(positions.RHO, "2S"),
  });
}

export class StolenThreeSpadeStaymanResponse extends StolenSpadeStaymanResponse {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidWas(positions.RHO, "3S"),
  });
}

export class RedoubleAfterDoubledStayman extends StaymanResponse {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidWas(positions.RHO, "X"),
    constraints: {
      XX: z3.And(staymanRedoubleHand, hearts.le(3), spades.le(3)),
    }, // with a major to show, show it
    prefer: [],
  });
}

export class ResponseToOneNotrump extends NotrumpResponse {
  static override dsl = rule({
    preconditions: new LastBidWas(positions.Partner, "1N"),
  });
}

export class LongMinorGameInvitation extends ResponseToOneNotrump {
  static override dsl = rule({
    purpose: "LongSuitInvitation",
    callNames: ["3C", "3D"],
    sharedConstraints: [
      new MinLength(6),
      new TwoOfTheTopThree(),
      points.ge(5),
      points.le(12),
    ], // with more, Stayman then the minor forces to game
    // FIXME: Should use the longer suit preference pattern.
    prefer: [],
  });
}

export class LongMajorSlamInvitation extends ResponseToOneNotrump {
  static override dsl = rule({
    purpose: "LongSuitInvitation",
    callNames: ["3H", "3S"],
    sharedConstraints: [
      new MinLength(6),
      new TwoOfTheTopThree(),
      points.ge(14),
    ],
    // FIXME: Should use the longer suit preference pattern.
    prefer: [],
  });
}

export class StaymanRebid extends Rule {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(positions.Me, annotations.Stayman),
    category: categories.NotrumpSystem,
  });
}

export class GarbagePassStaymanRebid extends StaymanRebid {
  static override dsl = rule({
    purpose: "Answer",
    // GarbageStayman only exists at the 2-level
    preconditions: new LastBidWas(positions.Me, "2C"),
    callNames: "P",
    sharedConstraints: points.le(7),
  });
}

export class MinorGameForceRebid extends StaymanRebid {
  static override dsl = rule({
    purpose: "Discovery", // a game-forcing minor keeps the slam exploration alive before 3N
    callNames: ["3C", "3D"],
    sharedConstraints: [new MinLength(5), minorGameForceStaymanConstraints],
    prefer: [],
  });
}

export class OtherMajorRebidAfterStayman extends StaymanRebid {
  static override dsl = rule({
    purpose: "MajorDiscovery",
    preconditions: [new InvertedPrecondition(new RaiseOfPartnersLastSuit())],
    // Rebidding the other major shows 5-4, with invitational or game-force values.
    constraints: {
      "2H": [points.ge(8), hearts.eq(5), spades.eq(4)],
      "2S": [points.ge(8), spades.eq(5), hearts.eq(4)],

      // # Use MinimumCombinedPoints instead of MinHighCardPoints as 3-level bids
      // # are game forcing over both 2C and 3C Stayman responses.
      "3H": [new MinimumCombinedPoints(25), hearts.eq(5), spades.eq(4)],
      "3S": [new MinimumCombinedPoints(25), spades.eq(5), hearts.eq(4)],
    },
    prefer: [new Highest("2H", "2S", "3H", "3S")], // the game force before the invitation
  });
}

export class RedoubleTransferToMinor extends NotrumpResponse {
  static override dsl = rule({
    purpose: "Ask",
    preconditions: [
      new LastBidWas(positions.Partner, "1N"),
      new LastBidWas(positions.RHO, "X"),
    ],
    callNames: "XX",
    annotations: annotations.Transfer,
    category: categories.Relay,
    sharedConstraints: z3.And(
      z3.Or(diamonds.ge(6), clubs.ge(6)),
      points.le(4), // NT is likely to be uncomfortable.
    ),
    prefer: [],
  });
}

// FIXME: Should share code with AcceptTransfer, except NotJumpFromPartner's LastBid is confused by 'XX'
export class AcceptTransferToTwoClubs extends Rule {
  static override dsl = rule({
    purpose: "Answer",
    category: categories.Relay,
    callNames: "2C",
    preconditions: [
      new LastBidWas(positions.Partner, "XX"),
      new LastBidWas(positions.RHO, "P"),
      new LastBidHasAnnotation(positions.Partner, annotations.Transfer),
    ],
    annotations: annotations.Artificial,
    sharedConstraints: NO_CONSTRAINTS,
    prefer: [],
  });
}

export class ResponseAfterTransferToTwoClubs extends Rule {
  static override dsl = rule({
    purpose: "Answer",
    category: categories.Relay,
    preconditions: [
      new LastBidWas(positions.Partner, "2C"),
      new LastBidHasAnnotation(positions.Me, annotations.Transfer),
    ],
    constraints: {
      P: clubs.ge(6),
      "2D": diamonds.ge(6),
    },
  });
}

/** The concrete rules of this section, by name (see sayc.ts). */
export const RULE_CLASSES: Readonly<Record<string, RuleClass>> = {
  AcceptTransferToClubs,
  AcceptTransferToHearts,
  AcceptTransferToSpades,
  AcceptTransferToTwoClubs,
  CompleteOwnTransferToHeartsAfterDouble,
  CompleteOwnTransferToSpadesAfterDouble,
  DiamondStaymanResponse,
  GameRaiseAfterTransferToHearts,
  GameRaiseAfterTransferToSpades,
  GarbagePassStaymanRebid,
  HeartsRebidAfterSpadesTransfer,
  JacobyTransfer,
  LongMajorSlamInvitation,
  LongMinorGameInvitation,
  MinorGameForceRebid,
  NaturalStaymanResponse,
  NewMinorRebidAfterJacobyTransfer,
  NotrumpGameAccept,
  NotrumpGameInvitation,
  NotrumpRebidAfterJacobyTransfer,
  OtherMajorRebidAfterStayman,
  PassDoubledTransferToHearts,
  PassDoubledTransferToSpades,
  PassStaymanResponse,
  QuantitativeFourNotrumpJump,
  RedoubleAfterDoubledStayman,
  RedoubleDoubledTransfer,
  RedoubleTransferToMinor,
  ResponseAfterTransferToClubs,
  ResponseAfterTransferToTwoClubs,
  ResponseToQuantitativeFourNotrump,
  SpadesRebidAfterHeartsTransfer,
  StolenThreeClubStayman,
  StolenThreeHeartStaymanResponse,
  StolenThreeSpadeStaymanResponse,
  StolenTwoClubStayman,
  StolenTwoHeartStaymanResponse,
  StolenTwoSpadeStaymanResponse,
  SuperAcceptTransferToHearts,
  SuperAcceptTransferToSpades,
  ThreeLevelStayman,
  TwoLevelStayman,
  TwoSpadesRelay,
};
