import type { Call, Card, Deal, Hand, Position, StrainName, SuitName, RankName, Vulnerability } from './types';

// Encoding order matches saycbridge: Clubs=0, Diamonds=1, Hearts=2, Spades=3
const ENCODING_SUITS: SuitName[] = ['C', 'D', 'H', 'S'];

// Encoding order: 2=0, 3=1, ..., T=8, J=9, Q=10, K=11, A=12
const ENCODING_RANKS: RankName[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

const HEX_CHARS = '0123456789abcdef';

// Position index for encoding: N=0, E=1, S=2, W=3
const POSITION_INDEX: Record<Position, number> = { N: 0, E: 1, S: 2, W: 3 };
const INDEX_POSITION: Position[] = ['N', 'E', 'S', 'W'];

/**
 * Maps a card to its unique identifier (0-51).
 * suitIndex * 13 + rankIndex
 */
export function cardId(card: Card): number {
  const suitIndex = ENCODING_SUITS.indexOf(card.suit);
  const rankIndex = ENCODING_RANKS.indexOf(card.rank);
  return suitIndex * 13 + rankIndex;
}

/**
 * Maps a card identifier (0-51) back to a Card.
 */
export function cardFromId(id: number): Card {
  const suitIndex = Math.floor(id / 13);
  const rankIndex = id % 13;
  return { suit: ENCODING_SUITS[suitIndex], rank: ENCODING_RANKS[rankIndex] };
}

/**
 * Returns the dealer position for a given board number (1-16).
 * Formula from saycbridge: (boardNumber + 3) % 4
 */
export function dealerForBoard(boardNumber: number): Position {
  return INDEX_POSITION[(boardNumber + 3) % 4];
}

// Standard duplicate bridge vulnerability by board number (mod 16).
// Source: saycbridge callhistory.py Vulnerability.from_board_number
const VULNERABILITY_TABLE: Vulnerability[] = [
  'EW',   // 0 (board 16)
  'None', // 1
  'NS',   // 2
  'EW',   // 3
  'Both', // 4
  'NS',   // 5
  'EW',   // 6
  'Both', // 7
  'None', // 8
  'EW',   // 9
  'Both', // 10
  'None', // 11
  'NS',   // 12
  'Both', // 13
  'None', // 14
  'NS',   // 15
];

/**
 * Returns the vulnerability for a given board number (1-16).
 */
export function vulnerabilityForBoard(boardNumber: number): Vulnerability {
  return VULNERABILITY_TABLE[boardNumber % 16];
}

/**
 * Encodes a Deal into a 26-character hex string.
 *
 * Each card (0-51) is assigned to a position (0-3).
 * Pairs of position indices are packed into hex digits: hex = posA * 4 + posB.
 */
export function encodeDeal(deal: Deal): string {
  const positionForCard = new Array<number>(52);

  const hands: [Position, Hand][] = [
    ['N', deal.north],
    ['E', deal.east],
    ['S', deal.south],
    ['W', deal.west],
  ];

  for (const [position, hand] of hands) {
    const posIndex = POSITION_INDEX[position];
    for (const card of hand.cards) {
      positionForCard[cardId(card)] = posIndex;
    }
  }

  let identifier = '';
  for (let offset = 0; offset < 26; offset++) {
    const hexIndex = positionForCard[offset * 2] * 4 + positionForCard[offset * 2 + 1];
    identifier += HEX_CHARS[hexIndex];
  }
  return identifier;
}

/**
 * Decodes a 26-character hex string into a Deal.
 */
export function decodeDeal(hex: string): Deal {
  if (hex.length !== 26) {
    throw new Error(`Invalid deal identifier: expected 26 hex chars, got ${hex.length}`);
  }

  const hands: Card[][] = [[], [], [], []]; // N, E, S, W

  for (let charIndex = 0; charIndex < 26; charIndex++) {
    const hexChar = hex[charIndex];
    const hexIndex = HEX_CHARS.indexOf(hexChar);
    if (hexIndex === -1) {
      throw new Error(`Invalid hex character '${hexChar}' at position ${charIndex}`);
    }

    const highHandIndex = Math.floor(hexIndex / 4);
    const lowHandIndex = hexIndex % 4;

    hands[highHandIndex].push(cardFromId(charIndex * 2));
    hands[lowHandIndex].push(cardFromId(charIndex * 2 + 1));
  }

  return {
    north: { cards: hands[0] },
    east: { cards: hands[1] },
    south: { cards: hands[2] },
    west: { cards: hands[3] },
  };
}

/**
 * Formats a Call as a short string: "P", "X", "XX", "1C", "2N", etc.
 * Matches saycbridge call name format.
 */
export function formatCall(call: Call): string {
  switch (call.type) {
    case 'pass': return 'P';
    case 'double': return 'X';
    case 'redouble': return 'XX';
    case 'bid': return `${call.level}${call.strain}`;
  }
}

/**
 * Parses a short call string ("P", "X", "XX", "1C", "2N", etc.) into a Call.
 */
export function parseCall(name: string): Call {
  const upper = name.toUpperCase();
  if (upper === 'P') return { type: 'pass' };
  if (upper === 'X') return { type: 'double' };
  if (upper === 'XX') return { type: 'redouble' };
  if (upper.length === 2) {
    const level = parseInt(upper[0], 10);
    const strain = upper[1] as StrainName;
    if (level >= 1 && level <= 7 && 'CDHSN'.includes(strain)) {
      return { type: 'bid', level, strain };
    }
  }
  throw new Error(`Invalid call name: '${name}'`);
}

/**
 * Formats an array of Calls as a comma-separated string.
 */
export function formatCalls(calls: Call[]): string {
  return calls.map(formatCall).join(',');
}

/**
 * Parses a comma-separated call string into an array of Calls.
 */
export function parseCalls(callsString: string): Call[] {
  if (!callsString) return [];
  return callsString.split(',').map(parseCall);
}

/**
 * Encodes a full board identifier string: "boardNumber-dealHex[:callHistory]"
 */
export function encodeBoardIdentifier(
  boardNumber: number,
  deal: Deal,
  calls?: Call[],
): string {
  let identifier = `${boardNumber}-${encodeDeal(deal)}`;
  if (calls && calls.length > 0) {
    identifier += `:${formatCalls(calls)}`;
  }
  return identifier;
}

export interface BoardIdentifier {
  boardNumber: number;
  deal: Deal;
  calls: Call[];
}

/**
 * Parses a full board identifier string: "boardNumber-dealHex[:callHistory]"
 */
export function decodeBoardIdentifier(identifier: string): BoardIdentifier {
  const dashIndex = identifier.indexOf('-');
  if (dashIndex === -1) {
    throw new Error('Invalid board identifier: missing dash separator');
  }

  const boardNumber = parseInt(identifier.substring(0, dashIndex), 10);
  if (isNaN(boardNumber)) {
    throw new Error('Invalid board identifier: board number is not a number');
  }

  const rest = identifier.substring(dashIndex + 1);
  const colonIndex = rest.indexOf(':');

  let dealHex: string;
  let calls: Call[] = [];

  if (colonIndex === -1) {
    dealHex = rest;
  } else {
    dealHex = rest.substring(0, colonIndex);
    calls = parseCalls(rest.substring(colonIndex + 1));
  }

  const deal = decodeDeal(dealHex);
  return { boardNumber, deal, calls };
}
