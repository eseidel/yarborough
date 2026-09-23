import { describe, it, expect } from "vitest";
import { handFromCdhsString, handToCdhsString } from "../types";
import {
  emptyEntry,
  entryFromHand,
  entryTotal,
  handFromEntry,
  isComplete,
  nextSuit,
  setSmall,
  suitLength,
  toggleHonor,
} from "../hand-entry";

/** ♠AQ982 ♥K5 ♦A973 ♣42, as a player would enter it: eight taps. */
function opener() {
  let entry = emptyEntry();
  entry = toggleHonor(entry, "S", "A");
  entry = toggleHonor(entry, "S", "Q");
  entry = setSmall(entry, "S", 3);
  entry = toggleHonor(entry, "H", "K");
  entry = setSmall(entry, "H", 1);
  entry = toggleHonor(entry, "D", "A");
  entry = setSmall(entry, "D", 3);
  entry = setSmall(entry, "C", 2);
  return entry;
}

describe("hand entry", () => {
  it("builds a hand from honors and counts of small cards", () => {
    const entry = opener();
    expect(entryTotal(entry)).toBe(13);
    // Small cards are the lowest spots: which ones is immaterial to SAYC.
    expect(handToCdhsString(handFromEntry(entry))).toBe("32.A432.K2.AQ432");
  });

  it("keeps the honors in rank order whatever order they were tapped", () => {
    let entry = toggleHonor(emptyEntry(), "H", "T");
    entry = toggleHonor(entry, "H", "A");
    entry = toggleHonor(entry, "H", "Q");
    expect(entry.H.honors).toEqual(["A", "Q", "T"]);
  });

  it("gives an honor back on a second tap", () => {
    const entry = toggleHonor(toggleHonor(emptyEntry(), "S", "K"), "S", "K");
    expect(entry.S.honors).toEqual([]);
  });

  it("lets a miscount pass thirteen cards, but not make a hand", () => {
    const full = opener();
    expect(isComplete(full)).toBe(true);
    const over = setSmall(full, "S", 4);
    expect(entryTotal(over)).toBe(14);
    expect(isComplete(over)).toBe(false);
    expect(isComplete(toggleHonor(over, "S", "A"))).toBe(true);
  });

  it("is a hand at thirteen cards, a suit never counted being void", () => {
    let entry = setSmall(emptyEntry(), "S", 7);
    entry = setSmall(entry, "H", 5);
    expect(isComplete(entry)).toBe(false);
    entry = toggleHonor(entry, "H", "A");
    expect(isComplete(entry)).toBe(true);
    expect(handToCdhsString(handFromEntry(entry))).toBe("..A65432.8765432");
  });

  it("ignores a count out of range", () => {
    const entry = emptyEntry();
    expect(setSmall(entry, "C", 9)).toBe(entry);
    expect(setSmall(entry, "C", -1)).toBe(entry);
  });

  it("moves on to the next suit still to be counted, in fan order", () => {
    let entry = emptyEntry();
    expect(nextSuit(entry, "S")).toBe("H");
    entry = setSmall(entry, "H", 2);
    expect(nextSuit(entry, "S")).toBe("D");
    entry = setSmall(entry, "D", 2);
    entry = setSmall(entry, "C", 2);
    expect(nextSuit(entry, "C")).toBe("S");
    entry = setSmall(entry, "S", 2);
    expect(nextSuit(entry, "S")).toBeNull();
  });

  it("counts a suit whose small cards are not yet counted by its honors", () => {
    const entry = toggleHonor(emptyEntry(), "D", "K");
    expect(suitLength(entry, "D")).toBe(1);
    expect(entry.D.small).toBeNull();
  });

  it("reads a finished hand back as a counted entry", () => {
    const hand = handFromCdhsString("AK.J.T8753.JT432")!;
    const entry = entryFromHand(hand);
    expect(entry.C).toEqual({ honors: ["A", "K"], small: 0 });
    expect(entry.H).toEqual({ honors: ["T"], small: 4 });
    expect(entry.S).toEqual({ honors: ["J", "T"], small: 3 });
    expect(handToCdhsString(handFromEntry(entry))).toBe("AK.J.T5432.JT432");
  });
});
