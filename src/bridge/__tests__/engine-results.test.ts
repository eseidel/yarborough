import { describe, expect, it } from "vitest";
import {
  parseCallInterpretation,
  parseCallInterpretations,
  parseCallName,
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
