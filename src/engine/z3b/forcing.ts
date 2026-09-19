// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/forcing.py.

import { assert } from "../core/assert";
import { NOTRUMP } from "../core/suit";
import type { History } from "./history";
import { positions } from "./model";
import { annotations } from "./preconditions";

// Unclear where this logic should go.  It used to live in the
// ForcedToBid precondition, but it's possible it should move to
// a call-auto-annotator system instead.  The concept of "forcing"
// is system-specific.  This logic attempts to handle the generic
// sense of "forcing" for SAYC as well as respect individual bids
// ability to opt in or out of their default "forcing" characteristic.
export class SAYCForcingOracle {
  _rhoBid(history: History): boolean {
    return history.rho.lastCall !== null && !history.rho.lastCall.isPass();
  }

  _partnerLastBidWasPass(history: History): boolean {
    return (
      history.partner.lastCall !== null && history.partner.lastCall.isPass()
    );
  }

  _partnerIsAPassedHand(history: History): boolean {
    // Partner had a turn before the opening and passed.
    const ch = history.callHistory;
    const calls = ch.calls;
    const opening = calls.findIndex((c) => !c.isPass());
    if (opening === -1) {
      return false;
    }
    const partnerSeat =
      (ch.dealer.positionAfterNCalls(calls.length).index + 2) % 4;
    for (let i = 0; i < opening; i++) {
      if (ch.dealer.positionAfterNCalls(i).index === partnerSeat) {
        return true;
      }
    }
    return false;
  }

  _amOpenerAndPartnerLastCallWasUnbidSuit(history: History): boolean {
    if (!history.me.annotations.includes(annotations.Opening)) {
      return false;
    }
    // A passed hand's new suit is not forcing: opener may pass with a minimum (agreed
    // 2026-08-29; SAYC's "new suit by responder is forcing" assumes an unpassed hand).
    if (this._partnerIsAPassedHand(history)) {
      return false;
    }
    assert(
      !history.partner.annotationsForLastCall.includes(annotations.Artificial),
    );
    const call = history.partner.lastCall;
    assert(call);
    assert(call.strain !== NOTRUMP);
    // FIXME: We should not be using private methods on History!
    const historyBeforePartnerLastBid = history._historyAfterLastCallFor(
      positions.LHO,
    );
    // If partner began the bidding, than of course his bid was an unbid suit!
    if (!historyBeforePartnerLastBid) {
      return true;
    }
    return historyBeforePartnerLastBid.us.unbidSuits.includes(call.strain!);
  }

  forcedToBid(history: History): boolean {
    // If partner hasn't bid yet, he can't be forcing us to bid.
    if (history.partner.lastCall === null) {
      return false;
    }
    if (this._partnerLastBidWasPass(history)) {
      return false;
    }
    if (this._rhoBid(history)) {
      return false;
    }
    // A lead-directing double asks for a lead, not for a call: partner may pass it.
    if (
      history.partner.annotationsForLastCall.includes(
        annotations.LeadDirectingDouble,
      )
    ) {
      return false;
    }
    // Artificial bids are always forcing. We use explicit pass rules to convert them into natural bids.
    if (
      history.partner.annotationsForLastCall.includes(annotations.Artificial)
    ) {
      return true;
    }
    if (
      history.partner.annotationsForLastCall.includes(annotations.OpenerReverse)
    ) {
      return true;
    }
    // Natural NT bids are never forcing in SAYC.
    if (history.partner.lastCall.strain === NOTRUMP) {
      return false;
    }

    // This code works, but for SAYC we don't yet have any rules which need an explicit forcing=True.
    const ruleForLastCall = history.partner.ruleForLastCall;
    if (ruleForLastCall && ruleForLastCall.forcing !== null) {
      return ruleForLastCall.forcing;
    }

    // This logic assumes that doubles/redoubles are non-forcing (which is correct for penalty, wrong for takeout/negative).
    // Since takeout/negative currently have explicit response coverage, this is OK for now.
    return this._amOpenerAndPartnerLastCallWasUnbidSuit(history);
  }
}
