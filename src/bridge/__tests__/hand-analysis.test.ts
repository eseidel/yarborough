import { describe, it, expect } from "vitest";
import { callsByName, unfitSummary } from "../hand-analysis";

describe("unfitSummary", () => {
  it("names the suit a call wants more of", () => {
    expect(
      unfitSummary({ kind: "suit_short", suit: "H", shown: 5, actual: 2 }),
    ).toBe("Shows 5+ ♥, you have 2");
  });

  it("names the suit a call wants fewer of", () => {
    expect(
      unfitSummary({ kind: "suit_long", suit: "S", shown: 3, actual: 6 }),
    ).toBe("Shows at most 3 ♠, you have 6");
  });

  it("says points with no suit at all", () => {
    expect(unfitSummary({ kind: "hcp_low", shown: 15, actual: 13 })).toBe(
      "Shows 15+ points, you have 13",
    );
    expect(unfitSummary({ kind: "hcp_high", shown: 14, actual: 16 })).toBe(
      "Shows at most 14 points, you have 16",
    );
  });
});

describe("callsByName", () => {
  it("finds a weighed call by the string that names it", () => {
    const byName = callsByName({
      call: { type: "bid", level: 1, strain: "S" },
      calls: [
        { call: { type: "pass" }, fit: "possible" },
        { call: { type: "bid", level: 1, strain: "S" }, fit: "chosen" },
      ],
    });
    expect(byName.get("1S")?.fit).toBe("chosen");
    expect(byName.get("P")?.fit).toBe("possible");
    expect(byName.get("2H")).toBeUndefined();
  });

  it("is empty with no analysis, so a call menu is simply unweighed", () => {
    expect(callsByName(null).size).toBe(0);
    expect(callsByName(undefined).size).toBe(0);
  });
});
