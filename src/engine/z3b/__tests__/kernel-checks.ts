// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The phase 6 gate's instruments: the records python/tests/export_fixtures.py
// writes (an auction snapshot, a decision), rebuilt from the real kernel so a
// test is one `toEqual` against the fixture line.  `snapshotOf` is
// `snapshot_auction`, `decisionOf` is `decide`; both follow the exporter's
// code, not the kernel's, so they also check the kernel from outside.
//
// While phase 5 has not registered every rule, an auction is comparable only
// where the rules that shaped it are all registered (`coverage`): the meaning
// of a call negates every other call's meaning, so one unregistered rule on
// the way changes every number after it.

import { Call, sortCalls } from "../../core/call";
import type { CallHistory } from "../../core/callhistory";
import type { Hand } from "../../core/hand";
import { SUITS } from "../../core/suit";
import {
  Bidder,
  type History,
  Interpreter,
  RuleSelector,
  compareProductionOrder,
} from "../bidder";
import { type EnumValue, sortedEnumValues } from "../enum";
import { SAYCForcingOracle } from "../forcing";
import type { GroupView, PositionView } from "../history";
import { positions } from "../model";
import type { BiddingSystem } from "../sayc";
import {
  type AuctionSnapshot,
  auctionKey,
  type DroppedCall,
  type GroupSnapshot,
  type ViewSnapshot,
} from "./fixtures";

/** One line of decisions.jsonl. */
export interface DecisionRecord {
  group: string;
  hand: string;
  calls: string;
  dealer: string;
  vulnerability: string;
  expected: string;
  subtest_of: string | null;
  error?: string;
  possible: [string, string][];
  maximal: [string, string][];
  collision: { calls: string[]; rules: string[]; priorities: string[] } | null;
  call: string | null;
  rule: string | null;
  bidder_call?: string | null;
  bidder_rule?: string | null;
}

/** The part of a decision the kernel reproduces. */
export type DecisionOutcome = Pick<
  DecisionRecord,
  "possible" | "maximal" | "collision" | "call" | "rule"
>;

function enumKeys(values: Iterable<EnumValue>): string[] {
  return sortedEnumValues(values).map((value) => value.key);
}

function viewSnapshot(
  view: PositionView,
  thresholds: readonly string[],
): ViewSnapshot {
  return {
    last_call: view.lastCall?.name ?? null,
    annotations_for_last_call: enumKeys(view.annotationsForLastCall),
    rule_for_last_call: view.ruleForLastCall?.name ?? null,
    annotations: enumKeys(view.annotations),
    min_points: view.minPoints,
    max_points: view.maxPoints,
    min_length: SUITS.map((s) => view.minLength(s)),
    max_length: SUITS.map((s) => view.maxLength(s)),
    is_balanced: view.isBalanced,
    bid_suits: view.bidSuits.map((s) => s.char),
    unbid_suits: view.unbidSuits.map((s) => s.char),
    contract_bid_suits: SUITS.filter((s) =>
      view.history._hasShownSuit(s, view.position, true),
    ).map((s) => s.char),
    could_have_more_points_than: Object.fromEntries(
      thresholds.map((points) => [
        points,
        view.couldHaveMorePointsThan(Number(points)),
      ]),
    ),
  };
}

function groupSnapshot(group: GroupView): GroupSnapshot {
  return {
    min_points: group.minPoints,
    bid_suits: group.bidSuits.map((s) => s.char),
    unbid_suits: group.unbidSuits.map((s) => s.char),
    annotations: enumKeys(group.annotations),
  };
}

function ruleByCall(history: History): (string | null)[] {
  const names: (string | null)[] = [];
  for (const step of history._walkHistory()) {
    if (step._previousHistory !== null) {
      names.push(step._ruleForLastCall?.name ?? null);
    }
  }
  names.reverse();
  return names;
}

/**
 * `snapshot_auction` over an interpreted history: the record the exporter
 * writes for it, with `could_have_more_points_than` at the thresholds the
 * expected record holds.  The head (dealer, vulnerability, calls) is the
 * auction asked for, as in the exporter: the history cache is keyed without
 * the vulnerability, so the History may carry another one.
 */
export function snapshotOf(
  system: BiddingSystem,
  asked: CallHistory,
  history: History,
  thresholds: readonly string[],
): AuctionSnapshot {
  const callHistory = history.callHistory;
  const snapshot: AuctionSnapshot = {
    dealer: asked.dealer.char,
    vulnerability: asked.vulnerability.name,
    calls: asked.callsString(),
    legal_calls: sortCalls([...history.legalCalls]).map((call) => call.name),
    unbid_suits: history.unbidSuits.map((s) => s.char),
    last_contract: history.lastContract?.name ?? null,
    us: groupSnapshot(history.us),
    them: groupSnapshot(history.them),
    everyone: groupSnapshot(history.everyone),
    views: Object.fromEntries(
      [...positions].map((position) => [
        position.key,
        viewSnapshot(history.viewFor(position), thresholds),
      ]),
    ),
    bid_suit_naturally: Object.fromEntries(
      [...positions].map((position) => [
        position.key,
        Object.fromEntries(
          SUITS.map((s) => [s.char, history.bidSuitNaturally(s, position)]),
        ),
      ]),
    ),
    first_natural_bidder: Object.fromEntries(
      SUITS.map((s) => [s.char, history.firstNaturalBidder(s)?.key ?? null]),
    ),
    annotations_by_call: history.annotationsByCall().map(enumKeys),
    rule_by_call: ruleByCall(history),
    forced_to_bid: new SAYCForcingOracle().forcedToBid(history),
    call_to_rule: {},
    dropped_calls: [],
  };
  if (!callHistory.isComplete()) {
    const selector = new RuleSelector(system, history);
    snapshot.call_to_rule = Object.fromEntries(
      [...selector._callToRule].map(([call, rule]) => [call.name, rule.name]),
    );
    snapshot.dropped_calls = selector.droppedCalls.map((dropped) => ({
      call: dropped.call.name,
      category: dropped.category.key,
      rules: dropped.rules.map((rule) => rule.name).sort(),
    }));
  }
  return snapshot;
}

/**
 * `decide` over one hand and auction: the possible calls with priorities,
 * the maximal set, the collision and the choice, step by step as the
 * exporter replays them, and then what `Bidder.call_selection_for` chose.
 */
export function decisionOf(
  system: BiddingSystem,
  hand: Hand,
  callHistory: CallHistory,
): {
  replay: DecisionOutcome;
  bidder: { call: string | null; rule: string | null };
} {
  const bidder = new Bidder();
  const selection = bidder.callSelectionFor(hand, callHistory);
  const bidderOutcome = {
    call: selection?.call.name ?? null,
    rule: selection?.rule?.name ?? null,
  };
  const replay = new Interpreter().withHistory(callHistory, (history) => {
    const selector = new RuleSelector(system, history);
    const possible = selector.possibleCallsForHand(hand, null);
    const maximal = possible.maximalCallsAndPriorities();
    const pairs = (list: readonly [Call, { repr(): string }][]) =>
      list.map(
        ([call, priority]) => [call.name, priority.repr()] as [string, string],
      );
    const outcome: DecisionOutcome = {
      possible: pairs(possible._callsAndPriorities),
      maximal: pairs(maximal),
      collision: null,
      call: null,
      rule: null,
    };
    const chosen = maximal
      .filter((pair) => !selector.ruleForCall(pair[0])!.requiresPlanning)
      .sort((a, b) =>
        a[0].name < b[0].name ? -1 : a[0].name > b[0].name ? 1 : 0,
      );
    if (chosen.length) {
      let calls = chosen.map((pair) => pair[0]);
      if (calls.length > 1) {
        outcome.collision = {
          calls: calls.map((call) => call.name),
          rules: calls.map((call) => selector.ruleForCall(call)!.name),
          priorities: chosen.map((pair) => pair[1].repr()),
        };
        calls = [[...calls].sort(compareProductionOrder)[0]];
      }
      outcome.call = calls[0].name;
      outcome.rule = selector.ruleForCall(calls[0])!.name;
    }
    return outcome;
  });
  return { replay, bidder: bidderOutcome };
}

// --- how much of the corpus a run checks -------------------------------------

/**
 * Every record with YARBOROUGH_FULL_BASELINE=1 in the environment (the whole
 * gate takes minutes); otherwise every `stride`th record, a deterministic
 * sample that keeps `pnpm test` short.  Returns the records to check and how
 * the choice is described.
 */
export function corpusSample<T>(
  records: readonly T[],
  stride: number,
): { checked: T[]; description: string } {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  if (env?.YARBOROUGH_FULL_BASELINE === "1") {
    return { checked: [...records], description: `all ${records.length}` };
  }
  const checked = records.filter((_record, index) => index % stride === 0);
  return {
    checked,
    description: `${checked.length} of ${records.length} (every ${stride}th; YARBOROUGH_FULL_BASELINE=1 checks all)`,
  };
}

// --- coverage ------------------------------------------------------------------

/**
 * Which recorded auctions the registered rules reproduce: with every manifest
 * rule registered, all of them; before that, those whose every proper prefix is
 * recorded with only registered rules (call_to_rule and dropped_calls).
 */
export class Coverage {
  private readonly byKey = new Map<string, AuctionSnapshot>();
  private readonly fullyRegistered = new Map<string, boolean>();
  readonly registered: ReadonlySet<string>;
  readonly complete: boolean;

  constructor(
    snapshots: Iterable<AuctionSnapshot>,
    registered: ReadonlySet<string>,
    complete: boolean,
  ) {
    this.registered = registered;
    this.complete = complete;
    for (const snapshot of snapshots) {
      this.byKey.set(
        auctionKey(snapshot.dealer, snapshot.vulnerability, snapshot.calls),
        snapshot,
      );
    }
  }

  snapshot(dealer: string, vulnerability: string, calls: string) {
    return this.byKey.get(auctionKey(dealer, vulnerability, calls)) ?? null;
  }

  /** Every rule the snapshot's next call could come from is registered. */
  isFullyRegistered(snapshot: AuctionSnapshot): boolean {
    const key = auctionKey(
      snapshot.dealer,
      snapshot.vulnerability,
      snapshot.calls,
    );
    let known = this.fullyRegistered.get(key);
    if (known === undefined) {
      known =
        Object.values(snapshot.call_to_rule).every((rule) =>
          this.registered.has(rule),
        ) &&
        snapshot.dropped_calls.every((dropped: DroppedCall) =>
          dropped.rules.every((rule) => this.registered.has(rule)),
        );
      this.fullyRegistered.set(key, known);
    }
    return known;
  }

  /** The proper prefixes of an auction, shortest first, or null when one is unrecorded. */
  prefixes(
    dealer: string,
    vulnerability: string,
    calls: string,
  ): AuctionSnapshot[] | null {
    const names = calls === "" ? [] : calls.split(" ");
    const prefixes: AuctionSnapshot[] = [];
    for (let length = 0; length < names.length; length++) {
      const prefix = this.snapshot(
        dealer,
        vulnerability,
        names.slice(0, length).join(" "),
      );
      if (!prefix) {
        return null;
      }
      prefixes.push(prefix);
    }
    return prefixes;
  }

  /** The registered rules reproduce the interpretation of this auction. */
  coversAuction(dealer: string, vulnerability: string, calls: string): boolean {
    if (this.complete) {
      return true;
    }
    const prefixes = this.prefixes(dealer, vulnerability, calls);
    return (
      prefixes !== null &&
      prefixes.every((prefix) => this.isFullyRegistered(prefix))
    );
  }

  /** The registered rules reproduce a decision over this auction. */
  coversDecision(
    dealer: string,
    vulnerability: string,
    calls: string,
  ): boolean {
    if (this.complete) {
      return true;
    }
    const snapshot = this.snapshot(dealer, vulnerability, calls);
    return (
      snapshot !== null &&
      this.isFullyRegistered(snapshot) &&
      this.coversAuction(dealer, vulnerability, calls)
    );
  }

  /**
   * The expected snapshot as the registered rules can reproduce it: its
   * call_to_rule and dropped_calls restricted to registered rules (the whole
   * record once the registry is complete).
   */
  expectedSnapshot(snapshot: AuctionSnapshot): AuctionSnapshot {
    if (this.complete) {
      return snapshot;
    }
    const { selector_call_to_rule: _ignored, ...rest } = snapshot;
    return {
      ...rest,
      call_to_rule: Object.fromEntries(
        Object.entries(snapshot.call_to_rule).filter(([, rule]) =>
          this.registered.has(rule),
        ),
      ),
      dropped_calls: snapshot.dropped_calls.filter((dropped) =>
        dropped.rules.every((rule) => this.registered.has(rule)),
      ),
    };
  }

  /** The kernel's snapshot restricted the same way, so the two compare. */
  actualSnapshot(
    actual: AuctionSnapshot,
    expected: AuctionSnapshot,
  ): AuctionSnapshot {
    if (this.complete) {
      return actual;
    }
    return {
      ...actual,
      call_to_rule: Object.fromEntries(
        Object.entries(actual.call_to_rule).filter(
          ([call]) => call in expected.call_to_rule,
        ),
      ),
      dropped_calls: actual.dropped_calls.filter((dropped) =>
        expected.dropped_calls.some((known) => known.call === dropped.call),
      ),
    };
  }
}
