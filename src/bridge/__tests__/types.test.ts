import { describe, it, expect } from "vitest";
import { cardsBySuit } from "../types";
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
