import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  currentPlayer,
  isAuctionComplete,
  lastBidCall,
  callToString,
  addRobotBids,
} from "../auction";
import type { CallHistory, Call } from "../types";

vi.mock("../engine", () => ({
  getNextBid: vi.fn(),
}));

import { getNextBid } from "../engine";
const mockGetNextBid = vi.mocked(getNextBid);

const pass: Call = { type: "pass" };
const oneClub: Call = { type: "bid", level: 1, strain: "C" };
const oneHeart: Call = { type: "bid", level: 1, strain: "H" };
const oneNT: Call = { type: "bid", level: 1, strain: "N" };

beforeEach(() => {
  mockGetNextBid.mockReset();
});

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

describe("callToString", () => {
  it("serializes pass", () => {
    expect(callToString(pass)).toBe("P");
  });

  it("serializes bids", () => {
    expect(callToString(oneClub)).toBe("1C");
    expect(callToString(oneHeart)).toBe("1H");
    expect(callToString(oneNT)).toBe("1N");
  });

  it("serializes double and redouble", () => {
    expect(callToString({ type: "double" })).toBe("X");
    expect(callToString({ type: "redouble" })).toBe("XX");
  });
});

describe("addRobotBids", () => {
  const boardId = "1-00000000000000000000000000";

  it("adds no bids when dealer is the user position", async () => {
    const history: CallHistory = { dealer: "S", calls: [] };
    const result = await addRobotBids(history, "S", boardId);
    expect(result.calls).toHaveLength(0);
    expect(mockGetNextBid).not.toHaveBeenCalled();
  });

  it("calls engine for each robot turn until user's turn", async () => {
    mockGetNextBid.mockResolvedValue(pass);
    const history: CallHistory = { dealer: "N", calls: [] };
    const result = await addRobotBids(history, "S", boardId);
    // N passes, E passes → now S's turn
    expect(result.calls).toHaveLength(2);
    expect(result.calls.every((c) => c.type === "pass")).toBe(true);
    expect(currentPlayer(result)).toBe("S");
    expect(mockGetNextBid).toHaveBeenCalledTimes(2);
  });

  it("passes the correct identifier with call history", async () => {
    mockGetNextBid.mockResolvedValue(pass);
    const history: CallHistory = { dealer: "E", calls: [] };
    await addRobotBids(history, "S", boardId);
    // First call: no calls yet
    expect(mockGetNextBid).toHaveBeenCalledWith(boardId);
    // Second call would not happen since E passes then it's S's turn
    expect(mockGetNextBid).toHaveBeenCalledTimes(1);
  });

  it("builds identifier with accumulated calls", async () => {
    mockGetNextBid.mockResolvedValue(pass);
    const history: CallHistory = { dealer: "W", calls: [] };
    await addRobotBids(history, "S", boardId);
    // W, N, E all need to bid before S
    expect(mockGetNextBid).toHaveBeenCalledTimes(3);
    // Third call should include previous two passes
    expect(mockGetNextBid).toHaveBeenNthCalledWith(3, `${boardId}:P,P`);
  });

  it("uses real bids from the engine", async () => {
    mockGetNextBid.mockResolvedValueOnce(oneNT); // E opens 1NT
    const history: CallHistory = { dealer: "E", calls: [] };
    const result = await addRobotBids(history, "S", boardId);
    // E bids 1NT → S's turn
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toEqual(oneNT);
  });

  it("completes auction when all robots pass out", async () => {
    mockGetNextBid.mockResolvedValue(pass);
    // Dealer is S (user), user passes. Robots should all pass → auction done.
    const history: CallHistory = { dealer: "S", calls: [pass] };
    const result = await addRobotBids(history, "S", boardId);
    expect(result.calls).toHaveLength(4);
    expect(isAuctionComplete(result)).toBe(true);
  });

  it("adds robot bids after user bid until user's turn again", async () => {
    mockGetNextBid.mockResolvedValue(pass);
    // Dealer is N, user is S. N and E already passed, user bid 1C.
    const history: CallHistory = {
      dealer: "N",
      calls: [pass, pass, oneClub],
    };
    // After user's 1C: W passes, N passes, E passes → S's turn
    const result = await addRobotBids(history, "S", boardId);
    expect(result.calls).toHaveLength(6);
    expect(currentPlayer(result)).toBe("S");
  });
});
