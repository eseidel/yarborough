// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// The kernel as the harness sees it: the part of python/tests/harness.py's
// `_run_test` that reads z3b's `CallSelection` (the call, `str(rule)`, the
// collision tuple, `rule_for_last_call` of LHO, Partner and RHO) and the
// stdout it captures while the bidder decides.  `pnpm baseline:check` loads
// `createHarnessBidder` from here (src/engine/harness/cli.ts).

import type { CallHistory } from "../core/callhistory";
import type { Hand } from "../core/hand";
import type {
  HarnessBidder,
  HarnessRuleInfo,
  HarnessSelection,
} from "../harness/harness";
import { Bidder, setBidderLog } from "./bidder";
import { positions } from "./model";

export function createHarnessBidder(): HarnessBidder {
  const bidder = new Bidder();
  return {
    findCallFor(hand: Hand, callHistory: CallHistory): HarnessSelection | null {
      // outputcapture.OutputCapture: everything the bidder prints is the
      // result's stdout, printed with the group and searched for WARNINGs.
      let stdout = "";
      const previous = setBidderLog((line) => {
        stdout += `${line}\n`;
      });
      try {
        const selection = bidder.callSelectionFor(hand, callHistory);
        if (!selection) {
          // A falsy call_selection: no call, no rule, no interpreted rules.  The
          // captured text is still the result's stdout in Python, so it rides
          // along when there is any.
          return stdout
            ? { call: null, ruleName: null, lastThreeRuleNames: null, stdout }
            : null;
        }
        // These are in call-order, so we'd access partner's via names[-2].
        // This history is prior to the call_selection's call.
        const history = selection.ruleSelector.history;
        const lastThreeRuleNames = [
          positions.LHO,
          positions.Partner,
          positions.RHO,
        ].map((position) => history.ruleForLastCall(position)?.name ?? null);
        const collision = selection.collision;
        return {
          call: selection.call,
          ruleName: selection.rule?.name ?? null,
          collision: collision
            ? {
                calls: collision[0].map((call) => call.name),
                rules: collision[1].map((rule) => rule.name),
                priorities: collision[2].map((priority) => priority.repr()),
              }
            : null,
          lastThreeRuleNames,
          stdout,
        };
      } finally {
        setBidderLog(previous);
      }
    },
    rules(): readonly HarnessRuleInfo[] {
      return bidder.system.rules.map((rule) => ({
        name: rule.name,
        requiresPlanning: rule.requiresPlanning,
      }));
    },
  };
}
