// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// The harness's own text, on corpora small enough to read.  Every expected
// string here was produced by `python -m tests.harness` with the same stub
// bidder, so this file pins the port against the original and not against
// itself.  `baseline.test.ts` does the same over the whole corpus.

import { describe, expect, it } from "vitest";
import { Call } from "../../core/call";
import { CallHistory } from "../../core/callhistory";
import { Hand } from "../../core/hand";
import type {
  HarnessBidder,
  HarnessRuleInfo,
  HarnessSelection,
} from "../harness";
import {
  CompiledTest,
  expectationLine,
  runHarness,
  TestGroup,
} from "../harness";
import type { SaycExpectation } from "../sayc_data";
import { saycExpectations } from "../sayc_data";

const RULES: HarnessRuleInfo[] = [
  { name: "NotrumpOpen", requiresPlanning: false },
  { name: "Stayman", requiresPlanning: false },
  { name: "NotrumpGame", requiresPlanning: false },
  { name: "PlannedSlam", requiresPlanning: true },
  { name: "NeverUsed", requiresPlanning: false },
];

/** The same decisions the Python stub bidder made. */
class StubBidder implements HarnessBidder {
  findCallFor(hand: Hand, callHistory: CallHistory): HarnessSelection | null {
    const key = `${hand.cdhsDotString()}|${callHistory.callsString()}`;
    switch (key) {
      case "KQ4.AQ8.K9873.K2|":
        return {
          call: Call.fromString("1N"),
          ruleName: "NotrumpOpen",
          lastThreeRuleNames: [null, null, null],
        };
      case "97.KJ2.AT3.AKQ95|":
        return {
          call: Call.fromString("1N"),
          ruleName: "NotrumpOpen",
          lastThreeRuleNames: [null, null, null],
        };
      case "T9.AJ72.K65.Q732|1N P 2C P 2D P":
        return {
          call: Call.fromString("3N"),
          ruleName: "NotrumpGame",
          lastThreeRuleNames: ["Stayman", "NotrumpOpen", "Stayman"],
        };
      case "T9.AJ72.K65.Q732|1N P":
        return {
          call: Call.fromString("2C"),
          ruleName: "Stayman",
          lastThreeRuleNames: [null, "NotrumpOpen", "Stayman"],
          collision: {
            calls: ["2C", "P"],
            rules: ["Stayman", "NotrumpOpen"],
            priorities: ["a", "b"],
          },
        };
      case "9.8753.7652.8732|1N P 2C P 2D P":
        return null;
      case "9.8753.7652.8732|1N P":
        return {
          call: Call.fromString("P"),
          ruleName: "NotrumpOpen",
          lastThreeRuleNames: [null, "NotrumpOpen", "Stayman"],
        };
      case "KQ4.AQ8.AK873.K2|":
        return {
          call: Call.fromString("2N"),
          ruleName: "NotrumpOpen",
          lastThreeRuleNames: [null, null, null],
          stdout: "Multiple rules have maximal category\n",
        };
      default:
        throw new Error(`unexpected ${key}`);
    }
  }

  rules(): HarnessRuleInfo[] {
    return RULES;
  }
}

const STUB_EXPECTATIONS: Record<string, readonly SaycExpectation[]> = {
  test_b_group: [
    ["KQ4.AQ8.K9873.K2", "1N"],
    ["97.KJ2.AT3.AKQ95", "2N"],
    // An explicit duplicate of the first line: it must be run once.
    ["KQ4.AQ8.K9873.K2", "1N"],
  ],
  test_a_group: [
    ["T9.AJ72.K65.Q732", "3N", "1N P 2C P 2D P"],
    ["9.8753.7652.8732", "P", "1N P 2C P 2D P"],
    ["KQ4.AQ8.AK873.K2", "2N", "", "N-S"],
  ],
};

/** `python -m tests.harness` with the stub bidder, verbatim. */
const STUB_OUTPUT = `test_a_group:
COLLISION: calls ['2C', 'P'] rules ['Stayman', 'NotrumpOpen'] priorities ['a', 'b'] for T9.AJ72.K65.Q732 (hcp: 10 lp: 10 sp: 11), history: 1N P (subtest of 1N P 2C P 2D P)
FAIL: None (expected P) for 9.8753.7652.8732 (hcp: 0 lp: 0 sp: 3), history: 1N P 2C P 2D P
FAIL: P (expected 2C) for 9.8753.7652.8732 (hcp: 0 lp: 0 sp: 3), history: 1N P (subtest of 1N P 2C P 2D P)
Multiple rules have maximal category
Pass 3 of 5 hands

test_b_group:
FAIL: 1N (expected 2N) for 97.KJ2.AT3.AKQ95 (hcp: 17 lp: 18 sp: 18), history:${" "}
Pass 1 of 2 hands

Pass 4 (57.1%) of 7 total hands
Collisions 1 (the bidder's choice was not ordered; 1 with a pass or double), no call 1, dropped calls 1

Tested call generation of 3 rules of 4 total (excluding 1 requires_planning rules).
Never selected call from:
NeverUsed

Tested interpretation of 3 rules of 5 total.

1 rules were never used for either bidding or interpretation:
NeverUsed
`;

/** `python -m tests.harness --dump` with the stub bidder, verbatim. */
const STUB_RULES_DUMP = `9.8753.7652.8732-N:NO:1N,P\tP\tNotrumpOpen\tNone,NotrumpOpen,Stayman
9.8753.7652.8732-N:NO:1N,P,2C,P,2D,P\tNone\tNone\t-
97.KJ2.AT3.AKQ95-N:NO:\t1N\tNotrumpOpen\tNone,None,None
KQ4.AQ8.AK873.K2-N:NS:\t2N\tNotrumpOpen\tNone,None,None
KQ4.AQ8.K9873.K2-N:NO:\t1N\tNotrumpOpen\tNone,None,None
T9.AJ72.K65.Q732-N:NO:1N,P\t2C\tStayman\tNone,NotrumpOpen,Stayman
T9.AJ72.K65.Q732-N:NO:1N,P,2C,P,2D,P\t3N\tNotrumpGame\tStayman,NotrumpOpen,Stayman
`;

describe("expectationLine", () => {
  const hand = Hand.fromCdhsString("KQ4.AQ8.K9873.K2");

  it("leaves the vulnerability out when it is None", () => {
    expect(
      expectationLine(
        hand,
        CallHistory.fromString("1N P"),
        Call.fromString("2C"),
      ),
    ).toBe("['KQ4.AQ8.K9873.K2', '2C', '1N P'],");
  });

  it("includes a vulnerability that is not None", () => {
    expect(
      expectationLine(
        hand,
        CallHistory.fromString("1N P", null, "N-S"),
        Call.fromString("2C"),
      ),
    ).toBe("['KQ4.AQ8.K9873.K2', '2C', '1N P', 'N-S'],");
  });

  it("writes a question mark when the call is unknown", () => {
    expect(expectationLine(hand, CallHistory.fromString(""))).toBe(
      "['KQ4.AQ8.K9873.K2', '?', ''],",
    );
  });
});

describe("CompiledTest", () => {
  const group = new TestGroup("test_group");

  it("identifies a test by hand, dealer, vulnerability and calls", () => {
    const test = CompiledTest.fromExpectationTupleInGroup(
      ["T9.AJ72.K65.Q732", "3N", "1N P 2C P 2D P"],
      group,
    );
    expect(test.identifier).toBe("T9.AJ72.K65.Q732-N:NO:1N,P,2C,P,2D,P");
    expect(test.testString).toBe(
      "T9.AJ72.K65.Q732 (hcp: 10 lp: 10 sp: 11), history: 1N P 2C P 2D P",
    );
  });

  it("rejects a hand that is not C.D.H.S", () => {
    expect(() =>
      CompiledTest.fromExpectationTupleInGroup(["nonsense", "P"], group),
    ).toThrow(/C\.D\.H\.S formatted hands/);
  });

  it("peels one subtest off every four calls, naming its parent", () => {
    const test = CompiledTest.fromExpectationTupleInGroup(
      ["T9.AJ72.K65.Q732", "3N", "1N P 2C P 2D P"],
      group,
    );
    const subtests = test.subtests;
    expect(
      subtests.map((subtest) => subtest.callHistory.callsString()),
    ).toEqual(["1N P"]);
    expect(subtests[0].expectedCall.name).toBe("2C");
    expect(subtests[0].subtestString).toBe(" (subtest of 1N P 2C P 2D P)");
  });

  it("peels every four calls off a longer auction", () => {
    const test = CompiledTest.fromExpectationTupleInGroup(
      ["T9.AJ72.K65.Q732", "4S", "1N P 2C P 2S P P P"],
      group,
    );
    expect(test.subtests.map((subtest) => subtest.expectedCall.name)).toEqual([
      "2S",
      "1N",
    ]);
    expect(
      test.subtests.map((subtest) => subtest.callHistory.callsString()),
    ).toEqual(["1N P 2C P", ""]);
  });
});

describe("TestGroup", () => {
  it("runs an explicit duplicate only once", () => {
    const group = new TestGroup("test_group");
    group.addExpectationLines([
      ["KQ4.AQ8.K9873.K2", "1N"],
      ["KQ4.AQ8.K9873.K2", "1N"],
    ]);
    expect(group.tests).toHaveLength(1);
  });

  it("keeps a subtest that is not already covered, and drops one that is", () => {
    const group = new TestGroup("test_group");
    group.addExpectationLines([
      ["T9.AJ72.K65.Q732", "3N", "1N P 2C P 2D P"],
      ["T9.AJ72.K65.Q732", "2C", "1N P"],
    ]);
    // The second line is the first one's subtest, already added.
    expect(group.tests.map((test) => test.callHistory.callsString())).toEqual([
      "1N P 2C P 2D P",
      "1N P",
    ]);
  });

  it("logs conflicting expectations for one identifier", () => {
    const run = runHarness(new StubBidder(), {
      expectations: {
        probe: [
          ["KQ4.AQ8.K9873.K2", "1N"],
          ["KQ4.AQ8.K9873.K2", "1C"],
        ],
      },
    });
    expect(run.stdout.split("\n")[0]).toBe(
      "ERROR   : Conflicting expectations for KQ4.AQ8.K9873.K2-N:NO:, 1N != 1C",
    );
    // Only the first expectation ran.
    expect(run.stdout).toContain("Pass 1 of 1 hands");
  });
});

describe("runHarness", () => {
  const run = runHarness(new StubBidder(), {
    expectations: STUB_EXPECTATIONS,
  });

  it("prints what the Python harness prints", () => {
    expect(run.stdout).toBe(STUB_OUTPUT);
  });

  it("dumps the rules sorted by identifier", () => {
    expect(run.rulesDump).toBe(STUB_RULES_DUMP);
  });

  it("succeeds when no hand raised", () => {
    expect(run.errors).toEqual([]);
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toBe("");
  });

  it("prints the groups in sorted order whatever the corpus order", () => {
    expect(run.stdout.indexOf("test_a_group:")).toBeLessThan(
      run.stdout.indexOf("test_b_group:"),
    );
  });

  it("is unaffected by the shard size", () => {
    for (const shardSize of [1, 2, 3, 100]) {
      const sharded = runHarness(new StubBidder(), {
        expectations: STUB_EXPECTATIONS,
        shardSize,
      });
      expect(sharded.stdout).toBe(STUB_OUTPUT);
      expect(sharded.rulesDump).toBe(STUB_RULES_DUMP);
    }
  });
});

describe("a bidder that raises", () => {
  class BrokenBidder implements HarnessBidder {
    findCallFor(): HarnessSelection {
      throw new Error("probe");
    }

    rules(): HarnessRuleInfo[] {
      return [];
    }
  }

  const run = runHarness(new BrokenBidder(), {
    expectations: { probe: [["KQ4.AQ8.K9873.K2", "1N"]] },
  });

  it("fails the run instead of hanging it", () => {
    expect(run.exitCode).toBe(1);
    expect(run.errors).toHaveLength(1);
    expect(run.stderr).toBe(
      "1 hands raised an exception (a broken rule, not a wrong bid)\n",
    );
  });

  it("names the hand in the group summary and again at the end", () => {
    expect(run.stdout).toContain(
      "ERROR: exception bidding KQ4.AQ8.K9873.K2 (hcp: 17 lp: 18 sp: 18), history:  (see end of run)",
    );
    expect(run.stdout).toContain("Pass 0 of 1 hands");
    expect(run.stdout).toContain("Pass 0 (0.0%) of 1 total hands");
    expect(run.stdout).toContain("Error: probe");
  });

  it("still prints a coverage summary for an empty rule set", () => {
    expect(run.stdout).toContain(
      "Tested call generation of 0 rules of 0 total (excluding 0 requires_planning rules).",
    );
    expect(run.stdout).toContain(
      "Tested interpretation of 0 rules of 0 total.",
    );
    expect(run.stdout).not.toContain("never used for either bidding");
  });
});

describe("a bidder with no rules to report", () => {
  it("says so instead of crashing", () => {
    class NoRules implements HarnessBidder {
      findCallFor(): HarnessSelection | null {
        return null;
      }

      rules(): HarnessRuleInfo[] | null {
        throw new Error("no system");
      }
    }
    const run = runHarness(new NoRules(), {
      expectations: { probe: [["KQ4.AQ8.K9873.K2", "1N"]] },
    });
    expect(run.stdout).toContain(
      "Ignoring coverage summary, failed to find rules.",
    );
  });
});

describe("the corpus", () => {
  it("has the groups and expectations of python/tests/test_sayc_data.py", () => {
    expect(Object.keys(saycExpectations)).toHaveLength(47);
    expect(
      Object.values(saycExpectations).reduce(
        (total, group) => total + group.length,
        0,
      ),
    ).toBe(956);
  });

  it("keeps the group order of the Python corpus", () => {
    const names = Object.keys(saycExpectations);
    expect(names[0]).toBe("test_open_one_nt");
    expect(names.slice(-3)).toEqual([
      "test_balancing_cappelletti",
      "test_passout_double_after_notrump_auction",
      "test_sayc_gaps",
    ]);
  });
});
