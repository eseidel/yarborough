// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The per-auction and per-hand records of python/tests/export_fixtures.py,
// rebuilt from the real kernel: `snapshotOf` is `snapshot_auction`'s
// snapshot, `meaningsOf` is `_meanings`, `decisionOf` is `decide`.  They
// follow the exporter's code, not the kernel's, so they check the kernel from
// outside; the fixture gates (history-fixtures.test.ts,
// decisions-fixtures.test.ts, dsl-fixtures.test.ts) compare one of these with
// a fixture line, and the regenerator (export.ts) writes them.

import { Call, sortCalls } from "../core/call";
import type { CallHistory } from "../core/callhistory";
import type { Hand } from "../core/hand";
import { SUITS } from "../core/suit";
import {
  Bidder,
  type History,
  Interpreter,
  RuleSelector,
  compareProductionOrder,
} from "../z3b/bidder";
import { SAYCForcingOracle } from "../z3b/forcing";
import type {
  GroupView,
  History as HistoryInterface,
  PositionView,
} from "../z3b/history";
import { positions } from "../z3b/model";
import { printedForm } from "../z3b/printed";
import type { Priority } from "../z3b/purposes";
import type { CompiledRule, PriorityOrdering } from "../z3b/rule_compiler";
import type { BiddingSystem } from "../z3b/sayc";
import { type Expr, z3 } from "../z3b/z3";
import { enumKeys } from "./describe";
import { fixtureHash } from "./hash";
import type {
  AuctionSnapshot,
  DecisionOutcome,
  GroupSnapshot,
  MeaningRecord,
  ViewSnapshot,
} from "./types";

/** `POINT_THRESHOLDS`: the points `could_have_more_points_than` is asked about. */
export const POINT_THRESHOLDS: readonly string[] = [
  "10",
  "13",
  "16",
  "19",
  "22",
  "25",
];

/** Python's `traceback.format_exception_only(type(exc), exc)[-1].strip()`. */
export function lastLine(error: unknown): string {
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : `${error}`;
  return text.trim().split("\n").pop() ?? "";
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
    // History._has_shown_suit(contracts_only=True): the suits shown by a
    // contract call (a double's promised suits do not count), as
    // SupportForPartnersSuits reads them.
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

/** `_forced_to_bid`: the oracle's answer, or the error it raised. */
function forcedToBid(history: History): boolean | { error: string } {
  try {
    return new SAYCForcingOracle().forcedToBid(history);
  } catch (error) {
    return { error: lastLine(error) };
  }
}

/**
 * `snapshot_auction` over an interpreted history: the record the exporter
 * writes for it, with `could_have_more_points_than` at `thresholds`
 * (`POINT_THRESHOLDS` in the exporter; a gate passes what the expected record
 * holds).  The head (dealer, vulnerability, calls) is the auction asked for,
 * as in the exporter: the history cache is keyed without the vulnerability,
 * so the History may carry another one.  The selector that owns the
 * `call_to_rule` is returned with it so `meaningsOf` can go on from there.
 */
export function snapshotOf(
  system: BiddingSystem,
  asked: CallHistory,
  history: History,
  thresholds: readonly string[] = POINT_THRESHOLDS,
): { snapshot: AuctionSnapshot; selector: RuleSelector | null } {
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
    forced_to_bid: forcedToBid(history),
    call_to_rule: {},
    dropped_calls: [],
  };
  if (callHistory.isComplete()) {
    return { snapshot, selector: null };
  }
  // `_call_to_rule_and_dropped` is the selector's own `_call_to_rule`: every
  // rule's `calls_over`, the best category per legal call, a tie dropping the
  // call.  The Python rebuilt it to compare with the selector's (writing
  // `selector_call_to_rule` on a difference); here they are one computation.
  const selector = new RuleSelector(system, history);
  snapshot.call_to_rule = Object.fromEntries(
    [...selector._callToRule].map(([call, rule]) => [call.name, rule.name]),
  );
  snapshot.dropped_calls = selector.droppedCalls.map((dropped) => ({
    call: dropped.call.name,
    category: dropped.category.key,
    rules: dropped.rules.map((rule) => rule.name).sort(),
  }));
  return { snapshot, selector };
}

/**
 * `_meanings`: per call of `callToRule`, the variants (priority, meaning) of
 * `rule.meaning_of` and `constraints_for_call` rebuilt with the unmade calls
 * in Call order.  `records` hash the printed forms (meanings.jsonl); `samples`
 * carry them (meanings-sample.jsonl).
 *
 * The Python also hashed `RuleSelector.constraints_for_call` and wrote
 * `selector_constraints` where it differed, because its selector iterated a
 * dict in insertion order; the TypeScript selector iterates `_callToRule` in
 * Call order, the very order rebuilt here, so the two cannot differ and the
 * field is never written.
 */
export function meaningsOf(
  ordering: PriorityOrdering,
  history: HistoryInterface,
  callToRule: ReadonlyMap<Call, CompiledRule>,
): { records: MeaningRecord[]; samples: MeaningRecord[] } {
  const calls = sortCalls([...callToRule.keys()]);
  const variants = new Map<Call, [Priority, Expr][]>();
  const errors = new Map<Call, string>();
  for (const call of calls) {
    try {
      variants.set(call, [...callToRule.get(call)!.meaningOf(history, call)]);
    } catch (error) {
      // A constraint that asserts on this auction.
      errors.set(call, lastLine(error));
    }
  }
  const records: MeaningRecord[] = [];
  const samples: MeaningRecord[] = [];
  for (const call of calls) {
    const rule = callToRule.get(call)!;
    const record: MeaningRecord = { call: call.name, rule: rule.name };
    const sample: MeaningRecord = { call: call.name, rule: rule.name };
    const error = errors.get(call);
    if (error !== undefined) {
      record.error = sample.error = error;
      records.push(record);
      samples.push(sample);
      continue;
    }
    const situations: Expr[] = [];
    const negations: Record<string, number[]>[] = [];
    for (const [priority, meaning] of variants.get(call)!) {
      const exprs = [meaning];
      const negated: Record<string, number[]> = {};
      for (const unmadeCall of calls) {
        if (
          errors.has(unmadeCall) ||
          callToRule.get(unmadeCall)!.requiresPlanning
        ) {
          continue;
        }
        variants
          .get(unmadeCall)!
          .forEach(([unmadePriority, unmadeMeaning], index) => {
            if (ordering.lt(priority, unmadePriority)) {
              exprs.push(z3.Not(unmadeMeaning));
              (negated[unmadeCall.name] ??= []).push(index);
            }
          });
      }
      situations.push(z3.And(exprs));
      negations.push(negated);
    }
    const constraints = printedForm(z3.Or(situations));
    const printed = variants.get(call)!.map(([priority, meaning]) => ({
      priority: priority.repr(),
      meaning: printedForm(meaning),
    }));
    record.variants = printed.map((variant) => ({
      priority: variant.priority,
      meaning: fixtureHash(variant.meaning),
    }));
    record.negations = negations;
    record.constraints = fixtureHash(constraints);
    if (errors.size) {
      record.excluded_errors = sortCalls([...errors.keys()]).map(
        (one) => one.name,
      );
    }
    sample.variants = printed;
    sample.constraints = constraints;
    records.push(record);
    samples.push(sample);
  }
  return { records, samples };
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
