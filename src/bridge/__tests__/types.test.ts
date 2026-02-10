import { describe, it, expect } from "vitest";
import {
  cardsBySuit,
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
