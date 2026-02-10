import { describe, it, expect } from 'vitest';
import {
  cardId,
  cardFromId,
  dealerForBoard,
  vulnerabilityForBoard,
  encodeDeal,
  decodeDeal,
  encodeBoardIdentifier,
  decodeBoardIdentifier,
  formatCall,
  parseCall,
  formatCalls,
  parseCalls,
} from '../board-identifier';
import { MOCK_DEAL } from '../mock';
import type { Call, Card } from '../types';

describe('cardId', () => {
  it('returns 0 for 2 of clubs', () => {
    expect(cardId({ suit: 'C', rank: '2' })).toBe(0);
  });

  it('returns 12 for ace of clubs', () => {
    expect(cardId({ suit: 'C', rank: 'A' })).toBe(12);
  });

  it('returns 13 for 2 of diamonds', () => {
    expect(cardId({ suit: 'D', rank: '2' })).toBe(13);
  });

  it('returns 51 for ace of spades', () => {
    expect(cardId({ suit: 'S', rank: 'A' })).toBe(51);
  });

  it('returns 39 for 2 of spades', () => {
    expect(cardId({ suit: 'S', rank: '2' })).toBe(39);
  });

  it('returns 8 for ten of clubs', () => {
    expect(cardId({ suit: 'C', rank: 'T' })).toBe(8);
  });
});

describe('cardFromId', () => {
  it('returns 2 of clubs for 0', () => {
    expect(cardFromId(0)).toEqual({ suit: 'C', rank: '2' });
  });

  it('returns ace of spades for 51', () => {
    expect(cardFromId(51)).toEqual({ suit: 'S', rank: 'A' });
  });

  it('round-trips with cardId for all 52 cards', () => {
    for (let id = 0; id < 52; id++) {
      const card = cardFromId(id);
      expect(cardId(card)).toBe(id);
    }
  });
});

describe('dealerForBoard', () => {
  it('maps board numbers 1-16 to correct dealers', () => {
    const expected: Record<number, string> = {
      1: 'N', 2: 'E', 3: 'S', 4: 'W',
      5: 'N', 6: 'E', 7: 'S', 8: 'W',
      9: 'N', 10: 'E', 11: 'S', 12: 'W',
      13: 'N', 14: 'E', 15: 'S', 16: 'W',
    };
    for (const [board, dealer] of Object.entries(expected)) {
      expect(dealerForBoard(Number(board))).toBe(dealer);
    }
  });
});

describe('vulnerabilityForBoard', () => {
  it('maps board numbers to correct vulnerabilities', () => {
    const expected: Record<number, string> = {
      1: 'None', 2: 'NS', 3: 'EW', 4: 'Both',
      5: 'NS', 6: 'EW', 7: 'Both', 8: 'None',
      9: 'EW', 10: 'Both', 11: 'None', 12: 'NS',
      13: 'Both', 14: 'None', 15: 'NS', 16: 'EW',
    };
    for (const [board, vul] of Object.entries(expected)) {
      expect(vulnerabilityForBoard(Number(board))).toBe(vul);
    }
  });
});

describe('formatCall', () => {
  it('formats pass', () => {
    expect(formatCall({ type: 'pass' })).toBe('P');
  });

  it('formats double', () => {
    expect(formatCall({ type: 'double' })).toBe('X');
  });

  it('formats redouble', () => {
    expect(formatCall({ type: 'redouble' })).toBe('XX');
  });

  it('formats bids', () => {
    expect(formatCall({ type: 'bid', level: 1, strain: 'C' })).toBe('1C');
    expect(formatCall({ type: 'bid', level: 3, strain: 'N' })).toBe('3N');
    expect(formatCall({ type: 'bid', level: 7, strain: 'S' })).toBe('7S');
  });
});

describe('parseCall', () => {
  it('parses pass', () => {
    expect(parseCall('P')).toEqual({ type: 'pass' });
  });

  it('parses double', () => {
    expect(parseCall('X')).toEqual({ type: 'double' });
  });

  it('parses redouble', () => {
    expect(parseCall('XX')).toEqual({ type: 'redouble' });
  });

  it('parses bids', () => {
    expect(parseCall('1C')).toEqual({ type: 'bid', level: 1, strain: 'C' });
    expect(parseCall('3N')).toEqual({ type: 'bid', level: 3, strain: 'N' });
    expect(parseCall('7S')).toEqual({ type: 'bid', level: 7, strain: 'S' });
  });

  it('is case-insensitive', () => {
    expect(parseCall('p')).toEqual({ type: 'pass' });
    expect(parseCall('x')).toEqual({ type: 'double' });
    expect(parseCall('xx')).toEqual({ type: 'redouble' });
  });

  it('throws for invalid call', () => {
    expect(() => parseCall('Z')).toThrow('Invalid call name');
    expect(() => parseCall('8C')).toThrow('Invalid call name');
    expect(() => parseCall('1Z')).toThrow('Invalid call name');
  });

  it('round-trips with formatCall', () => {
    const calls: Call[] = [
      { type: 'pass' },
      { type: 'double' },
      { type: 'redouble' },
      { type: 'bid', level: 1, strain: 'C' },
      { type: 'bid', level: 4, strain: 'H' },
      { type: 'bid', level: 7, strain: 'N' },
    ];
    for (const call of calls) {
      expect(parseCall(formatCall(call))).toEqual(call);
    }
  });
});

describe('formatCalls / parseCalls', () => {
  it('formats an array of calls as comma-separated string', () => {
    const calls: Call[] = [
      { type: 'bid', level: 1, strain: 'C' },
      { type: 'pass' },
      { type: 'bid', level: 1, strain: 'S' },
      { type: 'pass' },
    ];
    expect(formatCalls(calls)).toBe('1C,P,1S,P');
  });

  it('parses a comma-separated string', () => {
    const calls = parseCalls('1C,P,1S,P,2S,P,3S,P,P,P');
    expect(calls).toHaveLength(10);
    expect(calls[0]).toEqual({ type: 'bid', level: 1, strain: 'C' });
    expect(calls[1]).toEqual({ type: 'pass' });
    expect(calls[4]).toEqual({ type: 'bid', level: 2, strain: 'S' });
  });

  it('returns empty array for empty string', () => {
    expect(parseCalls('')).toEqual([]);
  });

  it('handles doubles and redoubles', () => {
    const calls = parseCalls('1N,X,XX,P,P,P');
    expect(calls).toEqual([
      { type: 'bid', level: 1, strain: 'N' },
      { type: 'double' },
      { type: 'redouble' },
      { type: 'pass' },
      { type: 'pass' },
      { type: 'pass' },
    ]);
  });
});

describe('encodeDeal', () => {
  it('encodes MOCK_DEAL to expected hex string', () => {
    expect(encodeDeal(MOCK_DEAL)).toBe('60357eabf0365f3a54383ea650');
  });

  it('produces a 26-character hex string', () => {
    const hex = encodeDeal(MOCK_DEAL);
    expect(hex).toHaveLength(26);
    expect(hex).toMatch(/^[0-9a-f]{26}$/);
  });
});

describe('decodeDeal', () => {
  it('decodes the MOCK_DEAL hex back to the same deal', () => {
    const decoded = decodeDeal('60357eabf0365f3a54383ea650');
    expect(decoded.north.cards).toHaveLength(13);
    expect(decoded.east.cards).toHaveLength(13);
    expect(decoded.south.cards).toHaveLength(13);
    expect(decoded.west.cards).toHaveLength(13);
  });

  it('round-trips with encodeDeal', () => {
    const hex = encodeDeal(MOCK_DEAL);
    const decoded = decodeDeal(hex);
    const rehex = encodeDeal(decoded);
    expect(rehex).toBe(hex);
  });

  it('produces cards that match the original deal', () => {
    const hex = encodeDeal(MOCK_DEAL);
    const decoded = decodeDeal(hex);

    const toSet = (hand: { cards: Card[] }) =>
      new Set(hand.cards.map(c => `${c.suit}${c.rank}`));

    expect(toSet(decoded.north)).toEqual(toSet(MOCK_DEAL.north));
    expect(toSet(decoded.east)).toEqual(toSet(MOCK_DEAL.east));
    expect(toSet(decoded.south)).toEqual(toSet(MOCK_DEAL.south));
    expect(toSet(decoded.west)).toEqual(toSet(MOCK_DEAL.west));
  });

  it('throws for invalid hex length', () => {
    expect(() => decodeDeal('abc')).toThrow('expected 26 hex chars');
  });

  it('throws for invalid hex characters', () => {
    expect(() => decodeDeal('zzzzzzzzzzzzzzzzzzzzzzzzzz')).toThrow('Invalid hex character');
  });
});

describe('encodeBoardIdentifier', () => {
  it('encodes board number and deal', () => {
    const id = encodeBoardIdentifier(15, MOCK_DEAL);
    expect(id).toBe('15-60357eabf0365f3a54383ea650');
  });

  it('includes call history when provided', () => {
    const calls: Call[] = [
      { type: 'bid', level: 1, strain: 'N' },
      { type: 'pass' },
      { type: 'bid', level: 2, strain: 'C' },
      { type: 'pass' },
    ];
    const id = encodeBoardIdentifier(15, MOCK_DEAL, calls);
    expect(id).toBe('15-60357eabf0365f3a54383ea650:1N,P,2C,P');
  });
});

describe('decodeBoardIdentifier', () => {
  it('parses board number and deal', () => {
    const result = decodeBoardIdentifier('15-60357eabf0365f3a54383ea650');
    expect(result.boardNumber).toBe(15);
    expect(result.calls).toEqual([]);

    const toSet = (hand: { cards: Card[] }) =>
      new Set(hand.cards.map(c => `${c.suit}${c.rank}`));
    expect(toSet(result.deal.north)).toEqual(toSet(MOCK_DEAL.north));
  });

  it('parses call history', () => {
    const result = decodeBoardIdentifier('15-60357eabf0365f3a54383ea650:1C,P,1S,P,2S,P,3S,P,P,P');
    expect(result.boardNumber).toBe(15);
    expect(result.calls).toHaveLength(10);
    expect(result.calls[0]).toEqual({ type: 'bid', level: 1, strain: 'C' });
    expect(result.calls[9]).toEqual({ type: 'pass' });
  });

  it('round-trips with encodeBoardIdentifier', () => {
    const calls: Call[] = [
      { type: 'bid', level: 1, strain: 'C' },
      { type: 'pass' },
    ];
    const original = encodeBoardIdentifier(8, MOCK_DEAL, calls);
    const decoded = decodeBoardIdentifier(original);
    expect(decoded.boardNumber).toBe(8);
    expect(decoded.calls).toEqual(calls);
    const reencoded = encodeBoardIdentifier(decoded.boardNumber, decoded.deal, decoded.calls);
    expect(reencoded).toBe(original);
  });

  it('throws for missing dash', () => {
    expect(() => decodeBoardIdentifier('abc')).toThrow('missing dash');
  });

  it('throws for non-numeric board number', () => {
    expect(() => decodeBoardIdentifier('xx-60357eabf0365f3a54383ea650')).toThrow('not a number');
  });
});
