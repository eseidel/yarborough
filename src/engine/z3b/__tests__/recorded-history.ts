// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// A History (history.ts) answered from one record of
// tests/engine-fixtures/auction-snapshots.jsonl: the observable state the
// Python interpreter reached on that auction, so the DSL (constraints,
// preconditions, the forcing oracle, the rule compiler) can be tested before
// the TypeScript interpreter exists (phase 6).  Members that need an earlier
// point of the auction (`_historyAfterLastCallFor`, `_walkHistoryFor`, a
// view's `walk`) answer from the prefix record when the fixture set holds it
// and from the calls alone otherwise; whatever else an unrecorded prefix is
// asked throws UnrecordedError, so a test that reads it fails loudly instead
// of guessing.

import { Call } from "../../core/call";
import { CallHistory } from "../../core/callhistory";
import { Strain, STRAINS, SUITS } from "../../core/suit";
import type { EnumValue } from "../enum";
import type { GroupView, History, PositionView, RuleView } from "../history";
import { positions } from "../model";
import { annotations } from "../preconditions";
import {
  type AuctionSnapshot,
  auctionKey,
  type GroupSnapshot,
  type ViewSnapshot,
} from "./fixtures";

export class UnrecordedError extends Error {
  constructor(what: string, history: RecordedHistory) {
    super(
      `${what} is not recorded for "${history.callHistory.callsString()}" (dealer ${history.callHistory.dealer.char})`,
    );
    this.name = "UnrecordedError";
  }
}

/** Every call name the auction can start with: the root History's legal calls. */
const ALL_CALL_NAMES = ["P"].concat(
  Call.LEVELS.flatMap((level) =>
    STRAINS.map((strain) => `${level}${strain.char}`),
  ),
);

const ROOT_VIEW: ViewSnapshot = {
  last_call: null,
  annotations_for_last_call: [],
  rule_for_last_call: null,
  annotations: [],
  min_points: 0,
  max_points: 37,
  min_length: [0, 0, 0, 0],
  max_length: [13, 13, 13, 13],
  is_balanced: false,
  bid_suits: [],
  unbid_suits: ["C", "D", "H", "S"],
  contract_bid_suits: [],
  could_have_more_points_than: {},
};

const ROOT_GROUP: GroupSnapshot = {
  min_points: 0,
  bid_suits: [],
  unbid_suits: ["C", "D", "H", "S"],
  annotations: [],
};

/** The state of the Python root History: no calls, nothing known. */
function rootSnapshot(dealer: string, vulnerability: string): AuctionSnapshot {
  return {
    dealer,
    vulnerability,
    calls: "",
    legal_calls: ALL_CALL_NAMES,
    unbid_suits: ["C", "D", "H", "S"],
    last_contract: null,
    us: ROOT_GROUP,
    them: ROOT_GROUP,
    everyone: ROOT_GROUP,
    views: Object.fromEntries([...positions].map((p) => [p.key, ROOT_VIEW])),
    bid_suit_naturally: Object.fromEntries(
      [...positions].map((p) => [
        p.key,
        Object.fromEntries(SUITS.map((s) => [s.char, false])),
      ]),
    ),
    first_natural_bidder: Object.fromEntries(SUITS.map((s) => [s.char, null])),
    annotations_by_call: [],
    rule_by_call: [],
    call_to_rule: {},
    dropped_calls: [],
    forced_to_bid: false,
  };
}

function annotationValues(keys: readonly string[]): EnumValue[] {
  return keys.map((key) => annotations.get(key as never));
}

function suits(chars: readonly string[]): Strain[] {
  return chars.map((char) => Strain.fromChar(char));
}

/** The fixture set: every snapshot by auction key, plus the rules it names. */
export class RecordedHistories {
  private readonly byKey = new Map<string, AuctionSnapshot>();
  /** What `ruleForLastCall` returns for a rule name; the test supplies it. */
  readonly ruleViews: (name: string) => RuleView;

  constructor(
    snapshots: Iterable<AuctionSnapshot>,
    ruleViews: (name: string) => RuleView,
  ) {
    for (const snapshot of snapshots) {
      this.byKey.set(
        auctionKey(snapshot.dealer, snapshot.vulnerability, snapshot.calls),
        snapshot,
      );
    }
    this.ruleViews = ruleViews;
  }

  get size(): number {
    return this.byKey.size;
  }

  snapshot(
    dealer: string,
    vulnerability: string,
    calls: string,
  ): AuctionSnapshot | null {
    if (calls === "") {
      return (
        this.byKey.get(auctionKey(dealer, vulnerability, "")) ??
        rootSnapshot(dealer, vulnerability)
      );
    }
    return this.byKey.get(auctionKey(dealer, vulnerability, calls)) ?? null;
  }

  /** The history of a recorded snapshot. */
  historyFor(snapshot: AuctionSnapshot): RecordedHistory {
    return new RecordedHistory(
      this,
      CallHistory.fromString(
        snapshot.calls,
        snapshot.dealer,
        snapshot.vulnerability,
      ),
      snapshot,
    );
  }

  /** The history of an auction, recorded or not (then only the calls answer). */
  history(callHistory: CallHistory): RecordedHistory {
    return new RecordedHistory(
      this,
      callHistory,
      this.snapshot(
        callHistory.dealer.char,
        callHistory.vulnerability.name,
        callHistory.callsString(),
      ),
    );
  }
}

class RecordedPositionView implements PositionView {
  readonly history: RecordedHistory;
  readonly position: EnumValue;

  constructor(history: RecordedHistory, position: EnumValue) {
    this.history = history;
    this.position = position;
  }

  private get view(): ViewSnapshot {
    return this.history.snapshotOrThrow(`the ${this.position.key} view`).views[
      this.position.key
    ];
  }

  get walk(): Iterable<PositionView> {
    const position = this.position;
    let history: RecordedHistory | null = this.history;
    return {
      *[Symbol.iterator]() {
        while (history) {
          yield new RecordedPositionView(history, position);
          history = history._fourCallsAgo;
        }
      },
    };
  }

  get annotations(): readonly EnumValue[] {
    return annotationValues(this.view.annotations);
  }

  get lastCall(): Call | null {
    return this.history.lastCallForPosition(this.position);
  }

  get annotationsForLastCall(): readonly EnumValue[] {
    return annotationValues(this.view.annotations_for_last_call);
  }

  get ruleForLastCall(): RuleView | null {
    return this.history.ruleForLastCall(this.position);
  }

  get minPoints(): number {
    return this.view.min_points;
  }

  get maxPoints(): number {
    return this.view.max_points;
  }

  couldHaveMorePointsThan(points: number): boolean {
    const recorded = this.view.could_have_more_points_than[String(points)];
    if (recorded === undefined) {
      throw new UnrecordedError(
        `could_have_more_points_than(${points})`,
        this.history,
      );
    }
    return recorded;
  }

  minLength(suit: Strain): number {
    return this.view.min_length[suit.index];
  }

  maxLength(suit: Strain): number {
    return this.view.max_length[suit.index];
  }

  get isBalanced(): boolean {
    return this.view.is_balanced;
  }

  get unbidSuits(): readonly Strain[] {
    return suits(this.view.unbid_suits);
  }

  get bidSuits(): readonly Strain[] {
    return suits(this.view.bid_suits);
  }
}

class RecordedGroupView implements GroupView {
  readonly history: RecordedHistory;
  readonly positions: readonly EnumValue[];
  private readonly name: "us" | "them" | "everyone";

  constructor(
    history: RecordedHistory,
    positions: readonly EnumValue[],
    name: "us" | "them" | "everyone",
  ) {
    this.history = history;
    this.positions = positions;
    this.name = name;
  }

  private get group(): GroupSnapshot {
    return this.history.snapshotOrThrow(`the ${this.name} group`)[this.name];
  }

  get annotations(): readonly EnumValue[] {
    return annotationValues(this.group.annotations);
  }

  get unbidSuits(): readonly Strain[] {
    return suits(this.group.unbid_suits);
  }

  get bidSuits(): readonly Strain[] {
    return suits(this.group.bid_suits);
  }

  get minPoints(): number {
    return this.group.min_points;
  }
}

export class RecordedHistory implements History {
  readonly store: RecordedHistories;
  readonly callHistory: CallHistory;
  /** Null for a prefix the fixture set does not hold. */
  readonly snapshot: AuctionSnapshot | null;

  constructor(
    store: RecordedHistories,
    callHistory: CallHistory,
    snapshot: AuctionSnapshot | null,
  ) {
    this.store = store;
    this.callHistory = callHistory;
    this.snapshot = snapshot;
  }

  get recorded(): boolean {
    return this.snapshot !== null;
  }

  snapshotOrThrow(what: string): AuctionSnapshot {
    if (this.snapshot === null) {
      throw new UnrecordedError(what, this);
    }
    return this.snapshot;
  }

  // --- what the calls alone answer -------------------------------------

  /** The history with the first `length` calls (null below the root). */
  prefix(length: number): RecordedHistory | null {
    if (length < 0) {
      return null;
    }
    if (length === this.callHistory.calls.length) {
      return this;
    }
    return this.store.history(this.callHistory.copyWithPartialHistory(length));
  }

  /** Python's `_four_calls_ago`. */
  get _fourCallsAgo(): RecordedHistory | null {
    return this.prefix(this.callHistory.calls.length - 4);
  }

  _historyAfterLastCallFor(position: EnumValue): RecordedHistory | null {
    return this.prefix(this.callHistory.calls.length - position.index);
  }

  *_walkHistoryFor(position: EnumValue): Iterable<RecordedHistory> {
    let history = this._historyAfterLastCallFor(position);
    while (history) {
      yield history;
      history = history._fourCallsAgo;
    }
  }

  lastCallForPosition(position: EnumValue): Call | null {
    const history = this._historyAfterLastCallFor(position);
    if (!history) {
      return null;
    }
    return history.callHistory.lastCall;
  }

  get lastContract(): Call | null {
    return this.callHistory.lastContract();
  }

  // --- what the snapshot answers ----------------------------------------

  get legalCalls(): ReadonlySet<Call> {
    return new Set(
      this.snapshotOrThrow("legal_calls").legal_calls.map((name) =>
        Call.fromString(name),
      ),
    );
  }

  get annotations(): readonly EnumValue[] {
    return this.snapshotOrThrow("annotations")
      .annotations_by_call.slice()
      .reverse()
      .flatMap(annotationValues);
  }

  annotationsByCall(): EnumValue[][] {
    return this.snapshotOrThrow("annotations_by_call").annotations_by_call.map(
      annotationValues,
    );
  }

  private view(position: EnumValue, what: string): ViewSnapshot {
    return this.snapshotOrThrow(what).views[position.key];
  }

  annotationsForPosition(position: EnumValue): readonly EnumValue[] {
    return annotationValues(
      this.view(position, "annotations_for_position").annotations,
    );
  }

  annotationsForLastCall(position: EnumValue): readonly EnumValue[] {
    return annotationValues(
      this.view(position, "annotations_for_last_call")
        .annotations_for_last_call,
    );
  }

  ruleForLastCall(position: EnumValue): RuleView | null {
    const name = this.view(position, "rule_for_last_call").rule_for_last_call;
    return name === null ? null : this.store.ruleViews(name);
  }

  minLengthForPosition(position: EnumValue, suit: Strain): number {
    return this.view(position, "min_length").min_length[suit.index];
  }

  maxLengthForPosition(position: EnumValue, suit: Strain): number {
    return this.view(position, "max_length").max_length[suit.index];
  }

  isBalancedForPosition(position: EnumValue): boolean {
    return this.view(position, "is_balanced").is_balanced;
  }

  minPointsForPosition(position: EnumValue): number {
    return this.view(position, "min_points").min_points;
  }

  maxPointsForPosition(position: EnumValue): number {
    return this.view(position, "max_points").max_points;
  }

  couldHaveMorePointsThan(position: EnumValue, points: number): boolean {
    return this.viewFor(position).couldHaveMorePointsThan(points);
  }

  firstNaturalBidder(strain: Strain): EnumValue | null {
    const key = this.snapshotOrThrow("first_natural_bidder")
      .first_natural_bidder[strain.char];
    return key === null ? null : positions.get(key as never);
  }

  bidSuitNaturally(strain: Strain, position: EnumValue): boolean {
    return this.snapshotOrThrow("bid_suit_naturally").bid_suit_naturally[
      position.key
    ][strain.char];
  }

  isBidSuit(suit: Strain, position: EnumValue): boolean {
    return this._hasShownSuit(suit, position, false);
  }

  isUnbidSuit(suit: Strain): boolean {
    return this.snapshotOrThrow("unbid_suits").unbid_suits.includes(suit.char);
  }

  get unbidSuits(): readonly Strain[] {
    return suits(this.snapshotOrThrow("unbid_suits").unbid_suits);
  }

  _hasShownSuit(
    suit: Strain,
    position: EnumValue,
    contractsOnly: boolean,
  ): boolean {
    const view = this.view(position, "bid_suits");
    const shown = contractsOnly ? view.contract_bid_suits : view.bid_suits;
    return shown.includes(suit.char);
  }

  // --- views ------------------------------------------------------------

  get rho(): PositionView {
    return new RecordedPositionView(this, positions.RHO);
  }

  get me(): PositionView {
    return new RecordedPositionView(this, positions.Me);
  }

  get partner(): PositionView {
    return new RecordedPositionView(this, positions.Partner);
  }

  get lho(): PositionView {
    return new RecordedPositionView(this, positions.LHO);
  }

  get us(): GroupView {
    return new RecordedGroupView(this, [positions.Me, positions.Partner], "us");
  }

  get them(): GroupView {
    return new RecordedGroupView(this, [positions.LHO, positions.RHO], "them");
  }

  get everyone(): GroupView {
    return new RecordedGroupView(this, [...positions], "everyone");
  }

  viewFor(position: EnumValue): PositionView {
    return new RecordedPositionView(this, position);
  }
}
