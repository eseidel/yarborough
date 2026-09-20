// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// export.ts, the regenerator of tests/engine-fixtures/: the four files that
// do not depend on the corpus subset (the manifest, the vocabulary, the
// categories, the model) must come back byte for byte, and a small subset
// (the first harness tests, the first committed deals) must be deterministic
// across two runs and match the committed records for the same keys.  The
// whole set is `pnpm fixtures:check` (about twenty minutes), which CI runs.

import { describe, expect, it } from "vitest";
import categoriesText from "../../../../tests/engine-fixtures/categories.json?raw";
import coreCasesText from "../../../../tests/engine-fixtures/core-cases.json?raw";
import decisionsText from "../../../../tests/engine-fixtures/decisions.jsonl?raw";
import interpretationsText from "../../../../tests/engine-fixtures/interpretations.jsonl?raw";
import meaningsSampleText from "../../../../tests/engine-fixtures/meanings-sample.jsonl?raw";
import meaningsText from "../../../../tests/engine-fixtures/meanings.jsonl?raw";
import modelExpressionsText from "../../../../tests/engine-fixtures/model-expressions.json?raw";
import randomDealsText from "../../../../tests/engine-fixtures/random-deals.jsonl?raw";
import rulesManifestText from "../../../../tests/engine-fixtures/rules-manifest.json?raw";
import snapshotsText from "../../../../tests/engine-fixtures/auction-snapshots.jsonl?raw";
import vocabularyText from "../../../../tests/engine-fixtures/vocabulary.json?raw";
import { Board } from "../../core/board";
import {
  ALL_CALL_NAMES,
  CORE_BOARDS,
  corpusAuctions,
  type ExportResult,
  exportFixtures,
  FILES,
  freshSeedSet,
  harnessTests,
  seedSetFromFixtures,
} from "../export";
import type { CoreCases } from "../types";

const LIMIT = 3;
const DEALS = 2;

const committedSeedSet = seedSetFromFixtures(randomDealsText, coreCasesText);

function records<T>(text: string): T[] {
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

/** The committed lines of a .jsonl file by the key `keyOf` gives a record. */
function committedLines(
  text: string,
  keyOf: (record: Record<string, unknown>) => string,
): Map<string, string> {
  return new Map(
    text
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => [
        keyOf(JSON.parse(line) as Record<string, unknown>),
        line,
      ]),
  );
}

const auctionKey = (record: Record<string, unknown>) =>
  `${record.dealer}|${record.vulnerability}|${record.calls}`;
const decisionKey = (record: Record<string, unknown>) =>
  `${record.group}|${record.hand}|${record.dealer}|${record.vulnerability}|${record.calls}`;
const dealKey = (record: Record<string, unknown>) => String(record.index);

let cached: [ExportResult, ExportResult] | null = null;

/** Two runs over the subset, made once for every test here. */
function twoRuns(): [ExportResult, ExportResult] {
  if (cached === null) {
    const options = {
      seedSet: {
        ...committedSeedSet,
        deals: committedSeedSet.deals.slice(0, DEALS),
      },
      limit: LIMIT,
    };
    cached = [exportFixtures(options), exportFixtures(options)];
  }
  return cached;
}

describe("the seed set", () => {
  it("reads the committed boards back", () => {
    expect(committedSeedSet.deals).toHaveLength(300);
    expect(committedSeedSet.coreBoards).toHaveLength(CORE_BOARDS);
    expect(committedSeedSet.deals[0]).toBe("8-ff4a81f63e458498029e7f194b");
    expect(committedSeedSet.coreBoards[0]).toBe("4-527472cbf5299c63283e8b9353");
  });

  it("draws a fresh set deterministically from a seed, with the TypeScript RNG", () => {
    const first = freshSeedSet(5, 7);
    expect(first).toEqual(freshSeedSet(5, 7));
    expect(first.deals).toHaveLength(5);
    expect(first.coreBoards).toHaveLength(CORE_BOARDS);
    expect(new Set([...first.deals, ...first.coreBoards]).size).toBe(
      5 + CORE_BOARDS,
    );
    for (const identifier of [...first.deals, ...first.coreBoards]) {
      expect(Board.fromIdentifier(identifier).identifier).toBe(identifier);
    }
    expect(freshSeedSet(5, 8).deals).not.toEqual(first.deals);
    // Not the Python's deals: a fresh draw changes the file.
    expect(first.deals).not.toEqual(committedSeedSet.deals.slice(0, 5));
  });
});

describe("the corpus", () => {
  it("lists the harness tests in the harness's order, subtests included", () => {
    const tests = harnessTests();
    expect(tests).toHaveLength(records(decisionsText).length);
    expect(harnessTests(LIMIT)).toEqual(tests.slice(0, LIMIT));
    expect(tests.some((test) => test.parentTest !== null)).toBe(true);
  });

  it("sorts the auctions by dealer, vulnerability, length and calls", () => {
    const auctions = corpusAuctions(harnessTests());
    expect(auctions).toHaveLength(records(snapshotsText).length);
    expect(
      auctions.map(
        ({ dealer, vulnerability, calls }) =>
          `${dealer}|${vulnerability}|${calls}`,
      ),
    ).toEqual(records<Record<string, unknown>>(snapshotsText).map(auctionKey));
    expect(ALL_CALL_NAMES).toHaveLength(38);
  });
});

describe("exportFixtures over a small subset", () => {
  it("writes every file and is deterministic across two runs", () => {
    const [first, second] = twoRuns();
    expect([...first.files.keys()].sort()).toEqual([...FILES].sort());
    for (const name of FILES) {
      expect(first.files.get(name), name).toBe(second.files.get(name));
    }
    expect(first.summary).toMatchObject({
      auctions: 6,
      auction_errors: [],
      meaning_errors: 0,
      interpretation_errors: [],
      decisions: LIMIT,
      decision_errors: [],
      bidder_disagreements: [],
      deals: DEALS,
      deal_errors: [],
    });
  });

  it.each([
    ["rules-manifest.json", rulesManifestText],
    ["vocabulary.json", vocabularyText],
    ["categories.json", categoriesText],
    ["model-expressions.json", modelExpressionsText],
  ] as const)("reproduces %s byte for byte", (name, text) => {
    expect(twoRuns()[0].files.get(name)).toBe(text);
  });

  it.each([
    ["auction-snapshots.jsonl", snapshotsText, auctionKey],
    ["meanings.jsonl", meaningsText, auctionKey],
    ["interpretations.jsonl", interpretationsText, auctionKey],
    ["decisions.jsonl", decisionsText, decisionKey],
    ["random-deals.jsonl", randomDealsText, dealKey],
  ] as const)(
    "reproduces the committed records of %s for the subset",
    (name, text, keyOf) => {
      const committed = committedLines(text, keyOf);
      const lines = twoRuns()[0]
        .files.get(name)!
        .split("\n")
        .filter((line) => line.length > 0);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        const key = keyOf(JSON.parse(line) as Record<string, unknown>);
        expect(line, `${name}: ${key}`).toBe(committed.get(key));
      }
    },
  );

  it("samples the first auctions with the full printed forms", () => {
    // The subset's auctions are not the first forty of the whole corpus, so
    // the sample cannot be compared line by line; its hashes must be the
    // records', though, and a sampled auction that is in the committed sample
    // must match it.
    const [run] = twoRuns();
    const sample = records<{
      calls: string;
      calls_and_rules: { call: string; constraints: string }[];
    }>(run.files.get("meanings-sample.jsonl")!);
    expect(sample).toHaveLength(6);
    const committedSample = committedLines(meaningsSampleText, auctionKey);
    const lines = run.files
      .get("meanings-sample.jsonl")!
      .split("\n")
      .filter((line) => line.length > 0);
    for (const line of lines) {
      const key = auctionKey(JSON.parse(line) as Record<string, unknown>);
      if (committedSample.has(key)) {
        expect(line, key).toBe(committedSample.get(key));
      }
    }
  });

  it("reproduces core-cases.json but for the leads it takes off the deals", () => {
    const expected = JSON.parse(coreCasesText) as CoreCases;
    const actual = JSON.parse(
      twoRuns()[0].files.get("core-cases.json")!,
    ) as CoreCases;
    const {
      leads: expectedLeads,
      bid_suits: expectedBidSuits,
      ...rest
    } = expected;
    const { leads, bid_suits: bidSuits, ...actualRest } = actual;
    expect(actualRest).toEqual(rest);
    expect(leads.length).toBeGreaterThan(0);
    expect(leads).toEqual(expectedLeads.slice(0, leads.length));
    expect(bidSuits).toEqual(expectedBidSuits.slice(0, bidSuits.length));
  });
});
