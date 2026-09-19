// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/core/board.py.

import { assert } from "./assert";
import { CallHistory } from "./callhistory";
import { Deal } from "./deal";
import { defaultRng, randomBelow, type Rng } from "./random";

export class Board {
  number: number;
  deal: Deal;
  callHistory: CallHistory;

  constructor(
    number?: number | null,
    deal?: Deal | null,
    callHistory?: CallHistory | null,
    rng: Rng = defaultRng,
  ) {
    this.number = number || 1;
    this.deal = deal || Deal.random(rng);
    // An empty CallHistory is falsy in Python (it has __len__), so test for null explicitly.
    this.callHistory =
      callHistory !== null && callHistory !== undefined
        ? callHistory
        : CallHistory.emptyForBoardNumber(this.number);
  }

  get identifier(): string {
    let identifier = `${this.number}-${this.deal.identifier}`;
    if (this.callHistory.calls.length) {
      identifier += `:${this.callHistory.commaSeparatedCalls()}`;
    }
    return identifier;
  }

  static fromIdentifier(identifier: string): Board {
    const components = identifier.split("-");
    let boardNumberString: string;
    let dealIdentifier: string;
    let callHistory: CallHistory;
    if (components.length === 2) {
      const [numberString, dealAndHistoryIdentifier] = components;
      boardNumberString = numberString;
      if (dealAndHistoryIdentifier.includes(":")) {
        const parts = dealAndHistoryIdentifier.split(":");
        assert(parts.length === 2, `Invalid board identifier: ${identifier}`);
        const [dealString, callHistoryIdentifier] = parts;
        dealIdentifier = dealString;
        // We have to do a bit of a dance to convert from the board url system that
        // the JS code uses to the one the python uses.
        callHistory = CallHistory.fromBoardNumberAndCallsString(
          Number.parseInt(boardNumberString, 10),
          callHistoryIdentifier,
        );
      } else {
        dealIdentifier = dealAndHistoryIdentifier;
        callHistory = CallHistory.emptyForBoardNumber(
          Number.parseInt(boardNumberString, 10),
        );
      }
    } else {
      assert(
        components.length === 3,
        `Invalid board identifier: ${identifier}`,
      );
      const [numberString, dealString, callHistoryIdentifier] = components;
      boardNumberString = numberString;
      dealIdentifier = dealString;
      callHistory = CallHistory.fromIdentifier(callHistoryIdentifier);
    }

    const boardNumber = Number.parseInt(boardNumberString, 10);
    const deal = Deal.fromIdentifier(dealIdentifier);
    return new Board(boardNumber, deal, callHistory);
  }

  static random(rng: Rng = defaultRng): Board {
    const boardNumber = randomBelow(16, rng) + 1;
    // Will automatically deal random if not passed a Deal.
    return new Board(boardNumber, null, null, rng);
  }
}
