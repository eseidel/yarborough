// Translated from python/core/tests/test_board.py, plus the identifier forms
// the fixtures will compare. Every expected value comes from running the
// Python.

import { describe, it, expect } from "vitest";
import { Board } from "../board";
import { CallHistory } from "../callhistory";
import { EAST, NORTH, SOUTH, WEST } from "../position";
import { mulberry32 } from "../random";

const DEAL_IDENTIFIER = "0622931ecfe9993de30355dae4";

describe("Board", () => {
  it("defaults to board one, dealt by North", () => {
    const board = new Board();
    expect(board.number).toBe(1);
    expect(board.callHistory.dealer).toBe(NORTH);
    expect(board.deal.hands).toHaveLength(4);
    expect(board.callHistory.calls).toEqual([]);
    expect(board.callHistory.vulnerability.name).toBe("None");
  });

  it("prefers the new identifier but reads the old one", () => {
    const board = Board.fromIdentifier(
      "8-2190948053667986713720276813968-N:NO:",
    );
    // Note how we can handle parsing old-style identifiers, but we prefer new ones:
    expect(board.identifier).toBe(`8-${DEAL_IDENTIFIER}`);
    // Make sure that parsing new-style identifiers does not raise.
    expect(Board.fromIdentifier(`8-${DEAL_IDENTIFIER}`)).toBeTruthy();
    expect(board.number).toBe(8);
    expect(board.callHistory.dealer).toBe(NORTH);
    expect(board.callHistory.vulnerability.name).toBe("None");
    // FIXME: We shouldn't really be using prettyOneLine here since it's likely to change.
    expect(board.deal.prettyOneLine()).toBe(
      "N: AQ8632.6.AKQT4.A (hcp: 19 lp: 22 sp: 25) E: J4.AQ2.73.K86543 (hcp: 10 lp: 12 sp: 11) S: T975.KJT4.92.QT9 (hcp: 6 lp: 6 sp: 7) W: K.98753.J865.J72 (hcp: 5 lp: 6 sp: 5)",
    );
  });

  it("takes the calls, the dealer and the vulnerability from the board number", () => {
    const board = Board.fromIdentifier(`8-${DEAL_IDENTIFIER}:1C,P,1S`);
    expect(board.number).toBe(8);
    // Board eight is dealt by West, with nobody vulnerable.
    expect(board.callHistory.dealer).toBe(WEST);
    expect(board.callHistory.vulnerability.name).toBe("None");
    expect(board.callHistory.callsString()).toBe("1C P 1S");
    expect(board.callHistory.identifier).toBe("W:NO:1C,P,1S");
    expect(board.identifier).toBe(`8-${DEAL_IDENTIFIER}:1C,P,1S`);
  });

  it("reads a three-part identifier that carries its own call history", () => {
    const board = Board.fromIdentifier(`5-${DEAL_IDENTIFIER}-E:BO:1C,P`);
    expect(board.number).toBe(5);
    expect(board.callHistory.dealer).toBe(EAST);
    expect(board.callHistory.vulnerability.name).toBe("Both");
    expect(board.callHistory.callsString()).toBe("1C P");
    // The dealer and vulnerability of the identifier are not written back out.
    expect(board.identifier).toBe(`5-${DEAL_IDENTIFIER}:1C,P`);
  });

  it("keeps a call history it was handed", () => {
    const board = Board.fromIdentifier(`8-${DEAL_IDENTIFIER}`);
    const withCalls = new Board(
      board.number,
      board.deal,
      CallHistory.fromString("1N P", "S", "N-S"),
    );
    expect(withCalls.identifier).toBe(`8-${DEAL_IDENTIFIER}:1N,P`);
    expect(withCalls.callHistory.dealer).toBe(SOUTH);
    expect(board.callHistory.dealer).toBe(WEST);
  });

  it("refuses an identifier it cannot parse", () => {
    expect(() => Board.fromIdentifier(DEAL_IDENTIFIER)).toThrow();
    expect(() => Board.fromIdentifier(`8-${DEAL_IDENTIFIER}:1C:P`)).toThrow();
  });

  it("deals a random board", () => {
    const board = Board.random(mulberry32(3));
    expect(board.number).toBeGreaterThanOrEqual(1);
    expect(board.number).toBeLessThanOrEqual(16);
    expect(board.deal.hands).toHaveLength(4);
    expect(board.callHistory.calls).toEqual([]);
    expect(board.callHistory.dealer).toBe(
      CallHistory.dealerFromBoardNumber(board.number),
    );
    // The same seed deals the same board.
    expect(Board.random(mulberry32(3)).identifier).toBe(board.identifier);
    expect(Board.random().deal.hands).toHaveLength(4);
  });
});
