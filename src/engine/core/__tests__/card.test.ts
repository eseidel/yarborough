// Ported alongside python/core/card.py, which has no test file of its own.

import { describe, it, expect } from "vitest";
import { Card } from "../card";
import { CLUBS, DIAMONDS, HEARTS, NOTRUMP, SPADES } from "../suit";

describe("Card", () => {
  it("indexes the ranks from the deuce up", () => {
    expect(Card.indexForCard("2")).toBe(0);
    expect(Card.indexForCard(9)).toBe(7);
    expect(Card.indexForCard("T")).toBe(8);
    expect(Card.indexForCard("A")).toBe(12);
    expect(Card.cardForIndex(0)).toBe("2");
    expect(Card.cardForIndex(8)).toBe("T");
    expect(Card.cardForIndex(12)).toBe("A");
    expect(() => Card.indexForCard("1")).toThrow();
    expect(() => Card.cardForIndex(13)).toThrow();
  });

  it("numbers the cards clubs first", () => {
    expect(Card.identifierForCard(CLUBS, "2")).toBe(0);
    expect(Card.identifierForCard(CLUBS, "A")).toBe(12);
    expect(Card.identifierForCard(DIAMONDS, "2")).toBe(13);
    expect(Card.identifierForCard(SPADES, "A")).toBe(51);
    expect(Card.suitAndIndexFromIdentifier(25)).toEqual([DIAMONDS, 12]);
    expect(Card.suitAndValueFromIdentifier(0)).toEqual([CLUBS, "2"]);
    expect(Card.suitAndValueFromIdentifier(25)).toEqual([DIAMONDS, "A"]);
    expect(Card.suitAndValueFromIdentifier(51)).toEqual([SPADES, "A"]);
  });

  it("counts high card points and controls", () => {
    expect(
      ["A", "K", "Q", "J", "T", "2"].map((card) => Card.highCardPoints(card)),
    ).toEqual([4, 3, 2, 1, 0, 0]);
    expect(
      ["A", "K", "Q", "J", "2"].map((card) => Card.controlCount(card)),
    ).toEqual([2, 1, 0, 0, 0]);
  });

  it("names a card", () => {
    expect(Card.cardName(HEARTS, "T")).toBe("T of Hearts");
    const card = new Card(HEARTS, "T");
    expect(card.displayValue()).toBe("10");
    expect(card.name).toBe("10H");
    expect(card.index()).toBe(8);
    expect(new Card(SPADES, "A").name).toBe("AS");
  });

  it("refuses a notrump card or a rank it does not know", () => {
    expect(() => new Card(NOTRUMP, "A")).toThrow();
    expect(() => new Card(SPADES, "1")).toThrow();
  });
});
