import type { Call, CallHistory, Position, StrainName } from "./types";
import { callToString } from "./types";
import { getNextCall } from "./engine";

const POSITION_ORDER: Position[] = ["N", "E", "S", "W"];
const STRAIN_RANK: StrainName[] = ["C", "D", "H", "S", "N"];

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

/**
 * Returns true if the given call is legal given the current auction state.
 * Handles bids (must be higher than last bid), doubles, redoubles, and passes.
 */
export function isCallLegal(call: Call, history: CallHistory): boolean {
  if (isAuctionComplete(history)) return false;

  if (call.type === "pass") return true;

  const last = lastBidCall(history);

  if (call.type === "bid") {
    if (!last) return true; // No prior bid — any bid is legal
    if (call.level! > last.level!) return true;
    if (call.level! < last.level!) return false;
    // Same level: higher-ranked strain wins
    return (
      STRAIN_RANK.indexOf(call.strain!) > STRAIN_RANK.indexOf(last.strain!)
    );
  }

  // For double/redouble, find the last non-pass call
  const lastNonPass = [...history.calls]
    .reverse()
    .find((c) => c.type !== "pass");

  if (call.type === "double") {
    // Can only double an opponent's bid (last non-pass is a bid, made by opponents)
    if (!lastNonPass || lastNonPass.type !== "bid") return false;
    // Check it's an opponent's call: the player who made lastNonPass is on the other side
    const lastNonPassIdx =
      history.calls.length -
      1 -
      [...history.calls].reverse().findIndex((c) => c.type !== "pass");
    const dealerIdx = POSITION_ORDER.indexOf(history.dealer);
    const bidderIdx = (dealerIdx + lastNonPassIdx) % 4;
    const currentIdx = (dealerIdx + history.calls.length) % 4;
    // Same parity = same partnership
    return bidderIdx % 2 !== currentIdx % 2;
  }

  if (call.type === "redouble") {
    // Can only redouble an opponent's double
    if (!lastNonPass || lastNonPass.type !== "double") return false;
    const lastNonPassIdx =
      history.calls.length -
      1 -
      [...history.calls].reverse().findIndex((c) => c.type !== "pass");
    const dealerIdx = POSITION_ORDER.indexOf(history.dealer);
    const bidderIdx = (dealerIdx + lastNonPassIdx) % 4;
    const currentIdx = (dealerIdx + history.calls.length) % 4;
    return bidderIdx % 2 !== currentIdx % 2;
  }

  return false;
}

/** Build the z3b identifier string: "<board>-<hex>:<calls>". */
export function buildIdentifier(boardId: string, calls: Call[]): string {
  if (calls.length === 0) return boardId;
  return `${boardId}:${calls.map(callToString).join(",")}`;
}

/** True when the board passed out (4 passes). */
export function isPassOut(history: CallHistory): boolean {
  return (
    history.calls.length === 4 && history.calls.every((c) => c.type === "pass")
  );
}

export interface ContractInfo {
  level: number;
  strain: StrainName;
  doubled?: "X" | "XX";
}

/** Determine the final contract for a completed auction. */
export function getContract(history: CallHistory): ContractInfo | null {
  if (isPassOut(history)) return null;
  const lastBid = lastBidCall(history);
  if (!lastBid || lastBid.type !== "bid" || !lastBid.level || !lastBid.strain) {
    return null;
  }
  const lastBidIdx = history.calls.lastIndexOf(lastBid);
  const callsAfter = history.calls.slice(lastBidIdx + 1);
  const lastNonPass = [...callsAfter].reverse().find((c) => c.type !== "pass");
  let doubled: "X" | "XX" | undefined;
  if (lastNonPass?.type === "double") doubled = "X";
  if (lastNonPass?.type === "redouble") doubled = "XX";
  return { level: lastBid.level, strain: lastBid.strain, doubled };
}

/** Determine the declarer for a completed auction. */
export function getDeclarer(history: CallHistory): Position | null {
  if (isPassOut(history)) return null;
  const lastBid = lastBidCall(history);
  if (!lastBid || lastBid.type !== "bid" || !lastBid.strain) return null;
  const lastBidIdx = history.calls.lastIndexOf(lastBid);
  const dealerIdx = POSITION_ORDER.indexOf(history.dealer);
  const winningBidder = POSITION_ORDER[(dealerIdx + lastBidIdx) % 4];
  const winningSideParity = POSITION_ORDER.indexOf(winningBidder) % 2;

  for (let i = 0; i < history.calls.length; i++) {
    const call = history.calls[i];
    const bidder = POSITION_ORDER[(dealerIdx + i) % 4];
    if (
      POSITION_ORDER.indexOf(bidder) % 2 === winningSideParity &&
      call.type === "bid" &&
      call.strain === lastBid.strain
    ) {
      return bidder;
    }
  }
  return null;
}

/** Return human readable contract and declarer summary (e.g. "3NT S" or "Pass Out"). */
export function formatContractAndDeclarer(history: CallHistory): string {
  if (isPassOut(history)) return "Pass Out";
  const contract = getContract(history);
  const declarer = getDeclarer(history);
  if (!contract || !declarer) return "";
  return `${contract.level}${contract.strain}${contract.doubled ?? ""} ${declarer}`;
}

/** Add robot bids until it is the user's turn or the auction completes. */
export async function addRobotBids(
  history: CallHistory,
  userPosition: Position,
  boardId: string,
): Promise<CallHistory> {
  let h = history;
  while (!isAuctionComplete(h) && currentPlayer(h) !== userPosition) {
    const identifier = buildIdentifier(boardId, h.calls);
    const call = await getNextCall(identifier);
    h = { ...h, calls: [...h.calls, call] };
  }
  return h;
}

/** Simulate a full autobidder auction from the beginning of the deal. */
export async function getFullAutobidAuction(
  baseBoardId: string,
  dealer: Position,
): Promise<CallHistory> {
  let h: CallHistory = { dealer, calls: [] };
  while (!isAuctionComplete(h)) {
    const identifier = buildIdentifier(baseBoardId, h.calls);
    const call = await getNextCall(identifier);
    h = { ...h, calls: [...h.calls, call] };
  }
  return h;
}
