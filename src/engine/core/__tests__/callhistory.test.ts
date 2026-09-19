// Translated from python/core/tests/test_callhistory.py, plus the parts of
// callhistory.py the Python tests do not reach. Every expected value comes
// from running the Python.

import { describe, it, expect } from "vitest";
import { Call } from "../call";
import { CallHistory, Vulnerability } from "../callhistory";
import { EAST, NORTH, POSITIONS, SOUTH, WEST } from "../position";

const ALL_CALLS = [
  "P",
  "X",
  "XX",
  "1C",
  "1D",
  "1H",
  "1S",
  "1N",
  "2C",
  "2D",
  "2H",
  "2S",
  "2N",
  "3C",
  "3D",
  "3H",
  "3S",
  "3N",
  "4C",
  "4D",
  "4H",
  "4S",
  "4N",
  "5C",
  "5D",
  "5H",
  "5S",
  "5N",
  "6C",
  "6D",
  "6H",
  "6S",
  "6N",
  "7C",
  "7D",
  "7H",
  "7S",
  "7N",
];

function legalCalls(historyString: string): string[] {
  const history = CallHistory.fromString(historyString);
  return ALL_CALLS.filter((name) => history.isLegalCall(Call.fromString(name)));
}

describe("Vulnerability", () => {
  it("comes from a board number", () => {
    const expectations: Record<number, string> = {
      1: "None",
      2: "N-S",
      3: "E-W",
      4: "Both",
      5: "N-S",
      6: "E-W",
      7: "Both",
      8: "None",
      9: "E-W",
      10: "Both",
      11: "None",
      12: "N-S",
      13: "Both",
      14: "None",
      15: "N-S",
      16: "E-W",
      17: "None",
      31: "N-S",
      33: "None",
    };
    for (const [number, expected] of Object.entries(expectations)) {
      expect(Vulnerability.fromBoardNumber(Number(number)).name).toBe(expected);
    }
  });

  it("has an identifier, a gib name and vulnerable seats", () => {
    const expectations: Record<
      string,
      { identifier: string; gib: string; vulnerable: string[] }
    > = {
      "E-W": { identifier: "EW", gib: "e", vulnerable: ["E", "W"] },
      "N-S": { identifier: "NS", gib: "n", vulnerable: ["N", "S"] },
      None: { identifier: "NO", gib: "-", vulnerable: [] },
      Both: { identifier: "BO", gib: "b", vulnerable: ["N", "E", "S", "W"] },
    };
    for (const [name, expected] of Object.entries(expectations)) {
      const vulnerability = new Vulnerability(name);
      expect(vulnerability.identifier).toBe(expected.identifier);
      expect(vulnerability.gibName()).toBe(expected.gib);
      expect(
        POSITIONS.filter((position) =>
          vulnerability.isVulnerable(position),
        ).map((position) => position.char),
      ).toEqual(expected.vulnerable);
      expect(Vulnerability.fromIdentifier(expected.identifier).name).toBe(name);
    }
  });

  it("defaults to None and refuses anything else", () => {
    expect(new Vulnerability().name).toBe("None");
    expect(new Vulnerability(null).name).toBe("None");
    expect(Vulnerability.fromString("").name).toBe("None");
    expect(
      Vulnerability.fromString("Both").equals(new Vulnerability("Both")),
    ).toBe(true);
    expect(() => new Vulnerability("N/S")).toThrow();
    expect(() => Vulnerability.fromIdentifier("XX")).toThrow();
  });
});

describe("CallHistory", () => {
  function assertDeclarer(
    historyString: string,
    dealer: typeof NORTH,
    declarer: typeof NORTH | null,
  ): void {
    expect(CallHistory.fromString(historyString, dealer.char).declarer()).toBe(
      declarer,
    );
  }

  it("finds the dummy", () => {
    expect(CallHistory.fromString("1S P 2S P P P").dummy()).toBe(SOUTH);
    expect(CallHistory.fromString("P P").dummy()).toBeNull();
  });

  it("finds the declarer", () => {
    assertDeclarer("", NORTH, null);
    assertDeclarer("P P P P", NORTH, null);
    assertDeclarer("1C", NORTH, NORTH);
    assertDeclarer("1C P P P", NORTH, NORTH);
    assertDeclarer("1C P 2C", NORTH, NORTH);
    assertDeclarer("1C P 1S", NORTH, SOUTH);
    assertDeclarer("P 1C P 1D P", NORTH, WEST);
    assertDeclarer("P 1C P 1D P", EAST, NORTH);
    assertDeclarer("P 1C P 1D P", WEST, SOUTH);
  });

  it("knows whose turn it is", () => {
    expect(CallHistory.fromString("").positionToCall()).toBe(NORTH);
    expect(CallHistory.fromString("P").positionToCall()).toBe(EAST);
    expect(CallHistory.fromString("1N P").positionToCall()).toBe(SOUTH);
    expect(CallHistory.fromString("1N P 2C").positionToCall()).toBe(WEST);
    expect(CallHistory.fromString("1N P 2C P").positionToCall()).toBe(NORTH);
    expect(CallHistory.fromString("1N P 2C P 2D").positionToCall()).toBe(EAST);
  });

  it("knows who called last", () => {
    expect(CallHistory.fromString("").lastToCall).toBeNull();
    expect(CallHistory.fromString("P").lastToCall).toBe(NORTH);
    expect(CallHistory.fromString("1N P").lastToCall).toBe(EAST);
    expect(CallHistory.fromString("1N P 2C").lastToCall).toBe(SOUTH);
    expect(CallHistory.fromString("1N P 2C P").lastToCall).toBe(WEST);
    expect(CallHistory.fromString("1N P 2C P 2D").lastToCall).toBe(NORTH);
  });

  it("recognizes a passout", () => {
    expect(CallHistory.fromString("").isPassout()).toBe(false);
    expect(CallHistory.fromString("P").isPassout()).toBe(false);
    expect(CallHistory.fromString("P P").isPassout()).toBe(false);
    expect(CallHistory.fromString("P P P").isPassout()).toBe(false);
    expect(CallHistory.fromString("P P P P").isPassout()).toBe(true);
    expect(CallHistory.fromString("P 1N P P P").isPassout()).toBe(false);
  });

  it("copies a partial history without touching the original", () => {
    const history = CallHistory.fromString("P P 1N P P P");
    expect(history.calls).toHaveLength(6);
    expect(history.copyWithPartialHistory(0).calls).toHaveLength(0);
    expect(history.copyWithPartialHistory(2).calls).toHaveLength(2);
    expect(history.copyWithPartialHistory(-2).calls).toHaveLength(4);
    const partialHistory = history.copyWithPartialHistory(3);
    expect(history.calls).toHaveLength(6);
    expect(partialHistory.calls).toHaveLength(3);
    partialHistory.calls.push(Call.fromString("P"));
    expect(history.calls).toHaveLength(6);
    expect(partialHistory.calls).toHaveLength(4);
    expect(partialHistory.dealer).toBe(history.dealer);
    expect(partialHistory.vulnerability).toBe(history.vulnerability);
  });

  it("climbs back up to the full history", () => {
    const history = CallHistory.fromString("P P 1N P P P");
    expect(
      history
        .ascendingPartialHistories(2)
        .map((partial) => partial.callsString()),
    ).toEqual(["P P", "P P 1N P", "P P 1N P P P"]);
    expect(
      history
        .ascendingPartialHistories(4)
        .map((partial) => partial.callsString()),
    ).toEqual(["P P", "P P 1N P P P"]);
    expect(CallHistory.fromString("").ascendingPartialHistories(2)).toEqual([]);
  });

  it("recognizes a competitive auction", () => {
    expect(CallHistory.fromString("1D P 1H P").competativeAuction()).toBe(
      false,
    );
    expect(CallHistory.fromString("1D 1H").competativeAuction()).toBe(true);
    expect(CallHistory.fromString("1D P P X").competativeAuction()).toBe(false);
  });

  it("finds the opener", () => {
    expect(CallHistory.fromString("P 1C P 1D P", NORTH.char).opener()).toBe(
      EAST,
    );
    expect(CallHistory.fromString("P 1C P 1D P", EAST.char).opener()).toBe(
      SOUTH,
    );
    expect(CallHistory.fromString("P 1C P 1D P", WEST.char).opener()).toBe(
      NORTH,
    );
    expect(CallHistory.fromString("P P P P").opener()).toBeNull();
  });

  it("round trips an identifier", () => {
    expect(CallHistory.fromIdentifier("E:EW:P").identifier).toBe(
      CallHistory.fromString("P", "E", "E-W").identifier,
    );
    // fromIdentifier is forgiving of a missing trailing colon
    expect(CallHistory.fromIdentifier("E:EW:").identifier).toBe(
      CallHistory.fromString("", "E", "E-W").identifier,
    );
    expect(CallHistory.fromIdentifier("E:EW").identifier).toBe(
      CallHistory.fromString("", "E", "E-W").identifier,
    );
    // fromIdentifier is forgiving of a trailing comma.
    expect(CallHistory.fromIdentifier("N:NO:P,").callsString()).toBe("P");
    expect(CallHistory.fromIdentifier("E:EW:P").identifier).toBe("E:EW:P");
    expect(CallHistory.fromString("1C P 1S", "S", "Both").identifier).toBe(
      "S:BO:1C,P,1S",
    );
    expect(() => CallHistory.fromIdentifier("E")).toThrow();
  });

  it("can double", () => {
    expect(CallHistory.fromString("1S 2H 2S").canDouble()).toBe(true);
    expect(CallHistory.fromString("1S").canDouble()).toBe(true);
    // The declarer's partner is next to call, so there is nothing to double.
    expect(CallHistory.fromString("1S P").canDouble()).toBe(false);
    expect(CallHistory.fromString("1S X").canDouble()).toBe(false);
    expect(CallHistory.fromString("1S X").canRedouble()).toBe(true);
    expect(CallHistory.fromString("1S X P").canRedouble()).toBe(false);
    expect(CallHistory.fromString("1S").canRedouble()).toBe(false);
  });

  it("checks a call for legality", () => {
    const assertIsLegalCall = (
      historyString: string,
      callName: string,
      isLegal: boolean,
    ): void => {
      const callHistory = CallHistory.fromString(historyString);
      const call = Call.fromString(callName);
      expect(callHistory.isLegalCall(call)).toBe(isLegal);
    };
    assertIsLegalCall("", "P", true);
    assertIsLegalCall("", "X", false);
    assertIsLegalCall("", "XX", false);
    assertIsLegalCall("P", "X", false);
    assertIsLegalCall("1N", "1C", false);
    assertIsLegalCall("1N", "XX", false);
    assertIsLegalCall("1N X", "X", false);
    assertIsLegalCall("1N X", "XX", true);
    assertIsLegalCall("P 1D 2S P", "X", false);
  });

  it("checks every call over a few auctions", () => {
    const suitedAndNotrump = ALL_CALLS.slice(3);
    expect(legalCalls("")).toEqual(["P", ...suitedAndNotrump]);
    expect(legalCalls("P")).toEqual(["P", ...suitedAndNotrump]);
    expect(legalCalls("1N")).toEqual([
      "P",
      "X",
      ...suitedAndNotrump.slice(suitedAndNotrump.indexOf("2C")),
    ]);
    expect(legalCalls("1N X")).toEqual([
      "P",
      "XX",
      ...suitedAndNotrump.slice(suitedAndNotrump.indexOf("2C")),
    ]);
    expect(legalCalls("P 1D 2S P")).toEqual([
      "P",
      ...suitedAndNotrump.slice(suitedAndNotrump.indexOf("2N")),
    ]);
    expect(legalCalls("1C P 1S X")).toEqual([
      "P",
      "XX",
      ...suitedAndNotrump.slice(suitedAndNotrump.indexOf("1N")),
    ]);
    expect(legalCalls("1C P 1S XX")).toEqual([
      "P",
      ...suitedAndNotrump.slice(suitedAndNotrump.indexOf("1N")),
    ]);
    expect(legalCalls("7N X")).toEqual(["P", "XX"]);
    // An auction that is over has no legal calls at all; asking throws.
    expect(() =>
      CallHistory.fromString("P P P P").isLegalCall(Call.fromString("P")),
    ).toThrow();
  });

  it("reads off the declarer, the contract and the state of the auction", () => {
    const rows = [
      {
        dealer: "N",
        auction: "1C P 1S P 2S P P P",
        declarer: "S",
        dummy: "N",
        opener: "N",
        contract: "2S",
        complete: true,
        passout: false,
        competative: false,
        identifier: "N:NO:1C,P,1S,P,2S,P,P,P",
        pretty: "Deal: N, Bids: 1C P 1S P 2S P P P",
      },
      {
        dealer: "E",
        auction: "P 1N X P P P",
        declarer: "S",
        dummy: "N",
        opener: "S",
        contract: "1NX",
        complete: true,
        passout: false,
        competative: false,
        identifier: "E:NO:P,1N,X,P,P,P",
        pretty: "Deal: E, Bids: P 1N X P P P",
      },
      {
        dealer: "S",
        auction: "1H 1S X XX P P P",
        declarer: "W",
        dummy: "E",
        opener: "S",
        contract: "1SXX",
        complete: true,
        passout: false,
        competative: true,
        identifier: "S:NO:1H,1S,X,XX,P,P,P",
        pretty: "Deal: S, Bids: 1H 1S X XX P P P",
      },
      {
        dealer: "W",
        auction: "P P P P",
        declarer: null,
        dummy: null,
        opener: null,
        contract: null,
        complete: true,
        passout: true,
        competative: false,
        identifier: "W:NO:P,P,P,P",
        pretty: "Deal: W, Bids: P P P P",
      },
      {
        dealer: "N",
        auction: "1N P 3N P P X P P P",
        declarer: "N",
        dummy: "S",
        opener: "N",
        contract: "3NX",
        complete: true,
        passout: false,
        competative: false,
        identifier: "N:NO:1N,P,3N,P,P,X,P,P,P",
        pretty: "Deal: N, Bids: 1N P 3N P P X P P P",
      },
    ];
    for (const row of rows) {
      const history = CallHistory.fromString(row.auction, row.dealer);
      expect(history.declarer()?.char ?? null).toBe(row.declarer);
      expect(history.dummy()?.char ?? null).toBe(row.dummy);
      expect(history.opener()?.char ?? null).toBe(row.opener);
      expect(history.contract()).toBe(row.contract);
      expect(history.isComplete()).toBe(row.complete);
      expect(history.isPassout()).toBe(row.passout);
      expect(history.competativeAuction()).toBe(row.competative);
      expect(history.identifier).toBe(row.identifier);
      expect(history.prettyOneLine()).toBe(row.pretty);
      expect(`${history}`).toBe(row.auction);
      expect(history.length).toBe(row.auction.split(" ").length);
    }
  });

  it("parses a calls string", () => {
    expect(CallHistory.fromString("").calls).toEqual([]);
    expect(CallHistory.fromString(" ").calls).toEqual([]);
    expect(CallHistory.fromString("1C,P,1S").callsString()).toBe("1C P 1S");
    expect(CallHistory.fromString("1C,P,1S").commaSeparatedCalls()).toBe(
      "1C,P,1S",
    );
    expect(CallHistory.fromString(" 1c p ").callsString()).toBe("1C P");
    expect(CallHistory.fromString("").dealer).toBe(NORTH);
    expect(CallHistory.fromString("").vulnerability.name).toBe("None");
  });

  it("appends a call to a copy", () => {
    const history = CallHistory.fromString("1C P", "E", "Both");
    const appended = history.copyAppendingCall(Call.fromString("1S"));
    expect(history.callsString()).toBe("1C P");
    expect(appended.callsString()).toBe("1C P 1S");
    expect(appended.dealer).toBe(EAST);
    expect(appended.vulnerability.name).toBe("Both");
    expect(() => history.copyAppendingCall(Call.fromString("1C"))).toThrow();
  });

  it("reads the calls by seat", () => {
    const history = CallHistory.fromString("1C P 1S P 2S", "E");
    expect(history.callsBy(EAST).map((call) => call.name)).toEqual([
      "1C",
      "2S",
    ]);
    expect(history.callsBy(SOUTH).map((call) => call.name)).toEqual(["P"]);
    expect(history.callsBy(WEST).map((call) => call.name)).toEqual(["1S"]);
    expect(history.callsBy(NORTH).map((call) => call.name)).toEqual(["P"]);
    expect(history.lastCallBy(EAST)?.name).toBe("2S");
    expect(history.firstCallBy(EAST)?.name).toBe("1C");
    expect(history.positionToCall()).toBe(SOUTH);
    expect(history.lastCallByNextBidder()?.name).toBe("P");
    expect(CallHistory.fromString("1C").lastCallBy(SOUTH)).toBeNull();
    expect(CallHistory.fromString("1C").firstCallBy(SOUTH)).toBeNull();
    expect(CallHistory.fromString("1C").lastCallByNextBidder()).toBeNull();
    expect(history.lastCall?.name).toBe("2S");
    expect(history.lastNonPass()?.name).toBe("2S");
    expect(history.lastToNotPass()).toBe(EAST);
    expect(history.lastContract()?.name).toBe("2S");
    expect(
      history
        .enumerateCalls()
        .map(([seat, call]) => `${seat.char}${call.name}`),
    ).toEqual(["E1C", "SP", "W1S", "NP", "E2S"]);
    expect(
      history
        .enumerateReversedCalls()
        .map(([seat, call]) => `${seat.char}${call.name}`),
    ).toEqual(["E2S", "NP", "W1S", "SP", "E1C"]);
    expect(CallHistory.fromString("").lastCall).toBeNull();
    expect(CallHistory.fromString("P P").lastNonPass()).toBeNull();
    expect(CallHistory.fromString("P P").lastToNotPass()).toBeNull();
    expect(CallHistory.fromString("P P").lastContract()).toBeNull();
    expect(CallHistory.fromString("P P").contract()).toBeNull();
  });

  it("takes the dealer and the vulnerability from a board number", () => {
    expect(CallHistory.emptyForBoardNumber(1).dealer).toBe(NORTH);
    expect(CallHistory.emptyForBoardNumber(6).dealer).toBe(EAST);
    expect(CallHistory.emptyForBoardNumber(16).dealer).toBe(WEST);
    const dealers: Record<number, string> = {
      1: "N",
      2: "E",
      3: "S",
      4: "W",
      5: "N",
      8: "W",
      9: "N",
      16: "W",
      17: "N",
    };
    for (const [number, char] of Object.entries(dealers)) {
      expect(CallHistory.dealerFromBoardNumber(Number(number)).char).toBe(char);
    }
    const history = CallHistory.fromBoardNumberAndCallsString(4, "1C,P");
    expect(history.dealer).toBe(WEST);
    expect(history.vulnerability.name).toBe("Both");
    expect(history.callsString()).toBe("1C P");
  });
});
