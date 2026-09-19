// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Opening-lead chooser: standard leads, rule-based, deterministic.
 *
 * A double-dummy table gives the defense the killing lead on every deal.  A
 * fairer "can you make what you bid" number plays the contract double-dummy
 * AFTER an opening lead chosen the way a standard pair leads (Pavlicek's
 * "after the lead" world, where double-dummy play tracks expert play within
 * about 0.16 tricks).  Two variants:
 *
 *   aware  -- knows which suits partner bid and which the declaring side bid;
 *   blind  -- ignores the auction entirely.
 *
 * Neither variant sees any hidden card.  The rules are the textbook ones
 * (fourth best from the longest/strongest suit against notrump, top of a
 * sequence, partner's suit, a singleton against a suit contract, never
 * underlead an ace against a suit), written to be readable and testable rather
 * than clever; `__tests__/leads.test.ts` pins a hand-written golden set.
 *
 *     choose(hand, strain, partnerSuits, theirSuits, blind) -> [card, reason]
 *
 * hand: 13 cards as "S.H.D.C" pips (`Hand.shdc_dot_string()`, e.g.
 * "KQJ3.A82.T97.J54"); strain: the contract's strain character in "SHDCN";
 * card: "SK" style (suit, rank).  This module, unlike the rest of the engine,
 * speaks S.H.D.C rather than C.D.H.S: that is the order its callers, its
 * strings and its tests have always used.
 *
 * A port of `python/leads.py`, function for function.
 */

export const RANKS = "AKQJT98765432";
export const SUITS = "SHDC";
export const HONORS = "AKQJT";

/** A card ("SK") and the textbook reason for leading it. */
export type Lead = readonly [card: string, reason: string];

/** A card within a chosen suit ("K") and the reason for that card. */
export type CardChoice = readonly [card: string, reason: string];

/** The pips of each suit of a hand, keyed by "S", "H", "D" and "C". */
export type SuitHoldings = Record<string, string>;

function rankIndex(card: string): number {
  return RANKS.indexOf(card);
}

/** The holdings of a "S.H.D.C" hand string, each sorted from the ace down. */
export function parse(hand: string): SuitHoldings {
  const parts = hand.split(".");
  if (parts.length !== 4) {
    throw new Error(hand);
  }
  const suits: SuitHoldings = {};
  for (let i = 0; i < SUITS.length; i += 1) {
    suits[SUITS[i]] = [...parts[i]]
      .sort((a, b) => rankIndex(a) - rankIndex(b))
      .join("");
  }
  let total = 0;
  for (const cards of Object.values(suits)) {
    total += cards.length;
  }
  if (total !== 13) {
    throw new Error(hand);
  }
  return suits;
}

/**
 * The top card of a sequence of n touching honors at the head of `cards`
 * (e.g. KQJ -> K), or null.
 */
export function touching(cards: string, n: number): string | null {
  if (cards.length < n || !HONORS.includes(cards[0])) {
    return null;
  }
  const idx = [...cards.slice(0, n)].map(rankIndex);
  for (let i = 0; i < n - 1; i += 1) {
    if (idx[i + 1] !== idx[i] + 1) {
      return null;
    }
  }
  return cards[0];
}

const INTERIOR_SEQUENCES: readonly (readonly [string, string])[] = [
  ["AQJ", "Q"],
  ["KQT", "K"],
  ["QJ9", "Q"],
  ["KJT", "J"],
  ["AJT", "J"],
  ["KT9", "T"],
  ["AT9", "T"],
  ["QT9", "T"],
  ["JT8", "J"],
  ["T98", "T"],
];

/** Which card to lead from a chosen suit against notrump. */
export function cardInSuitVsNt(cards: string): CardChoice {
  const n = cards.length;
  if (n === 1) {
    return [cards[0], "singleton"];
  }
  if (n === 2) {
    return [cards[0], "top of doubleton"];
  }
  const top = touching(cards, 3);
  if (top) {
    return [top, "top of sequence"];
  }
  // broken sequences and interior sequences: AKJ -> K? (AKx: lead K asking
  // count/unblock: K); AQJ -> Q; KJT -> J; AJT -> J; QT9 -> T
  if (
    n >= 3 &&
    "AK".includes(cards[0]) &&
    "AK".includes(cards[1]) &&
    cards[0] !== cards[1]
  ) {
    return ["K", "K from AK"];
  }
  for (const [combo, lead] of INTERIOR_SEQUENCES) {
    if (cards.slice(0, 3) === combo) {
      return [lead, "top of interior/broken sequence"];
    }
  }
  if (n >= 4) {
    return [cards[3], "fourth best"];
  }
  // three cards: honor-high -> low; small -> top
  if (HONORS.includes(cards[0])) {
    return [cards[2], "low from three to an honor"];
  }
  return [cards[0], "top of nothing"];
}

/** Which card to lead from a chosen suit against a suit contract. */
export function cardInSuitVsSuit(cards: string, isTrump = false): CardChoice {
  const n = cards.length;
  if (n === 1) {
    return [cards[0], "singleton"];
  }
  if (n === 2) {
    return [cards[0], "top of doubleton"];
  }
  const top = touching(cards, 2);
  if (top && cards[0] !== "A") {
    return [top, "top of sequence"];
  }
  if (cards[0] === "A" && cards[1] === "K") {
    return ["K", "K from AK"];
  }
  if (isTrump) {
    return [cards[cards.length - 1], "low trump"];
  }
  if (cards[0] === "A") {
    return ["A", "ace (never underlead an ace vs a suit)"];
  }
  if (n >= 4) {
    return [cards[3], "fourth best"];
  }
  if (HONORS.includes(cards[0])) {
    return [cards[2], "low from three to an honor"];
  }
  return [cards[0], "top of nothing"];
}

const HONOR_STRENGTH: Record<string, number> = {
  A: 4,
  K: 3,
  Q: 2,
  J: 1,
  T: 0.5,
};

/** Honor strength of a holding: A=4, K=3, Q=2, J=1, T=0.5. */
export function strength(cards: string): number {
  let total = 0;
  for (const card of cards) {
    total += HONOR_STRENGTH[card] ?? 0;
  }
  return total;
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1;
    }
  }
  return a.length - b.length;
}

/**
 * Python's `max(iterable, key=...)` over tuple keys: the first item with the
 * greatest key wins, so ties keep the iteration order.
 */
function maxBy<T>(items: readonly T[], key: (item: T) => number[]): T {
  if (items.length === 0) {
    throw new Error("max() arg is an empty sequence");
  }
  let best = items[0];
  let bestKey = key(best);
  for (const item of items.slice(1)) {
    const itemKey = key(item);
    if (compareKeys(itemKey, bestKey) > 0) {
      best = item;
      bestKey = itemKey;
    }
  }
  return best;
}

function flag(value: boolean): number {
  return value ? 1 : 0;
}

/**
 * Return [card, reason] for the opening lead.
 *
 * strain: the contract's strain in "SHDCN". partnerSuits / theirSuits: suits
 * ("S", "H", ...) bid naturally by partner / by the declaring side (ignored
 * when blind).
 */
export function choose(
  hand: string,
  strain: string,
  partnerSuits: readonly string[] = [],
  theirSuits: readonly string[] = [],
  blind = false,
): Lead {
  if (strain.length !== 1 || !"SHDCN".includes(strain)) {
    throw new Error(strain);
  }
  const suits = parse(hand);
  if (blind) {
    partnerSuits = [];
    theirSuits = [];
  }
  partnerSuits = partnerSuits.filter((s) => SUITS.includes(s));
  theirSuits = theirSuits.filter((s) => SUITS.includes(s));
  if (strain === "N") {
    // 0. our own suit when it is clearly better than partner's: 5+ cards
    //    headed by a sequence, or any 5+ suit when our holding in partner's
    //    suit is a singleton (round-14 bridge review)
    const ownStrong = [...SUITS].filter(
      (s) =>
        suits[s].length >= 5 &&
        (touching(suits[s], 3) !== null || strength(suits[s]) >= 4),
    );
    // 1. partner's suit (round-14: not from a singleton when we hold a 5-card
    //    suit of our own)
    for (const s of partnerSuits) {
      if (
        suits[s].length > 0 &&
        ownStrong.length === 0 &&
        !(suits[s].length === 1 && [...SUITS].some((x) => suits[x].length >= 5))
      ) {
        const [c, why] = cardInSuitVsNt(suits[s]);
        return [s + c, `partner's suit, ${why}`];
      }
    }
    // 2. longest unbid suit (4+), ties by strength; sequences of honors
    //    preferred over ragged length; a suit the declaring side bid is fine
    //    to lead through from a solid 3-card sequence
    let candidates = [...SUITS].filter(
      (s) =>
        suits[s].length > 0 &&
        (!theirSuits.includes(s) || touching(suits[s], 3) !== null),
    );
    if (candidates.length === 0) {
      candidates = [...SUITS].filter((s) => suits[s].length > 0);
    }
    const key = (s: string): number[] => {
      const cards = suits[s];
      const seq = touching(cards, 3) ? 1 : 0;
      return [flag(cards.length >= 4), seq, cards.length, strength(cards)];
    };
    const best = maxBy(candidates, key);
    const [c, why] = cardInSuitVsNt(suits[best]);
    return [
      best + c,
      `${theirSuits.length > 0 ? "unbid " : ""}longest/strongest suit, ${why}`,
    ];
  }
  // suit contract
  const trump = strain;
  const side = [...SUITS].filter((s) => s !== trump && suits[s].length > 0);
  // 1. partner's suit -- unless we hold a solid 3-card sequence elsewhere, or
  //    a singleton in partner's suit with a touching sequence elsewhere
  //    (round-14 bridge review)
  const seqElsewhere = side.filter(
    (s) => touching(suits[s], 2) !== null && suits[s][0] !== "A",
  );
  const solidElsewhere = side.filter(
    (s) => touching(suits[s], 3) !== null && suits[s][0] !== "A",
  );
  for (const s of partnerSuits) {
    if (
      s !== trump &&
      suits[s].length > 0 &&
      solidElsewhere.length === 0 &&
      !(suits[s].length === 1 && seqElsewhere.length > 0)
    ) {
      const [c, why] = cardInSuitVsSuit(suits[s]);
      return [s + c, `partner's suit, ${why}`];
    }
  }
  // 2. a singleton in a side suit (not an ace) when we hold few trumps: hoping
  //    to ruff
  for (const s of side) {
    if (suits[s].length === 1 && suits[s] !== "A" && suits[trump].length <= 3) {
      return [s + suits[s], "singleton, hoping to ruff"];
    }
  }
  // 3. top of a touching honor sequence (KQ, QJ, JT) in a side suit; AK -> K
  const byLength = [...side].sort((a, b) => suits[b].length - suits[a].length);
  for (const s of byLength) {
    const cards = suits[s];
    if (
      (touching(cards, 2) !== null && cards[0] !== "A") ||
      cards.slice(0, 2) === "AK"
    ) {
      const [c, why] = cardInSuitVsSuit(cards);
      return [s + c, why];
    }
  }
  // 4. a side suit without an ace, preferring unbid suits, then length (4th
  //    best) or a doubleton
  let unbid = side.filter((s) => !theirSuits.includes(s));
  if (unbid.length === 0) {
    unbid = side;
  }
  const safe = unbid.filter((s) => suits[s][0] !== "A");
  if (safe.length > 0) {
    const best = maxBy(safe, (s) => [
      flag(suits[s].length >= 4),
      flag(suits[s].length === 2),
      suits[s].length,
      strength(suits[s]),
    ]);
    const [c, why] = cardInSuitVsSuit(suits[best]);
    return [best + c, `side suit without an ace, ${why}`];
  }
  // 5. a trump from a safe holding rather than underleading an ace
  if (suits[trump].length >= 2 && !"AKQ".includes(suits[trump][0])) {
    return [
      trump + suits[trump][suits[trump].length - 1],
      "low trump (every side suit is headed by the ace)",
    ];
  }
  // 6. last resort: the ace of the longest side suit
  const best = maxBy(unbid, (s) => [suits[s].length]);
  return [best + "A", "ace of the longest side suit (nothing safer)"];
}

/**
 * [partnerSuits, theirSuits] from an auction: NATURAL suit calls by the
 * leader's partner and by the declaring side.  `artificial` (per-call bools:
 * the engine's Artificial annotation, which marks Stayman, transfers, asks,
 * Cappelletti...) excludes conventional calls -- without it a Stayman 2C or a
 * transfer reads as a suit "they" bid.
 *
 * calls: call names in order ("1N", "P", "2C", ...); dealerIndex/leaderIndex:
 * 0=N, 1=E, 2=S, 3=W.
 */
export function bidSuits(
  calls: readonly string[],
  dealerIndex: number,
  leaderIndex: number,
  artificial: readonly boolean[] | null = null,
): readonly [partnerSuits: string[], theirSuits: string[]] {
  const partner: string[] = [];
  const theirs: string[] = [];
  for (let i = 0; i < calls.length; i += 1) {
    const c = calls[i];
    const seat = (dealerIndex + i) % 4;
    if (artificial !== null && i < artificial.length && artificial[i]) {
      continue;
    }
    if (c.length === 2 && "1234567".includes(c[0]) && SUITS.includes(c[1])) {
      if (seat === (leaderIndex + 2) % 4) {
        partner.push(c[1]);
      } else if (seat % 2 !== leaderIndex % 2) {
        theirs.push(c[1]);
      }
    }
  }
  return [partner, theirs];
}
