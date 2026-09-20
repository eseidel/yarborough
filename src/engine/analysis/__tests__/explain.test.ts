// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// cspell:ignore Reponse
//
// `src/engine/analysis/explain.ts` against the Python it replaces.  Every
// case below was run through `python -m analysis.explain` with the same
// arguments and the answers compared line for line: the possible calls in
// their order, their rules and priorities, the maximal mark, the maximal
// line, the rule that claims the expected call, its meanings in order, and
// the fits / ok / NO verdicts, conjunct by conjunct.  The expressions
// themselves are the only difference, and only in spelling: the Python prints
// z3py's pretty form (`And(hearts >= 6)`), this prints Z3's s-expression
// (`(and (>= hearts 6))`), of the same term.

import { describe, expect, it } from "vitest";
import {
  explain,
  explanationLines,
  type ExplainRequest,
  run,
  USAGE,
} from "../explain";

/** A case, with what the Python answered for it. */
interface Case {
  request: ExplainRequest;
  /** `[mark, call, rule, priority]` per possible call, in the printed order. */
  possible: [boolean, string, string, string][];
  maximal: [string, string][];
  /** The rule that claims `--expected`, or null when none does. */
  rule?: string | null;
  /** Per meaning: the priority, whether it fits, and the conjunct verdicts. */
  meanings?: [string, boolean, boolean[]][];
}

const CASES: Record<string, Case> = {
  "an opening hand with six hearts": {
    request: { hand: "K73.A3.AJ7654.A9" },
    possible: [
      [
        false,
        "1C",
        "OneLevelSuitOpening",
        "MajorDiscovery/OneLevelSuitOpening[3, 0]",
      ],
      [
        false,
        "1C",
        "OneLevelSuitOpening",
        "MajorDiscovery/OneLevelSuitOpening[6, 0]",
      ],
      [
        true,
        "1H",
        "OneLevelSuitOpening",
        "MajorDiscovery/OneLevelSuitOpening[0, 0]",
      ],
      [
        false,
        "1H",
        "OneLevelSuitOpening",
        "MajorDiscovery/OneLevelSuitOpening[2, 0]",
      ],
      [false, "P", "DefaultPass", "Forced/DefaultPass[0, 0]/fallback1"],
    ],
    maximal: [["1H", "MajorDiscovery/OneLevelSuitOpening[0, 0]"]],
  },
  "the rebid the tool's docstring shows": {
    request: {
      hand: "K73.A3.AJ7654.A9",
      history: "1H P 2H P",
      expected: "3H",
    },
    possible: [
      [
        true,
        "3H",
        "UnforcedRebidOriginalSuitByOpener",
        "RebidLongMajorMinimum/UnforcedRebidOriginalSuitByOpener[0, 6]",
      ],
      [
        false,
        "3H",
        "UnforcedRebidOriginalSuitByOpener",
        "RebidSuit/UnforcedRebidOriginalSuitByOpener[0, 6]",
      ],
    ],
    maximal: [
      ["3H", "RebidLongMajorMinimum/UnforcedRebidOriginalSuitByOpener[0, 6]"],
    ],
    rule: "UnforcedRebidOriginalSuitByOpener",
    meanings: [
      [
        "RebidLongMajorMinimum/UnforcedRebidOriginalSuitByOpener[0, 6]",
        true,
        [true, true, true],
      ],
      ["RebidSuit/UnforcedRebidOriginalSuitByOpener[0, 6]", true, [true, true]],
    ],
  },
  "a response the balance requirement rules out": {
    request: { hand: "AK32.K5.QJT.9862", history: "1C P", expected: "2N" },
    possible: [
      [
        true,
        "1S",
        "OneLevelNewSuitResponse",
        "MajorDiscovery/OneLevelNewSuitResponse[5, 0]",
      ],
      [
        false,
        "2N",
        "NotrumpResponseToMinorOpen",
        "CharacterizeStrength/NotrumpResponseToMinorOpen[0, 0]",
      ],
    ],
    maximal: [["1S", "MajorDiscovery/OneLevelNewSuitResponse[5, 0]"]],
    rule: "NotrumpResponseToMinorOpen",
    meanings: [
      [
        "BalancedLimit/NotrumpResponseToMinorOpen[0, 0]",
        false,
        [true, true, false],
      ],
      [
        "CharacterizeStrength/NotrumpResponseToMinorOpen[0, 0]",
        true,
        [true, true],
      ],
    ],
  },
  "a quantitative slam try the hand is far too weak for": {
    request: { hand: "32.QJ4.K9876.QT5", history: "1N P", expected: "4N" },
    possible: [
      [true, "2D", "JacobyTransfer", "MajorDiscovery/JacobyTransfer[0, 0]"],
      [false, "2D", "JacobyTransfer", "MajorDiscovery/JacobyTransfer[3, 0]"],
      [
        false,
        "2N",
        "NotrumpGameInvitation",
        "CharacterizeStrength/NotrumpGameInvitation[0, 0]",
      ],
      [false, "2C", "TwoLevelStayman", "Miscellaneous/TwoLevelStayman[0, 0]"],
      [false, "P", "DefaultPass", "Forced/DefaultPass[0, 0]/fallback1"],
    ],
    maximal: [["2D", "MajorDiscovery/JacobyTransfer[0, 0]"]],
    rule: "QuantitativeFourNotrumpJump",
    meanings: [
      ["Slam/strain2/QuantitativeFourNotrumpJump[0, 0]", false, [false]],
    ],
  },
  "a redouble no rule can make": {
    request: { hand: "32.QJ4.K9876.QT5", history: "1N P", expected: "XX" },
    possible: [
      [true, "2D", "JacobyTransfer", "MajorDiscovery/JacobyTransfer[0, 0]"],
      [false, "2D", "JacobyTransfer", "MajorDiscovery/JacobyTransfer[3, 0]"],
      [
        false,
        "2N",
        "NotrumpGameInvitation",
        "CharacterizeStrength/NotrumpGameInvitation[0, 0]",
      ],
      [false, "2C", "TwoLevelStayman", "Miscellaneous/TwoLevelStayman[0, 0]"],
      [false, "P", "DefaultPass", "Forced/DefaultPass[0, 0]/fallback1"],
    ],
    maximal: [["2D", "MajorDiscovery/JacobyTransfer[0, 0]"]],
    rule: null,
    meanings: [],
  },
  "a grand slam no part of which fits": {
    request: { hand: "32.QJ4.K9876.QT5", history: "1N P", expected: "7S" },
    possible: [
      [true, "2D", "JacobyTransfer", "MajorDiscovery/JacobyTransfer[0, 0]"],
      [false, "2D", "JacobyTransfer", "MajorDiscovery/JacobyTransfer[3, 0]"],
      [
        false,
        "2N",
        "NotrumpGameInvitation",
        "CharacterizeStrength/NotrumpGameInvitation[0, 0]",
      ],
      [false, "2C", "TwoLevelStayman", "Miscellaneous/TwoLevelStayman[0, 0]"],
      [false, "P", "DefaultPass", "Forced/DefaultPass[0, 0]/fallback1"],
    ],
    maximal: [["2D", "MajorDiscovery/JacobyTransfer[0, 0]"]],
    rule: "NaturalSuited",
    meanings: [
      ["Slam/strain0/NaturalSuited[0, 0]/fallback1", false, [false, false]],
    ],
  },
  "a competitive auction, and a rebid for the wrong seat": {
    request: {
      hand: "AQJ63.KT2.A4.KQ9",
      history: "1S 2H X P",
      expected: "2S",
    },
    possible: [
      [
        true,
        "3H",
        "CuebidReponseToNegativeDouble",
        "GameForce/CuebidReponseToNegativeDouble[0, 5]",
      ],
      [
        false,
        "3C",
        "NewSuitResponseToNegativeDouble",
        "MinorDiscovery/NewSuitResponseToNegativeDouble[0, 6]",
      ],
      [
        false,
        "4C",
        "NaturalSuited",
        "MinorDiscovery/NaturalSuited[2, 9]/fallback1",
      ],
      [
        false,
        "3C",
        "NewSuitResponseToNegativeDouble",
        "MinorDiscoveryWithFour/NewSuitResponseToNegativeDouble[0, 6]",
      ],
      [
        false,
        "3N",
        "NaturalNotrump",
        "Game/strain1/NaturalNotrump[1, 2]/fallback1",
      ],
      [
        false,
        "3N",
        "NaturalNotrump",
        "Game/strain3/NaturalNotrump[1, 2]/fallback1",
      ],
      [
        false,
        "2N",
        "NotrumpResponseToNegativeDouble",
        "CharacterizeStrength/NotrumpResponseToNegativeDouble[0, 1]",
      ],
    ],
    maximal: [["3H", "GameForce/CuebidReponseToNegativeDouble[0, 5]"]],
    rule: "ForcedRebidOriginalSuitByOpener",
    meanings: [
      [
        "RebidLongMajorMinimum/ForcedRebidOriginalSuitByOpener[0, 3]",
        false,
        [false, true, false],
      ],
      [
        "CharacterizeStrength/ForcedRebidOriginalSuitByOpener[0, 3]",
        false,
        [false, true, false],
      ],
      ["Forced/ForcedRebidOriginalSuitByOpener[0, 3]", false, [false, true]],
    ],
  },
};

describe("explain, against python -m analysis.explain", () => {
  for (const [name, expected] of Object.entries(CASES)) {
    it(`explains ${name}`, () => {
      const report = explain(expected.request);
      expect(
        report.possible.map((entry) => [
          entry.maximal,
          entry.call,
          entry.rule,
          entry.priority,
        ]),
      ).toEqual(expected.possible);
      expect(
        report.maximal.map((entry) => [entry.call, entry.priority]),
      ).toEqual(expected.maximal);
      if (expected.meanings === undefined) {
        expect(report.expected).toBeNull();
        return;
      }
      expect(report.expected?.call).toBe(expected.request.expected);
      expect(report.expected?.rule).toBe(expected.rule);
      expect(
        report.expected?.meanings.map((meaning) => [
          meaning.priority,
          meaning.fits,
          meaning.conjuncts.map((conjunct) => conjunct.fits),
        ]),
      ).toEqual(expected.meanings);
      // Every conjunct is a printed term, never the empty string.
      for (const meaning of report.expected!.meanings) {
        for (const conjunct of meaning.conjuncts) {
          expect(conjunct.printed.length).toBeGreaterThan(0);
        }
      }
    });
  }
});

describe("the printed report", () => {
  it("lays out the columns as the Python's format strings do", () => {
    const lines = explanationLines(
      explain(CASES["the rebid the tool's docstring shows"].request),
    );
    expect(lines).toEqual([
      "possible calls:",
      "  * 3H  UnforcedRebidOriginalSuitByOpener        RebidLongMajorMinimum/UnforcedRebidOriginalSuitByOpener[0, 6]",
      "    3H  UnforcedRebidOriginalSuitByOpener        RebidSuit/UnforcedRebidOriginalSuitByOpener[0, 6]",
      "maximal: 3H (RebidLongMajorMinimum/UnforcedRebidOriginalSuitByOpener[0, 6])",
      "",
      "UnforcedRebidOriginalSuitByOpener for 3H:",
      "  RebidLongMajorMinimum/UnforcedRebidOriginalSuitByOpener[0, 6]: fits",
      "     ok  (<= points 18)",
      "     ok  (and (>= hearts 6))",
      "     ok  (and (>= hearts 6))",
      "  RebidSuit/UnforcedRebidOriginalSuitByOpener[0, 6]: fits",
      "     ok  (<= points 18)",
      "     ok  (and (>= hearts 6))",
    ]);
  });

  it("says when no rule claims the expected call", () => {
    const report = {
      possible: [],
      maximal: [],
      expected: { call: "7N", rule: null, meanings: [] },
    };
    expect(explanationLines(report)).toEqual([
      "possible calls:",
      "maximal: ",
      "",
      "no rule claims 7N",
    ]);
  });
});

describe("the command line", () => {
  it("prints the report and returns 0", () => {
    const lines: string[] = [];
    const code = run(["K73.A3.AJ7654.A9", "1H P 2H P", "--expected", "3H"], {
      log: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    expect(lines[0]).toBe("possible calls:");
    expect(lines).toContain("UnforcedRebidOriginalSuitByOpener for 3H:");
  });

  it("takes the hand alone, as the Python's empty history does", () => {
    const lines: string[] = [];
    expect(run(["K73.A3.AJ7654.A9"], { log: (line) => lines.push(line) })).toBe(
      0,
    );
    expect(lines).toContain(
      "maximal: 1H (MajorDiscovery/OneLevelSuitOpening[0, 0])",
    );
  });

  it("asks for a hand when there is none, and for --expected's value", () => {
    for (const argv of [[], ["--expected"], ["--expected", "3H"]]) {
      const lines: string[] = [];
      expect(run(argv, { log: (line) => lines.push(line) })).toBe(2);
      expect(lines).toEqual([USAGE]);
    }
  });
});
