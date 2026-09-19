// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/rules.py, one section of it (see the section list
// at the top of that file).  Filled in by phase 5 of
// docs/typescript-engine-plan.md; the base classes shared by every section
// stay in ../rules.ts.
//
// The preempts (the preemptive overcall, the responses to a preempt and the
// preempter's forced rebids) and the slam conventions (Gerber, Blackwood, the
// two notrump feature request and the grand slam force).  PreemptiveOpen and
// the `preemptWeakOpening` condition it shares with the jump overcalls are in
// ../rules.ts.
//
// cspell:ignore Blackwood Gerber preempt preempts preempter Preemptive hcp

import { Call } from "../../core/call";
import { NOTRUMP, SUITS } from "../../core/suit";
import {
  Constraint,
  ConstraintNot,
  MinCombinedPointsForPartnerMinimumSuitedRebid,
  MinimumCombinedLength,
  MinimumCombinedPoints,
  MinLength,
  ThirdRoundStopper,
  ThreeOfTheTopFiveOrBetter,
  TwoOfTheTopThree,
} from "../constraints";
import type { History } from "../history";
import {
  exprForSuit,
  highCardPoints,
  NO_CONSTRAINTS,
  numberOfAces,
  numberOfKings,
  points,
  positions,
} from "../model";
import {
  AndPrecondition,
  annotations,
  EitherPrecondition,
  ForcedToBid,
  HaveFit,
  InvertedPrecondition,
  JumpFromLastContract,
  LastBidHasAnnotation,
  LastBidHasStrain,
  LastBidHasSuit,
  LastBidWas,
  LastBidWasBelowGame,
  NotJumpFromLastContract,
  NotJumpFromPartnerLastBid,
  RaiseOfPartnersLastSuit,
  RebidSameSuit,
  UnbidSuit,
} from "../preconditions";
import { Highest } from "../prefer";
import { categories, Rule, rule, type RuleClass } from "../rule_compiler";
import { suitPreference } from "../rules";
import { type Expr, z3 } from "../z3";

// The overcall section of rules.py (another file here) owns DirectOvercall and
// preempt_weak_overcall; PreemptiveOvercall derives from the one and reads the
// other, so both are repeated privately until that section lands.
class DirectOvercall extends Rule {
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

// A preempt is for less than an opening hand.  An opening preempt is for a hand that would not
// open at the one level (the opening rule for the seat); a weak jump overcall is for at most
// eleven high card points, however long the suit.
const preemptWeakOvercall = highCardPoints.le(11);

// --- Preempts -----------------------------------------------------------

export class PreemptiveOvercall extends DirectOvercall {
  static override dsl = rule({
    purpose: "Preempt",
    conditionalPurposes: [[preemptWeakOvercall, "PreemptWeak"]],
    annotations: annotations.Preemptive,
    preconditions: [new JumpFromLastContract(), new UnbidSuit()],
    constraints: {
      "2C 2D 2H 2S": new MinLength(6),
      "3C 3D 3H 3S": new MinLength(7),
      "4C 4D 4H 4S": new MinLength(8),
    },
    prefer: [new Highest(...Call.suitedNamesBetween("2C", "4S"))], // the level is the length
    sharedConstraints: [new ThreeOfTheTopFiveOrBetter(), points.ge(5)],
  });
}

export class ResponseToPreempt extends Rule {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.Preemptive,
    ),
  });
}

// We don't need anything to pass a preempt.  Even with a void in partner's
// suit we can't correct w/o forcing to game.
// This is basically just a version of SuitGameIsRemote w/o the fit requirement.
export class PassResponseToPreempt extends ResponseToPreempt {
  static override dsl = rule({
    purpose: "Forced", // unconstrained: anything with a reason to bid comes first
    callNames: "P",
    // FIXME: Partner can always have up to 16 hcp when preempting.
    // This should be Max over his minimum?
    sharedConstraints: NO_CONSTRAINTS,
  });
}

const newSuitResponsesToPreempt = suitPreference(
  Call.suitedNamesBetween("2D", "4D"),
);

export class NewSuitResponseToPreempt extends ResponseToPreempt {
  static override dsl = rule({
    purpose: "AskLater", // forcing, but a game in hand (3N with stoppers) comes first
    preconditions: [new UnbidSuit(), new NotJumpFromLastContract()],
    callNames: newSuitResponsesToPreempt.callNames,
    prefer: newSuitResponsesToPreempt,
    sharedConstraints: [
      new MinLength(5),
      // Should this deny support for partner's preempt suit?
      // Does this really need 17+ points for a 2-level contract and 20+ for a 3-level?
      // It seems this bid should be more "we have the majority of the points"
      // than that a particular level is safe.  Responding to a 2-level 15+ should be sufficient?
      new MinCombinedPointsForPartnerMinimumSuitedRebid(),
    ],
  });
}

export class PassAfterPreempt extends Rule {
  static override dsl = rule({
    purpose: "Forced",
    preconditions: [
      new LastBidHasAnnotation(positions.Me, annotations.Preemptive),
      new InvertedPrecondition(new ForcedToBid()),
    ],
    callNames: "P",
    sharedConstraints: NO_CONSTRAINTS,
  });
}

/** Some unbid suit has at least min_length cards. */
export class UnbidSuitOfLength extends Constraint {
  readonly minLength: number;

  constructor(minLength: number) {
    super();
    this.minLength = minLength;
  }

  expr(history: History, call: Call): Expr {
    void call;
    const unbid = history.unbidSuits;
    if (!unbid.length) {
      return z3.BoolVal(false);
    }
    return z3.Or(unbid.map((s) => exprForSuit(s).ge(this.minLength)));
  }
}

export class ForcedRebidAfterPreempt extends Rule {
  static override dsl = rule({
    preconditions: [
      new LastBidHasAnnotation(positions.Me, annotations.Preemptive),
      new ForcedToBid(), // aka, partner mentioned a new suit.
      new LastBidWasBelowGame(), // RHO must have passed for us to be forced.
    ],
  });
}

export class ForcedRebidAfterNewSuitResponseToPreempt extends ForcedRebidAfterPreempt {
  static override dsl = rule({
    preconditions: [
      new LastBidHasSuit(positions.Partner),
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.Partner, annotations.Artificial),
      ),
    ],
  });
}

// This applies both after a new suit, or after 2N feature request.
export class MinimumRebidOfPreemptSuit extends ForcedRebidAfterPreempt {
  static override dsl = rule({
    purpose: "Forced",
    preconditions: [
      new RebidSameSuit(),
      new NotJumpFromLastContract(),
      // FIXME: This is a hack around the LawOfTotalTricks appearing *forcing*
      new InvertedPrecondition(new RaiseOfPartnersLastSuit()),
    ],
    // Min: 1S 2D P 2H P 3D
    callNames: Call.suitedNamesBetween("3D", "4D"),
    sharedConstraints: NO_CONSTRAINTS,
  });
}

export class RaiseOfPartnersPreemptResponse extends ForcedRebidAfterNewSuitResponseToPreempt {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: [
      new RaiseOfPartnersLastSuit(),
      new NotJumpFromLastContract(),
    ],
    // Min: 1S 2D P 2H P 3D, Unclear what the max is.
    callNames: Call.suitedNamesBetween("3D", "4D"),
    // FIXME: This can also be made with doubleton honors according to p85
    sharedConstraints: new MinimumCombinedLength(8),
    prefer: [],
  });
}

export class NewSuitAfterPreempt extends ForcedRebidAfterNewSuitResponseToPreempt {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: [new NotJumpFromLastContract(), new UnbidSuit()],
    // Min: 1S 2D P 2H P 2S, Unclear what the max is.
    callNames: Call.suitedNamesBetween("2S", "4D"),
    // Without support for partner's suit (with it, the raise).
    sharedConstraints: [
      points.ge(9),
      new MinLength(4),
      new ConstraintNot(new MinimumCombinedLength(8, true)),
    ],
    prefer: [],
  });
}

export class NotrumpAfterPreempt extends ForcedRebidAfterNewSuitResponseToPreempt {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new NotJumpFromLastContract(),
    // Min: 2D P 2H P 2N, Unclear if 3N is viable?
    callNames: ["2N", "3N"],
    // Without support for partner's suit and without a four-card suit to show (p85 h4).
    sharedConstraints: [
      points.ge(9),
      new ConstraintNot(new MinimumCombinedLength(8, true)),
      new ConstraintNot(new UnbidSuitOfLength(4)),
    ],
    prefer: [],
  });
}

// With a minimum we would rather raise his suit than rebid our own.
// With a maximum we would still rather raise, failing that a new suit, and otherwise NT.

// --- Slam conventions ---------------------------------------------------

export class Gerber extends Rule {
  static override dsl = rule({
    category: categories.Gadget,
    requiresPlanning: true,
    sharedConstraints: NO_CONSTRAINTS,
    annotations: annotations.Gerber,
    prefer: [],
  });
}

export class GerberForAces extends Gerber {
  static override dsl = rule({
    purpose: "Planned",
    callNames: "4C",
    preconditions: [
      new LastBidHasStrain(positions.Partner, NOTRUMP),
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.Partner, annotations.Artificial),
      ),
    ],
  });
}

export class GerberForKings extends Gerber {
  static override dsl = rule({
    purpose: "Planned",
    callNames: "5C",
    preconditions: new LastBidHasAnnotation(positions.Me, annotations.Gerber),
  });
}

export class ResponseToGerber extends Rule {
  static override dsl = rule({
    purpose: "Answer",
    category: categories.Relay,
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.Gerber),
      new NotJumpFromPartnerLastBid(),
    ],
    constraints: {
      "4D": z3.Or(numberOfAces.eq(0), numberOfAces.eq(4)),
      "4H": numberOfAces.eq(1),
      "4S": numberOfAces.eq(2),
      "4N": numberOfAces.eq(3),
      "5D": z3.Or(numberOfKings.eq(0), numberOfKings.eq(4)),
      "5H": numberOfKings.eq(1),
      "5S": numberOfKings.eq(2),
      "5N": numberOfKings.eq(3),
    },
    annotations: annotations.Artificial,
    prefer: [],
  });
}

export class Blackwood extends Rule {
  static override dsl = rule({
    category: categories.Gadget,
    requiresPlanning: true,
    sharedConstraints: NO_CONSTRAINTS,
    annotations: annotations.Blackwood,
    prefer: [],
  });
}

export class BlackwoodForAces extends Blackwood {
  static override dsl = rule({
    purpose: "Planned",
    callNames: "4N",
    preconditions: [
      new LastBidHasSuit(positions.Partner),
      // A suit named by an artificial call is not a suit: after 2C P 2D the waiting 2D
      // made 4N ace-asking (and, being requires_planning, it was never actually bid --
      // the call was simply dead, blocking the 30-31 notrump rebid).
      new InvertedPrecondition(
        new LastBidHasAnnotation(positions.Partner, annotations.Artificial),
      ),
      new EitherPrecondition(new JumpFromLastContract(), new HaveFit()),
    ],
  });
}

export class BlackwoodForKings extends Blackwood {
  static override dsl = rule({
    purpose: "Planned",
    callNames: "5N",
    preconditions: new LastBidHasAnnotation(
      positions.Me,
      annotations.Blackwood,
    ),
  });
}

export class ResponseToBlackwood extends Rule {
  static override dsl = rule({
    purpose: "Answer",
    category: categories.Relay,
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.Blackwood),
      new NotJumpFromPartnerLastBid(),
    ],
    constraints: {
      "5C": z3.Or(numberOfAces.eq(0), numberOfAces.eq(4)),
      "5D": numberOfAces.eq(1),
      "5H": numberOfAces.eq(2),
      "5S": numberOfAces.eq(3),
      "6C": z3.Or(numberOfKings.eq(0), numberOfKings.eq(4)),
      "6D": numberOfKings.eq(1),
      "6H": numberOfKings.eq(2),
      "6S": numberOfKings.eq(3),
    },
    annotations: annotations.Artificial,
    prefer: [],
  });
}

export class TwoNotrumpFeatureRequest extends ResponseToPreempt {
  static override dsl = rule({
    purpose: "Planned",
    category: categories.Gadget,
    annotations: annotations.FeatureRequest,
    requiresPlanning: true,
    // The booklet's feature asks are on 15-16 opposite a weak two (21 combined, p88), but
    // lowering this to 21 makes the (never bid, requires_planning) ask claim 2N by category
    // over a weak jump overcall and leaves the natural 2N with no call -- see the
    // requires_planning item in docs/saycbridge-misses-plan.md.
    constraints: { "2N": new MinimumCombinedPoints(22) },
  });
}

export class ResponseToTwoNotrumpFeatureRequest extends Rule {
  static override dsl = rule({
    category: categories.Gadget,
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.FeatureRequest,
    ),
  });
}

/** A third-round stopper in a suit other than the one we preempted in: the feature. */
export class OutsideThirdRoundStopper extends Constraint {
  expr(history: History, call: Call): Expr {
    void call;
    const mine = history.me.lastCall!.strain;
    return z3.Or(
      SUITS.filter((s) => s !== mine).map((s) =>
        new ThirdRoundStopper().expr(history, Call.fromLevelAndStrain(3, s)),
      ),
    );
  }
}

export class FeatureResponseToTwoNotrumpFeatureRequest extends ResponseToTwoNotrumpFeatureRequest {
  static override dsl = rule({
    purpose: "Answer",
    category: categories.Gadget,
    preconditions: new InvertedPrecondition(new RebidSameSuit()),
    annotations: annotations.Artificial,
    callNames: ["3C", "3D", "3H", "3S"],
    // Note: We could have a protected outside honor with as few as 6 points,
    // (QJTxxx in our main suit + Qxx in our outside honor suit)
    // p86 seems to suggest we need 9+ hcp.
    sharedConstraints: [points.ge(9), new ThirdRoundStopper()],
    prefer: [],
  });
}

/**
 * A maximum with no feature to show rebids 3N (both authorities; round-18 review,
 * A1): the feature bid outranks it, so 3N means no outside third-round stopper, and the
 * minimum suit rebid sits below both.
 */
export class MaximumNotrumpResponseToTwoNotrumpFeatureRequest extends ResponseToTwoNotrumpFeatureRequest {
  static override dsl = rule({
    purpose: "Answer",
    category: categories.Gadget,
    callNames: "3N",
    sharedConstraints: [
      points.ge(9),
      new ConstraintNot(new OutsideThirdRoundStopper()),
    ],
    prefer: [],
  });
}

export class GrandSlamForce extends Rule {
  static override dsl = rule({
    purpose: "Planned",
    preconditions: [
      new LastBidHasSuit(positions.Partner),
      // Since ACBL requires 8hcp to open naturally, I suspect partner has to have opened for GSF to be on.
      new LastBidHasAnnotation(positions.Partner, annotations.Opening),
      new JumpFromLastContract(), // This is slightly redundant. :)
    ],
    callNames: "5N",
    requiresPlanning: true,
    sharedConstraints: NO_CONSTRAINTS,
    annotations: annotations.GrandSlamForce,
  });
}

export class ResponseToGrandSlamForce extends Rule {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.GrandSlamForce),
      new RebidSameSuit(),
    ],
    constraints: {
      "6C 6D 6H 6S": NO_CONSTRAINTS,
      "7C 7D 7H 7S": new TwoOfTheTopThree(),
    },
    prefer: [new Highest(...Call.suitedNamesBetween("6C", "7S"))], // the grand slam when the trumps allow it
  });
}

/** The concrete rules of this section, by name (see sayc.ts). */
export const RULE_CLASSES: Readonly<Record<string, RuleClass>> = {
  PreemptiveOvercall,
  PassResponseToPreempt,
  NewSuitResponseToPreempt,
  PassAfterPreempt,
  MinimumRebidOfPreemptSuit,
  RaiseOfPartnersPreemptResponse,
  NewSuitAfterPreempt,
  NotrumpAfterPreempt,
  GerberForAces,
  GerberForKings,
  ResponseToGerber,
  BlackwoodForAces,
  BlackwoodForKings,
  ResponseToBlackwood,
  TwoNotrumpFeatureRequest,
  FeatureResponseToTwoNotrumpFeatureRequest,
  MaximumNotrumpResponseToTwoNotrumpFeatureRequest,
  GrandSlamForce,
  ResponseToGrandSlamForce,
};
