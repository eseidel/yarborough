// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/rules.py, section by section, in the convention
// documented at the top of rule_compiler.ts.  Phase 5 of
// docs/typescript-engine-plan.md fills in the sections; the rules here are
// the exemplars the DSL foundation was proved against.
//
// The rules of SAYC, roughly in the order a bidding book presents them.  Each section is a
// base Rule class and its concrete rules.  Every rule declares its purpose (purposes.ts:
// why the call is made, and which reason wins), and where it may bid several calls, its
// own preference among them (prefer, prefer.ts).  Two rules of one purpose must not both
// fit a hand: their meanings, or preconditions, keep them apart; a rule that is the call of
// last resort for its purpose says so (fallback).
//
//   Openings ............................ Opening, OneLevelSuitOpening, NotrumpOpening, StrongTwoClubs
//   Responses to a suit opening ......... Response, RaiseResponse, Jacoby2N, NegativeDouble, ...
//   Responses to 2C ..................... ResponseToStrongTwoClubs
//   Opener's rebids ..................... OpenerRebid, ReverseByOpener, JumpShiftByOpener, ...
//   Responder's rebids .................. ResponderRebid, FourthSuitForcing, SecondNegative
//   Notrump responses ................... NotrumpResponse, Stayman, Jacoby transfers, AcceptTransfer
//   Overcalls and advances .............. DirectOvercall, BalancingOvercall, Michaels, Unusual2N
//   Takeout doubles ..................... TakeoutDouble, ResponseToTakeoutDouble, RebidAfterTakeoutDouble
//   Preempts ............................ PreemptiveOpen, PreemptiveOvercall, ResponseToPreempt
//   Slam conventions .................... Gerber, Blackwood, TwoNotrumpFeatureRequest, GrandSlamForce
//
// Natural bids, passes and the law of total tricks live in natural.ts; Cappelletti in cappelletti.ts.

import { Call } from "../core/call";
import { MAJORS, SUITS } from "../core/suit";
import {
  ConstraintAnd,
  ConstraintNot,
  MaxLengthInUnbidMajors,
  MinLength,
  OpeningRuleConstraint,
  ThreeOfTheTopFiveOrBetter,
} from "./constraints";
import type { History } from "./history";
import {
  balanced,
  clubs,
  diamonds,
  hearts,
  points,
  positions,
  spades,
} from "./model";
import {
  annotations,
  FourthSeatOpensPreemptsAtGameOnly,
  InvertedPrecondition,
  JumpFromLastContract,
  LastBidHasAnnotation,
  NoOpening,
  UnbidSuit,
} from "./preconditions";
import { Cheapest, Highest, Longest } from "./prefer";
import { type MixinBase, Rule, rule } from "./rule_compiler";
import { z3 } from "./z3";

/** A raise that names a different call (a cuebid, Jordan): support for PARTNER's suit. */
export function partnerSuitSupportPurpose(
  history: History,
  call: Call,
): string {
  void call;
  const partners = history.partner.lastCall;
  if (
    partners !== null &&
    partners.isContract() &&
    "HS".includes(partners.strain!.char)
  ) {
    return "SupportMajors";
  }
  return "SupportMinors";
}

/** A prefer list that remembers its calls (`callNames: preference.callNames`). */
export interface SuitPreference extends Array<Longest | Cheapest> {
  callNames: string[];
}

/**
 * The prefer list for a rule that may bid any of several suits: the longest suit first;
 * with equal lengths a major before a minor, then the cheaper call.
 */
export function suitPreference(callNames: readonly string[]): SuitPreference {
  const calls = callNames.map((name) => Call.fromString(name));
  const majors = calls
    .filter((call) => MAJORS.includes(call.strain!))
    .map((call) => call.name);
  const minors = calls
    .filter((call) => !MAJORS.includes(call.strain!))
    .map((call) => call.name);
  const preference = [
    new Longest(...callNames),
    new Cheapest(...majors),
    new Cheapest(...minors),
  ] as SuitPreference;
  preference.callNames = [...callNames];
  return preference;
}

// --- Openings -----------------------------------------------------------

export class Opening extends Rule {
  static override dsl = rule({
    annotations: annotations.Opening,
    preconditions: new NoOpening(),
  });
}

export class OneLevelSuitOpening extends Opening {
  static override dsl = rule({
    purpose: "MajorDiscovery",
    sharedConstraints: new OpeningRuleConstraint(),
    annotationsPerCall: {
      "1C": annotations.BidClubs,
      "1D": annotations.BidDiamonds,
      "1H": annotations.BidHearts,
      "1S": annotations.BidSpades,
    },
    annotations: annotations.OneLevelSuitOpening,
    constraints: {
      "1C": clubs.ge(3),
      "1D": diamonds.ge(3),
      "1H": hearts.ge(5),
      "1S": spades.ge(5),
    },
    prefer: [
      new Longest("1H", "1S"), // a five-card major, the longer first
      "1S",
      "1H", // five-five: spades
      new Longest("1C", "1D"), // the longer minor
      ["1C", z3.And(clubs.eq(3), diamonds.eq(3))], // three-three: clubs
      "1D",
      "1C", // four-four (or five-five): diamonds
    ],
  });
}

export class NotrumpOpening extends Opening {
  static override dsl = rule({
    purpose: "EnterNotrumpSystem",
    annotations: annotations.NotrumpSystemsOn,
    constraints: {
      "1N": z3.And(points.ge(15), points.le(17), balanced),
      "2N": z3.And(points.ge(20), points.le(21), balanced),
    },
  });
}

/**
 * 25-27 balanced (booklet: the bands above the 2N opening are 25-27 open 3N, 28-29
 * open 2C then 3N, 30-31 open 2C then 4N; the engine previously compressed all of them
 * into 2C-then-3N).  Above StrongTwoClubs so the band actually opens 3N.  No notrump
 * systems: responses are natural.
 */
export class ThreeNotrumpOpening extends Opening {
  static override dsl = rule({
    purpose: "EnterNotrumpSystem",
    callNames: "3N",
    sharedConstraints: z3.And(points.ge(25), points.le(27), balanced),
  });
}

export class StrongTwoClubs extends Opening {
  static override dsl = rule({
    purpose: "GameForce",
    // Artificial: says nothing about clubs (a double of it is lead-directing, not takeout).
    annotations: [annotations.StrongTwoClubOpening, annotations.Artificial],
    callNames: "2C",
    sharedConstraints: points.ge(22), // FIXME: Should support "or 9+ winners"
  });
}

// --- Responses to a suit opening ----------------------------------------

export class Response extends Rule {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.Opening,
    ),
  });
}

export class ResponseToOneLevelSuitedOpen extends Response {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(
      positions.Partner,
      annotations.OneLevelSuitOpening,
    ),
  });
}

/** The mixin of the jump shifts: an unbid suit, one level above the last contract. */
export function JumpShift<B extends MixinBase>(Base: B) {
  return class JumpShift extends Base {
    static override dsl = rule({
      preconditions: [new UnbidSuit(), new JumpFromLastContract(1)],
    });
  };
}

// --- Opener's rebids ----------------------------------------------------

export class OpenerRebid extends Rule {
  static override dsl = rule({
    preconditions: new LastBidHasAnnotation(positions.Me, annotations.Opening),
  });
}

export class RebidAfterOneLevelOpen extends OpenerRebid {
  static override dsl = rule({
    // FIXME: Most subclasses here only make sense over a minimum rebid from partner.
    preconditions: [
      new LastBidHasAnnotation(positions.Me, annotations.OneLevelSuitOpening),
    ],
  });
}

// After a negative double the cuebid (19+, every strain still open) outranks a jump shift (19+).

// The lowest possible jumpshift is 1C P 1D P 2H.
// The highest possible jumpshift is 1S P 2S P 4H
// FIXME: The book mentions that opener jumpshifts don't always promise 4, especially for 1C P MAJOR P 3D
const jumpShiftByOpenerCalls = [
  "2H",
  "2S",
  "3C",
  "3D",
  "3H",
  "3S",
  "4C",
  "4D",
  "4H",
];

export class JumpShiftByOpener extends JumpShift(RebidAfterOneLevelOpen) {
  static override dsl = rule({
    purpose: "GameForce",
    callNames: jumpShiftByOpenerCalls,
    preconditions: new InvertedPrecondition(
      new LastBidHasAnnotation(positions.Partner, annotations.NegativeDouble),
    ), // after partner's negative double the cuebid is the game force
    sharedConstraints: [points.ge(19), new MinLength(4), z3.Not(balanced)], // balanced 18-19 jumps in notrump instead
    prefer: [
      new Longest(...jumpShiftByOpenerCalls),
      new Cheapest(...jumpShiftByOpenerCalls),
    ], // the longer suit, else up the line
  });
}

// --- Preempts -----------------------------------------------------------

export const preemptWeakOpening = new ConstraintNot(
  new OpeningRuleConstraint(),
);

export class PreemptiveOpen extends Opening {
  static override dsl = rule({
    purpose: "Preempt",
    conditionalPurposes: [[preemptWeakOpening, "PreemptWeak"]],
    annotations: annotations.Preemptive,
    preconditions: new FourthSeatOpensPreemptsAtGameOnly(),
    constraints: {
      "2D 2H 2S 3C": new ConstraintAnd(
        new MinLength(6),
        new MinLength(1, SUITS),
        new MaxLengthInUnbidMajors(3),
      ),
      "3D 3H 3S": new MinLength(7),
      "4C 4D 4H 4S": new MinLength(8),
    },
    sharedConstraints: [new ThreeOfTheTopFiveOrBetter(), points.ge(5)],
    prefer: [
      new Highest(
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
      ),
    ], // the level is the length
  });
}
