// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// The phase 6 gate, second half: every record of
// tests/engine-fixtures/decisions.jsonl reproduced by the real bidder over the
// corpus hand and auction: the possible calls with their priorities in the
// order the rule selector adds them, the maximal set, the collision, and the
// call and rule chosen, both as the exporter replays the choice and as
// `Bidder.callSelectionFor` makes it.
//
// Coverage follows history-fixtures.test.ts: the auction and every prefix must
// be shaped by registered rules only, so the possible list names only
// registered rules; once the registry is complete every record is covered.
// The whole gate takes well over a minute, so `pnpm test` checks a
// deterministic fifth of the covered records; YARBOROUGH_FULL_BASELINE=1
// checks them all (`corpusSample`).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CallHistory } from "../../core/callhistory";
import { Hand } from "../../core/hand";
import { setBidderLog } from "../bidder";
import { StandardAmericanYellowCard } from "../sayc";
import {
  type AuctionSnapshot,
  type ManifestRule,
  readJsonFixture,
  readJsonlFixture,
} from "./fixtures";
import {
  Coverage,
  corpusSample,
  type DecisionRecord,
  decisionOf,
} from "./kernel-checks";

const manifest = readJsonFixture<ManifestRule[]>("rules-manifest.json");
const snapshots = readJsonlFixture<AuctionSnapshot>("auction-snapshots.jsonl");
const decisions = readJsonlFixture<DecisionRecord>("decisions.jsonl");
const registered = new Set(
  StandardAmericanYellowCard.rules.map((rule) => rule.name),
);
const coverage = new Coverage(
  snapshots,
  registered,
  registered.size === manifest.length,
);

const covered = decisions.filter(
  (record) =>
    coverage.coversDecision(
      record.dealer,
      record.vulnerability,
      record.calls,
    ) && record.possible.every(([, priority]) => namesRegisteredRule(priority)),
);

/** The rule a priority repr names (`Game/strain1/Rule[0, 1]/fallback1`). */
function namesRegisteredRule(priority: string): boolean {
  const match = /([A-Za-z0-9_]+)\[/.exec(priority);
  return match !== null && registered.has(match[1]);
}

describe("decisions.jsonl through the real bidder", () => {
  let restoreLog: ReturnType<typeof setBidderLog>;
  beforeAll(() => {
    restoreLog = setBidderLog(() => {});
  });
  afterAll(() => {
    setBidderLog(restoreLog);
  });

  it(`covers ${covered.length} of ${decisions.length} decisions with ${registered.size} of ${manifest.length} rules`, () => {
    console.log(
      `decisions-fixtures: ${covered.length} of ${decisions.length} decisions covered by ${registered.size} of ${manifest.length} rules`,
    );
    expect(covered.length).toBeGreaterThan(0);
    expect(decisions.filter((record) => record.error)).toHaveLength(0);
    if (coverage.complete) {
      expect(covered.length).toBe(decisions.length);
    }
  });

  it("decides every covered hand as Python did", { timeout: 600_000 }, () => {
    const started = performance.now();
    let slowest = { key: "", ms: 0 };
    const { checked, description } = corpusSample(covered, 5);
    for (const record of checked) {
      const key = `${record.hand} over ${record.dealer} ${record.vulnerability} "${record.calls}"`;
      const before = performance.now();
      const { replay, bidder } = decisionOf(
        StandardAmericanYellowCard,
        Hand.fromCdhsString(record.hand),
        CallHistory.fromString(
          record.calls,
          record.dealer,
          record.vulnerability,
        ),
      );
      const ms = performance.now() - before;
      if (ms > slowest.ms) {
        slowest = { key, ms };
      }
      expect(replay, key).toEqual({
        possible: record.possible,
        maximal: record.maximal,
        collision: record.collision,
        call: record.call,
        rule: record.rule,
      });
      // bidder_call / bidder_rule appear only when Bidder.call_selection_for
      // itself chose differently from the replay.
      expect(bidder, key).toEqual({
        call:
          "bidder_call" in record ? (record.bidder_call ?? null) : record.call,
        rule:
          "bidder_rule" in record ? (record.bidder_rule ?? null) : record.rule,
      });
    }
    console.log(
      `decisions-fixtures: ${description} covered decisions checked in ${(performance.now() - started).toFixed(0)} ms; slowest ${slowest.key} ${slowest.ms.toFixed(0)} ms`,
    );
  });
});
