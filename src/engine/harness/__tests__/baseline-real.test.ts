// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// The regression gate of the engine: the TypeScript harness, bidding every
// corpus hand with `createHarnessBidder()`, prints exactly what
// `python -m tests.harness` printed when the baselines were accepted.
//
// The full corpus takes minutes, so the run is gated: it runs only with
// YARBOROUGH_FULL_BASELINE=1 in the environment.  `pnpm baseline:check` is
// the everyday way to run it (and what CI runs); this test is the same run
// inside Vitest.

import { describe, expect, it } from "vitest";
import baselineText from "../../../../tests/baselines/z3b_baseline.txt?raw";
import rulesBaselineText from "../../../../tests/baselines/z3b_rules_baseline.txt?raw";
import { createHarnessBidder } from "../../z3b/harness-bidder";
import { runHarness } from "../harness";

const env = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env;

const reason =
  env?.YARBOROUGH_FULL_BASELINE === "1"
    ? ""
    : "skipped: set YARBOROUGH_FULL_BASELINE=1 (or run pnpm baseline:check)";

describe.skipIf(reason !== "")(
  `the real bidder against the accepted Python baselines${reason && ` (${reason})`}`,
  () => {
    it(
      "prints the harness output and the rules dump byte for byte",
      { timeout: 1_800_000 },
      () => {
        const started = performance.now();
        const run = runHarness(createHarnessBidder());
        console.log(
          `baseline-real: the corpus in ${((performance.now() - started) / 1000).toFixed(1)} s`,
        );
        expect(run.errors).toEqual([]);
        expect(run.stderr).toBe("");
        expect(run.stdout).toBe(baselineText);
        expect(run.rulesDump).toBe(rulesBaselineText);
        expect(run.exitCode).toBe(0);
      },
    );
  },
);
