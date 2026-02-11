import { describe, it, expect } from "vitest";
import { fanOrderCards, FAN_SUIT_ORDER } from "../CardFan";
import type { Hand } from "../../bridge";

describe("FAN_SUIT_ORDER", () => {
  it("is D, C, H, S", () => {
    expect(FAN_SUIT_ORDER).toEqual(["D", "C", "H", "S"]);
  });
});

describe("fanOrderCards", () => {
  it("returns cards in DCHS suit order, high-to-low within each suit", () => {
    const hand: Hand = {
      cards: [
        { suit: "S", rank: "A" },
        { suit: "H", rank: "K" },
        { suit: "D", rank: "Q" },
        { suit: "C", rank: "J" },
        { suit: "S", rank: "T" },
        { suit: "H", rank: "9" },
        { suit: "D", rank: "8" },
        { suit: "C", rank: "7" },
        { suit: "S", rank: "6" },
        { suit: "H", rank: "5" },
        { suit: "D", rank: "4" },
        { suit: "C", rank: "3" },
        { suit: "S", rank: "2" },
      ],
    };

    const ordered = fanOrderCards(hand);
    const labels = ordered.map((c) => `${c.rank}${c.suit}`);

    // Diamonds first (high to low), then Clubs, Hearts, Spades
    expect(labels).toEqual([
      "QD",
      "8D",
      "4D",
      "JC",
      "7C",
      "3C",
      "KH",
      "9H",
      "5H",
      "AS",
      "TS",
      "6S",
      "2S",
    ]);
  });

  it("skips void suits", () => {
    const hand: Hand = {
      cards: [
        { suit: "S", rank: "A" },
        { suit: "S", rank: "K" },
        { suit: "H", rank: "Q" },
        { suit: "H", rank: "J" },
      ],
    };

    const ordered = fanOrderCards(hand);
    const suits = ordered.map((c) => c.suit);

    // No D or C cards, only H then S
    expect(suits).toEqual(
      ["Q", "J", "A", "K"].map((_, i) => (i < 2 ? "H" : "S")),
    );
    expect(ordered).toHaveLength(4);
  });

  it("returns empty array for empty hand", () => {
    const hand: Hand = { cards: [] };
    expect(fanOrderCards(hand)).toEqual([]);
  });
});
