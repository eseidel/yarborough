// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/cappelletti.py: the Cappelletti defense to a 1N
// opening (direct and balancing), the responses to it and the rebids after
// it.  The declaration convention is the header comment of rule_compiler.ts.
//
// cspell:ignore Cappelletti Cappelleti cappelletti notrump penalize

import { CLUBS, DIAMONDS, MAJORS } from "../core/suit";
import {
  type Constraints,
  LongestSuitExceptOpponentSuits,
  MinimumCombinedLength,
  MinimumCombinedPoints,
  MinimumCombinedSupportPoints,
  MinLength,
  ThreeOfTheTopFiveOrBetter,
} from "./constraints";
import {
  balanced,
  clubs,
  diamonds,
  hearts,
  NO_CONSTRAINTS,
  playingPoints,
  points,
  positions,
  spades,
} from "./model";
import {
  annotations,
  LastBidHasAnnotation,
  LastBidHasStrain,
  LastBidWas,
  NotJumpFromLastContract,
  PartnerHasAtLeastLengthInSuit,
  RaiseOfPartnersLastSuit,
  UnbidSuit,
} from "./preconditions";
import { Cheapest } from "./prefer";
import { tuple } from "./py";
import { type MixinBase, Rule, rule, type RuleClass } from "./rule_compiler";
import { suitPreference } from "./rules";
import { z3 } from "./z3";
import { balancingPrecondition } from "./rules/overcalls";

// Shared call schedule for defending against a 1N opening, direct or balancing seat
// (mixin pattern, like MichaelsCuebid): the responses key off annotations.Cappelletti either way.
const cappellettiEntriesConstraints: Readonly<Record<string, Constraints>> = {
  "2C": z3.Or(clubs.ge(6), diamonds.ge(6), hearts.ge(6), spades.ge(6)),
  "2D": z3.And(hearts.ge(5), spades.ge(5)),
  "2H": z3.And(hearts.ge(5), z3.Or(clubs.ge(5), diamonds.ge(5))),
  "2S": z3.And(spades.ge(5), z3.Or(clubs.ge(5), diamonds.ge(5))),
  "2N": z3.And(clubs.ge(5), diamonds.ge(5)),
  // I think the logic here is that with such an uneven distribution of points
  // in the opponents, we don't really want to play a game anyway, so we just penalize them.
  X: points.ge(15),
};

export function CappellettiEntries<B extends MixinBase>(Base: B) {
  return class CappellettiEntries extends Base {
    static override dsl = rule({
      constraints: cappellettiEntriesConstraints,
      annotationsPerCall: {
        "2C 2D 2N": annotations.Artificial,
      },
      annotations: annotations.Cappelletti,
      // The book suggests "decent strength".
      // The book bids Cappelletti with 11 hcp, but seems to want 12 hcp when responding.
      // Wikipedia says Cappelletti is 9-14 hcp.
      // playing_points here is sorta compensating for us not using length_points?
      explanationsPerCall: {
        X: `Indicates a 1NT opening hand.  NT conventional responses are off.
Responder can pass with enough points to penalize opener, but more likely should escape to a suit fit.`,
        "2C": "Indicates one-suited hand (6+ cards in an un-named suit).",
      },
      // the penalty double, a two-suiter, a long suit
      prefer: ["X", new Cheapest("2D", "2H", "2S", "2N"), "2C"],
    });
  };
}

// Cappelletti may promise < 15 hcp, since 3-level overcalls are also on and may be preferred.
export class Cappelletti extends CappellettiEntries(Rule) {
  static override dsl = rule({
    purpose: "Compete",
    preconditions: [
      new LastBidHasAnnotation(positions.RHO, annotations.Opening),
      new LastBidWas(positions.RHO, "1N"),
    ],
    sharedConstraints: [points.ge(10), playingPoints.ge(12)],
  });
}

/**
 * 1N-P-P was previously a rule desert: every balancing rule requires a one-level SUIT
 * opening, so classic balance hands passed out 1N.  Same schedule as Cappelletti, slightly
 * lighter (the direct seat's pass has shown weakness, so the points are marked).
 */
export class BalancingCappelletti extends CappellettiEntries(Rule) {
  static override dsl = rule({
    purpose: "Compete",
    preconditions: [balancingPrecondition, new LastBidWas(positions.LHO, "1N")],
    // The double still shows a 1N-opening HAND, not just 15+ points: with an unbalanced 15+
    // we bid a suit or pass and defend (test_sayc "1N P P" expects P on KQ986.K.AK7.J942).
    constraints: {
      ...cappellettiEntriesConstraints,
      X: z3.And(points.ge(15), balanced),
    },
    sharedConstraints: [points.ge(9), playingPoints.ge(11)],
  });
}

export class ResponseToCappelletti extends Rule {
  static override dsl = rule({
    preconditions: [
      new LastBidHasAnnotation(positions.Partner, annotations.Cappelletti),
      new LastBidWas(positions.RHO, "P"),
    ],
  });
}

export class PassResponseToOneNotrumpPenaltyDouble extends ResponseToCappelletti {
  static override dsl = rule({
    purpose: "Penalize",
    preconditions: new LastBidWas(positions.Partner, "X"),
    constraints: {
      P: new MinimumCombinedPoints(21), // We have a point majority and should penalize 1N.
    },
  });
}

const newSuitResponsesToPenaltyDouble = suitPreference([
  "2C",
  "2D",
  "2H",
  "2S",
]);

export class NewSuitResponseToOneNotrumpPenaltyDouble extends ResponseToCappelletti {
  static override dsl = rule({
    purpose: "Discovery",
    preconditions: [
      new LastBidWas(positions.Partner, "X"),
      new UnbidSuit(),
      new NotJumpFromLastContract(),
    ],
    callNames: newSuitResponsesToPenaltyDouble.callNames,
    prefer: newSuitResponsesToPenaltyDouble,
    sharedConstraints: [new MinLength(4), new LongestSuitExceptOpponentSuits()],
  });
}

export class ResponseToCappellettiTwoClubs extends ResponseToCappelletti {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidWas(positions.Partner, "2C"),
    constraints: {
      P: [clubs.ge(6), new ThreeOfTheTopFiveOrBetter(CLUBS)],
      "2D": NO_CONSTRAINTS,
      "2H": [hearts.ge(5), new ThreeOfTheTopFiveOrBetter()],
      "2S": [spades.ge(5), new ThreeOfTheTopFiveOrBetter()],
      "2N": [points.ge(11), balanced],
      // Could 3C be strong long clubs?
      // And 3D be long diamonds?
    },
    annotationsPerCall: {
      "2D": annotations.Artificial,
    },
    explanationsPerCall: {
      "2D": "Waiting. Asks partners to name their 6-card suit.",
    },
    // a strong major, long clubs, a balanced 11+, else the waiting 2D
    prefer: ["2S", "2H", "P", "2N", "2D"],
  });
}

export class RebidAfterCappelleti extends Rule {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(
      positions.Me,
      annotations.Cappelletti,
    ),
  });
}

export class SuitRebidAfterCappellettiTwoClubs extends RebidAfterCappelleti {
  static override dsl = rule({
    purpose: "Discovery",
    preconditions: [new LastBidWas(positions.Me, "2C"), new UnbidSuit()],
    // FIXME: What if they interfere?
    callNames: ["2H", "2S", "3C", "3D"],
    sharedConstraints: new MinLength(6),
  });
}

export class ResponseToCappellettiTwoDiamonds extends ResponseToCappelletti {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: new LastBidWas(positions.Partner, "2D"),
    constraints: {
      P: [diamonds.ge(6), new ThreeOfTheTopFiveOrBetter(DIAMONDS)],
      // Partner has already said he's 5-5 in the majors, so he has at most 3 in the minors.
      "2N": [clubs.ge(5), diamonds.ge(5)],
      "3C": [clubs.ge(6), new ThreeOfTheTopFiveOrBetter(CLUBS)],

      // Could these be natural too?  They imply invitational points?  But how many does partner have?
      // Currently we're assuming that 2D promises 5-5 in the majors.
      "3H": [
        new MinimumCombinedLength(9),
        new MinimumCombinedSupportPoints(22),
      ],
      "3S": [
        new MinimumCombinedLength(9),
        new MinimumCombinedSupportPoints(22),
      ],
    },
    annotationsPerCall: {
      "2N": annotations.Artificial,
    },
    // the invitational raise, both minors, a long minor, else pass
    prefer: ["3H", "3S", "2N", "3C", "P"],
  });
}

export class ResponseToMajorCappelletti extends ResponseToCappelletti {
  static override dsl = rule({
    // suit.MAJORS is a Python tuple, and its repr shows in the precondition's.
    preconditions: new LastBidHasStrain(positions.Partner, tuple(...MAJORS)),
  });
}

export class NewSuitResponseToMajorCappelletti extends ResponseToMajorCappelletti {
  static override dsl = rule({
    purpose: "Discovery",
    preconditions: new UnbidSuit(),
    callNames: ["2S", "3C", "3D", "3H"],
    sharedConstraints: [new MinLength(6), new ThreeOfTheTopFiveOrBetter()],
  });
}

export class RaiseResponseToMajorCappelletti extends ResponseToMajorCappelletti {
  static override dsl = rule({
    purpose: "SupportMajors",
    preconditions: [
      new LastBidHasStrain(positions.Partner, tuple(...MAJORS)),
      new RaiseOfPartnersLastSuit(),
    ],
    sharedConstraints: [
      new MinimumCombinedLength(8),
      // Should this be support points?
      // Partner could have as few as 10 points!
      new MinimumCombinedPoints(18),
    ],
    callNames: ["3H", "3S"],
    prefer: [],
  });
}

export class CappellettiMinorRequest extends ResponseToMajorCappelletti {
  static override dsl = rule({
    purpose: "Planned",
    callNames: "2N",
    requiresPlanning: true, // FIXME: Can't we do this with constraints?
    annotations: annotations.CappellettiMinorRequest,
    sharedConstraints: NO_CONSTRAINTS,
  });
}

export class ResponseToCappellettiMinorRequest extends RebidAfterCappelleti {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: [
      new NotJumpFromLastContract(),
      new LastBidHasAnnotation(
        positions.Partner,
        annotations.CappellettiMinorRequest,
      ),
    ],
    callNames: ["3C", "3D"],
    sharedConstraints: new MinLength(5),
  });
}

export class RaiseAfterCappellettiMinorRequest extends Rule {
  static override dsl = rule({
    purpose: "Answer",
    preconditions: [
      new LastBidHasAnnotation(
        positions.Me,
        annotations.CappellettiMinorRequest,
      ),
      new PartnerHasAtLeastLengthInSuit(5),
    ],
    callNames: ["3H", "3S"],
    sharedConstraints: [
      new MinimumCombinedLength(8),
      new MinimumCombinedSupportPoints(22), // Matches limit raise
    ],
  });
}

/** The concrete rules of this module, by name (see sayc.ts). */
export const RULE_CLASSES: Readonly<Record<string, RuleClass>> = {
  Cappelletti,
  BalancingCappelletti,
  PassResponseToOneNotrumpPenaltyDouble,
  NewSuitResponseToOneNotrumpPenaltyDouble,
  ResponseToCappellettiTwoClubs,
  SuitRebidAfterCappellettiTwoClubs,
  ResponseToCappellettiTwoDiamonds,
  NewSuitResponseToMajorCappelletti,
  RaiseResponseToMajorCappelletti,
  CappellettiMinorRequest,
  ResponseToCappellettiMinorRequest,
  RaiseAfterCappellettiMinorRequest,
};
