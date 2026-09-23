import {
  type Card,
  type Hand,
  type RankName,
  type SuitName,
  FAN_SUIT_ORDER,
  cardsBySuit,
} from "./types";

/**
 * A hand as a player enters it: per suit, the honors held and how many small
 * cards.
 *
 * The bidding engine reads a hand as its suit lengths and its A, K, Q, J and
 * 10 (z3b/model.ts has no variable for any lower card), so a 9 and a 2 bid
 * alike, and asking which small cards a player holds would only cost taps.
 * `small` is null until the player has said how many, which is what moves
 * the entry on to the next suit.
 */
export interface SuitEntry {
  honors: RankName[];
  small: number | null;
}

export type HandEntry = Record<SuitName, SuitEntry>;

export const HONOR_RANKS: RankName[] = ["A", "K", "Q", "J", "T"];

/** The small cards a suit is given, lowest first: which ones is immaterial. */
const SMALL_RANKS: RankName[] = ["2", "3", "4", "5", "6", "7", "8", "9"];

export const MAX_SMALL = SMALL_RANKS.length;

export function isHonor(rank: RankName): boolean {
  return HONOR_RANKS.includes(rank);
}

export function emptyEntry(): HandEntry {
  return {
    S: { honors: [], small: null },
    H: { honors: [], small: null },
    D: { honors: [], small: null },
    C: { honors: [], small: null },
  };
}

/** A finished hand as an entry, every suit already counted. */
export function entryFromHand(hand: Hand): HandEntry {
  const bySuit = cardsBySuit(hand);
  const entry = emptyEntry();
  for (const suit of FAN_SUIT_ORDER) {
    const honors = bySuit[suit].map((card) => card.rank).filter(isHonor);
    entry[suit] = { honors, small: bySuit[suit].length - honors.length };
  }
  return entry;
}

export function suitLength(entry: HandEntry, suit: SuitName): number {
  return entry[suit].honors.length + (entry[suit].small ?? 0);
}

export function entryTotal(entry: HandEntry): number {
  return FAN_SUIT_ORDER.reduce(
    (total, suit) => total + suitLength(entry, suit),
    0,
  );
}

/** Every suit has been counted: the entry says how long each one is. */
export function allCounted(entry: HandEntry): boolean {
  return FAN_SUIT_ORDER.every((suit) => entry[suit].small !== null);
}

/**
 * The entry is a hand: every suit counted, and thirteen cards. An entry can
 * pass thirteen on the way there, since a player who miscounts one suit
 * should be able to enter the rest and then see which suit is wrong; it just
 * cannot be finished like that.
 */
export function isComplete(entry: HandEntry): boolean {
  return allCounted(entry) && entryTotal(entry) === 13;
}

/** Take or give back one honor. */
export function toggleHonor(
  entry: HandEntry,
  suit: SuitName,
  rank: RankName,
): HandEntry {
  const current = entry[suit];
  const honors = current.honors.includes(rank)
    ? current.honors.filter((r) => r !== rank)
    : HONOR_RANKS.filter((r) => r === rank || current.honors.includes(r));
  return { ...entry, [suit]: { ...current, honors } };
}

/** Say how many small cards a suit has; a count out of range is ignored. */
export function setSmall(
  entry: HandEntry,
  suit: SuitName,
  small: number,
): HandEntry {
  if (!Number.isInteger(small) || small < 0 || small > MAX_SMALL) return entry;
  return { ...entry, [suit]: { ...entry[suit], small } };
}

/** The next suit after `from`, in the fan's order, still to be counted. */
export function nextSuit(entry: HandEntry, from: SuitName): SuitName | null {
  const start = FAN_SUIT_ORDER.indexOf(from);
  for (let step = 1; step < FAN_SUIT_ORDER.length; step++) {
    const suit = FAN_SUIT_ORDER[(start + step) % FAN_SUIT_ORDER.length];
    if (entry[suit].small === null) return suit;
  }
  return null;
}

/** The entry as thirteen cards, the small cards the lowest of their suit. */
export function handFromEntry(entry: HandEntry): Hand {
  const cards: Card[] = [];
  for (const suit of FAN_SUIT_ORDER) {
    for (const rank of entry[suit].honors) cards.push({ suit, rank });
    for (const rank of SMALL_RANKS.slice(0, entry[suit].small ?? 0)) {
      cards.push({ suit, rank });
    }
  }
  return { cards };
}
