// Facts about a deal that the review states in words: each side's points and
// the suits in which the partners hold eight or more cards between them.

import type { Deal, Position, SuitName } from "../bridge/types";
import {
  SUIT_ORDER,
  cardsBySuit,
  handForPosition,
  highCardPoints,
} from "../bridge/types";
import type { Side } from "./analysis";

const SIDE_SEATS: Record<Side, Position[]> = { NS: ["N", "S"], EW: ["E", "W"] };

export function sideHcp(deal: Deal, side: Side): number {
  return SIDE_SEATS[side].reduce(
    (sum, seat) => sum + highCardPoints(handForPosition(deal, seat)),
    0,
  );
}

export interface SuitFit {
  suit: SuitName;
  /** Cards the two partners hold in the suit. */
  length: number;
}

/** The side's eight-card or longer suits, longest first. */
export function sideFits(deal: Deal, side: Side): SuitFit[] {
  const hands = SIDE_SEATS[side].map((seat) =>
    cardsBySuit(handForPosition(deal, seat)),
  );
  return SUIT_ORDER.map((suit) => ({
    suit,
    length: hands.reduce((sum, hand) => sum + hand[suit].length, 0),
  }))
    .filter((fit) => fit.length >= 8)
    .sort((a, b) => b.length - a.length);
}
