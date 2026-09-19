// Ported alongside python/core/suit.py; the Python has no test file of its
// own, so these pin the behavior the rest of the engine leans on.

import { describe, it, expect } from "vitest";
import {
  CLUBS,
  DIAMONDS,
  HEARTS,
  MAJORS,
  MINORS,
  NOTRUMP,
  SPADES,
  STRAINS,
  SUITS,
  Strain,
  Suit,
  compareStrains,
  sortStrains,
} from "../suit";

describe("Strain", () => {
  it("is a singleton per index", () => {
    expect(Strain.fromIndex(0)).toBe(CLUBS);
    expect(Strain.fromChar("N")).toBe(NOTRUMP);
    expect(Strain.fromName("Hearts")).toBe(HEARTS);
    expect(CLUBS.equals(Strain.fromIndex(0))).toBe(true);
    expect(CLUBS.equals(null)).toBe(false);
  });

  it("cannot be constructed directly", () => {
    expect(() => new Strain(0)).toThrow();
  });

  it("rejects indexes, names and chars it does not know", () => {
    expect(() => Strain.fromIndex(5)).toThrow();
    expect(() => Strain.fromName("Trump")).toThrow();
    expect(() => Strain.fromChar("X")).toThrow();
  });

  it("names and chars follow C D H S N", () => {
    expect(STRAINS.map((strain) => strain.char).join("")).toBe("CDHSN");
    expect(STRAINS.map((strain) => strain.name)).toEqual([
      "Clubs",
      "Diamonds",
      "Hearts",
      "Spades",
      "Notrump",
    ]);
    expect(`${HEARTS}`).toBe("Hearts");
    expect(HEARTS.repr()).toBe("Strain(Hearts)");
  });

  it("knows which strains are suits", () => {
    expect(SUITS.every((suit) => suit.isSuit())).toBe(true);
    expect(NOTRUMP.isSuit()).toBe(false);
  });

  it("sorts by index", () => {
    expect(compareStrains(CLUBS, NOTRUMP)).toBeLessThan(0);
    expect(compareStrains(SPADES, HEARTS)).toBeGreaterThan(0);
    expect(compareStrains(HEARTS, HEARTS)).toBe(0);
    expect(
      sortStrains([NOTRUMP, HEARTS, CLUBS, SPADES, DIAMONDS]).map(
        (strain) => strain.char,
      ),
    ).toEqual(["C", "D", "H", "S", "N"]);
  });

  it("pairs the minors and the majors", () => {
    expect(MINORS).toEqual([CLUBS, DIAMONDS]);
    expect(MAJORS).toEqual([HEARTS, SPADES]);
    expect(CLUBS.otherMinor()).toBe(DIAMONDS);
    expect(DIAMONDS.otherMinor()).toBe(CLUBS);
    expect(HEARTS.otherMajor()).toBe(SPADES);
    expect(SPADES.otherMajor()).toBe(HEARTS);
    expect(() => HEARTS.otherMinor()).toThrow();
    expect(() => CLUBS.otherMajor()).toThrow();
  });
});

describe("Suit", () => {
  it("only accepts the four suits", () => {
    expect(Suit.fromIndex(3)).toBe(SPADES);
    expect(Suit.fromChar("D")).toBe(DIAMONDS);
    expect(() => Suit.fromIndex(4)).toThrow();
    expect(() => Suit.fromChar("N")).toThrow();
  });
});
