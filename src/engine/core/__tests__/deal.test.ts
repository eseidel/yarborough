// Translated from python/core/tests/test_deal.py, plus the identifier round
// trips the fixtures will compare. Every expected value comes from running the
// Python.

import { describe, it, expect } from "vitest";
import { Deal } from "../deal";
import { NORTH, POSITIONS, WEST } from "../position";
import { mulberry32 } from "../random";

const IN_ORDER =
  "23456789TJQKA... .23456789TJQKA.. ..23456789TJQKA. ...23456789TJQKA";

describe("Deal", () => {
  it("round trips its identifier", () => {
    const deal = Deal.fromString(IN_ORDER);
    expect(deal.identifier).toBe("0000001555555aaaaaabffffff");
    expect(Deal.fromIdentifier(deal.identifier).prettyOneLine()).toBe(
      deal.prettyOneLine(),
    );
  });

  it("round trips the old base-four identifier", () => {
    const deal = Deal.fromString(IN_ORDER);
    expect(deal.oldIdentifier).toBe("20282409502907850621528255234048");
    expect(Deal.fromIdentifier(deal.oldIdentifier).identifier).toBe(
      deal.identifier,
    );
    // An old identifier is anything longer than 29 characters.
    expect(deal.oldIdentifier.length).toBeGreaterThan(29);
    expect(deal.identifier).toHaveLength(26);
  });

  it("reads both identifier forms of the same deal", () => {
    const hands = [
      "AQ8632.6.AKQT4.A",
      "J4.AQ2.73.K86543",
      "T975.KJT4.92.QT9",
      "K.98753.J865.J72",
    ];
    const hex = "0622931ecfe9993de30355dae4";
    const old = "2190948053667986713720276813968";
    for (const identifier of [hex, old]) {
      const deal = Deal.fromIdentifier(identifier);
      expect(deal.hands.map((hand) => hand.cdhsDotString())).toEqual(hands);
      expect(deal.identifier).toBe(hex);
      expect(deal.oldIdentifier).toBe(old);
    }
  });

  it("writes itself as json", () => {
    const deal = Deal.fromString(IN_ORDER);
    expect(JSON.parse(deal.toJson()).east).toBe(".AKQJT98765432..");
    expect(deal.toJson()).toBe(
      '{"north": "AKQJT98765432...", "east": ".AKQJT98765432..", "south": "..AKQJT98765432.", "west": "...AKQJT98765432"}',
    );
    expect(Object.keys(JSON.parse(deal.toJson()))).toEqual([
      "north",
      "east",
      "south",
      "west",
    ]);
  });

  it("writes itself on one line", () => {
    const deal = Deal.fromString(IN_ORDER);
    expect(deal.prettyOneLine()).toBe(
      "N: AKQJT98765432... (hcp: 10 lp: 19 sp: 25) E: .AKQJT98765432.. (hcp: 10 lp: 19 sp: 25) S: ..AKQJT98765432. (hcp: 10 lp: 19 sp: 25) W: ...AKQJT98765432 (hcp: 10 lp: 19 sp: 25)",
    );
    expect(deal.handFor(NORTH).cdhsDotString()).toBe("AKQJT98765432...");
    expect(deal.handFor(WEST).cdhsDotString()).toBe("...AKQJT98765432");
  });

  it("refuses a deal that is not fifty-two distinct cards", () => {
    expect(() =>
      Deal.fromString(
        "23456789TJQKA... 23456789TJQKA... ..23456789TJQKA. ...23456789TJQKA",
      ),
    ).toThrow();
  });

  it("deals a random deal", () => {
    const deal = Deal.random(mulberry32(11));
    expect(deal.hands).toHaveLength(4);
    for (const position of POSITIONS) {
      expect(
        deal
          .handFor(position)
          .suitLengths()
          .reduce((a, b) => a + b, 0),
      ).toBe(13);
    }
    // The same seed deals the same deal, and any deal round trips.
    expect(Deal.random(mulberry32(11)).identifier).toBe(deal.identifier);
    expect(Deal.fromIdentifier(deal.identifier).identifier).toBe(
      deal.identifier,
    );
    expect(Deal.random().hands).toHaveLength(4);
  });
});
