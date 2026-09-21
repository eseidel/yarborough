import { describe, expect, it } from "vitest";
import {
  HAND_SIZE,
  cardKey,
  handFromKeys,
  holdingOf,
  isComplete,
  keyToCard,
  toggleCard,
} from "../hand-entry";

/** A thirteen-card hand as keys: AQ982 spades, K5 hearts, A973 diamonds, 42 clubs. */
const OPENER = [
  "SA",
  "SQ",
  "S9",
  "S8",
  "S2",
  "HK",
  "H5",
  "DA",
  "D9",
  "D7",
  "D3",
  "C4",
  "C2",
];

describe("entering a hand", () => {
  it("names a card by its suit and rank", () => {
    expect(cardKey({ suit: "S", rank: "A" })).toBe("SA");
    expect(keyToCard("HT")).toEqual({ suit: "H", rank: "T" });
  });

  it("takes a card and puts it back", () => {
    const taken = toggleCard(new Set(), "SA");
    expect([...taken]).toEqual(["SA"]);
    expect([...toggleCard(taken, "SA")]).toEqual([]);
  });

  it("refuses a fourteenth card rather than swapping one out", () => {
    // The entry has no counter: a card the app will not take is how a
    // miscount announces itself.
    const full = new Set(OPENER);
    expect(isComplete(full)).toBe(true);
    const after = toggleCard(full, "CA");
    expect(after.size).toBe(HAND_SIZE);
    expect(after.has("CA")).toBe(false);
    // Putting one back still works, and makes room again.
    const room = toggleCard(full, "C2");
    expect(room.size).toBe(HAND_SIZE - 1);
    expect(toggleCard(room, "CA").has("CA")).toBe(true);
  });

  it("is not complete until the thirteenth card", () => {
    expect(isComplete(new Set(OPENER.slice(0, 12)))).toBe(false);
    expect(isComplete(new Set(OPENER))).toBe(true);
  });

  it("orders the hand the way the fan draws it", () => {
    // Spades through clubs, each suit from the ace down, whatever order the
    // cards were taken in.
    const hand = handFromKeys(new Set([...OPENER].reverse()));
    expect(hand.cards.map((card) => card.suit + card.rank)).toEqual(OPENER);
  });

  it("reads one suit's holding", () => {
    const keys = new Set(OPENER);
    expect(holdingOf(keys, "S")).toEqual(["A", "Q", "9", "8", "2"]);
    expect(holdingOf(keys, "C")).toEqual(["4", "2"]);
    // A void is no ranks, not a placeholder.
    expect(holdingOf(new Set(["SA"]), "H")).toEqual([]);
  });
});
