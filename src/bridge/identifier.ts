import type {
  Card,
  Deal,
  Hand,
  Position,
  SuitName,
  RankName,
  Vulnerability,
} from "./types";
import { vulnerabilityFromBoardNumber } from "./types";
import { randomDeal } from "./mock";

const SUIT_INDEX: Record<SuitName, number> = { C: 0, D: 1, H: 2, S: 3 };
const RANK_INDEX: Record<RankName, number> = {
  "2": 0,
  "3": 1,
  "4": 2,
  "5": 3,
  "6": 4,
  "7": 5,
  "8": 6,
  "9": 7,
  T: 8,
  J: 9,
  Q: 10,
  K: 11,
  A: 12,
};

const SUITS_BY_INDEX: SuitName[] = ["C", "D", "H", "S"];
const RANKS_BY_INDEX: RankName[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
  "A",
];
const POSITIONS_BY_INDEX: Position[] = ["N", "E", "S", "W"];
const HEX_CHARS = "0123456789abcdef";

function cardId(card: Card): number {
  return SUIT_INDEX[card.suit] * 13 + RANK_INDEX[card.rank];
}

function cardFromId(id: number): Card {
  return {
    suit: SUITS_BY_INDEX[Math.floor(id / 13)],
    rank: RANKS_BY_INDEX[id % 13],
  };
}

/** Encode a Deal to a 26-character hex string (saycbridge format). */
export function encodeDeal(deal: Deal): string {
  const positionForCard = new Uint8Array(52);
  const hands: [Position, Hand][] = [
    ["N", deal.north],
    ["E", deal.east],
    ["S", deal.south],
    ["W", deal.west],
  ];
  for (const [pos, hand] of hands) {
    const posIdx = POSITIONS_BY_INDEX.indexOf(pos);
    for (const card of hand.cards) {
      positionForCard[cardId(card)] = posIdx;
    }
  }

  let hex = "";
  for (let i = 0; i < 26; i++) {
    const high = positionForCard[i * 2];
    const low = positionForCard[i * 2 + 1];
    hex += HEX_CHARS[high * 4 + low];
  }
  return hex;
}

/** Decode a 26-character hex string to a Deal. Returns null if invalid. */
export function decodeDeal(hex: string): Deal | null {
  if (hex.length !== 26) return null;

  const hands: Card[][] = [[], [], [], []];
  for (let charIdx = 0; charIdx < 26; charIdx++) {
    const hexVal = HEX_CHARS.indexOf(hex[charIdx].toLowerCase());
    if (hexVal < 0) return null;

    const highPosIdx = Math.floor(hexVal / 4);
    const lowPosIdx = hexVal % 4;

    hands[highPosIdx].push(cardFromId(charIdx * 2));
    hands[lowPosIdx].push(cardFromId(charIdx * 2 + 1));
  }

  return {
    north: { cards: hands[0] },
    east: { cards: hands[1] },
    south: { cards: hands[2] },
    west: { cards: hands[3] },
  };
}

/** Derive dealer from board number (1-16). */
export function dealerFromBoardNumber(boardNumber: number): Position {
  return POSITIONS_BY_INDEX[(boardNumber - 1) % 4];
}

/** Generate a random board identifier string and its decoded deal. */
export function generateBoardId(): {
  boardNumber: number;
  deal: Deal;
  vulnerability: Vulnerability;
  id: string;
} {
  const boardNumber = Math.floor(Math.random() * 16) + 1;
  const deal = randomDeal();
  const id = `${boardNumber}-${encodeDeal(deal)}`;
  return {
    boardNumber,
    deal,
    vulnerability: vulnerabilityFromBoardNumber(boardNumber),
    id,
  };
}

/** Parse a board identifier string. Returns null if invalid. */
export function parseBoardId(
  id: string,
): {
  boardNumber: number;
  deal: Deal;
  dealer: Position;
  vulnerability: Vulnerability;
} | null {
  const dashIdx = id.indexOf("-");
  if (dashIdx < 1) return null;

  const boardNumber = parseInt(id.substring(0, dashIdx), 10);
  if (isNaN(boardNumber) || boardNumber < 1 || boardNumber > 16) return null;

  const deal = decodeDeal(id.substring(dashIdx + 1));
  if (!deal) return null;

  return {
    boardNumber,
    deal,
    dealer: dealerFromBoardNumber(boardNumber),
    vulnerability: vulnerabilityFromBoardNumber(boardNumber),
  };
}
