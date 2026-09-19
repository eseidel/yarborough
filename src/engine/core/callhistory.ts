// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/core/callhistory.py.

import { assert } from "./assert";
import { Call } from "./call";
import { NORTH, Position } from "./position";
import { compareStrains } from "./suit";

// Python's `%` is a floor modulo; JavaScript's is not.
function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

const VULNERABILITY_NAMES = ["E-W", "N-S", "None", "Both"];

const NAME_TO_IDENTIFIER: Record<string, string> = {
  "E-W": "EW",
  "N-S": "NS",
  None: "NO",
  Both: "BO",
};

const IDENTIFIER_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(NAME_TO_IDENTIFIER).map(([name, identifier]) => [
    identifier,
    name,
  ]),
);

const GIB_NAMES: Record<string, string> = {
  "E-W": "e",
  "N-S": "n",
  None: "-",
  Both: "b",
};

// http://www.jazclass.aust.com/bridge/scoring/score11.htm
// FIXME: There must be a more compact way to represent this series.
const NUMBER_TO_VULNERABILITY: Record<number, string> = {
  0: "E-W", // board 16
  1: "None",
  2: "N-S",
  3: "E-W",
  4: "Both",
  5: "N-S",
  6: "E-W",
  7: "Both",
  8: "None",
  9: "E-W",
  10: "Both",
  11: "None",
  12: "N-S",
  13: "Both",
  14: "None",
  15: "N-S",
};

// I'm not sure this needs to be its own class.
export class Vulnerability {
  readonly name: string;

  constructor(name?: string | null) {
    // FIXME: We should find a better storage system than strings.
    this.name = name || "None";
    assert(
      VULNERABILITY_NAMES.includes(this.name),
      `${this.name} is not a valid vulnerability`,
    );
  }

  static readonly nameToIdentifier = NAME_TO_IDENTIFIER;
  static readonly identifierToName = IDENTIFIER_TO_NAME;

  get identifier(): string {
    return NAME_TO_IDENTIFIER[this.name];
  }

  static fromIdentifier(identifier: string): Vulnerability {
    const name = IDENTIFIER_TO_NAME[identifier];
    assert(
      name !== undefined,
      `${identifier} is not a valid vulnerability identifier`,
    );
    return new Vulnerability(name);
  }

  static fromString(string?: string | null): Vulnerability {
    return new Vulnerability(string);
  }

  gibName(): string {
    return GIB_NAMES[this.name];
  }

  static fromBoardNumber(boardNumber: number): Vulnerability {
    return new Vulnerability(NUMBER_TO_VULNERABILITY[mod(boardNumber, 16)]);
  }

  isVulnerable(position: Position): boolean {
    if (this.name === "None") {
      return false;
    }
    if (this.name === "Both") {
      return true;
    }
    return this.name.includes(position.char);
  }

  equals(other: Vulnerability | null | undefined): boolean {
    return other != null && this.name === other.name;
  }

  toString(): string {
    return this.name;
  }
}

// FIXME: It's unclear if this class should expose just call_names or Call objects.
export class CallHistory {
  calls: Call[];
  dealer: Position;
  vulnerability: Vulnerability;

  private static _callsFromCallsString(callsString: string): Call[] {
    if (!callsString) {
      return [];
    }
    if (callsString.includes(",")) {
      callsString = callsString.replaceAll(",", " ");
    }
    callsString = callsString.trim(); // Remove any trailing whitespace.
    const callNames = callsString.split(" ");
    // This if exists to support string === ''
    if (!callNames.length || !callNames[0]) {
      return [];
    }
    // fromString may be more forgiving than we want...
    return callNames.map((name) => Call.fromString(name));
  }

  static fromString(
    historyString: string,
    dealerChar?: string | null,
    vulnerabilityString?: string | null,
  ): CallHistory {
    const dealer = dealerChar ? Position.fromChar(dealerChar) : null;
    const vulnerability = Vulnerability.fromString(vulnerabilityString);
    const calls = CallHistory._callsFromCallsString(historyString);
    return new CallHistory(calls, dealer, vulnerability);
  }

  static dealerFromBoardNumber(boardNumber: number): Position {
    // It's unclear if this number->dealer/vulnerability knowledge belongs in CallHistory or in Board.
    const dealerIndex = mod(boardNumber + 3, 4);
    return Position.fromIndex(dealerIndex);
  }

  static fromBoardNumberAndCallsString(
    boardNumber: number,
    callsString: string,
  ): CallHistory {
    const vulnerability = Vulnerability.fromBoardNumber(boardNumber);
    const dealer = CallHistory.dealerFromBoardNumber(boardNumber);
    const calls = CallHistory._callsFromCallsString(callsString);
    return new CallHistory(calls, dealer, vulnerability);
  }

  static emptyForBoardNumber(boardNumber: number): CallHistory {
    return CallHistory.fromBoardNumberAndCallsString(boardNumber, "");
  }

  constructor(
    calls?: Call[] | null,
    dealer?: Position | null,
    vulnerability?: Vulnerability | null,
  ) {
    this.calls = calls || [];
    this.dealer = dealer || NORTH;
    this.vulnerability = vulnerability || Vulnerability.fromBoardNumber(1);
  }

  toString(): string {
    return this.callsString();
  }

  /** Python's `__len__`. */
  get length(): number {
    return this.calls.length;
  }

  canDouble(): boolean {
    // Make sure we haven't already doubled.
    const lastNonPass = this.lastNonPass();
    assert(lastNonPass !== null);
    if (!lastNonPass.isContract()) {
      return false;
    }
    const declarer = this.declarer();
    assert(declarer !== null);
    return !declarer.inPartnershipWith(this.positionToCall());
  }

  canRedouble(): boolean {
    const lastNonPass = this.lastNonPass();
    assert(lastNonPass !== null);
    if (!lastNonPass.isDouble()) {
      return false;
    }
    const declarer = this.declarer();
    assert(declarer !== null);
    return declarer.inPartnershipWith(this.positionToCall());
  }

  // This may belong on a separate bridge-rules object?
  isLegalCall(call: Call): boolean {
    assert(!this.isComplete());
    if (call.isPass()) {
      return true;
    }
    const lastContract = this.lastContract();
    if (!lastContract) {
      return !call.isDouble() && !call.isRedouble();
    }
    // Doubles do not have levels.
    if (call.level) {
      if (lastContract.level! > call.level) {
        return false;
      }
      if (
        lastContract.level === call.level &&
        compareStrains(lastContract.strain!, call.strain!) >= 0
      ) {
        return false;
      }
    }
    if (call.isDouble() && !this.canDouble()) {
      return false;
    }
    if (call.isRedouble() && !this.canRedouble()) {
      return false;
    }
    return true;
  }

  copyAppendingCall(call: Call): CallHistory {
    assert(call);
    assert(this.isLegalCall(call));
    return new CallHistory(
      [...this.calls, call],
      this.dealer,
      this.vulnerability,
    );
  }

  copyWithPartialHistory(lastEntry: number): CallHistory {
    return new CallHistory(
      this.calls.slice(0, lastEntry),
      this.dealer,
      this.vulnerability,
    );
  }

  ascendingPartialHistories(step: number): CallHistory[] {
    const partialHistories: CallHistory[] = [];
    // We only terminate from here if called on an empty history.
    let length = this.calls.length;
    while (length > 0) {
      partialHistories.unshift(
        length === this.calls.length
          ? this
          : this.copyWithPartialHistory(length),
      );
      if (length < step) {
        break;
      }
      // The Python takes `copyWithPartialHistory(-step)` of the history it is
      // holding, which drops the last `step` calls; a step of zero empties it
      // and ends the loop.
      length = step > 0 ? length - step : 0;
    }
    return partialHistories;
  }

  get identifier(): string {
    return `${this.dealer.char}:${this.vulnerability.identifier}:${this.commaSeparatedCalls()}`;
  }

  static fromIdentifier(identifier: string): CallHistory {
    const components = identifier.split(":");
    let dealerChar: string;
    let vulnerabilityIdentifier: string;
    let callsIdentifier: string;
    if (components.length === 3) {
      [dealerChar, vulnerabilityIdentifier, callsIdentifier] = components;
    } else if (components.length === 2) {
      // It's very common to have the last colon in the URL missing.
      [dealerChar, vulnerabilityIdentifier] = components;
      callsIdentifier = "";
    } else {
      throw new Error(`Invalid history identifier: ${identifier}`);
    }

    const dealer = Position.fromChar(dealerChar);
    const vulnerability = Vulnerability.fromIdentifier(vulnerabilityIdentifier);
    const calls = CallHistory._callsFromCallsString(callsIdentifier);
    return new CallHistory(calls, dealer, vulnerability);
  }

  prettyOneLine(): string {
    return `Deal: ${this.dealer.char}, Bids: ${this.callsString()}`;
  }

  callsString(): string {
    return this.calls.map((call) => call.name).join(" ");
  }

  commaSeparatedCalls(): string {
    return this.calls.map((call) => call.name).join(",");
  }

  get lastCall(): Call | null {
    if (!this.calls.length) {
      return null;
    }
    return this.calls[this.calls.length - 1];
  }

  get lastToCall(): Position | null {
    if (!this.calls.length) {
      return null;
    }
    return this.dealer.positionAfterNCalls(this.calls.length - 1);
  }

  lastNonPass(): Call | null {
    for (let index = this.calls.length - 1; index >= 0; index--) {
      const call = this.calls[index];
      if (!call.isPass()) {
        return call;
      }
    }
    return null;
  }

  lastToNotPass(): Position | null {
    for (const [caller, call] of this.enumerateReversedCalls()) {
      if (!call.isPass()) {
        return caller;
      }
    }
    return null;
  }

  lastContract(): Call | null {
    for (let index = this.calls.length - 1; index >= 0; index--) {
      const call = this.calls[index];
      if (call.isContract()) {
        return call;
      }
    }
    return null;
  }

  positionToCall(): Position {
    // FIXME: Should this return None when isComplete?
    // We'd have to check callers, some may assume it's OK to call positionToCall after isComplete.
    return this.dealer.positionAfterNCalls(this.calls.length);
  }

  callsBy(position: Position): Call[] {
    const offsetFromDealer = this.dealer.callsBetween(position);
    if (this.calls.length <= offsetFromDealer) {
      return [];
    }
    const calls: Call[] = [];
    for (let index = offsetFromDealer; index < this.calls.length; index += 4) {
      calls.push(this.calls[index]);
    }
    return calls;
  }

  enumerateCalls(): [Position, Call][] {
    return this.calls.map((call, callOffset) => [
      this.dealer.positionAfterNCalls(callOffset),
      call,
    ]);
  }

  enumerateReversedCalls(): [Position, Call][] {
    return [...this.enumerateCalls()].reverse();
  }

  competativeAuction(): boolean {
    let firstCaller: Position | null = null;
    for (const [caller, call] of this.enumerateCalls()) {
      if (!firstCaller && call.isContract()) {
        firstCaller = caller;
      }
      if (call.isContract() && !caller.inPartnershipWith(firstCaller)) {
        return true;
      }
    }
    return false;
  }

  lastCallBy(position: Position): Call | null {
    const calls = this.callsBy(position);
    if (!calls.length) {
      return null;
    }
    return calls[calls.length - 1];
  }

  firstCallBy(position: Position): Call | null {
    const calls = this.callsBy(position);
    if (!calls.length) {
      return null;
    }
    return calls[0];
  }

  lastCallByNextBidder(): Call | null {
    const nextCaller = this.positionToCall();
    return this.lastCallBy(nextCaller);
  }

  opener(): Position | null {
    for (const [caller, call] of this.enumerateCalls()) {
      if (call.isContract()) {
        return caller;
      }
    }
    return null;
  }

  declarer(): Position | null {
    let firstCaller: Position | null = null;
    let lastCaller: Position | null = null;
    let lastCall: Call | null = null;
    for (const [caller, call] of this.enumerateReversedCalls()) {
      if (!call.isContract()) {
        continue;
      }
      if (!lastCall) {
        lastCall = call;
        lastCaller = caller;
      }
      if (
        call.strain!.equals(lastCall.strain) &&
        caller.inPartnershipWith(lastCaller)
      ) {
        firstCaller = caller;
      }
    }
    return firstCaller;
  }

  dummy(): Position | null {
    const declarer = this.declarer();
    return declarer ? declarer.partner : null;
  }

  contract(): string | null {
    // Maybe we need a Contract object which holds declarer, suit, level, and doubles?
    const lastContract = this.lastContract();
    if (lastContract) {
      const lastNonPass = this.lastNonPass()!;
      let doubleString = "";
      if (lastNonPass.isDouble()) {
        doubleString = "X";
      } else if (lastNonPass.isRedouble()) {
        doubleString = "XX";
      }
      return `${lastContract.name}${doubleString}`;
    }
    return null;
  }

  isComplete(): boolean {
    const count = this.calls.length;
    return (
      count > 3 &&
      this.calls[count - 1].isPass() &&
      this.calls[count - 2].isPass() &&
      this.calls[count - 3].isPass()
    );
  }

  isPassout(): boolean {
    return this.isComplete() && this.calls[this.calls.length - 4].isPass();
  }
}
