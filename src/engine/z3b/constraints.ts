// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/constraints.py.  A Constraint turns the auction and
// the call into a z3 expression over the hand model; the construction mirrors
// the Python operator by operator, so that the printed form of a meaning is
// the text the Python printed.

import { assert } from "../core/assert";
import type { Call } from "../core/call";
import {
  compareStrains,
  MAJORS,
  sortStrains,
  type Strain,
  SUITS,
} from "../core/suit";
import type { History } from "./history";
import * as model from "./model";
import { exprForSuit, highCardPoints, positions } from "./model";
import { annotations } from "./preconditions";
import * as purposes from "./purposes";
import { type Expr, z3 } from "./z3";

export abstract class Constraint {
  abstract expr(history: History, call: Call): Expr;
}

/**
 * What a rule's `constraints`, `sharedConstraints` and conditions hold: a z3
 * expression, a Constraint, or a (nested) list of those (a Python tuple is a
 * list here).
 */
export type Constraints = Expr | Constraint | readonly Constraints[];

/** A Constraint or an expression, as ConstraintAnd/ConstraintOr accept. */
export type ConstraintOrExpr = Constraint | Expr;

function exprOf(constraint: ConstraintOrExpr, history: History, call: Call) {
  return constraint instanceof Constraint
    ? constraint.expr(history, call)
    : constraint;
}

export class ConstraintAnd extends Constraint {
  readonly constraints: readonly ConstraintOrExpr[];

  constructor(...constraints: ConstraintOrExpr[]) {
    super();
    this.constraints = constraints;
  }

  expr(history: History, call: Call): Expr {
    return z3.And(
      this.constraints.map((constraint) => exprOf(constraint, history, call)),
    );
  }
}

export class ConstraintOr extends Constraint {
  readonly constraints: readonly ConstraintOrExpr[];

  constructor(...constraints: ConstraintOrExpr[]) {
    super();
    this.constraints = constraints;
  }

  expr(history: History, call: Call): Expr {
    return z3.Or(
      this.constraints.map((constraint) => exprOf(constraint, history, call)),
    );
  }
}

export class ConstraintNot extends Constraint {
  readonly constraint: Constraint;

  constructor(constraint: Constraint) {
    super();
    this.constraint = constraint;
  }

  expr(history: History, call: Call): Expr {
    return z3.Not(this.constraint.expr(history, call));
  }
}

export class MinimumCombinedLength extends Constraint {
  readonly minCount: number;
  readonly usePartnersLastSuit: boolean;

  constructor(minCount: number, usePartnersLastSuit = false) {
    super();
    this.minCount = minCount;
    this.usePartnersLastSuit = usePartnersLastSuit;
  }

  expr(history: History, call: Call): Expr {
    let suit = call.strain!;
    if (this.usePartnersLastSuit) {
      // We should assert here, except this is used to pass after a transfer accept (which is artificial)
      // assert annotations.Artificial not in history.partner.annotations_for_last_call
      suit = history.partner.lastCall!.strain!;
    }
    const partnerPromisedLength = history.partner.minLength(suit);
    const impliedLength = Math.max(this.minCount - partnerPromisedLength, 0);
    return exprForSuit(suit).ge(impliedLength);
  }
}

/**
 * Our length in the suit is at most max_count less what partner has promised (a single
 * raise over their takeout double: three trumps, the eight-card fit and no more).
 */
export class MaximumCombinedLength extends Constraint {
  readonly maxCount: number;

  constructor(maxCount: number) {
    super();
    this.maxCount = maxCount;
  }

  expr(history: History, call: Call): Expr {
    return exprForSuit(call.strain!).le(
      this.maxCount - history.partner.minLength(call.strain!),
    );
  }
}

export class MinimumCombinedPoints extends Constraint {
  readonly minPoints: number;

  constructor(minPoints: number) {
    super();
    this.minPoints = minPoints;
  }

  expr(history: History): Expr {
    return model.points.ge(
      Math.max(0, this.minPoints - history.partner.minPoints),
    );
  }
}

export class MinimumCombinedSupportPoints extends Constraint {
  readonly minPoints: number;
  readonly usePartnersLastSuit: boolean;

  constructor(minPoints: number, usePartnersLastSuit = false) {
    super();
    this.minPoints = minPoints;
    this.usePartnersLastSuit = usePartnersLastSuit;
  }

  expr(history: History, call: Call): Expr {
    const impliedMinPoints = Math.max(
      0,
      this.minPoints - history.partner.minPoints,
    );
    let suit = call.strain!;
    if (this.usePartnersLastSuit) {
      assert(
        !history.partner.annotationsForLastCall.includes(
          annotations.Artificial,
        ),
      );
      suit = history.partner.lastCall!.strain!;
    }
    return model.supportPointsExprForSuit(suit).ge(impliedMinPoints);
  }
}

/**
 * Support points counted for the suit of the call being made (a rebid of our own
 * suit opposite partner's promised support, where partner's generic min_points does not
 * carry his support-point promise).
 */
export class MinimumSupportPointsForSuitOfCall extends Constraint {
  readonly minPoints: number;

  constructor(minPoints: number) {
    super();
    this.minPoints = minPoints;
  }

  expr(history: History, call: Call): Expr {
    void history;
    return model.supportPointsExprForSuit(call.strain!).ge(this.minPoints);
  }
}

export class MaximumSupportPointsForSuitOfCall extends Constraint {
  readonly maxPoints: number;

  constructor(maxPoints: number) {
    super();
    this.maxPoints = maxPoints;
  }

  expr(history: History, call: Call): Expr {
    void history;
    return model.supportPointsExprForSuit(call.strain!).le(this.maxPoints);
  }
}

export class MinimumSupportPointsForPartnersLastSuit extends Constraint {
  readonly minPoints: number;

  constructor(minPoints: number) {
    super();
    this.minPoints = minPoints;
  }

  expr(history: History): Expr {
    // We should assert here, except this is used to pass after a transfer accept (which is artificial)
    // assert annotations.Artificial not in history.partner.annotations_for_last_call
    return model
      .supportPointsExprForSuit(history.partner.lastCall!.strain!)
      .ge(this.minPoints);
  }
}

export class MaximumSupportPointsForPartnersLastSuit extends Constraint {
  readonly maxPoints: number;

  constructor(maxPoints: number) {
    super();
    this.maxPoints = maxPoints;
  }

  expr(history: History): Expr {
    assert(
      !history.partner.annotationsForLastCall.includes(annotations.Artificial),
    );
    return model
      .supportPointsExprForSuit(history.partner.lastCall!.strain!)
      .le(this.maxPoints);
  }
}

export class MaximumCombinedPoints extends Constraint {
  readonly maxPoints: number;

  constructor(maxPoints: number) {
    super();
    this.maxPoints = maxPoints;
  }

  expr(history: History): Expr {
    return model.points.le(
      Math.max(0, this.maxPoints - history.partner.maxPoints),
    );
  }
}

/**
 * The slam-is-remote passes: the combined total stays under the threshold OPPOSITE
 * PARTNER'S MINIMUM -- we lack the values to insist opposite a minimum.  Judged against
 * partner's maximum (as MaximumCombinedPoints still is for the game-zone pass), a wide
 * range made the pass impossible and hands were left with NO call: a 14-count could not
 * pass partner's 3N (2026-09-01, autobid-for-none).
 */
export class MaximumCombinedPointsOppositeMinimum extends Constraint {
  readonly maxPoints: number;

  constructor(maxPoints: number) {
    super();
    this.maxPoints = maxPoints;
  }

  expr(history: History): Expr {
    return model.points.le(
      Math.max(0, this.maxPoints - history.partner.minPoints),
    );
  }
}

export class MinLength extends Constraint {
  readonly minLength: number;
  readonly suits: readonly Strain[] | null;

  constructor(minLength: number, suits: readonly Strain[] | null = null) {
    super();
    this.minLength = minLength;
    this.suits = suits;
  }

  expr(history: History, call: Call): Expr {
    void history;
    const suits = this.suits && this.suits.length ? this.suits : [call.strain!];
    return z3.And(suits.map((suit) => exprForSuit(suit).ge(this.minLength)));
  }
}

export class MaxLength extends Constraint {
  readonly maxLength: number;

  constructor(maxLength: number) {
    super();
    this.maxLength = maxLength;
  }

  expr(history: History, call: Call): Expr {
    void history;
    return exprForSuit(call.strain!).le(this.maxLength);
  }
}

export class MinLengthInLastContractSuit extends Constraint {
  readonly minLength: number;

  constructor(minLength: number) {
    super();
    this.minLength = minLength;
  }

  expr(history: History): Expr {
    return exprForSuit(history.lastContract!.strain!).ge(this.minLength);
  }
}

/**
 * Three of the top five honors in the suit the opponents just bid: the holding a trap
 * pass wants (KJT865 is the booklet's example), trump tricks against their suit and not
 * just length.
 */
export class ThreeOfTheTopFiveInLastContractSuit extends Constraint {
  expr(history: History): Expr {
    return [
      model.threeOfTheTopFiveClubsOrBetter,
      model.threeOfTheTopFiveDiamondsOrBetter,
      model.threeOfTheTopFiveHeartsOrBetter,
      model.threeOfTheTopFiveSpadesOrBetter,
    ][history.lastContract!.strain!.index];
  }
}

/**
 * The holding that doubles an artificial ace-asking response for the lead (p124 h32): a
 * void (a ruff is coming) or the ace and king.
 */
export class VoidOrAceKingInLastContractSuit extends Constraint {
  expr(history: History): Expr {
    const strain = history.lastContract!.strain!;
    const ace = [
      model.aceOfClubs,
      model.aceOfDiamonds,
      model.aceOfHearts,
      model.aceOfSpades,
    ][strain.index];
    const king = [
      model.kingOfClubs,
      model.kingOfDiamonds,
      model.kingOfHearts,
      model.kingOfSpades,
    ][strain.index];
    return z3.Or(exprForSuit(strain).eq(0), z3.And(ace.eq(1), king.eq(1)));
  }
}

/**
 * At most a singleton in one of the opponents' suits: the shape that lets a takeout
 * double be light (p118 h9: 10 hcp with a singleton club after 1C P 1D).
 */
export class ShortnessInASuitTheyBid extends Constraint {
  expr(history: History): Expr {
    const theirSuits = history.them.bidSuits;
    assert(
      theirSuits.length > 0,
      `${this.constructor.name}: they bid no suit: ${history.callHistory}`,
    );
    return z3.Or(theirSuits.map((suit) => exprForSuit(suit).le(1)));
  }
}

export class MaxLengthInLastContractSuit extends Constraint {
  readonly maxLength: number;

  constructor(maxLength: number) {
    super();
    this.maxLength = maxLength;
  }

  expr(history: History): Expr {
    return exprForSuit(history.lastContract!.strain!).le(this.maxLength);
  }
}

/**
 * The majors other than the suit of the call are short (their name notwithstanding, they
 * need not be unbid).
 */
export class MaxLengthInUnbidMajors extends Constraint {
  readonly maxLength: number;

  constructor(maxLength: number) {
    super();
    this.maxLength = maxLength;
  }

  expr(history: History, call: Call): Expr {
    void history;
    return z3.And(
      MAJORS.filter((major) => major !== call.strain).map((major) =>
        exprForSuit(major).le(this.maxLength),
      ),
    );
  }
}

/**
 * Our points and partner's minimum do not reach a notrump game: the hand is worth an
 * invitation at most.
 */
export class NotEnoughForGame extends Constraint {
  expr(history: History): Expr {
    return highCardPoints.lt(Math.max(0, 25 - history.partner.minPoints));
  }
}

/**
 * At least min_length cards in the suit of partner's last bid (support, when the call
 * itself is a cuebid of theirs).
 */
export class MinLengthInPartnersLastSuit extends Constraint {
  readonly minLength: number;

  constructor(minLength: number) {
    super();
    this.minLength = minLength;
  }

  expr(history: History): Expr {
    return exprForSuit(history.partner.lastCall!.strain!).ge(this.minLength);
  }
}

/** At most max_length cards in the suit of partner's last bid. */
export class MaxLengthInPartnersLastSuit extends Constraint {
  readonly maxLength: number;

  constructor(maxLength: number) {
    super();
    this.maxLength = maxLength;
  }

  expr(history: History): Expr {
    return exprForSuit(history.partner.lastCall!.strain!).le(this.maxLength);
  }
}

/**
 * No major above partner's suit (one biddable at the one level) is longer than
 * max_length: a notrump response denies such a suit.
 */
export class MaxLengthInHigherUnbidMajors extends Constraint {
  readonly maxLength: number;

  constructor(maxLength: number) {
    super();
    this.maxLength = maxLength;
  }

  expr(history: History): Expr {
    const partnerSuit = history.partner.lastCall!.strain;
    return z3.And(
      MAJORS.filter(
        (major) =>
          partnerSuit === null || compareStrains(major, partnerSuit) > 0,
      ).map((major) => exprForSuit(major).le(this.maxLength)),
    );
  }
}

/**
 * A help-suit try in a major is for a hand short of the game; opposite a raise of a
 * minor the try still looks for 3N, so any strength tries.
 */
export class HelpSuitGameTryStrength extends Constraint {
  readonly maxSupportPoints: number;

  constructor(maxSupportPoints = 19) {
    super();
    this.maxSupportPoints = maxSupportPoints;
  }

  expr(history: History): Expr {
    const partnerSuit = history.partner.lastCall!.strain;
    if (partnerSuit === null || !"HS".includes(partnerSuit.char)) {
      return model.NO_CONSTRAINTS;
    }
    return model
      .supportPointsExprForSuit(partnerSuit)
      .le(this.maxSupportPoints);
  }
}

/** The opponents have neither bid nor doubled (a hand-independent fact of the auction). */
export class OpponentsSilent extends Constraint {
  expr(history: History): Expr {
    for (const position of [positions.LHO, positions.RHO]) {
      for (const opponent of history._walkHistoryFor(position)) {
        const call = opponent.callHistory.lastCall;
        if (call !== null && !call.isPass()) {
          return z3.BoolVal(false);
        }
      }
    }
    return z3.BoolVal(true);
  }
}

// class AdditionalLength(Constraint):
//     def __init__(self, additional_length):
//         self.additional_length = additional_length

//     def expr(self, history, call):
//         strain = history.last_contract.strain
//         return expr_for_suit(strain) >= history.me.min_length(strain) + self.additional_length

export class SupportForPartnerLastBid extends Constraint {
  readonly _minCount: number;

  constructor(minCount: number) {
    super();
    this._minCount = minCount;
  }

  expr(history: History): Expr {
    const partnerSuit = history.partner.lastCall!.strain!;
    return exprForSuit(partnerSuit).ge(this._minCount);
  }
}

export abstract class SupportForMultipleSuits extends Constraint {
  _fourInAlmostEverySuit(missingSuit: Strain, suits: readonly Strain[]): Expr {
    return z3.And(
      suits
        .filter((suit) => suit !== missingSuit)
        .map((suit) => exprForSuit(suit).ge(4)),
    );
  }

  _supportForSuits(suits: readonly Strain[], history: History): Expr {
    if (suits.length === 3) {
      const threeCardSupportExpr = z3.And(
        suits.map((suit) => exprForSuit(suit).ge(3)),
      );
      const fourCardSupportExpr = z3.Or(
        suits.map((missingSuit) =>
          this._fourInAlmostEverySuit(missingSuit, suits),
        ),
      );
      return z3.And(threeCardSupportExpr, fourCardSupportExpr);
    }
    if (suits.length === 2) {
      return z3.And(suits.map((suit) => exprForSuit(suit).ge(4)));
    }
    if (suits.length === 1) {
      // one suit left for partner: four of it
      return exprForSuit(suits[0]).ge(4);
    }
    assert(
      false,
      `${this.constructor.name} only supports 1 to 3 unbid suits, found ${suits.length}: ${history.callHistory}`,
    );
  }
}

export class SupportForUnbidSuits extends SupportForMultipleSuits {
  expr(history: History): Expr {
    return this._supportForSuits(history.unbidSuits, history);
  }
}

/**
 * Balancing, reopening and after a preempt the double is lighter in shape: three cards
 * in every unbid suit, four in at least one, and at most a doubleton in their suit.
 */
export class LightSupportForUnbidSuits extends Constraint {
  expr(history: History): Expr {
    const unbidSuits = history.unbidSuits;
    assert(
      unbidSuits.length === 2 || unbidSuits.length === 3,
      `${this.constructor.name}: ${unbidSuits.length} unbid suits: ${history.callHistory}`,
    );
    return z3.And(
      z3.And(unbidSuits.map((suit) => exprForSuit(suit).ge(3))),
      z3.Or(unbidSuits.map((suit) => exprForSuit(suit).ge(4))),
      exprForSuit(history.lastContract!.strain!).le(2),
    );
  }
}

/**
 * Completing partner's transfer is automatic, except over RHO's suit overcall, where the
 * completion at the three level promises three-card support (p17 h47), and over RHO's double
 * of the transfer (p17 h46).
 */
export class SupportForTransferOverInterference extends Constraint {
  expr(history: History, call: Call): Expr {
    const rhoLastCall = history.rho.lastCall;
    const rhoOvercalled =
      rhoLastCall !== null &&
      rhoLastCall.strain !== null &&
      SUITS.includes(rhoLastCall.strain);
    const rhoDoubled = rhoLastCall !== null && rhoLastCall.isDouble();
    if (!rhoOvercalled && !rhoDoubled) {
      return model.NO_CONSTRAINTS;
    }
    // Over a (lead-directing) double of the transfer the completion also promises three
    // cards: with a doubleton opener passes, with five good ones he redoubles (p17-18).
    return exprForSuit(call.strain!).ge(3);
  }
}

/**
 * Opener's reopening double (1x (1y) P P: X): three cards in every unbid suit and at most a
 * doubleton in theirs (p136-137: 3-3 shapes double; shortness in their suit is what matters).
 * The direct-seat takeout double keeps its stricter shape.
 */
export class ReopeningSupport extends Constraint {
  expr(history: History): Expr {
    const unbidSuits = history.unbidSuits;
    assert(
      unbidSuits.length === 2 || unbidSuits.length === 3,
      `${this.constructor.name}: ${unbidSuits.length} unbid suits: ${history.callHistory}`,
    );
    return z3.And(
      z3.And(unbidSuits.map((suit) => exprForSuit(suit).ge(3))),
      exprForSuit(history.lastContract!.strain!).le(2),
    );
  }
}

export class MaxLengthInUnbidSuits extends Constraint {
  readonly maxLength: number;

  constructor(maxLength: number) {
    super();
    this.maxLength = maxLength;
  }

  expr(history: History): Expr {
    return z3.And(
      history.unbidSuits.map((suit) => exprForSuit(suit).le(this.maxLength)),
    );
  }
}

/**
 * Support for the three suits other than the last contract's suit.  Unlike
 * SupportForUnbidSuits this never depends on history.unbid_suits bookkeeping (which can
 * report 4 unbid suits mid-auction, e.g. after an artificial or unrecognized 2C, and then
 * _support_for_suits asserts): a takeout action over a one-suit contract just needs the
 * other three suits.
 */
export class SupportForSuitsOtherThanLastContract extends SupportForMultipleSuits {
  expr(history: History): Expr {
    const contractSuit = history.lastContract!.strain;
    return this._supportForSuits(
      SUITS.filter((s) => s !== contractSuit),
      history,
    );
  }
}

// We support any suit partner has shown life in.  Used for cuebid responses to doubles.
export class SupportForPartnersSuits extends SupportForMultipleSuits {
  expr(history: History): Expr {
    // This is kinda a hack.  Because TakeoutDouble can be either 17+ hcp or shape
    // we don't know that partner has necessarily bid a suit yet, so we can't just:
    // partners_suits = filter(lambda strain: history.partner.min_length(strain) > 1, suit.SUITS)
    // Instead we take the inverse of suits which ops have bid, which should be the same.
    // Suits the opponents only PROMISED with a double (a negative double shows the majors)
    // do not count: after 1C 1D X P 2C X the doubler's partner supports hearts and spades
    // (them.bid_suits would leave one suit; bank U, 2026-08-30).
    // A list in suit order, not a set: the suits are iterated into the expression.
    const partnersSuits = SUITS.filter(
      (s) =>
        !history.them.positions.some((p) => history._hasShownSuit(s, p, true)),
    );
    return this._supportForSuits(partnersSuits, history);
  }
}

export class Unusual2NShape extends Constraint {
  // 5-5 in two lowest unbid suits
  expr(history: History): Expr {
    const unbidSuits = sortStrains([...history.unbidSuits]).slice(0, 2);
    return z3.And(unbidSuits.map((suit) => exprForSuit(suit).ge(5)));
  }
}

export class StopperInRHOSuit extends Constraint {
  expr(history: History): Expr {
    const rhoSuit = history.rho.lastCall!.strain;
    if (rhoSuit === null) {
      return model.NO_CONSTRAINTS;
    }
    return model.stopperExprForSuit(rhoSuit);
  }
}

export class StoppersInUnbidSuits extends Constraint {
  expr(history: History): Expr {
    if (!history.unbidSuits.length) {
      return model.NO_CONSTRAINTS;
    }
    return z3.And(
      history.unbidSuits.map((suit) => model.stopperExprForSuit(suit)),
    );
  }
}

export class StoppersInOpponentsSuits extends Constraint {
  expr(history: History): Expr {
    if (!history.them.bidSuits.length) {
      return model.NO_CONSTRAINTS;
    }
    return z3.And(
      history.them.bidSuits.map((suit) => model.stopperExprForSuit(suit)),
    );
  }
}

purposes.CONDITIONS.set("stopped", new StoppersInOpponentsSuits());

export class Stopper extends Constraint {
  expr(history: History, call: Call): Expr {
    void history;
    return model.stopperExprForSuit(call.strain!);
  }
}

export class LongestSuitExceptOpponentSuits extends Constraint {
  expr(history: History, call: Call): Expr {
    const suitExpr = exprForSuit(call.strain!);
    // Including hearts >= hearts in this And doesn't hurt, but just reads funny when debugging.
    return z3.And(
      history.them.unbidSuits
        .filter((suit) => suit !== call.strain)
        .map((suit) => suitExpr.ge(exprForSuit(suit))),
    );
  }
}

export class LongestOfPartnersSuits extends Constraint {
  expr(history: History, call: Call): Expr {
    // Nothing to say if partner hasn't bid more than one suit.
    if (history.partner.bidSuits.length < 2) {
      return model.NO_CONSTRAINTS;
    }
    const suitExpr = exprForSuit(call.strain!);
    // Including hearts >= hearts in this And doesn't hurt, but just reads funny when debugging.
    return z3.And(
      history.partner.bidSuits
        .filter((suit) => suit !== call.strain)
        .map((suit) => suitExpr.ge(exprForSuit(suit))),
    );
  }
}

export class TwoOfTheTopThree extends Constraint {
  expr(history: History, call: Call): Expr {
    void history;
    return [
      model.twoOfTheTopThreeClubs,
      model.twoOfTheTopThreeDiamonds,
      model.twoOfTheTopThreeHearts,
      model.twoOfTheTopThreeSpades,
    ][call.strain!.index];
  }
}

export class ThreeOfTheTopFiveOrBetter extends Constraint {
  readonly suit: Strain | null;

  constructor(suit: Strain | null = null) {
    super();
    this.suit = suit;
  }

  expr(history: History, call: Call): Expr {
    void history;
    const strain = this.suit !== null ? this.suit : call.strain!;
    return [
      model.threeOfTheTopFiveClubsOrBetter,
      model.threeOfTheTopFiveDiamondsOrBetter,
      model.threeOfTheTopFiveHeartsOrBetter,
      model.threeOfTheTopFiveSpadesOrBetter,
    ][strain.index];
  }
}

export class ThirdRoundStopper extends Constraint {
  expr(history: History, call: Call): Expr {
    void history;
    return [
      model.thirdRoundStopperClubs,
      model.thirdRoundStopperDiamonds,
      model.thirdRoundStopperHearts,
      model.thirdRoundStopperSpades,
    ][call.strain!.index];
  }
}

export class OpeningRuleConstraint extends Constraint {
  expr(history: History): Expr {
    if (history.partner.lastCall === null) {
      // first or second seat
      return model.ruleOfTwenty;
    }
    if (history.lho.lastCall === null) {
      // Third seat shades a point: rule of nineteen (the booklet's light third-seat
      // openings; round-18 review, C6 -- this was written and commented out long ago
      // as "inconsistent with some test cases", re-adjudicated by the harness).  Not
      // with a seven-card suit: those hands preempt, and the shading was stealing
      // them into one-level openings.
      return z3.Or(
        model.ruleOfTwenty,
        z3.And(
          model.ruleOfNineteen,
          model.clubs.le(6),
          model.diamonds.le(6),
          model.hearts.le(6),
          model.spades.le(6),
        ),
      );
    }
    return model.ruleOfFifteen;
  }
}

export class MinCombinedPointsForPartnerMinimumSuitedRebid extends Constraint {
  expr(history: History, call: Call): Expr {
    // If we're forcing partner to bid, we're promising it's OK to rebid their suit at the next level with a minimum.
    const partnerCall = history.partner.lastCall!;
    assert(call.strain !== partnerCall.strain);
    let rebidLevel = call.level!;
    if (compareStrains(call.strain!, partnerCall.strain!) > 0) {
      rebidLevel += 1;
    }
    // NOTE: This math matches NaturalSuited (almost):
    const expectedPoints = 19 + (rebidLevel - 2) * 3;
    return model.points.ge(expectedPoints - history.partner.minPoints);
  }
}

// Four-card support for partner's minor comes before an invitational notrump when the hand is
// short of game values (SupportMinorWithFour); five-card support is raised with any strength
// (SupportMinorWithFive).  The partner_ forms are for a cuebid, whose own suit is theirs.
export const minorRaiseBeforeNotrump = new ConstraintAnd(
  new MinLength(4),
  new NotEnoughForGame(),
);
export const minorRaiseWithFive = new MinLength(5);
export const partnerMinorRaiseBeforeNotrump = new ConstraintAnd(
  new MinLengthInPartnersLastSuit(4),
  new NotEnoughForGame(),
);
export const partnerMinorRaiseWithFive = new MinLengthInPartnersLastSuit(5);
