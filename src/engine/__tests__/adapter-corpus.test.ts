// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// The phase 7 adapter gate: the two fixtures python/tests/export_fixtures.py
// writes by calling the Python adapter, reproduced by the TypeScript one.
//
//   interpretations.jsonl  `get_call_interpretations` for every auction the
//                          corpus visits: the rule, its explanation and the
//                          knowledge string of every legal next call.
//   random-deals.jsonl     seeded deals bid to completion in all four seats:
//                          the call and the rule at every decision, the
//                          auction `get_full_autobid` produces, and the
//                          opening lead against the contract it reached.
//
// Both gates take minutes in full, so `pnpm test` checks a deterministic fifth
// of the records and YARBOROUGH_FULL_BASELINE=1 checks them all, through the
// `corpusSample` helper the phase 6 gates use.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BiddingInputError,
  getCallInterpretations,
  getFullAutobid,
  getOpeningLead,
} from "../adapter";
import { Board } from "../core/board";
import { Pass } from "../core/call";
import { Bidder, setBidderLog } from "../z3b/bidder";
import { corpusSample } from "../z3b/__tests__/kernel-checks";
import {
  type DealDecision,
  interpretationRecords,
  randomDealRecords,
  type RandomDealRecord,
} from "./adapter-fixtures";

/** The board identifier of a deal plus the auction it was bid to. */
function identifierWithAuction(record: RandomDealRecord): string {
  return `${record.board}:${record.calls.split(" ").join(",")}`;
}

/**
 * `bid_random_deal` of the exporter: the deal bid out one decision at a time
 * through `Bidder.callSelectionFor`, with the rule and the collision at each
 * step and the count of dropped calls the kernel warned about.
 */
function decisionsOf(record: RandomDealRecord): DealDecision[] {
  const board = Board.fromIdentifier(record.board);
  const history = board.callHistory;
  const bidder = new Bidder();
  const decisions: DealDecision[] = [];
  while (!history.isComplete()) {
    const position = history.positionToCall();
    let captured = "";
    const previous = setBidderLog((line) => {
      captured += `${line}\n`;
    });
    let selection;
    try {
      selection = bidder.callSelectionFor(
        board.deal.handFor(position),
        history,
      );
    } finally {
      setBidderLog(previous);
    }
    const decision: DealDecision = selection
      ? {
          position: position.char,
          call: selection.call.name,
          rule: selection.rule?.name ?? null,
          collision: Boolean(selection.collision),
        }
      : {
          position: position.char,
          call: "P",
          rule: null,
          collision: false,
          no_call: true,
        };
    const dropped =
      captured.split("Multiple rules have maximal category").length - 1;
    if (dropped) {
      decision.dropped = dropped;
    }
    decisions.push(decision);
    history.calls.push(selection ? selection.call : new Pass());
  }
  return decisions;
}

let restoreLog: ReturnType<typeof setBidderLog>;
beforeAll(() => {
  restoreLog = setBidderLog(() => {});
});
afterAll(() => {
  setBidderLog(restoreLog);
});

describe("interpretations.jsonl through the adapter", () => {
  it(`has ${interpretationRecords.length} auctions, none of which failed in Python`, () => {
    expect(interpretationRecords.length).toBeGreaterThan(0);
    expect(interpretationRecords.filter((record) => record.error)).toHaveLength(
      0,
    );
  });

  it(
    "interprets every legal call of every auction as Python did",
    { timeout: 1_800_000 },
    () => {
      const started = performance.now();
      const { checked, description } = corpusSample(interpretationRecords, 5);
      let calls = 0;
      for (const record of checked) {
        const key = `${record.dealer} ${record.vulnerability} "${record.calls}"`;
        const interpretations = getCallInterpretations(
          record.calls,
          record.dealer,
          record.vulnerability,
        );
        expect(interpretations, key).toEqual(record.interpretations);
        calls += interpretations.length;
      }
      console.log(
        `adapter-corpus: ${description} auctions, ${calls} interpreted calls, in ${(
          performance.now() - started
        ).toFixed(0)} ms`,
      );
    },
  );
});

describe("random-deals.jsonl through the adapter", () => {
  it(`has ${randomDealRecords.length} deals, none of which failed in Python`, () => {
    expect(randomDealRecords.length).toBeGreaterThan(0);
    expect(randomDealRecords.filter((record) => record.error)).toHaveLength(0);
    expect(
      randomDealRecords.filter(
        (record) => record.lead !== null && record.lead.error,
      ),
    ).toHaveLength(0);
  });

  it("bids and leads every deal as Python did", { timeout: 1_800_000 }, () => {
    const started = performance.now();
    const { checked, description } = corpusSample(randomDealRecords, 5);
    let leads = 0;
    for (const record of checked) {
      const key = `deal ${record.index} (${record.board})`;
      // The rule at every decision, through Bidder.callSelectionFor.
      expect(decisionsOf(record), key).toEqual(record.decisions);
      // The adapter's own auction.
      expect(getFullAutobid(record.board), key).toEqual(
        record.calls.split(" "),
      );
      const identifier = identifierWithAuction(record);
      if (record.lead === null) {
        // The four passed-out deals have no lead to take.
        expect(() => getOpeningLead(identifier), key).toThrow(
          BiddingInputError,
        );
        continue;
      }
      expect(getOpeningLead(identifier), key).toEqual(record.lead);
      leads += 1;
    }
    console.log(
      `adapter-corpus: ${description} deals, ${leads} opening leads, in ${(
        performance.now() - started
      ).toFixed(0)} ms`,
    );
  });
});
