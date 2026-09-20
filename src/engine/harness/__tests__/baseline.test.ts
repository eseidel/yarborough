// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// The phase 7 gate, run early against a recorded bidder: the TypeScript
// harness must print exactly what `python -m tests.harness` printed when the
// baselines were accepted.  The fixture bidder replays the decisions the
// Python bidder made, so any difference here is the harness's own text.

import { describe, expect, it } from "vitest";
import baselineText from "../../../../tests/baselines/z3b_baseline.txt?raw";
import rulesBaselineText from "../../../../tests/baselines/z3b_rules_baseline.txt?raw";
import { runHarness } from "../harness";
import { FixtureBidder } from "./fixture-bidder";

describe("the TypeScript harness against the accepted Python baselines", () => {
  const run = runHarness(new FixtureBidder());

  it("prints the harness output byte for byte", () => {
    expect(run.stdout).toBe(baselineText);
  });

  it("writes the rules dump byte for byte", () => {
    expect(run.rulesDump).toBe(rulesBaselineText);
  });

  it("bids every hand without an exception", () => {
    expect(run.errors).toEqual([]);
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toBe("");
  });
});
