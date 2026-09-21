import { describe, it, expect } from "vitest";
import {
  callsByName,
  preferenceSummary,
  purposePhrase,
  unfitSummary,
} from "../hand-analysis";

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

describe("preferenceSummary", () => {
  const SPADES = { type: "bid", level: 1, strain: "S" } as const;

  it("puts one purpose against the other", () => {
    expect(
      preferenceSummary(
        {
          kind: "purpose",
          purpose: "MinorDiscovery",
          chosenPurpose: "MajorDiscovery",
        },
        SPADES,
      ),
    ).toBe(
      "SAYC prefers 1\u2660: bidding a major you may fit comes before " +
        "bidding a minor you may fit.",
    );
  });

  it("names the rule when one rule offers both calls", () => {
    expect(
      preferenceSummary(
        {
          kind: "rule",
          purpose: "MajorDiscovery",
          chosenPurpose: "MajorDiscovery",
        },
        SPADES,
        "One Level Suit Opening",
      ),
    ).toBe(
      "SAYC prefers 1\u2660: One Level Suit Opening offers both, and picks " +
        "that one with this hand.",
    );
  });

  it("says a fallback is a last resort", () => {
    expect(
      preferenceSummary(
        { kind: "fallback", purpose: "Game", chosenPurpose: "Game" },
        SPADES,
      ),
    ).toContain("only bid when nothing better fits");
  });

  it("says which strain a purpose prefers", () => {
    expect(
      preferenceSummary(
        { kind: "strain", purpose: "Game", chosenPurpose: "Game" },
        SPADES,
      ),
    ).toBe(
      "SAYC prefers 1\u2660: for bidding a game, that strain comes first.",
    );
  });

  it("falls back to a purpose's own name if the engine gains one", () => {
    expect(purposePhrase("SomethingNew")).toBe("SomethingNew");
    expect(purposePhrase("Game")).toBe("bidding a game");
  });
});
