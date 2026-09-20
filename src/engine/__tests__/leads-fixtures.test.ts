// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// The `leads` and `bid_suits` cases of tests/engine-fixtures/core-cases.json,
// which python/tests/export_fixtures.py takes off the opening leads of the
// random deals: forty hands with the contract's strain and the suits the
// auction showed, and the card and reason Python chose for each, sighted and
// blind.  leads.test.ts translates python/tests/test_leads.py; these are the
// recorded answers, and they are what keeps `leads` honest for the adapter's
// `get_opening_lead`.

import { describe, expect, it } from "vitest";
import { bidSuits, choose } from "../leads";
import { coreCases } from "./adapter-fixtures";

describe("core-cases.json leads", () => {
  it(`chooses all ${coreCases.leads.length} recorded cards, sighted and blind`, () => {
    expect(coreCases.leads.length).toBeGreaterThan(0);
    for (const leadCase of coreCases.leads) {
      const key = `${leadCase.hand} vs ${leadCase.strain}`;
      expect(
        choose(
          leadCase.hand,
          leadCase.strain,
          leadCase.partner_suits,
          leadCase.their_suits,
        ),
        key,
      ).toEqual([leadCase.card, leadCase.reason]);
      expect(
        choose(
          leadCase.hand,
          leadCase.strain,
          leadCase.partner_suits,
          leadCase.their_suits,
          true,
        ),
        `${key} blind`,
      ).toEqual([leadCase.blind_card, leadCase.blind_reason]);
    }
  });

  it(`reads the bid suits of all ${coreCases.bid_suits.length} recorded auctions`, () => {
    expect(coreCases.bid_suits.length).toBeGreaterThan(0);
    for (const bidSuitsCase of coreCases.bid_suits) {
      expect(
        bidSuits(
          bidSuitsCase.calls,
          bidSuitsCase.dealer_index,
          bidSuitsCase.leader_index,
          bidSuitsCase.artificial,
        ),
        bidSuitsCase.calls.join(" "),
      ).toEqual(bidSuitsCase.result);
    }
  });
});
