import { describe, expect, it } from "vitest";
import {
  parseCallInterpretation,
  parseCallInterpretations,
  parseCallName,
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
