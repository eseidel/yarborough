import type { Call, CallHistory, Position } from "./types";
import { getNextBid } from "./engine";

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

/** Serialize a Call to the short string format the Rust engine uses. */
export function callToString(call: Call): string {
  if (call.type === "pass") return "P";
  if (call.type === "double") return "X";
  if (call.type === "redouble") return "XX";
  return `${call.level}${call.strain}`;
}

/** Build the identifier string for the Rust engine: "<board>-<hex>:<calls>". */
function buildIdentifier(boardId: string, calls: Call[]): string {
  if (calls.length === 0) return boardId;
  return `${boardId}:${calls.map(callToString).join(",")}`;
}

/** Add robot bids (via WASM engine) until it's the user's turn or the auction completes. */
export async function addRobotBids(
  history: CallHistory,
  userPosition: Position,
  boardId: string,
): Promise<CallHistory> {
  let h = history;
  while (!isAuctionComplete(h) && currentPlayer(h) !== userPosition) {
    const identifier = buildIdentifier(boardId, h.calls);
    const call = await getNextBid(identifier);
    h = { ...h, calls: [...h.calls, call] };
  }
  return h;
}
