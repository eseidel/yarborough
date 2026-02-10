import type { Call, CallHistory, Position } from "./types";

const POSITION_ORDER: Position[] = ["N", "E", "S", "W"];

/** Return the position whose turn it is to bid. */
export function currentPlayer(history: CallHistory): Position {
  const dealerIdx = POSITION_ORDER.indexOf(history.dealer);
  return POSITION_ORDER[(dealerIdx + history.calls.length) % 4];
}

/** True when the auction is over (4+ calls, last 3 are passes). */
export function isAuctionComplete(history: CallHistory): boolean {
  const { calls } = history;
  if (calls.length < 4) return false;
  return calls.slice(-3).every((c) => c.type === "pass");
}

/** Find the last actual bid (not pass/double/redouble) in the call history. */
export function lastBidCall(history: CallHistory): Call | undefined {
  return [...history.calls].reverse().find((c) => c.type === "bid");
}

/** Add robot passes until it's the given position's turn or the auction completes. */
export function addRobotPasses(
  history: CallHistory,
  userPosition: Position,
): CallHistory {
  let h = history;
  while (!isAuctionComplete(h) && currentPlayer(h) !== userPosition) {
    h = { ...h, calls: [...h.calls, { type: "pass" as const }] };
  }
  return h;
}
