// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/preconditions.py.  Every Precondition keeps its
// Python `__repr__` (`repr()`), which is how a rule's preconditions are
// printed.

import { assert } from "../core/assert";
import type { Call } from "../core/call";
import {
  compareStrains,
  MAJORS,
  MINORS,
  type Strain,
  STRAINS,
  SUITS,
} from "../core/suit";
import { type EnumValue, makeEnum } from "./enum";
import { SAYCForcingOracle } from "./forcing";
import type { History } from "./history";
import { positions } from "./model";
import { pyRepr, PyTuple, pyStringRepr } from "./py";

// The ordering of these values does not matter.  We only use Enum so that
// python throws an lookup error when we typo the annotation name.
export const annotations = makeEnum(
  "Opening",

  // FIXME: It's a bit odd that 1C, 1S, 2N can end up with both
  // OneLevelSuitOpening and NotrumpSystemsOn.
  // e.g. Does ResponderJumpShift apply after 2N?
  "OneLevelSuitOpening", // 1-level suited response opening book.
  "StrongTwoClubOpening", // 2C response opening book.
  "NotrumpSystemsOn", // NT response opening book.
  "StandardOvercall", // Overcall opening book.
  "Preemptive", // Preemptive opening book.

  "BidClubs",
  "BidDiamonds",
  "BidHearts",
  "BidSpades",

  "LimitRaise",
  "JumpShiftResponse", // responder's strong jump shift over a one-level opening (19+ or the booklet's special hands)
  "OpenerReverse",

  // Not all Cappelletti bids are artificial, some can be treated as to-play.
  "Cappelletti",

  // Quantitative 4N is odd, but not artificial. :)
  "QuantitativeFourNotrumpJump",
  // A suited overcall in the pass-out seat (lighter than a direct overcall; advancer's
  // raises and notrump bids read it that way, p144).
  "BalancingOvercall",

  // Advancer's cuebid of the opponents' suit over our overcall (a limit raise or
  // better of our suit, p137): the overcaller's rebids anchor on it.
  "CuebidAdvance",
  // A minimum, non-forcing decline of partner's invitation (ResponseToJordan's cheapest
  // rebid): partner passes it rather than proving combined points he cannot have.
  "Signoff",
  // The call agrees partner's last suit without naming it (the cuebid advance of an
  // overcall): its points are read as support points for that suit, and the suit counts
  // as agreed for the natural bids that follow.
  "SupportsPartnersSuit",

  "Artificial",
  // NOTE: RuleCompiler._compileAnnotations will automatically imply
  // "Artificial" when encountering any annotations > Artificial.
  // This is a hack to avoid "forgot to add Artificial" bugs.
  "Blackwood",
  "FeatureRequest",
  "FourthSuitForcing",
  "Gerber",
  "Jacoby2N",
  "MichaelsCuebid",
  "MichaelsMinorRequest",
  "CappellettiMinorRequest",
  "NegativeDouble",
  "Stayman",
  "TakeoutDouble",
  "Transfer",
  "Unusual2N",
  "GrandSlamForce",
  "Jordan",
  "Lebensohl",
  "LeadDirectingDouble",
);

// Used by RuleCompiler._compileAnnotations.
export const impliesArtificial: ReadonlySet<EnumValue> = new Set(
  [...annotations].filter((value) => value.gt(annotations.Artificial)),
);

export function didBidAnnotation(suit: Strain): EnumValue {
  return [
    annotations.BidClubs,
    annotations.BidDiamonds,
    annotations.BidHearts,
    annotations.BidSpades,
  ][suit.index];
}

/** `strain in suit.SUITS` for a call's strain, which may be null. */
function isSuit(strain: Strain | null): strain is Strain {
  return strain !== null && SUITS.includes(strain);
}

// FIXME: Consider adding a CallPrecondition and HistoryPrecondition subclasses
// which could then easily be filtered to the front of the preconditions list
// for faster matching, or asserting about unreachable call_names, etc.
export abstract class Precondition {
  /** Python's `repr_name`: the name `repr()` prints instead of the class name. */
  static readonly reprName: string | null = null;

  /** Python's `__repr__`: `Name(arg, arg)` with each argument's Python repr. */
  repr(): string {
    const cls = this.constructor as typeof Precondition;
    const name = cls.reprName ?? cls.name;
    return `${name}(${this.reprArgs.map(pyRepr).join(", ")})`;
  }

  toString(): string {
    return this.repr();
  }

  get reprArgs(): unknown[] {
    return [];
  }

  abstract fits(history: History, call: Call): boolean;
}

export class InvertedPrecondition extends Precondition {
  static override readonly reprName = "Not";
  readonly precondition: Precondition;

  constructor(precondition: Precondition) {
    super();
    this.precondition = precondition;
  }

  override get reprArgs(): unknown[] {
    return [this.precondition];
  }

  fits(history: History, call: Call): boolean {
    return !this.precondition.fits(history, call);
  }
}

export abstract class SummaryPrecondition extends Precondition {
  readonly preconditions: readonly Precondition[];

  constructor(...preconditions: Precondition[]) {
    super();
    this.preconditions = preconditions;
  }

  override get reprArgs(): unknown[] {
    return [...this.preconditions];
  }
}

export class EitherPrecondition extends SummaryPrecondition {
  static override readonly reprName = "Either";

  fits(history: History, call: Call): boolean {
    return this.preconditions.some((precondition) =>
      precondition.fits(history, call),
    );
  }
}

export class AndPrecondition extends SummaryPrecondition {
  static override readonly reprName = "And";

  fits(history: History, call: Call): boolean {
    return this.preconditions.every((precondition) =>
      precondition.fits(history, call),
    );
  }
}

export class NoOpening extends Precondition {
  fits(history: History, _call: Call): boolean {
    return !history.annotations.includes(annotations.Opening);
  }
}

export class Opened extends Precondition {
  readonly position: EnumValue;

  constructor(position: EnumValue) {
    super();
    this.position = position;
  }

  override get reprArgs(): unknown[] {
    return [this.position.key];
  }

  fits(history: History, _call: Call): boolean {
    return history
      .annotationsForPosition(this.position)
      .includes(annotations.Opening);
  }
}

/**
 * The position had a turn before the opening bid and passed (a passed hand: its later
 * calls are limited).
 */
export class PassedHand extends Precondition {
  readonly position: EnumValue;

  constructor(position: EnumValue) {
    super();
    this.position = position;
  }

  override get reprArgs(): unknown[] {
    return [this.position.key];
  }

  fits(history: History, _call: Call): boolean {
    const ch = history.callHistory;
    const calls = ch.calls;
    const opening = calls.findIndex((c) => !c.isPass());
    if (opening === -1) {
      return false;
    }
    const mySeat = ch.dealer.positionAfterNCalls(calls.length).index;
    // positions: RHO=0, Partner=1, LHO=2, Me=3 -> seats me+3, me+2, me+1, me.
    const seat = (mySeat + 3 - this.position.index) % 4;
    for (let i = 0; i < opening; i++) {
      if (ch.dealer.positionAfterNCalls(i).index === seat) {
        return true;
      }
    }
    return false;
  }
}

export class TheyOpened extends Precondition {
  fits(history: History, _call: Call): boolean {
    return history.them.annotations.includes(annotations.Opening);
  }
}

// FIXME: Rename to NotrumpOpeningBook?
export class NotrumpSystemsOn extends Precondition {
  fits(history: History, _call: Call): boolean {
    return history.us.annotations.includes(annotations.NotrumpSystemsOn);
  }
}

export class OneLevelSuitedOpeningBook extends Precondition {
  fits(history: History, _call: Call): boolean {
    return history.us.annotations.includes(annotations.OneLevelSuitOpening);
  }
}

export class StrongTwoClubOpeningBook extends Precondition {
  fits(history: History, _call: Call): boolean {
    return history.us.annotations.includes(annotations.StrongTwoClubOpening);
  }
}

export class HasBid extends Precondition {
  readonly position: EnumValue;

  constructor(position: EnumValue) {
    super();
    this.position = position;
  }

  override get reprArgs(): unknown[] {
    return [this.position.key];
  }

  fits(history: History, _call: Call): boolean {
    for (const view of history.viewFor(this.position).walk) {
      if (view.lastCall && !view.lastCall.isPass()) {
        return true;
      }
    }
    return false;
  }
}

export class ForcedToBid extends Precondition {
  fits(history: History, _call: Call): boolean {
    // preconditions.py depends on forcing.py, but forcing.py needs to know annotations.
    return new SAYCForcingOracle().forcedToBid(history);
  }
}

export class IsGame extends Precondition {
  _gameLevel(strain: Strain): number {
    if (MINORS.includes(strain)) {
      return 5;
    }
    if (MAJORS.includes(strain)) {
      return 4;
    }
    return 3;
  }

  fits(history: History, call: Call): boolean {
    void history;
    return call.isContract() && call.level === this._gameLevel(call.strain!);
  }
}

export class LastBidWasBelowGame extends IsGame {
  override fits(history: History, _call: Call): boolean {
    const lastContract = history.lastContract!;
    return lastContract.level! < this._gameLevel(lastContract.strain!);
  }
}

export class LastBidWasGameOrAbove extends IsGame {
  override fits(history: History, _call: Call): boolean {
    const lastContract = history.lastContract!;
    return lastContract.level! >= this._gameLevel(lastContract.strain!);
  }
}

export class LastBidWasBelowSlam extends Precondition {
  fits(history: History, _call: Call): boolean {
    const lastContract = history.lastContract!;
    return lastContract.level! < 6;
  }
}

/**
 * The auction's opening call (first non-pass) was callName, by whoever made it.
 * Combine with TheyOpened()/Opened(position) to constrain which side opened.
 */
export class OpeningBidWas extends Precondition {
  readonly callName: string;

  constructor(callName: string) {
    super();
    this.callName = callName;
  }

  override get reprArgs(): unknown[] {
    return [this.callName];
  }

  fits(history: History, _call: Call): boolean {
    for (const callerCall of history.callHistory.calls) {
      if (!callerCall.isPass()) {
        return callerCall.name === this.callName;
      }
    }
    return false;
  }
}

/**
 * The opponents opened a suit and the auction is dying at two of it: the opening suit
 * is the last contract, at level two, bid by LHO (responder's raise of RHO's opening, or
 * opener's own rebid after partner's response), and partner and RHO have just passed.  The
 * balancing seat.
 */
export class TheyRaisedToTwoAndStopped extends Precondition {
  fits(history: History, _call: Call): boolean {
    const opening = history.callHistory.calls.find((c) => !c.isPass()) ?? null;
    const lastContract = history.lastContract;
    if (!opening || !lastContract || !isSuit(opening.strain)) {
      return false;
    }
    // A one-level opening raised or rebid to two, not a weak two that everyone passed
    // (that is TakeoutDoubleAfterPreempt's spot).
    if (opening.level !== 1) {
      return false;
    }
    if (lastContract.level !== 2 || lastContract.strain !== opening.strain) {
      return false;
    }
    return (
      history.lho.lastCall !== null &&
      history.lho.lastCall.equals(lastContract) &&
      history.partner.lastCall !== null &&
      history.partner.lastCall.isPass() &&
      history.rho.lastCall !== null &&
      history.rho.lastCall.isPass()
    );
  }
}

export class LastBidHasAnnotation extends Precondition {
  readonly position: EnumValue;
  readonly annotation: EnumValue;

  constructor(position: EnumValue, annotation: EnumValue) {
    super();
    this.position = position;
    this.annotation = annotation;
    // This assert is likely incompatible with module based development, but is nice for catching typos.
    assert(this.annotation.enum === annotations);
  }

  override get reprArgs(): unknown[] {
    return [this.position.key, this.annotation.key];
  }

  fits(history: History, _call: Call): boolean {
    return history
      .viewFor(this.position)
      .annotationsForLastCall.includes(this.annotation);
  }
}

/**
 * In fourth seat (three passes to us) a preempt is only worth making at the four level
 * (p88 h27: 4H in every seat); lower preempts give the opponents nothing to preempt.
 */
export class FourthSeatOpensPreemptsAtGameOnly extends Precondition {
  fits(history: History, call: Call): boolean {
    const fourthSeat = new LastBidWas(positions.LHO, "P").fits(history, call);
    return !fourthSeat || call.level! >= 4;
  }
}

export class LastBidHasStrain extends Precondition {
  readonly position: EnumValue;
  /** A list, or a `tuple()` where the Python rule wrote one (it shows in `repr`). */
  readonly strains: readonly Strain[] | PyTuple<Strain>;

  constructor(
    position: EnumValue,
    strainOrStrains: Strain | readonly Strain[] | PyTuple<Strain>,
  ) {
    super();
    this.position = position;
    if (STRAINS.includes(strainOrStrains as Strain)) {
      this.strains = [strainOrStrains as Strain];
    } else {
      this.strains = strainOrStrains as readonly Strain[] | PyTuple<Strain>;
    }
  }

  override get reprArgs(): unknown[] {
    return [this.position.key, this.strains];
  }

  fits(history: History, _call: Call): boolean {
    const lastCall = history.viewFor(this.position).lastCall;
    return (
      lastCall !== null &&
      lastCall.strain !== null &&
      this.strains.includes(lastCall.strain)
    );
  }
}

export class LastBidHasSuit extends Precondition {
  readonly position: EnumValue | null;

  constructor(position: EnumValue | null = null) {
    super();
    this.position = position;
  }

  override get reprArgs(): unknown[] {
    const positionString = this.position
      ? pyStringRepr(this.position.key)
      : null;
    return [positionString];
  }

  fits(history: History, _call: Call): boolean {
    const lastCall = !this.position
      ? history.lastContract
      : history.viewFor(this.position).lastCall;
    return lastCall !== null && isSuit(lastCall.strain);
  }
}

export class LastBidHasLevel extends Precondition {
  readonly position: EnumValue;
  readonly level: number;

  constructor(position: EnumValue, level: number) {
    super();
    this.position = position;
    this.level = level;
  }

  override get reprArgs(): unknown[] {
    return [this.position.key, this.level];
  }

  fits(history: History, _call: Call): boolean {
    const lastCall = history.viewFor(this.position).lastCall;
    return lastCall !== null && lastCall.level === this.level;
  }
}

export class LastBidWas extends Precondition {
  readonly position: EnumValue;
  readonly callName: string;

  constructor(position: EnumValue, callName: string) {
    super();
    this.position = position;
    this.callName = callName;
  }

  override get reprArgs(): unknown[] {
    return [this.position.key, this.callName];
  }

  fits(history: History, _call: Call): boolean {
    const lastCall = history.viewFor(this.position).lastCall;
    return lastCall !== null && lastCall.name === this.callName;
  }
}

export class RaiseOfPartnersLastSuit extends Precondition {
  fits(history: History, call: Call): boolean {
    const partnerLastCall = history.partner.lastCall;
    if (!partnerLastCall || !isSuit(partnerLastCall.strain)) {
      return false;
    }
    return (
      call.strain === partnerLastCall.strain &&
      history.partner.minLength(partnerLastCall.strain) >= 3
    );
  }
}

export class CueBid extends Precondition {
  readonly position: EnumValue;
  readonly useFirstSuit: boolean;

  constructor(position: EnumValue, useFirstSuit = false) {
    super();
    this.position = position;
    this.useFirstSuit = useFirstSuit;
  }

  fits(history: History, call: Call): boolean {
    let targetCall: Call | null;
    if (this.useFirstSuit) {
      targetCall = null;
      for (const view of history.viewFor(this.position).walk) {
        targetCall = view.lastCall;
      }
    } else {
      targetCall = history.viewFor(this.position).lastCall;
    }

    if (!targetCall || !isSuit(targetCall.strain)) {
      return false;
    }
    return (
      call.strain === targetCall.strain &&
      history.viewFor(this.position).minLength(targetCall.strain) >= 3
    );
  }
}

export class SuitLowerThanMyLastSuit extends Precondition {
  fits(history: History, call: Call): boolean {
    if (!isSuit(call.strain)) {
      return false;
    }
    const lastCall = history.me.lastCall;
    if (!lastCall || !isSuit(lastCall.strain)) {
      return false;
    }
    return compareStrains(call.strain, lastCall.strain) < 0;
  }
}

/** The call is a rebid of the first suit we bid (opener's original suit after a reverse). */
export class RebidFirstSuit extends Precondition {
  fits(history: History, call: Call): boolean {
    if (!isSuit(call.strain)) {
      return false;
    }
    let firstCall: Call | null = null;
    for (const view of history.me.walk) {
      if (view.lastCall) {
        firstCall = view.lastCall;
      }
    }
    return firstCall !== null && firstCall.strain === call.strain;
  }
}

export class RebidSameSuit extends Precondition {
  fits(history: History, call: Call): boolean {
    if (!isSuit(call.strain)) {
      return false;
    }
    return (
      history.me.lastCall !== null &&
      call.strain === history.me.lastCall.strain &&
      history.me.bidSuits.includes(call.strain)
    );
  }
}

export class PartnerHasAtLeastLengthInSuit extends Precondition {
  readonly length: number;

  constructor(length: number) {
    super();
    this.length = length;
  }

  override get reprArgs(): unknown[] {
    return [this.length];
  }

  fits(history: History, call: Call): boolean {
    if (!isSuit(call.strain)) {
      return false;
    }
    return history.partner.minLength(call.strain) >= this.length;
  }
}

export class MaxShownLength extends Precondition {
  readonly position: EnumValue;
  readonly maxLength: number;
  readonly suit: Strain | null;

  constructor(
    position: EnumValue,
    maxLength: number,
    suit: Strain | null = null,
  ) {
    super();
    this.position = position;
    this.maxLength = maxLength;
    this.suit = suit;
  }

  override get reprArgs(): unknown[] {
    return [this.position.key, this.maxLength, this.suit];
  }

  fits(history: History, call: Call): boolean {
    const strain = this.suit === null ? call.strain : this.suit;
    return (
      isSuit(strain) &&
      history.viewFor(this.position).minLength(strain) <= this.maxLength
    );
  }
}

export class DidBidSuit extends Precondition {
  readonly position: EnumValue;

  constructor(position: EnumValue) {
    super();
    this.position = position;
  }

  fits(history: History, call: Call): boolean {
    if (!isSuit(call.strain)) {
      return false;
    }
    return history.isBidSuit(call.strain, this.position);
  }
}

/**
 * The suit of the last contract bid has been shown by `position` (by bidding it or by a
 * call that promises it).  For calls that are not suits, such as a double of RHO's bid.
 */
export class LastContractSuitBidBy extends Precondition {
  readonly position: EnumValue;

  constructor(position: EnumValue) {
    super();
    this.position = position;
  }

  fits(history: History, _call: Call): boolean {
    const lastContract = history.lastContract;
    if (!lastContract || !isSuit(lastContract.strain)) {
      return false;
    }
    return history.isBidSuit(lastContract.strain, this.position);
  }
}

export class UnbidSuit extends Precondition {
  fits(history: History, call: Call): boolean {
    if (!isSuit(call.strain)) {
      return false;
    }
    return history.isUnbidSuit(call.strain);
  }
}

export class SuitUnbidByOpponents extends Precondition {
  fits(history: History, call: Call): boolean {
    if (!isSuit(call.strain)) {
      return false;
    }
    return history.them.unbidSuits.includes(call.strain);
  }
}

export class UnbidSuitCountRange extends Precondition {
  readonly lower: number;
  readonly upper: number;

  constructor(lower: number, upper: number) {
    super();
    this.lower = lower;
    this.upper = upper;
  }

  override get reprArgs(): unknown[] {
    return [this.lower, this.upper];
  }

  fits(history: History, _call: Call): boolean {
    const count = history.unbidSuits.length;
    return count >= this.lower && count <= this.upper;
  }
}

/** Python's `Strain` precondition (the name is taken by core/suit here). */
export class StrainPrecondition extends Precondition {
  static override readonly reprName = "Strain";
  readonly strain: Strain;

  constructor(strain: Strain) {
    super();
    this.strain = strain;
  }

  override get reprArgs(): unknown[] {
    return [this.strain];
  }

  fits(history: History, call: Call): boolean {
    void history;
    return call.strain === this.strain;
  }
}

export class Level extends Precondition {
  readonly level: number;

  constructor(level: number) {
    super();
    this.level = level;
  }

  override get reprArgs(): unknown[] {
    return [this.level];
  }

  fits(history: History, call: Call): boolean {
    if (call.isDouble()) {
      return history.lastContract!.level === this.level;
    }
    return call.isContract() && call.level === this.level;
  }
}

export class MaxLevel extends Precondition {
  readonly maxLevel: number;

  constructor(maxLevel: number) {
    super();
    this.maxLevel = maxLevel;
  }

  override get reprArgs(): unknown[] {
    return [this.maxLevel];
  }

  fits(history: History, call: Call): boolean {
    if (call.isDouble()) {
      return history.lastContract!.level! <= this.maxLevel;
    }
    return call.isContract() && call.level! <= this.maxLevel;
  }
}

export class HaveFit extends Precondition {
  fits(history: History, _call: Call): boolean {
    for (const strain of SUITS) {
      if (
        history.partner.minLength(strain) + history.me.minLength(strain) >=
        8
      ) {
        return true;
      }
    }
    return false;
  }
}

export abstract class Jump extends Precondition {
  readonly exactSize: number | null;

  constructor(exactSize: number | null = null) {
    super();
    this.exactSize = exactSize;
  }

  override get reprArgs(): unknown[] {
    return [this.exactSize];
  }

  _jumpSize(lastCall: Call, call: Call): number {
    if (compareStrains(call.strain!, lastCall.strain!) <= 0) {
      // If the new suit is less than the last bid one, than we need to change more than one level for it to be a jump.
      return call.level! - lastCall.level! - 1;
    }
    // Otherwise any bid not at the current level is a jump.
    return call.level! - lastCall.level!;
  }

  fits(history: History, call: Call): boolean {
    if (call.isPass()) {
      return false;
    }
    if (call.isDouble() || call.isRedouble()) {
      call = history.callHistory.lastContract()!;
    }

    const lastCall = this._lastCall(history);
    if (!lastCall || !lastCall.isContract()) {
      // If we don't have a previous bid to compare to, this can't be a jump.
      return false;
    }
    const jumpSize = this._jumpSize(lastCall, call);
    if (this.exactSize === null) {
      return jumpSize !== 0;
    }
    return this.exactSize === jumpSize;
  }

  abstract _lastCall(history: History): Call | null;
}

export class JumpFromLastContract extends Jump {
  _lastCall(history: History): Call | null {
    return history.callHistory.lastContract();
  }
}

export class JumpFromMyLastBid extends Jump {
  _lastCall(history: History): Call | null {
    return history.me.lastCall;
  }
}

export class JumpFromPartnerLastBid extends Jump {
  _lastCall(history: History): Call | null {
    return history.partner.lastCall;
  }
}

export class NotJumpFromLastContract extends JumpFromLastContract {
  constructor() {
    super(0);
  }
}

export class NotJumpFromMyLastBid extends JumpFromMyLastBid {
  constructor() {
    super(0);
  }
}

export class NotJumpFromPartnerLastBid extends JumpFromPartnerLastBid {
  constructor() {
    super(0);
  }
}
