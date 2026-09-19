// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// The phase 7 gate through the real kernel: the TypeScript harness, bidding
// every corpus hand with `createHarnessBidder()`, prints exactly what
// `python -m tests.harness` printed when the baselines were accepted.
// `baseline.test.ts` proves the same text with a recorded bidder; this file
// proves the bidder.
//
// The full corpus takes minutes, so the run is gated twice: it is skipped
// while phase 5 has not registered every rule (the output could not match),
// and otherwise runs only with YARBOROUGH_FULL_BASELINE=1 in the environment.
// `pnpm baseline:check` is the everyday way to run it; this test is the CI
// gate once the registry is complete.

import { describe, expect, it } from "vitest";
import baselineText from "../../../../python/tests/baselines/z3b_baseline.txt?raw";
import rulesBaselineText from "../../../../python/tests/baselines/z3b_rules_baseline.txt?raw";
import manifestText from "../../../../tests/engine-fixtures/rules-manifest.json?raw";
import { createHarnessBidder } from "../../z3b/harness-bidder";
import { StandardAmericanYellowCard } from "../../z3b/sayc";
import { runHarness } from "../harness";

const manifestSize = (JSON.parse(manifestText) as unknown[]).length;
const registryComplete =
  StandardAmericanYellowCard.rules.length === manifestSize;
const env = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env;
const requested = env?.YARBOROUGH_FULL_BASELINE === "1";

const reason = !registryComplete
  ? `skipped: ${StandardAmericanYellowCard.rules.length} of ${manifestSize} rules registered`
  : !requested
    ? "skipped: set YARBOROUGH_FULL_BASELINE=1 (or run pnpm baseline:check)"
    : "";

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
