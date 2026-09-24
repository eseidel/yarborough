import { describe, expect, it } from "vitest";
import {
  parseCallInterpretation,
  parseCallInterpretations,
  parseCallName,
  parseHandAnalysis,
  parseOpeningLead,
  parseStringResult,
} from "../engine-results";

describe("parseCallName", () => {
  it("parses every call representation returned by z3b", () => {
    expect(parseCallName("P")).toEqual({ type: "pass" });
    expect(parseCallName("X")).toEqual({ type: "double" });
    expect(parseCallName("XX")).toEqual({ type: "redouble" });
    expect(parseCallName("7N")).toEqual({
      type: "bid",
      level: 7,
      strain: "N",
    });
  });

  it("rejects malformed call representations", () => {
    expect(() => parseCallName("8C")).toThrow("invalid call");
    expect(() => parseCallName("1T")).toThrow("invalid call");
    expect(() => parseCallName(null)).toThrow("non-string call");
  });
});

describe("parseCallInterpretation", () => {
  it("converts z3b's JSON shape into the frontend type", () => {
    expect(
      parseCallInterpretation({
        call_name: "1N",
        rule_name: "Notrump Opening",
        description: "15-17 HCP",
        knowledge_string: "15-17 hcp, 2-5C 2-5D 2-5H 2-5S NotrumpSystemsOn",
      }),
    ).toEqual({
      call: { type: "bid", level: 1, strain: "N" },
      ruleName: "Notrump Opening",
      description: "15-17 HCP",
      constraints: "15-17 hcp, 2-5C 2-5D 2-5H 2-5S NotrumpSystemsOn",
    });
  });

  it("carries the engine's three-level category when present", () => {
    expect(
      parseCallInterpretation({
        call_name: "2D",
        rule_name: "Jacoby Transfer To Hearts",
        category: [
          "Responding to an opening",
          "To 1NT",
          "Jacoby Transfer To Hearts",
        ],
      }).category,
    ).toEqual([
      "Responding to an opening",
      "To 1NT",
      "Jacoby Transfer To Hearts",
    ]);
    expect(parseCallInterpretation({ call_name: "P", category: null })).toEqual(
      { call: { type: "pass" } },
    );
    expect(() =>
      parseCallInterpretation({ call_name: "P", category: ["Opening"] }),
    ).toThrow("invalid category");
    expect(() =>
      parseCallInterpretation({ call_name: "P", category: ["a", "", "c"] }),
    ).toThrow("invalid category");
  });

  it("omits absent optional explanations", () => {
    expect(
      parseCallInterpretation({
        call_name: "P",
        rule_name: null,
        description: "",
      }),
    ).toEqual({ call: { type: "pass" } });
  });

  it("rejects invalid response fields", () => {
    expect(() =>
      parseCallInterpretation({ call_name: "P", rule_name: 1 }),
    ).toThrow("invalid rule name");
    expect(() => parseCallInterpretations({})).toThrow(
      "invalid call interpretations",
    );
    expect(() => parseStringResult(1, "board identifier")).toThrow(
      "invalid board identifier",
    );
  });
});

describe("parseOpeningLead", () => {
  it("converts the adapter's JSON shape into the frontend type", () => {
    expect(
      parseOpeningLead({
        leader: "W",
        card: "D4",
        reason: "fourth best",
        partner_suits: ["S"],
        their_suits: ["H", "D"],
      }),
    ).toEqual({
      leader: "W",
      card: { suit: "D", rank: "4" },
      reason: "fourth best",
      partnerSuits: ["S"],
      theirSuits: ["H", "D"],
    });
  });

  it("rejects malformed leads", () => {
    expect(() =>
      parseOpeningLead({
        leader: "Q",
        card: "D4",
        partner_suits: [],
        their_suits: [],
      }),
    ).toThrow("invalid leader");
    expect(() =>
      parseOpeningLead({
        leader: "W",
        card: "D1",
        partner_suits: [],
        their_suits: [],
      }),
    ).toThrow("Invalid card");
    expect(() =>
      parseOpeningLead({
        leader: "W",
        card: "D4",
        partner_suits: ["N"],
        their_suits: [],
      }),
    ).toThrow("partner suits");
  });
});

describe("parseHandAnalysis", () => {
  const meaning = {
    rule_name: "One Level Suit Opening",
    description: null,
    knowledge_string: "12-21 hcp, 5+H",
  };

  it("reads each kind of call", () => {
    const analysis = parseHandAnalysis({
      call_name: "1S",
      category: ["Opening", "One of a suit", "One Level Suit Opening"],
      calls: [
        {
          call_name: "P",
          ...meaning,
          fit: "possible",
          misses: [],
          preference: {
            kind: "purpose",
            over: "1S",
            purpose: "Forced",
            over_purpose: "MajorDiscovery",
            entry: null,
          },
        },
        {
          call_name: "1D",
          ...meaning,
          fit: "possible",
          misses: [],
          preference: {
            kind: "rule",
            over: "1S",
            purpose: "MajorDiscovery",
            over_purpose: "MajorDiscovery",
            entry: { kind: "longest", calls: ["1H", "1S"] },
          },
        },
        {
          call_name: "1N",
          ...meaning,
          fit: "unfit",
          misses: [
            { kind: "points", min: 15, max: 17, actual: 13, with_shape: false },
            {
              kind: "points",
              min: 18,
              max: 34,
              actual: 13,
              with_shape: true,
              shape: {
                kind: "lengths",
                lengths: [{ suit: "C", length: 4, bid_by: "opponents" }],
              },
            },
            {
              kind: "points",
              min: 22,
              max: 34,
              actual: 13,
              with_shape: true,
              shape: { kind: "balanced", balanced: false },
            },
            {
              kind: "points",
              min: 6,
              max: 9,
              actual: 10,
              with_shape: true,
              shape: { kind: "shortest", length: 3 },
            },
            { kind: "length", suit: "H", min: 5, max: 13, actual: 2 },
            { kind: "balanced" },
            { kind: "shape" },
            { kind: "honors", suit: null },
            { kind: "honors", suit: "S" },
          ],
          preference: null,
        },
        { call_name: "4N", ...meaning, fit: "planned", misses: [] },
        {
          call_name: "1H",
          ...meaning,
          fit: "unfit",
          misses: [],
          point_rule: "rule_of_20",
        },
      ],
    });
    expect(analysis.call).toEqual({ type: "bid", level: 1, strain: "S" });
    expect(analysis.category).toHaveLength(3);
    const [pass, oneDiamond, notrump, blackwood] = analysis.calls;
    expect(pass.preference).toEqual({
      kind: "purpose",
      over: { type: "bid", level: 1, strain: "S" },
      purpose: "Forced",
      overPurpose: "MajorDiscovery",
    });
    expect(oneDiamond.preference!.entry).toEqual({
      kind: "longest",
      calls: [
        { type: "bid", level: 1, strain: "H" },
        { type: "bid", level: 1, strain: "S" },
      ],
    });
    expect(notrump.misses).toEqual([
      { kind: "points", min: 15, max: 17, actual: 13, withShape: false },
      {
        kind: "points",
        min: 18,
        max: 34,
        actual: 13,
        withShape: true,
        shape: {
          kind: "lengths",
          lengths: [{ suit: "C", length: 4, bidBy: "opponents" }],
        },
      },
      {
        kind: "points",
        min: 22,
        max: 34,
        actual: 13,
        withShape: true,
        shape: { kind: "balanced", balanced: false },
      },
      {
        kind: "points",
        min: 6,
        max: 9,
        actual: 10,
        withShape: true,
        shape: { kind: "shortest", length: 3 },
      },
      { kind: "length", suit: "H", min: 5, max: 13, actual: 2 },
      { kind: "balanced" },
      { kind: "shape" },
      { kind: "honors" },
      { kind: "honors", suit: "S" },
    ]);
    expect(notrump.preference).toBeUndefined();
    expect(blackwood.fit).toBe("planned");
    expect(blackwood.pointRule).toBeUndefined();
    expect(analysis.calls[4].pointRule).toBe("rule_of_20");
  });

  it("refuses a point rule it does not know", () => {
    expect(() =>
      parseHandAnalysis({
        call_name: "1S",
        calls: [
          {
            call_name: "1S",
            rule_name: null,
            description: null,
            knowledge_string: "",
            fit: "chosen",
            misses: [],
            point_rule: "rule_of_22",
          },
        ],
      }),
    ).toThrow("point rule");
  });

  it("has no call when no rule fits the hand", () => {
    const analysis = parseHandAnalysis({
      call_name: null,
      category: null,
      calls: [],
    });
    expect(analysis.call).toBeUndefined();
    expect(analysis.calls).toEqual([]);
  });

  it("refuses what it does not recognize", () => {
    const call = { call_name: "1H", ...meaning, fit: "unfit", misses: [] };
    expect(() => parseHandAnalysis(null)).toThrow("hand analysis");
    expect(() => parseHandAnalysis({ calls: "no" })).toThrow("hand analysis");
    expect(() =>
      parseHandAnalysis({ calls: [{ ...call, fit: "maybe" }] }),
    ).toThrow("call fit");
    expect(() =>
      parseHandAnalysis({ calls: [{ ...call, misses: null }] }),
    ).toThrow("misses");
    expect(() =>
      parseHandAnalysis({ calls: [{ ...call, misses: [{ kind: "luck" }] }] }),
    ).toThrow("miss");
    expect(() =>
      parseHandAnalysis({
        calls: [
          {
            ...call,
            misses: [{ kind: "length", suit: "N", min: 5, max: 13, actual: 2 }],
          },
        ],
      }),
    ).toThrow("suit");
    expect(() =>
      parseHandAnalysis({
        calls: [
          {
            ...call,
            misses: [{ kind: "points", min: "15", max: 17, actual: 13 }],
          },
        ],
      }),
    ).toThrow("point bound");
    for (const shape of [
      { kind: "lengths", lengths: [] },
      { kind: "lengths", lengths: [{ suit: "N", length: 4 }] },
      {
        kind: "lengths",
        lengths: [{ suit: "C", length: 4, bid_by: "declarer" }],
      },
      { kind: "shortest", length: "3" },
      { kind: "balanced", balanced: "yes" },
      { kind: "square" },
    ]) {
      expect(() =>
        parseHandAnalysis({
          calls: [
            {
              ...call,
              misses: [
                {
                  kind: "points",
                  min: 18,
                  max: 34,
                  actual: 7,
                  with_shape: true,
                  shape,
                },
              ],
            },
          ],
        }),
      ).toThrow(/shape|suit/);
    }
    expect(() =>
      parseHandAnalysis({
        calls: [
          {
            ...call,
            fit: "possible",
            preference: {
              kind: "whim",
              over: "1S",
              purpose: "A",
              over_purpose: "B",
            },
          },
        ],
      }),
    ).toThrow("preference");
    expect(() =>
      parseHandAnalysis({
        calls: [
          {
            ...call,
            fit: "possible",
            preference: { kind: "purpose", over: "1S", purpose: "A" },
          },
        ],
      }),
    ).toThrow("preference");
    expect(() =>
      parseHandAnalysis({
        calls: [
          {
            ...call,
            fit: "possible",
            preference: {
              kind: "rule",
              over: "1S",
              purpose: "A",
              over_purpose: "A",
              entry: { kind: "longest" },
            },
          },
        ],
      }),
    ).toThrow("preference entry");
  });
});
