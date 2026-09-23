import { describe, it, expect } from "vitest";
import {
  cardsBySuit,
  fanOrderCards,
  findCallInterpretation,
  formatRuleName,
  handFromCdhsString,
  handToCdhsString,
  vulnerabilityFromBoardNumber,
  vulnerabilityLabel,
} from "../types";
import { randomDeal, MOCK_DEAL } from "../mock";

describe("randomDeal", () => {
  it("has 13 cards per hand", () => {
    const deal = randomDeal();
    expect(deal.north.cards).toHaveLength(13);
    expect(deal.east.cards).toHaveLength(13);
    expect(deal.south.cards).toHaveLength(13);
    expect(deal.west.cards).toHaveLength(13);
  });

  it("has 52 unique cards", () => {
    const deal = randomDeal();
    const all = [
      ...deal.north.cards,
      ...deal.east.cards,
      ...deal.south.cards,
      ...deal.west.cards,
    ];
    expect(all).toHaveLength(52);
    const unique = new Set(all.map((c) => `${c.suit}${c.rank}`));
    expect(unique.size).toBe(52);
  });
});

describe("MOCK_DEAL", () => {
  it("has 13 cards per hand", () => {
    expect(MOCK_DEAL.north.cards).toHaveLength(13);
    expect(MOCK_DEAL.east.cards).toHaveLength(13);
    expect(MOCK_DEAL.south.cards).toHaveLength(13);
    expect(MOCK_DEAL.west.cards).toHaveLength(13);
  });

  it("has 52 unique cards", () => {
    const all = [
      ...MOCK_DEAL.north.cards,
      ...MOCK_DEAL.east.cards,
      ...MOCK_DEAL.south.cards,
      ...MOCK_DEAL.west.cards,
    ];
    const unique = new Set(all.map((c) => `${c.suit}${c.rank}`));
    expect(unique.size).toBe(52);
  });
});

describe("vulnerabilityFromBoardNumber", () => {
  it("returns correct vulnerability for all 16 boards", () => {
    // Standard bridge vulnerability rotation
    expect(vulnerabilityFromBoardNumber(1)).toBe("None");
    expect(vulnerabilityFromBoardNumber(2)).toBe("NS");
    expect(vulnerabilityFromBoardNumber(3)).toBe("EW");
    expect(vulnerabilityFromBoardNumber(4)).toBe("Both");
    expect(vulnerabilityFromBoardNumber(5)).toBe("NS");
    expect(vulnerabilityFromBoardNumber(6)).toBe("EW");
    expect(vulnerabilityFromBoardNumber(7)).toBe("Both");
    expect(vulnerabilityFromBoardNumber(8)).toBe("None");
    expect(vulnerabilityFromBoardNumber(9)).toBe("EW");
    expect(vulnerabilityFromBoardNumber(10)).toBe("Both");
    expect(vulnerabilityFromBoardNumber(11)).toBe("None");
    expect(vulnerabilityFromBoardNumber(12)).toBe("NS");
    expect(vulnerabilityFromBoardNumber(13)).toBe("Both");
    expect(vulnerabilityFromBoardNumber(14)).toBe("None");
    expect(vulnerabilityFromBoardNumber(15)).toBe("NS");
    expect(vulnerabilityFromBoardNumber(16)).toBe("EW");
  });
});

describe("vulnerabilityLabel", () => {
  it("returns human-readable labels", () => {
    expect(vulnerabilityLabel("None")).toBe("None Vul");
    expect(vulnerabilityLabel("NS")).toBe("N-S Vul");
    expect(vulnerabilityLabel("EW")).toBe("E-W Vul");
    expect(vulnerabilityLabel("Both")).toBe("Both Vul");
  });
});

describe("cardsBySuit", () => {
  it("groups and sorts cards by suit", () => {
    const bySuit = cardsBySuit(MOCK_DEAL.north);
    expect(bySuit.S).toHaveLength(4);
    expect(bySuit.S[0].rank).toBe("A");
    expect(bySuit.H).toHaveLength(3);
    expect(bySuit.D).toHaveLength(3);
    expect(bySuit.C).toHaveLength(3);
  });
});

describe("findCallInterpretation", () => {
  const interpretations = [
    {
      call: { type: "bid" as const, level: 1, strain: "H" as const },
      ruleName: "OneLevelSuitOpening",
      description: "12-21 HCP, 5+ hearts",
    },
    {
      call: { type: "pass" as const },
      ruleName: undefined,
      description: undefined,
    },
  ];

  it("returns the interpretation matching the call's type, level, and strain", () => {
    expect(
      findCallInterpretation(interpretations, {
        type: "bid",
        level: 1,
        strain: "H",
      }),
    ).toEqual(interpretations[0]);
    expect(findCallInterpretation(interpretations, { type: "pass" })).toEqual(
      interpretations[1],
    );
  });

  it("falls back to an interpretation with no rule name for an unmatched call", () => {
    const call = { type: "bid" as const, level: 2, strain: "S" as const };
    expect(findCallInterpretation(interpretations, call)).toEqual({
      call,
      ruleName: undefined,
      description: undefined,
    });
  });
});

describe("formatRuleName", () => {
  it("formats PascalCase rule names into spaced titles", () => {
    expect(formatRuleName("OneLevelSuitOpening")).toBe(
      "One Level Suit Opening",
    );
    expect(formatRuleName("StrongTwoClubs")).toBe("Strong Two Clubs");
    expect(formatRuleName("Jacoby2N")).toBe("Jacoby 2NT");
    expect(formatRuleName("Opening1N")).toBe("Opening 1NT");
    expect(formatRuleName("RHOOpeningPreempt")).toBe("RHO Opening Preempt");
    expect(formatRuleName("LHOPreempt")).toBe("LHO Preempt");
  });
});

describe("hand strings", () => {
  const OPENER = "42.A973.K5.AQ982";

  it("writes a hand clubs first, the way the engine reads it", () => {
    const hand = handFromCdhsString(OPENER)!;
    expect(handToCdhsString(hand)).toBe(OPENER);
    // The fan draws it spades first; the string is the other order.
    expect(fanOrderCards(hand)[0]).toEqual({ suit: "S", rank: "A" });
  });

  it("reads a void as an empty holding", () => {
    const hand = handFromCdhsString("AKQJT98765432...")!;
    expect(hand.cards).toHaveLength(13);
    expect(hand.cards.every((card) => card.suit === "C")).toBe(true);
  });

  it("refuses anything that is not thirteen distinct cards", () => {
    expect(handFromCdhsString("42.A973.K5.AQ98")).toBeNull(); // twelve
    expect(handFromCdhsString("442.A973.K5.AQ82")).toBeNull(); // the four twice
    expect(handFromCdhsString("4X.A973.K5.AQ982")).toBeNull(); // no such rank
    expect(handFromCdhsString("42.A973.K5")).toBeNull(); // three suits
  });

  it("does not care about the case it is written in", () => {
    expect(handToCdhsString(handFromCdhsString(OPENER.toLowerCase())!)).toBe(
      OPENER,
    );
  });
});
