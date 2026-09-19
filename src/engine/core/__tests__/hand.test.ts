// Translated from python/core/tests/test_hand.py, plus the evaluations the
// Python tests do not reach. Every expected value comes from running the
// Python. Hand strings are C.D.H.S.

import { describe, it, expect } from "vitest";
import { Hand } from "../hand";
import { mulberry32 } from "../random";
import { CLUBS, DIAMONDS, HEARTS, NOTRUMP, SPADES, SUITS } from "../suit";

describe("Hand", () => {
  function assertBalanced(handString: string, balanced: boolean): void {
    expect(Hand.fromCdhsString(handString).isBalanced()).toBe(balanced);
  }

  it("knows a balanced hand", () => {
    assertBalanced("732.Q.AJ.AKJ9843", false);
    assertBalanced("73.Q2.AJ.AKJ9843", false);
    assertBalanced("732.Q32.AJ.AKJ98", true);
  });

  function assertFlat(handString: string, flat: boolean): void {
    expect(Hand.fromCdhsString(handString).isFlat()).toBe(flat);
  }

  it("knows a flat hand", () => {
    assertFlat("732.Q.AJ.AKJ9843", false);
    assertFlat("732.Q32.AJ.AKJ98", false);
    assertFlat("732.Q32.AJ8.AKJ9", true);
    assertFlat("A732.Q32.AJ8.AKJ", true);
    assertFlat("A73.AQ32.AJ8.AKJ", true);
    assertFlat("952.QT87.A86.Q52", true);
  });

  function assertNonWorkingHonorAdjustment(
    handString: string,
    trump: typeof HEARTS,
    expectedAdjustment: number,
  ): void {
    const hand = Hand.fromCdhsString(handString);
    expect(hand._supportPointAdjustmentForNonWorkingHonors(trump)).toBe(
      expectedAdjustment,
    );
  }

  it("discounts non-working honors", () => {
    assertNonWorkingHonorAdjustment("AKJ52.J.J9743.54", HEARTS, -1);
    assertNonWorkingHonorAdjustment("AKJ52.Q.J9743.54", HEARTS, -2);
    assertNonWorkingHonorAdjustment("AKJ52.K.J9743.54", HEARTS, -3);
    assertNonWorkingHonorAdjustment("AKJ52.A.J9743.54", HEARTS, 0);
    assertNonWorkingHonorAdjustment("AKJ52.KQ.J974.54", HEARTS, -2);
    assertNonWorkingHonorAdjustment("AKJ52.KJ.J974.54", HEARTS, -1);
    assertNonWorkingHonorAdjustment("AKJ52.K9.J974.54", HEARTS, 0);
    assertNonWorkingHonorAdjustment("AKJ52.QJ.J974.54", HEARTS, -3);
    assertNonWorkingHonorAdjustment("AKJ52.Q9.J974.54", HEARTS, -2);
  });

  it("counts support points", () => {
    expect(Hand.fromCdhsString("AKJ52.J.J9743.54").supportPoints(HEARTS)).toBe(
      13,
    );
    expect(Hand.fromCdhsString("AKJ52.J.J9743.54").genericSupportPoints()).toBe(
      13,
    );
    expect(Hand.fromCdhsString("AKJ52..J9743.J54").genericSupportPoints()).toBe(
      15,
    );
    expect(() =>
      Hand.fromCdhsString("AKJ52.J.J9743.54").supportPoints(NOTRUMP),
    ).toThrow();
  });

  function handWithClubs(clubsString: string): Hand {
    const spadeFillerString = "AKQJT98765432";
    const handString = `${clubsString}...${spadeFillerString.slice(0, spadeFillerString.length - clubsString.length)}`;
    return Hand.fromCdhsString(handString);
  }

  function assertStopper(
    cardsString: string,
    expectedRound: number | null,
  ): void {
    const hand = handWithClubs(cardsString);
    expect(hand.hasFourthRoundStopper(CLUBS)).toBe(
      expectedRound !== null && expectedRound <= 4,
    );
    expect(hand.hasThirdRoundStopper(CLUBS)).toBe(
      expectedRound !== null && expectedRound <= 3,
    );
    expect(hand.hasSecondRoundStopper(CLUBS)).toBe(
      expectedRound !== null && expectedRound <= 2,
    );
    expect(hand.hasFirstRoundStopper(CLUBS)).toBe(
      expectedRound !== null && expectedRound <= 1,
    );
  }

  it("knows its stoppers", () => {
    assertStopper("2", null);
    assertStopper("85", null);
    assertStopper("A", 1);
    assertStopper("K", null);
    assertStopper("K2", null); // Kx is only a 66% chance stopper.
    assertStopper("KQ", 2);
    assertStopper("QJ", null);
    assertStopper("QJ2", 3);
    // Currently we count Txxx as a stopper, but not 9xxx.
    assertStopper("T765", 4);
    assertStopper("9765", null);
    assertStopper("J765", 4);
    assertStopper("87654", 4);
  });

  it("writes itself as a dot string", () => {
    const cdhsDotString = "AKJ52.J.J9743.54";
    const hand = Hand.fromCdhsString(cdhsDotString);
    expect(hand.cdhsDotString()).toBe(cdhsDotString);
    expect(hand.shdcDotString()).toBe("54.J9743.J.AKJ52");
    expect(hand.repr()).toBe("Hand(['AKJ52', 'J', 'J9743', '54'])");
    // The cards of a suit are sorted, and the case does not matter.
    expect(Hand.fromCdhsString("25akj.j.j9743.45").cdhsDotString()).toBe(
      cdhsDotString,
    );
  });

  it("evaluates a hand the way the Python does", () => {
    const rows = [
      {
        cdhs: "AKJ52.J.J9743.54",
        shdc: "54.J9743.J.AKJ52",
        hcp: 10,
        lp: 12,
        sp: { C: 13, D: 12, H: 13, S: 12 },
        genericSp: 13,
        balanced: false,
        flat: false,
        controls: 3,
        aces: 1,
        kings: 1,
        lengths: [5, 1, 5, 2],
        longest: ["C", "H"],
        hcpBySuit: { C: 8, D: 1, H: 1, S: 0 },
        stoppers: {
          C: [true, true, true, true],
          D: [false, false, false, false],
          H: [false, false, false, true],
          S: [false, false, false, false],
        },
        pretty: "AKJ52.J.J9743.54 (hcp: 10 lp: 12 sp: 13)",
      },
      {
        cdhs: "732.Q32.AJ.AKJ98",
        shdc: "AKJ98.AJ.Q32.732",
        hcp: 15,
        lp: 16,
        sp: { C: 15, D: 15, H: 16, S: 15 },
        genericSp: 15,
        balanced: true,
        flat: false,
        controls: 5,
        aces: 2,
        kings: 1,
        lengths: [3, 3, 2, 5],
        longest: ["S"],
        hcpBySuit: { C: 0, D: 2, H: 5, S: 8 },
        stoppers: {
          C: [false, false, false, false],
          D: [false, false, true, true],
          H: [true, true, true, true],
          S: [true, true, true, true],
        },
        pretty: "732.Q32.AJ.AKJ98 (hcp: 15 lp: 16 sp: 15)",
      },
      {
        cdhs: "AQ8632.6.AKQT4.A",
        shdc: "A.AKQT4.6.AQ8632",
        hcp: 19,
        lp: 22,
        sp: { C: 25, D: 22, H: 25, S: 22 },
        genericSp: 25,
        balanced: false,
        flat: false,
        controls: 7,
        aces: 3,
        kings: 1,
        lengths: [6, 1, 5, 1],
        longest: ["C"],
        hcpBySuit: { C: 6, D: 0, H: 9, S: 4 },
        stoppers: {
          C: [true, true, true, true],
          D: [false, false, false, false],
          H: [true, true, true, true],
          S: [true, true, true, true],
        },
        pretty: "AQ8632.6.AKQT4.A (hcp: 19 lp: 22 sp: 25)",
      },
      {
        cdhs: "952.QT87.A86.Q52",
        shdc: "Q52.A86.QT87.952",
        hcp: 8,
        lp: 8,
        sp: { C: 8, D: 8, H: 8, S: 8 },
        genericSp: 8,
        balanced: true,
        flat: true,
        controls: 2,
        aces: 1,
        kings: 0,
        lengths: [3, 4, 3, 3],
        longest: ["D"],
        hcpBySuit: { C: 0, D: 2, H: 4, S: 2 },
        stoppers: {
          C: [false, false, false, false],
          D: [false, false, true, true],
          H: [true, true, true, true],
          S: [false, false, true, true],
        },
        pretty: "952.QT87.A86.Q52 (hcp: 8 lp: 8 sp: 8)",
      },
      {
        cdhs: "AK.J.T8753.JT432",
        shdc: "JT432.T8753.J.AK",
        hcp: 9,
        lp: 11,
        sp: { C: 11, D: 11, H: 12, S: 12 },
        genericSp: 12,
        balanced: false,
        flat: false,
        controls: 3,
        aces: 1,
        kings: 1,
        lengths: [2, 1, 5, 5],
        longest: ["H", "S"],
        hcpBySuit: { C: 7, D: 1, H: 0, S: 1 },
        stoppers: {
          C: [true, true, true, true],
          D: [false, false, false, false],
          H: [false, false, false, true],
          S: [false, false, false, true],
        },
        pretty: "AK.J.T8753.JT432 (hcp: 9 lp: 11 sp: 12)",
      },
      {
        cdhs: "KQJ.AT98.32.K765",
        shdc: "K765.32.AT98.KQJ",
        hcp: 13,
        lp: 13,
        sp: { C: 14, D: 14, H: 13, S: 14 },
        genericSp: 14,
        balanced: true,
        flat: false,
        controls: 4,
        aces: 1,
        kings: 2,
        lengths: [3, 4, 2, 4],
        longest: ["D", "S"],
        hcpBySuit: { C: 6, D: 4, H: 0, S: 3 },
        stoppers: {
          C: [false, true, true, true],
          D: [true, true, true, true],
          H: [false, false, false, false],
          S: [false, false, true, true],
        },
        pretty: "KQJ.AT98.32.K765 (hcp: 13 lp: 13 sp: 14)",
      },
    ];

    for (const row of rows) {
      const hand = Hand.fromCdhsString(row.cdhs);
      expect(hand.cdhsDotString()).toBe(row.cdhs);
      expect(hand.shdcDotString()).toBe(row.shdc);
      expect(hand.highCardPoints()).toBe(row.hcp);
      expect(hand.lengthPoints()).toBe(row.lp);
      expect(hand.genericSupportPoints()).toBe(row.genericSp);
      expect(hand.isBalanced()).toBe(row.balanced);
      expect(hand.isFlat()).toBe(row.flat);
      expect(hand.controlCount()).toBe(row.controls);
      expect(hand.aceCount()).toBe(row.aces);
      expect(hand.kingCount()).toBe(row.kings);
      expect(hand.suitLengths()).toEqual(row.lengths);
      expect(hand.longestSuits().map((suit) => suit.char)).toEqual(row.longest);
      expect(hand.prettyOneLine()).toBe(row.pretty);
      for (const suit of SUITS) {
        const char = suit.char as "C" | "D" | "H" | "S";
        expect(hand.supportPoints(suit)).toBe(row.sp[char]);
        expect(hand.hcpInSuit(suit)).toBe(row.hcpBySuit[char]);
        expect([
          hand.hasFirstRoundStopper(suit),
          hand.hasSecondRoundStopper(suit),
          hand.hasThirdRoundStopper(suit),
          hand.hasFourthRoundStopper(suit),
        ]).toEqual(row.stoppers[char]);
        expect(hand.isLongestSuit(suit)).toBe(row.longest.includes(char));
      }
    }
  });

  it("answers questions about its cards", () => {
    const hand = Hand.fromCdhsString("AKJ52.J.J9743.54");
    expect(hand.cardsInSuit(CLUBS)).toBe("AKJ52");
    expect(hand.lengthOfSuit(CLUBS)).toBe(5);
    expect(hand.highCardInSuit(CLUBS)).toBe("A");
    expect(hand.highCardInSuit(DIAMONDS)).toBe("J");
    expect(hand.hasAtLeast(2, "AKQ", CLUBS)).toBe(true);
    expect(hand.hasAtLeast(3, "AKQ", CLUBS)).toBe(false);
    expect(hand.isLongestSuit(CLUBS, [CLUBS])).toBe(false);
    expect(hand.isLongestSuit(SPADES, [CLUBS, HEARTS])).toBe(true);
    expect(() =>
      Hand.fromCdhsString("AKJ52..J9743.J54").highCardInSuit(DIAMONDS),
    ).toThrow();
  });

  it("plays a card out of a hand", () => {
    const hand = Hand.fromCdhsString("AKJ52.J.J9743.54");
    hand.playCard(CLUBS, "A");
    expect(hand.cardsInSuit(CLUBS)).toBe("KJ52");
    expect(hand.lengthOfSuit(CLUBS)).toBe(4);
    expect(() => hand.playCard(CLUBS, "A")).toThrow();
  });

  it("refuses a hand that is not thirteen cards", () => {
    expect(() => Hand.fromCdhsString("AKJ52.J.J9743.5")).toThrow();
    expect(() => Hand.fromCdhsString("AKJ52.J.J9743.543")).toThrow();
  });

  it("deals a random hand", () => {
    const hand = Hand.random(mulberry32(7));
    expect(
      hand.suitLengths().reduce((total, length) => total + length, 0),
    ).toBe(13);
    // The same seed deals the same hand.
    expect(Hand.random(mulberry32(7)).cdhsDotString()).toBe(
      hand.cdhsDotString(),
    );
    expect(
      Hand.random()
        .suitLengths()
        .reduce((a, b) => a + b, 0),
    ).toBe(13);
  });
});
