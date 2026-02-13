export type SuitName = "C" | "D" | "H" | "S";

export interface Suit {
  name: SuitName;
  displayName: string;
  symbol: string;
  color: string; // Tailwind text color class
}

export const SUITS: Record<SuitName, Suit> = {
  C: {
    name: "C",
    displayName: "Clubs",
    symbol: "\u2663",
    color: "text-blue-900",
  },
  D: {
    name: "D",
    displayName: "Diamonds",
    symbol: "\u2666",
    color: "text-orange-600",
  },
  H: {
    name: "H",
    displayName: "Hearts",
    symbol: "\u2665",
    color: "text-red-600",
  },
  S: {
    name: "S",
    displayName: "Spades",
    symbol: "\u2660",
    color: "text-black",
  },
};

// Display order: spades on top
export const SUIT_ORDER: SuitName[] = ["S", "H", "D", "C"];

export type RankName =
  | "A"
  | "K"
  | "Q"
  | "J"
  | "T"
  | "9"
  | "8"
  | "7"
  | "6"
  | "5"
  | "4"
  | "3"
  | "2";

export const RANK_ORDER: RankName[] = [
  "A",
  "K",
  "Q",
  "J",
  "T",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
];

export function displayRank(rank: RankName): string {
  return rank === "T" ? "10" : rank;
}

export interface Card {
  suit: SuitName;
  rank: RankName;
}

export interface Hand {
  cards: Card[];
}

export function cardsBySuit(hand: Hand): Record<SuitName, Card[]> {
  const result: Record<SuitName, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const card of hand.cards) {
    result[card.suit].push(card);
  }
  for (const suit of SUIT_ORDER) {
    result[suit].sort(
      (a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank),
    );
  }
  return result;
}

/** Suit display order for the card fan: S, H, D, C (left to right). */
export const FAN_SUIT_ORDER: SuitName[] = ["S", "H", "D", "C"];

/** Return all cards from a hand in fan display order (SHDC, high-to-low within each suit). */
export function fanOrderCards(hand: Hand): Card[] {
  const bySuit = cardsBySuit(hand);
  return FAN_SUIT_ORDER.flatMap((suit) => bySuit[suit]);
}

export type Position = "N" | "E" | "S" | "W";

export const POSITION_NAMES: Record<Position, string> = {
  N: "North",
  E: "East",
  S: "South",
  W: "West",
};

export const CALL_TABLE_ORDER: Position[] = ["W", "N", "E", "S"];

export interface Deal {
  north: Hand;
  east: Hand;
  south: Hand;
  west: Hand;
}

export function handForPosition(deal: Deal, position: Position): Hand {
  const map: Record<Position, Hand> = {
    N: deal.north,
    E: deal.east,
    S: deal.south,
    W: deal.west,
  };
  return map[position];
}

// Strains: suits + notrump (for bidding)
export type StrainName = SuitName | "N";

export function strainSymbol(strain: StrainName): string {
  if (strain === "N") return "NT";
  return SUITS[strain].symbol;
}

export function strainColor(strain: StrainName): string {
  if (strain === "N") return "text-black";
  return SUITS[strain].color;
}

export type CallType = "bid" | "pass" | "double" | "redouble";

export interface Call {
  type: CallType;
  level?: number;
  strain?: StrainName;
}

export type Vulnerability = "None" | "NS" | "EW" | "Both";

/** Derive vulnerability from board number (1–16), matching standard bridge rotation. */
export function vulnerabilityFromBoardNumber(
  boardNumber: number,
): Vulnerability {
  switch (boardNumber % 16) {
    case 1:
    case 8:
    case 11:
    case 14:
      return "None";
    case 2:
    case 5:
    case 12:
    case 15:
      return "NS";
    case 3:
    case 6:
    case 9:
    case 0:
      return "EW";
    case 4:
    case 7:
    case 10:
    case 13:
      return "Both";
    default:
      return "None";
  }
}

/** Human-readable vulnerability label. */
export function vulnerabilityLabel(vul: Vulnerability): string {
  switch (vul) {
    case "None":
      return "None Vul";
    case "NS":
      return "N-S Vul";
    case "EW":
      return "E-W Vul";
    case "Both":
      return "Both Vul";
  }
}

export interface CallHistory {
  dealer: Position;
  calls: Call[];
}

export interface CallInterpretation {
  call: Call;
  ruleName?: string;
  description?: string;
}

const HCP_VALUES: Partial<Record<RankName, number>> = {
  A: 4,
  K: 3,
  Q: 2,
  J: 1,
};

export function highCardPoints(hand: Hand): number {
  return hand.cards.reduce(
    (sum, card) => sum + (HCP_VALUES[card.rank] ?? 0),
    0,
  );
}
