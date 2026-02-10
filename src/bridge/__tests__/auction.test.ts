import { describe, it, expect } from "vitest";
import {
  currentPlayer,
  isAuctionComplete,
  lastBidCall,
  addRobotPasses,
} from "../auction";
import type { CallHistory, Call } from "../types";

const pass: Call = { type: "pass" };
const oneClub: Call = { type: "bid", level: 1, strain: "C" };
const oneHeart: Call = { type: "bid", level: 1, strain: "H" };

describe("currentPlayer", () => {
  it("returns dealer when no calls have been made", () => {
    expect(currentPlayer({ dealer: "N", calls: [] })).toBe("N");
    expect(currentPlayer({ dealer: "E", calls: [] })).toBe("E");
    expect(currentPlayer({ dealer: "S", calls: [] })).toBe("S");
    expect(currentPlayer({ dealer: "W", calls: [] })).toBe("W");
  });

  it("advances clockwise through positions", () => {
    const history: CallHistory = { dealer: "N", calls: [pass] };
    expect(currentPlayer(history)).toBe("E");
  });

  it("wraps around after West", () => {
    const history: CallHistory = { dealer: "W", calls: [pass] };
    expect(currentPlayer(history)).toBe("N");
  });

  it("cycles correctly for a full round", () => {
    const history: CallHistory = {
      dealer: "E",
      calls: [pass, pass, pass],
    };
    // E + 3 calls = N (wraps around: E→S→W→N)
    expect(currentPlayer(history)).toBe("N");
  });
});

describe("isAuctionComplete", () => {
  it("is not complete with fewer than 4 calls", () => {
    expect(isAuctionComplete({ dealer: "N", calls: [] })).toBe(false);
    expect(isAuctionComplete({ dealer: "N", calls: [pass, pass, pass] })).toBe(
      false,
    );
  });

  it("is complete when all 4 players pass", () => {
    expect(
      isAuctionComplete({ dealer: "N", calls: [pass, pass, pass, pass] }),
    ).toBe(true);
  });

  it("is complete when last 3 calls are passes after a bid", () => {
    expect(
      isAuctionComplete({
        dealer: "N",
        calls: [oneClub, pass, pass, pass],
      }),
    ).toBe(true);
  });

  it("is not complete when bidding is still active", () => {
    expect(
      isAuctionComplete({
        dealer: "N",
        calls: [oneClub, pass, oneHeart, pass],
      }),
    ).toBe(false);
  });
});

describe("lastBidCall", () => {
  it("returns undefined when no bids have been made", () => {
    expect(lastBidCall({ dealer: "N", calls: [pass, pass] })).toBeUndefined();
  });

  it("returns the most recent bid", () => {
    const history: CallHistory = {
      dealer: "N",
      calls: [oneClub, pass, oneHeart, pass],
    };
    expect(lastBidCall(history)).toEqual(oneHeart);
  });
});

describe("addRobotPasses", () => {
  it("adds no passes when dealer is the user position", () => {
    const history: CallHistory = { dealer: "S", calls: [] };
    const result = addRobotPasses(history, "S");
    expect(result.calls).toHaveLength(0);
  });

  it("adds passes until it is the user's turn", () => {
    const history: CallHistory = { dealer: "N", calls: [] };
    const result = addRobotPasses(history, "S");
    // N passes, E passes → now S's turn
    expect(result.calls).toHaveLength(2);
    expect(result.calls.every((c) => c.type === "pass")).toBe(true);
    expect(currentPlayer(result)).toBe("S");
  });

  it("wraps around correctly when dealer is West and user is South", () => {
    const history: CallHistory = { dealer: "W", calls: [] };
    const result = addRobotPasses(history, "S");
    // W passes, N passes, E passes → now S's turn
    expect(result.calls).toHaveLength(3);
    expect(currentPlayer(result)).toBe("S");
  });

  it("adds passes after user bid until user's turn again", () => {
    // Dealer is N, user is S. N and E already passed, user bid 1C.
    const history: CallHistory = {
      dealer: "N",
      calls: [pass, pass, oneClub],
    };
    // After user's 1C: W passes, N passes, E passes → S's turn
    const result = addRobotPasses(history, "S");
    expect(result.calls).toHaveLength(6);
    expect(currentPlayer(result)).toBe("S");
  });

  it("completes auction when all robots pass out", () => {
    // Dealer is S (user), user passes. Robots should all pass → auction done.
    const history: CallHistory = { dealer: "S", calls: [pass] };
    const result = addRobotPasses(history, "S");
    expect(result.calls).toHaveLength(4);
    expect(isAuctionComplete(result)).toBe(true);
  });

  it("works with East as dealer and user as South", () => {
    const history: CallHistory = { dealer: "E", calls: [] };
    const result = addRobotPasses(history, "S");
    // E passes → S's turn
    expect(result.calls).toHaveLength(1);
    expect(currentPlayer(result)).toBe("S");
  });
});
