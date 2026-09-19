// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// The tolerance rules of python/tests/check_baseline.py: a known miss that
// got fixed is accepted (with its rules line and the pass counts that move
// with it); anything else is a behavior change and must be reported.

import { describe, expect, it } from "vitest";
import {
  assertHarnessCompleted,
  compareOutput,
  compareRules,
  diffLines,
  HarnessDidNotComplete,
  compareRun,
  isClean,
  normalize,
  report,
  splitLines,
} from "../check_baseline";

/** A baseline shaped like the real one, small enough to reason about. */
const BASELINE = [
  "test_doubles:",
  "FAIL: 3S (expected 2S) for A874.AK96.8.AK84 (hcp: 18 lp: 18 sp: 21), history: 1H X P 2S P",
  "FAIL: 2S (expected 4S) for Q86.J32.K7.AQT65 (hcp: 12 lp: 13 sp: 13), history: 1D X P",
  "Pass 2 of 4 hands",
  "",
  "test_preemption:",
  "Pass 3 of 3 hands",
  "",
  "Pass 5 (71.4%) of 7 total hands",
  "Collisions 0 (the bidder's choice was not ordered; 0 with a pass or double), no call 0, dropped calls 0",
  "",
  "Tested call generation of 2 rules of 2 total (excluding 0 requires_planning rules).",
  "",
  "Tested interpretation of 1 rules of 2 total.",
  "",
].join("\n");

const RULES_BASELINE = [
  "A874.AK96.8.AK84-N:NO:1H,X,P,2S,P\t3S\tSomeRaise\tNone,DefaultPass,Raise",
  "Q86.J32.K7.AQT65-N:NO:1D,X,P\t2S\tOneLevelSuitOpening\tNone,None,TakeoutDouble",
  "T9.AJ2.T652.T973-N:NO:2N,P\t3C\tThreeLevelStayman\tNone,NotrumpOpen,DefaultPass",
].join("\n");

describe("splitLines", () => {
  it("drops the trailing empty line the way Python's splitlines does", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\nb")).toEqual(["a", "b"]);
    expect(splitLines("")).toEqual([]);
    expect(splitLines("\n")).toEqual([""]);
  });
});

describe("normalize", () => {
  it("strips trailing whitespace from every line", () => {
    expect(normalize("Pass 3 of 3 hands   \n")).toEqual(["Pass 3 of 3 hands"]);
  });

  it("strips trailing dots from FAIL lines only", () => {
    expect(normalize("FAIL: P (expected X) for A.B.C.D...\n")).toEqual([
      "FAIL: P (expected X) for A.B.C.D",
    ]);
    expect(normalize("Never selected call from:.\n")).toEqual([
      "Never selected call from:.",
    ]);
  });
});

describe("diffLines", () => {
  it("is empty for equal inputs", () => {
    expect(diffLines(["a", "b"], ["a", "b"])).toEqual([]);
  });

  it("reports the removals of a block before its additions", () => {
    expect(diffLines(["a", "b", "c"], ["a", "x", "c"])).toEqual(["-b", "+x"]);
  });

  it("reports pure insertions and deletions", () => {
    expect(diffLines(["a", "c"], ["a", "b", "c"])).toEqual(["+b"]);
    expect(diffLines(["a", "b", "c"], ["a", "c"])).toEqual(["-b"]);
  });
});

describe("compareOutput", () => {
  it("accepts an unchanged run", () => {
    const lines = normalize(BASELINE);
    expect(compareOutput(lines, lines)).toEqual({ fixed: [], problems: [] });
  });

  it("accepts a fixed miss and the pass counts that move with it", () => {
    const actual = normalize(BASELINE)
      .filter((line) => !line.startsWith("FAIL: 2S (expected 4S)"))
      .map((line) =>
        line === "Pass 2 of 4 hands"
          ? "Pass 3 of 4 hands"
          : line === "Pass 5 (71.4%) of 7 total hands"
            ? "Pass 6 (85.7%) of 7 total hands"
            : line,
      );
    const { fixed, problems } = compareOutput(normalize(BASELINE), actual);
    expect(problems).toEqual([]);
    expect(fixed).toEqual([
      "FAIL: 2S (expected 4S) for Q86.J32.K7.AQT65 (hcp: 12 lp: 13 sp: 13), history: 1D X P",
    ]);
  });

  it("reports a new failure", () => {
    const actual = normalize(BASELINE).flatMap((line) =>
      line === "Pass 3 of 3 hands"
        ? [
            "FAIL: P (expected 3C) for T9.AJ2.T652.T973 (hcp: 4 lp: 4 sp: 5), history: 2N P",
            "Pass 2 of 3 hands",
          ]
        : [line],
    );
    const { fixed, problems } = compareOutput(normalize(BASELINE), actual);
    expect(fixed).toEqual([]);
    expect(problems).toEqual([
      "+FAIL: P (expected 3C) for T9.AJ2.T652.T973 (hcp: 4 lp: 4 sp: 5), history: 2N P",
    ]);
  });

  it("reports a changed coverage line", () => {
    const actual = normalize(BASELINE).map((line) =>
      line.startsWith("Tested interpretation")
        ? "Tested interpretation of 2 rules of 2 total."
        : line,
    );
    const { problems } = compareOutput(normalize(BASELINE), actual);
    expect(problems).toEqual([
      "-Tested interpretation of 1 rules of 2 total.",
      "+Tested interpretation of 2 rules of 2 total.",
    ]);
  });

  it("reports changed hand counts even though pass counts are tolerated", () => {
    const actual = normalize(BASELINE).map((line) =>
      line === "Pass 3 of 3 hands" ? "Pass 4 of 4 hands" : line,
    );
    const { fixed, problems } = compareOutput(normalize(BASELINE), actual);
    expect(fixed).toEqual([]);
    expect(problems).toEqual([
      "hand counts changed: ['4', '3', '7'] -> ['4', '4', '7']",
    ]);
  });
});

describe("compareRules", () => {
  const fixedLine =
    "FAIL: 2S (expected 4S) for Q86.J32.K7.AQT65 (hcp: 12 lp: 13 sp: 13), history: 1D X P";

  it("is empty for an unchanged dump", () => {
    expect(compareRules([], RULES_BASELINE, RULES_BASELINE)).toEqual([]);
  });

  it("accepts the rules line of a hand whose miss was fixed", () => {
    const actual = RULES_BASELINE.replace(
      "Q86.J32.K7.AQT65-N:NO:1D,X,P\t2S\tOneLevelSuitOpening",
      "Q86.J32.K7.AQT65-N:NO:1D,X,P\t4S\tJumpRaise",
    );
    expect(compareRules([fixedLine], RULES_BASELINE, actual)).toEqual([]);
  });

  it("still reports a changed rule for another hand", () => {
    const actual = RULES_BASELINE.replace(
      "T9.AJ2.T652.T973-N:NO:2N,P\t3C\tThreeLevelStayman",
      "T9.AJ2.T652.T973-N:NO:2N,P\t3C\tGarbageStayman",
    );
    expect(compareRules([fixedLine], RULES_BASELINE, actual)).toEqual([
      "-T9.AJ2.T652.T973-N:NO:2N,P\t3C\tThreeLevelStayman\tNone,NotrumpOpen,DefaultPass",
      "+T9.AJ2.T652.T973-N:NO:2N,P\t3C\tGarbageStayman\tNone,NotrumpOpen,DefaultPass",
    ]);
  });

  it("reports a fixed hand's line when the new call is not the expected one", () => {
    const actual = RULES_BASELINE.replace(
      "Q86.J32.K7.AQT65-N:NO:1D,X,P\t2S\tOneLevelSuitOpening",
      "Q86.J32.K7.AQT65-N:NO:1D,X,P\t3S\tJumpRaise",
    );
    expect(compareRules([fixedLine], RULES_BASELINE, actual)).toEqual([
      "+Q86.J32.K7.AQT65-N:NO:1D,X,P\t3S\tJumpRaise\tNone,None,TakeoutDouble",
    ]);
  });

  it("reports a changed interpretation column with the same call and rule", () => {
    const actual = RULES_BASELINE.replace(
      "\tNone,None,TakeoutDouble",
      "\tNone,None,NegativeDouble",
    );
    expect(compareRules([], RULES_BASELINE, actual)).toHaveLength(2);
  });
});

describe("assertHarnessCompleted", () => {
  it("accepts a run with a total line and no ERROR", () => {
    expect(() => assertHarnessCompleted(BASELINE)).not.toThrow();
  });

  it("rejects a run with no total line", () => {
    expect(() => assertHarnessCompleted("test_doubles:\n")).toThrow(
      HarnessDidNotComplete,
    );
  });

  it("rejects a run in which a hand raised", () => {
    const text = `ERROR: exception bidding x\n${BASELINE}`;
    expect(() => assertHarnessCompleted(text)).toThrow(/1 hands raised/);
  });
});

describe("compareRun and report", () => {
  it("reports an unchanged run as ok", () => {
    const comparison = compareRun(
      `${BASELINE}\n`,
      `${RULES_BASELINE}\n`,
      `${BASELINE}\n`,
      `${RULES_BASELINE}\n`,
    );
    expect(isClean(comparison)).toBe(true);
    expect(comparison.totalLine).toBe("Pass 5 (71.4%) of 7 total hands");
    expect(report(comparison)).toBe(
      "Pass 5 (71.4%) of 7 total hands\nbaseline ok (0 fixed misses)",
    );
  });

  it("reports a mismatch with its counts", () => {
    const changed = BASELINE.replace(
      "Tested interpretation of 1 rules",
      "Tested interpretation of 2 rules",
    );
    const changedRules = RULES_BASELINE.replace("SomeRaise", "OtherRaise");
    const comparison = compareRun(
      `${changed}\n`,
      `${changedRules}\n`,
      `${BASELINE}\n`,
      `${RULES_BASELINE}\n`,
    );
    expect(isClean(comparison)).toBe(false);
    expect(report(comparison)).toContain(
      "BASELINE MISMATCH: 2 output lines, 2 rule lines",
    );
  });
});
