// cspell:ignore DAKJ
import type {
  Deal,
  Hand,
  Card,
  SuitName,
  RankName,
  CallHistory,
  CallInterpretation,
} from "./types";
import { RANK_ORDER } from "./types";

function makeDeck(): Card[] {
  const suits: SuitName[] = ["C", "D", "H", "S"];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of RANK_ORDER) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffle<T>(array: T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomDeal(): Deal {
  const deck = shuffle(makeDeck());
  const hands: Hand[] = [
    { cards: [] },
    { cards: [] },
    { cards: [] },
    { cards: [] },
  ];
  deck.forEach((card, i) => hands[i % 4].cards.push(card));
  return { north: hands[0], east: hands[1], south: hands[2], west: hands[3] };
}

function parseHand(s: string): Card[] {
  const cards: Card[] = [];
  for (const group of s.split(" ")) {
    const suit = group[0] as SuitName;
    for (let i = 1; i < group.length; i++) {
      cards.push({ suit, rank: group[i] as RankName });
    }
  }
  return cards;
}

export const MOCK_DEAL: Deal = {
  north: { cards: parseHand("SAK32 HQJ4 D987 C654") },
  east: { cards: parseHand("SQJ9 HT98 DAKJ CT982") },
  south: { cards: parseHand("ST876 HA76 DQ32 CAK3") },
  west: { cards: parseHand("S54 HK532 DT654 CQJ7") },
};

export const MOCK_CALL_HISTORY: CallHistory = {
  dealer: "N",
  calls: [
    { type: "bid", level: 1, strain: "N" },
    { type: "pass" },
    { type: "bid", level: 2, strain: "C" },
    { type: "pass" },
    { type: "bid", level: 2, strain: "N" },
    { type: "pass" },
    { type: "bid", level: 3, strain: "N" },
    { type: "pass" },
    { type: "pass" },
    { type: "pass" },
  ],
};

export const MOCK_INTERPRETATIONS: CallInterpretation[] = [
  { call: { type: "pass" }, ruleName: "Pass", description: "Nothing to say" },
  {
    call: { type: "bid", level: 1, strain: "C" },
    ruleName: "Opening 1\u2663",
    description: "12-21 HCP, 3+ clubs",
  },
  {
    call: { type: "bid", level: 1, strain: "D" },
    ruleName: "Opening 1\u2666",
    description: "12-21 HCP, 3+ diamonds",
  },
  {
    call: { type: "bid", level: 1, strain: "H" },
    ruleName: "Opening 1\u2665",
    description: "12-21 HCP, 5+ hearts",
  },
  {
    call: { type: "bid", level: 1, strain: "S" },
    ruleName: "Opening 1\u2660",
    description: "12-21 HCP, 5+ spades",
  },
  {
    call: { type: "bid", level: 1, strain: "N" },
    ruleName: "Opening 1NT",
    description: "15-17 HCP, balanced",
  },
  {
    call: { type: "bid", level: 2, strain: "C" },
    ruleName: "Strong 2\u2663",
    description: "22+ HCP or 9+ tricks",
  },
];
