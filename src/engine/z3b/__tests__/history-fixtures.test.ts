// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// The phase 6 gate, first half (docs/typescript-engine-plan.md): every record
// of tests/engine-fixtures/auction-snapshots.jsonl reproduced by the real
// History that the Interpreter builds from the calls alone, no recorded state.
// Every observable the exporter wrote is compared: the views' points and
// lengths, balance, annotations, rules, bid and unbid suits, the point
// thresholds, the legal calls, the last contract, the group points,
// bid_suit_naturally, first_natural_bidder, annotations_by_call, call_to_rule,
// dropped_calls and forced_to_bid.
//
// Until phase 5 registers every manifest rule, only the auctions the
// registered rules shaped are comparable (kernel-checks.ts, Coverage); the
// coverage is printed.  Once the registry is complete every record must be
// covered.  The whole gate takes about four minutes, so `pnpm test` checks a
// deterministic fifth of the covered records; YARBOROUGH_FULL_BASELINE=1
// checks them all (`corpusSample`).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CallHistory } from "../../core/callhistory";
import { Interpreter, setBidderLog } from "../bidder";
import { StandardAmericanYellowCard } from "../sayc";
import {
  type AuctionSnapshot,
  type ManifestRule,
  readJsonFixture,
  readJsonlFixture,
} from "./fixtures";
import { Coverage, corpusSample, snapshotOf } from "./kernel-checks";

const manifest = readJsonFixture<ManifestRule[]>("rules-manifest.json");
const snapshots = readJsonlFixture<AuctionSnapshot>("auction-snapshots.jsonl");
const registered = new Set(
  StandardAmericanYellowCard.rules.map((rule) => rule.name),
);
const coverage = new Coverage(
  snapshots,
  registered,
  registered.size === manifest.length,
);

const covered = snapshots.filter((snapshot) =>
  coverage.coversAuction(
    snapshot.dealer,
    snapshot.vulnerability,
    snapshot.calls,
  ),
);

describe("auction-snapshots.jsonl from scratch", () => {
  let restoreLog: ReturnType<typeof setBidderLog>;
  beforeAll(() => {
    // A category tie prints a WARNING; the fixture records it as a dropped call.
    restoreLog = setBidderLog(() => {});
  });
  afterAll(() => {
    setBidderLog(restoreLog);
  });

  it(`covers ${covered.length} of ${snapshots.length} auctions with ${registered.size} of ${manifest.length} rules`, () => {
    console.log(
      `history-fixtures: ${covered.length} of ${snapshots.length} auctions covered by ${registered.size} of ${manifest.length} rules`,
    );
    expect(covered.length).toBeGreaterThan(0);
    if (coverage.complete) {
      expect(covered.length).toBe(snapshots.length);
    }
  });

  it(
    "interprets every covered auction as Python did",
    { timeout: 600_000 },
    () => {
      const started = performance.now();
      let longest = { calls: "", ms: 0 };
      const { checked, description } = corpusSample(covered, 5);
      for (const snapshot of checked) {
        const expected = coverage.expectedSnapshot(snapshot);
        const callHistory = CallHistory.fromString(
          snapshot.calls,
          snapshot.dealer,
          snapshot.vulnerability,
        );
        const thresholds = Object.keys(
          snapshot.views[Object.keys(snapshot.views)[0]]
            .could_have_more_points_than,
        );
        const before = performance.now();
        const actual = new Interpreter().withHistory(callHistory, (history) =>
          coverage.actualSnapshot(
            snapshotOf(
              StandardAmericanYellowCard,
              callHistory,
              history,
              thresholds,
            ),
            expected,
          ),
        );
        const ms = performance.now() - before;
        if (ms > longest.ms) {
          longest = { calls: snapshot.calls, ms };
        }
        expect(
          actual,
          `${snapshot.dealer} ${snapshot.vulnerability} "${snapshot.calls}"`,
        ).toEqual(expected);
      }
      console.log(
        `history-fixtures: ${description} covered auctions checked in ${(performance.now() - started).toFixed(0)} ms; longest "${longest.calls}" ${longest.ms.toFixed(0)} ms`,
      );
    },
  );
});
