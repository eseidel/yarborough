import { describe, expect, it } from "vitest";
import {
  alternativesText,
  missPointRules,
  missReasons,
  saycBidReasons,
  weighedCall,
  yourCallReasons,
  yourCallText,
} from "../hand-reasons";
import {
  type Call,
  type HandAnalysis,
  type HandCallAnalysis,
  handFromCdhsString,
} from "../../bridge/types";

const bid = (level: number, strain: "C" | "D" | "H" | "S" | "N"): Call => ({
  type: "bid",
  level,
  strain,
});
const PASS: Call = { type: "pass" };

// ♠KJ74 ♥Q853 ♦A52 ♣K6: thirteen points and four hearts, over partner's 1♥.
const HAND = handFromCdhsString("K6.A52.Q853.KJ74")!;

const weighed = (
  call: Call,
  fit: HandCallAnalysis["fit"],
  extra: Partial<HandCallAnalysis> = {},
): HandCallAnalysis => ({ call, fit, misses: [], ...extra });

// Over 1♥: SAYC jumps to 3♥, 1♠ also fits, 2♥ misses on points.
const ANALYSIS: HandAnalysis = {
  call: bid(3, "H"),
  calls: [
    weighed(PASS, "unfit", {
      misses: [
        { kind: "points", min: 0, max: 5, actual: 13, withShape: false },
      ],
    }),
    weighed(bid(1, "S"), "possible", {
      preference: {
        kind: "purpose",
        over: bid(3, "H"),
        purpose: "MajorDiscovery",
        overPurpose: "SupportMajors",
      },
    }),
    weighed(bid(1, "N"), "possible"),
    weighed(bid(2, "H"), "unfit", {
      misses: [
        { kind: "points", min: 6, max: 10, actual: 13, withShape: false },
      ],
    }),
    weighed(bid(3, "H"), "chosen"),
    weighed(bid(4, "N"), "planned"),
    weighed(bid(7, "N"), "no_rule"),
  ],
};

describe("where the user's call stands with their hand", () => {
  it("finds a call's analysis", () => {
    expect(weighedCall(ANALYSIS, bid(2, "H"))?.fit).toBe("unfit");
    expect(weighedCall(ANALYSIS, bid(5, "C"))).toBeNull();
    expect(weighedCall(null, bid(2, "H"))).toBeNull();
  });

  it("says what a call misses, or why SAYC ranked it lower", () => {
    expect(yourCallText(weighedCall(ANALYSIS, bid(2, "H"))!)).toBe(
      "2♥ doesn't fit your hand. Needs 6–10 hcp, you have 13.",
    );
    expect(yourCallText(weighedCall(ANALYSIS, bid(1, "S"))!)).toBe(
      "1♠ fits your hand too. SAYC prefers 3♥: raising partner's major comes before showing a suit you may fit.",
    );
    expect(yourCallText(weighedCall(ANALYSIS, bid(1, "N"))!)).toBe(
      "1NT fits your hand too.",
    );
    expect(yourCallText(weighedCall(ANALYSIS, bid(3, "H"))!)).toBe(
      "3♥ is SAYC's call with your hand.",
    );
    expect(yourCallText(weighedCall(ANALYSIS, bid(4, "N"))!)).toBe(
      "SAYC bids 4NT here only as part of a plan, such as a slam try.",
    );
    expect(yourCallText(weighedCall(ANALYSIS, bid(7, "N"))!)).toBe(
      "SAYC has no rule for 7NT here.",
    );
    expect(yourCallText(weighed(bid(2, "H"), "unfit"))).toBe(
      "2♥ doesn't fit your hand.",
    );
  });
});

describe("the reasons Practice shows", () => {
  it("explains a miss: SAYC's numbers, then the user's call", () => {
    expect(missReasons(HAND, bid(2, "H"), bid(3, "H"), ANALYSIS)).toEqual([
      "You have 13 hcp and 4 ♥.",
      "2♥ doesn't fit your hand. Needs 6–10 hcp, you have 13.",
    ]);
  });

  it("still gives SAYC's numbers when the engine could not weigh the hand", () => {
    expect(missReasons(HAND, bid(2, "H"), bid(3, "H"), null)).toEqual([
      "You have 13 hcp and 4 ♥.",
    ]);
  });

  it("explains SAYC's call in full, with each call it ranked lower", () => {
    expect(saycBidReasons(HAND, bid(3, "H"), ANALYSIS)).toEqual([
      "You have 13 hcp and 4 ♥.",
      "Why not 1♠? SAYC prefers 3♥: raising partner's major comes before showing a suit you may fit.",
      "1NT fits your hand too.",
    ]);
    expect(alternativesText(ANALYSIS, 1)).toHaveLength(1);
  });

  it("leaves a call the auction merely allows out of the alternatives", () => {
    const forcedPass = weighed(PASS, "possible", {
      preference: {
        kind: "purpose",
        over: bid(1, "S"),
        purpose: "Forced",
        overPurpose: "MajorDiscovery",
      },
    });
    expect(
      alternativesText({ calls: [forcedPass, weighed(bid(1, "S"), "chosen")] }),
    ).toEqual([]);
    // Where the user passed, it is still why SAYC bid on.
    expect(yourCallText(forcedPass)).toBe(
      "Pass fits your hand too. SAYC prefers 1♠. Pass is for a hand with nothing better to say.",
    );
  });

  it("explains one of the user's calls in the auction", () => {
    expect(yourCallReasons(HAND, bid(3, "H"), ANALYSIS)).toEqual([
      "3♥ is SAYC's call with your hand. You have 13 hcp and 4 ♥.",
    ]);
    expect(yourCallReasons(HAND, bid(2, "H"), ANALYSIS)).toEqual([
      "2♥ doesn't fit your hand. Needs 6–10 hcp, you have 13.",
    ]);
    expect(yourCallReasons(HAND, bid(2, "H"), null)).toEqual([]);
  });
});

describe("a point rule on the miss card", () => {
  // ♠Q5432 ♥AJ ♦K32 ♣J32: 11 + 5 + 3 = 19, a point short of opening.
  const SHORT = handFromCdhsString("J32.K32.AJ.Q5432")!;
  const SHORT_ANALYSIS: HandAnalysis = {
    call: PASS,
    calls: [
      weighed(PASS, "chosen"),
      weighed(bid(1, "S"), "unfit", {
        misses: [
          { kind: "points", min: 12, max: 35, actual: 11, withShape: true },
        ],
        pointRule: "rule_of_20",
      }),
    ],
  };

  it("counts out the rule the user's call falls short of", () => {
    expect(missReasons(SHORT, bid(1, "S"), PASS, SHORT_ANALYSIS)).toEqual([
      "You have 11 hcp.",
      "1♠ doesn't fit your hand. With this shape, needs 12–35 hcp, you have 11.",
      "Rule of 20: 11 hcp + 5 ♠ + 3 ♦ = 19, short of 20.",
    ]);
    expect(missPointRules(bid(1, "S"), PASS, SHORT_ANALYSIS)).toEqual([
      "rule_of_20",
    ]);
  });

  it("counts out the rule that made SAYC's call an opening", () => {
    // ♠AK432 ♥QJ432 ♦4 ♣32: 10 + 5 + 5 = 20.
    const light = handFromCdhsString("32.4.QJ432.AK432")!;
    const analysis: HandAnalysis = {
      call: bid(1, "S"),
      calls: [
        weighed(PASS, "possible"),
        weighed(bid(1, "S"), "chosen", { pointRule: "rule_of_20" }),
      ],
    };
    expect(missReasons(light, PASS, bid(1, "S"), analysis)).toEqual([
      "You have 10 hcp and 5 ♠.",
      "Rule of 20: 10 hcp + 5 ♠ + 5 ♥ = 20, enough to open.",
      "Pass fits your hand too.",
    ]);
    expect(missPointRules(PASS, bid(1, "S"), analysis)).toEqual(["rule_of_20"]);
  });

  it("names no rule when none decided either call", () => {
    expect(missPointRules(bid(2, "H"), bid(3, "H"), ANALYSIS)).toEqual([]);
    expect(missPointRules(bid(2, "H"), bid(3, "H"), null)).toEqual([]);
  });
});
