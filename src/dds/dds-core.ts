// Pure conversions between the site's deal types and DDS's PBN strings and
// index encodings. No worker, no wasm: everything here runs in a unit test.

import type {
  Card,
  Deal,
  Hand,
  Position,
  RankName,
  StrainName,
  SuitName,
} from "../bridge/types";
import { RANK_ORDER, handForPosition } from "../bridge/types";

/** DDS orders strains spades first and notrump last... */
export const DDS_STRAIN_ORDER: readonly StrainName[] = [
  "S",
  "H",
  "D",
  "C",
  "N",
];
/** ...and hands clockwise from North. */
export const DDS_HAND_ORDER: readonly Position[] = ["N", "E", "S", "W"];
const PBN_SUIT_ORDER: readonly SuitName[] = ["S", "H", "D", "C"];

/** Trick counts for every strain and declarer: `table.S.N` is spades by North. */
export type DoubleDummyTable = Record<StrainName, Record<Position, number>>;

export function ddsStrainIndex(strain: StrainName): number {
  return DDS_STRAIN_ORDER.indexOf(strain);
}

export function ddsHandIndex(position: Position): number {
  return DDS_HAND_ORDER.indexOf(position);
}

/** DDS ranks run 2..14 with the ace at 14. */
export function ddsRankValue(rank: RankName): number {
  return 14 - RANK_ORDER.indexOf(rank);
}

/** One hand as PBN: spades.hearts.diamonds.clubs, each suit from the ace down. */
export function handToPbn(hand: Hand): string {
  return PBN_SUIT_ORDER.map((suit) =>
    hand.cards
      .filter((card) => card.suit === suit)
      .map((card) => card.rank)
      .sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b))
      .join(""),
  ).join(".");
}

/** The whole deal as PBN, North first: "N:AK.. .. .. .." */
export function dealToPbn(deal: Deal): string {
  return (
    "N:" +
    DDS_HAND_ORDER.map((position) =>
      handToPbn(handForPosition(deal, position)),
    ).join(" ")
  );
}

/** The same PBN with one card taken out of one hand (the opening lead, once played). */
export function pbnWithoutCard(
  pbn: string,
  position: Position,
  card: Card,
): string {
  const [prefix, ...hands] = pbn.split(/[: ]/);
  if (prefix !== "N" || hands.length !== 4) {
    throw new Error(`Not a North-first PBN deal: ${pbn}`);
  }
  const handIndex = ddsHandIndex(position);
  const suits = hands[handIndex].split(".");
  const suitIndex = PBN_SUIT_ORDER.indexOf(card.suit);
  if (!suits[suitIndex].includes(card.rank)) {
    throw new Error(`${position} does not hold ${card.suit}${card.rank}`);
  }
  suits[suitIndex] = suits[suitIndex].replace(card.rank, "");
  hands[handIndex] = suits.join(".");
  return `N:${hands.join(" ")}`;
}

/** "H8" (suit then rank, the engine's card spelling) as a Card. */
export function parseCardName(name: string): Card {
  if (!/^[CDHS][AKQJT98765432]$/.test(name)) {
    throw new Error(`Invalid card: ${name}`);
  }
  return { suit: name[0] as SuitName, rank: name[1] as RankName };
}

/** The twenty comma-separated trick counts dds_calc_table returns, as a table. */
export function parseDoubleDummyTable(text: string): DoubleDummyTable {
  if (text.startsWith("error")) {
    throw new Error(`The double-dummy solver failed: ${text}`);
  }
  const values = text.split(",").map(Number);
  if (values.length !== 20 || values.some((v) => !Number.isInteger(v))) {
    throw new Error(
      `The double-dummy solver returned an invalid table: ${text}`,
    );
  }
  const table = {} as DoubleDummyTable;
  DDS_STRAIN_ORDER.forEach((strain, strainIndex) => {
    table[strain] = {} as Record<Position, number>;
    DDS_HAND_ORDER.forEach((position, handIndex) => {
      table[strain][position] = values[strainIndex * 4 + handIndex];
    });
  });
  return table;
}

/** Tricks a contract at `level` needs. */
export function tricksRequired(level: number): number {
  return level + 6;
}

/**
 * The result of a `level` contract with `tricks` taken, the way it is said at
 * the table: "makes 4 (10 tricks)", "makes 5 (11 tricks)" for an overtrick on a
 * four-level contract, "down 2 (7 tricks)".
 */
export function describeResult(level: number, tricks: number): string {
  const needed = tricksRequired(level);
  const plural = tricks === 1 ? "trick" : "tricks";
  if (tricks < needed) return `down ${needed - tricks} (${tricks} ${plural})`;
  return `makes ${tricks - 6} (${tricks} ${plural})`;
}
