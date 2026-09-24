import { describe, expect, it } from "vitest";
import {
  callsByName,
  chosenText,
  isBalanced,
  missesText,
  missText,
  preferenceText,
  purposePhrase,
} from "../hand-analysis";
import {
  type Call,
  type ShapeFact,
  handFromCdhsString,
  highCardPoints,
} from "../types";

const bid = (level: number, strain: "C" | "D" | "H" | "S" | "N"): Call => ({
  type: "bid",
  level,
  strain,
});
const PASS: Call = { type: "pass" };
// ♠AQ982 ♥K5 ♦A973 ♣42
const OPENER = handFromCdhsString("42.A973.K5.AQ982")!;
// ♠K852 ♥AJ73 ♦KQ4 ♣A6
const NOTRUMP = handFromCdhsString("A6.KQ4.AJ73.K852")!;

describe("the numbers of a hand", () => {
  it("counts high-card points", () => {
    expect(highCardPoints(OPENER)).toBe(13);
    expect(highCardPoints(NOTRUMP)).toBe(17);
  });

  it("knows a balanced hand", () => {
    expect(isBalanced(NOTRUMP)).toBe(true);
    expect(isBalanced(OPENER)).toBe(false); // two doubletons
  });
});

describe("missText", () => {
  it("says the points a call needs and the hand's own", () => {
    expect(
      missText({
        kind: "points",
        min: 15,
        max: 17,
        actual: 13,
        withShape: false,
      }),
    ).toBe("Needs 15–17 hcp, you have 13");
    expect(
      missText({
        kind: "points",
        min: 22,
        max: 37,
        actual: 13,
        withShape: false,
      }),
    ).toBe("Needs 22+ hcp, you have 13");
    expect(
      missText({
        kind: "points",
        min: 0,
        max: 5,
        actual: 10,
        withShape: false,
      }),
    ).toBe("Needs at most 5 hcp, you have 10");
    expect(
      missText({
        kind: "points",
        min: 18,
        max: 18,
        actual: 11,
        withShape: true,
      }),
    ).toBe("With this shape, needs 18 hcp, you have 11");
  });

  it("names the part of the shape a point range depends on", () => {
    const points = (shape: ShapeFact) =>
      missText({
        kind: "points",
        min: 18,
        max: 37,
        actual: 7,
        withShape: true,
        shape,
      });
    expect(
      points({ kind: "lengths", lengths: [{ suit: "C", length: 4 }] }),
    ).toBe("With 4 ♣, needs 18+ hcp, you have 7");
    expect(
      points({
        kind: "lengths",
        lengths: [{ suit: "C", length: 4, bidBy: "opponents" }],
      }),
    ).toBe("With 4 ♣ (their suit), needs 18+ hcp, you have 7");
    expect(
      points({
        kind: "lengths",
        lengths: [{ suit: "H", length: 1, bidBy: "partner" }],
      }),
    ).toBe("With a singleton ♥ (partner's suit), needs 18+ hcp, you have 7");
    expect(
      points({
        kind: "lengths",
        lengths: [
          { suit: "H", length: 5 },
          { suit: "S", length: 2 },
        ],
      }),
    ).toBe("With 5 ♥ and a doubleton ♠, needs 18+ hcp, you have 7");
    expect(
      points({ kind: "lengths", lengths: [{ suit: "D", length: 1 }] }),
    ).toBe("With a singleton ♦, needs 18+ hcp, you have 7");
    expect(
      points({ kind: "lengths", lengths: [{ suit: "D", length: 0 }] }),
    ).toBe("With a void in ♦, needs 18+ hcp, you have 7");
    expect(points({ kind: "shortest", length: 3 })).toBe(
      "With no doubleton, singleton or void, needs 18+ hcp, you have 7",
    );
    expect(points({ kind: "shortest", length: 4 })).toBe(
      "With this shape, needs 18+ hcp, you have 7",
    );
    expect(points({ kind: "balanced", balanced: false })).toBe(
      "With an unbalanced hand, needs 18+ hcp, you have 7",
    );
    expect(points({ kind: "balanced", balanced: true })).toBe(
      "With a balanced hand, needs 18+ hcp, you have 7",
    );
  });

  it("says the side of a length the hand is on", () => {
    expect(
      missText({ kind: "length", suit: "H", min: 5, max: 13, actual: 2 }),
    ).toBe("Needs 5+ ♥, you have 2");
    expect(
      missText({ kind: "length", suit: "S", min: 1, max: 3, actual: 5 }),
    ).toBe("Needs at most 3 ♠, you have 5");
    expect(
      missText({ kind: "length", suit: "D", min: 6, max: 6, actual: 4 }),
    ).toBe("Needs 6 ♦, you have 4");
  });

  it("names shape and honors without numbers", () => {
    expect(missText({ kind: "balanced" })).toBe("Needs a balanced hand");
    expect(missText({ kind: "shape" })).toBe("Needs a different shape");
    expect(missText({ kind: "honors", suit: "C" })).toBe(
      "Needs better ♣ honors",
    );
    expect(missText({ kind: "honors" })).toBe("Needs different honors");
  });

  it("keeps two misses at most", () => {
    expect(
      missesText([
        { kind: "points", min: 15, max: 17, actual: 13, withShape: false },
        { kind: "balanced" },
        { kind: "shape" },
      ]),
    ).toBe("Needs 15–17 hcp, you have 13. Needs a balanced hand.");
    expect(missesText([])).toBe("Doesn't fit this hand.");
  });
});

describe("preferenceText", () => {
  it("compares purposes", () => {
    expect(
      preferenceText(bid(1, "S"), {
        kind: "purpose",
        over: bid(3, "H"),
        purpose: "MajorDiscovery",
        overPurpose: "SupportMajors",
      }),
    ).toBe(
      "SAYC prefers 3♥: raising partner's major comes before showing a suit you may fit.",
    );
  });

  it("says a pass is for a hand with nothing better", () => {
    expect(
      preferenceText(PASS, {
        kind: "purpose",
        over: bid(1, "S"),
        purpose: "Forced",
        overPurpose: "MajorDiscovery",
      }),
    ).toBe("SAYC prefers 1♠. Pass is for a hand with nothing better to say.");
  });

  it("names the entry of a rule's own order", () => {
    expect(
      preferenceText(bid(1, "D"), {
        kind: "rule",
        over: bid(1, "S"),
        purpose: "MajorDiscovery",
        overPurpose: "MajorDiscovery",
        entry: { kind: "longest", calls: [bid(1, "H"), bid(1, "S")] },
      }),
    ).toBe("SAYC prefers 1♠: the longest of 1♥ and 1♠ comes first.");
    const other = (
      kind:
        | "highest"
        | "higher_suit"
        | "lowest_level"
        | "named"
        | "conditional"
        | "unnamed",
    ) =>
      preferenceText(bid(2, "D"), {
        kind: "rule",
        over: bid(2, "H"),
        purpose: "Game",
        overPurpose: "Game",
        entry: { kind, calls: [] },
      });
    expect(other("highest")).toContain("highest level");
    expect(other("higher_suit")).toContain("higher suit");
    expect(other("lowest_level")).toContain("lowest level");
    expect(other("named")).toContain("2♥ comes first");
    expect(other("conditional")).toContain("with this hand");
    expect(other("unnamed")).toContain("cheaper call");
  });

  it("covers strain, fallback and ties", () => {
    const over = bid(4, "S");
    expect(
      preferenceText(bid(3, "N"), {
        kind: "strain",
        over,
        purpose: "Game",
        overPurpose: "Game",
      }),
    ).toContain("a major game comes before notrump");
    expect(
      preferenceText(bid(1, "N"), {
        kind: "fallback",
        over,
        purpose: "Game",
        overPurpose: "Game",
      }),
    ).toContain("1NT is only bid when nothing better fits");
    expect(
      preferenceText(bid(2, "C"), {
        kind: "tie",
        over,
        purpose: "Game",
        overPurpose: "Game",
      }),
    ).toContain("don't rank these two");
  });

  it("falls back to a purpose's own name", () => {
    expect(purposePhrase("SomethingNew")).toBe("SomethingNew");
  });
});

describe("chosenText", () => {
  it("gives the points and the length of the suit bid", () => {
    expect(chosenText(OPENER, bid(1, "S"))).toBe("You have 13 hcp and 5 ♠.");
  });

  it("gives the balance of a notrump bid", () => {
    expect(chosenText(NOTRUMP, bid(1, "N"))).toBe(
      "You have 17 hcp and a balanced hand.",
    );
    expect(chosenText(OPENER, PASS)).toBe("You have 13 hcp.");
  });
});

describe("callsByName", () => {
  it("indexes an analysis by call", () => {
    const byName = callsByName({
      calls: [
        { call: PASS, fit: "possible", misses: [] },
        { call: bid(1, "S"), fit: "chosen", misses: [] },
      ],
    });
    expect(byName.get("1S")!.fit).toBe("chosen");
    expect(callsByName(null).size).toBe(0);
  });
});
