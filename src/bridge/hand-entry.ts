import type { Card, Hand, RankName, SuitName } from "./types";
import { FAN_SUIT_ORDER, RANK_ORDER } from "./types";

/** A hand is thirteen cards, which is what makes a miscount visible. */
export const HAND_SIZE = 13;

/** One card as a key: its suit then its rank, "SA" for the ace of spades. */
export type CardKey = string;

export function cardKey(card: Card): CardKey {
  return card.suit + card.rank;
}

export function keyToCard(key: CardKey): Card {
  return { suit: key[0] as SuitName, rank: key[1] as RankName };
}

/**
 * The cards as a hand, in the fan's order: spades through clubs, each suit
 * from the ace down.
 */
export function handFromKeys(keys: ReadonlySet<CardKey>): Hand {
  const cards: Card[] = [];
  for (const suit of FAN_SUIT_ORDER) {
    for (const rank of RANK_ORDER) {
      if (keys.has(suit + rank)) {
        cards.push({ suit, rank });
      }
    }
  }
  return { cards };
}

/**
 * The hand with `key` taken or put back.
 *
 * A fourteenth card is refused rather than swapped in: the entry has no
 * counter, and a card the app will not take is how a miscount shows up.
 */
export function toggleCard(
  keys: ReadonlySet<CardKey>,
  key: CardKey,
): ReadonlySet<CardKey> {
  const next = new Set(keys);
  if (next.has(key)) {
    next.delete(key);
  } else if (next.size < HAND_SIZE) {
    next.add(key);
  }
  return next;
}

/** True once the hand has all thirteen of its cards. */
export function isComplete(keys: ReadonlySet<CardKey>): boolean {
  return keys.size >= HAND_SIZE;
}

/** The ranks of one suit, ace first, as the fan writes them. */
export function holdingOf(
  keys: ReadonlySet<CardKey>,
  suit: SuitName,
): RankName[] {
  return RANK_ORDER.filter((rank) => keys.has(suit + rank));
}
