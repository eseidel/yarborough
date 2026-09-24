// cspell:ignore SHDC
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

/** The textbook opening lead against a completed auction's contract. */
export interface OpeningLead {
  leader: Position;
  card: Card;
  reason: string;
  partnerSuits: SuitName[];
  theirSuits: SuitName[];
}

export interface CallInterpretation {
  call: Call;
  ruleName?: string;
  description?: string;
  constraints?: string;
  /**
   * What kind of call this is, in three levels from the engine's category
   * table (`src/engine/categories.ts`): what you are doing, the family of call,
   * and the rule. Present on the engine's suggested call.
   */
  category?: string[];
}

/**
 * Pick `call`'s interpretation out of the legal-call list z3b returns for a
 * position in the auction. Falls back to an interpretation with no rule name
 * when `call` isn't one z3b would have made (e.g. a deliberately off-system
 * bid), so callers always have something to render.
 */
export function findCallInterpretation(
  interpretations: CallInterpretation[],
  call: Call,
): CallInterpretation {
  return (
    interpretations.find(
      (interpretation) =>
        interpretation.call.type === call.type &&
        interpretation.call.level === call.level &&
        interpretation.call.strain === call.strain,
    ) ?? { call, ruleName: undefined, description: undefined }
  );
}

export function formatRuleName(ruleName: string): string {
  return ruleName
    .replace(/([1-9A-Z])/g, " $1")
    .replace(/R H O/g, "RHO")
    .replace(/L H O/g, "LHO")
    .replace(/\sN$/g, "NT")
    .trim();
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

/** Serialize a Call to the compact z3b identifier format. */
export function callToString(call: Call): string {
  if (call.type === "pass") return "P";
  if (call.type === "double") return "X";
  if (call.type === "redouble") return "XX";
  return `${call.level}${call.strain}`;
}

/** Parse a short string bid (e.g. "P", "1H") into a Call. */
export function stringToCall(s: string): Call {
  if (s === "P") return { type: "pass" };
  if (s === "X") return { type: "double" };
  if (s === "XX") return { type: "redouble" };
  const level = parseInt(s[0], 10);
  const strain = s.substring(1) as StrainName;
  return { type: "bid", level, strain };
}

/** A call the way it is said: "Pass", "X", "XX", "1♠", "3NT". */
export function callLabel(call: Call): string {
  if (call.type === "pass") return "Pass";
  if (call.type === "double") return "X";
  if (call.type === "redouble") return "XX";
  return `${call.level}${strainSymbol(call.strain!)}`;
}

/** The order a hand string names the suits: clubs, diamonds, hearts, spades. */
export const CDHS_SUIT_ORDER: SuitName[] = ["C", "D", "H", "S"];

/**
 * A hand as the engine writes it: "42.A973.K5.AQ982" is 42 of clubs, A973 of
 * diamonds, K5 of hearts and AQ982 of spades.  The repository writes hands
 * C.D.H.S throughout (see CLAUDE.md), matching `Suit::ALL`, while the app
 * shows them spades first; the two orders meet here.
 */
export function handToCdhsString(hand: Hand): string {
  const bySuit = cardsBySuit(hand);
  return CDHS_SUIT_ORDER.map((suit) =>
    bySuit[suit].map((card) => card.rank).join(""),
  ).join(".");
}

/** Read a C.D.H.S hand string. Returns null when it is not thirteen cards. */
export function handFromCdhsString(text: string): Hand | null {
  const holdings = text.toUpperCase().split(".");
  if (holdings.length !== CDHS_SUIT_ORDER.length) return null;
  const cards: Card[] = [];
  const seen = new Set<string>();
  for (const [index, holding] of holdings.entries()) {
    const suit = CDHS_SUIT_ORDER[index];
    for (const rank of holding) {
      if (!RANK_ORDER.includes(rank as RankName)) return null;
      if (seen.has(suit + rank)) return null;
      seen.add(suit + rank);
      cards.push({ suit, rank: rank as RankName });
    }
  }
  return cards.length === 13 ? { cards } : null;
}

/**
 * How a hand stands with one legal call: the call SAYC makes with it, a call
 * it could make that SAYC ranks lower, a call it does not fit, a call SAYC
 * only makes by plan (Blackwood), or a call no SAYC rule makes here.
 */
export type CallFit = "chosen" | "possible" | "unfit" | "planned" | "no_rule";

/**
 * One fact about a hand's own shape: the length of one or two of its suits,
 * the length of its shortest suit, or whether it is balanced.
 */
export type ShapeFact =
  | {
      kind: "lengths";
      /** `bidBy`: who bid the suit of the last contract, when it is this one. */
      lengths: {
        suit: SuitName;
        length: number;
        bidBy?: "partner" | "opponents";
      }[];
    }
  | { kind: "shortest"; length: number }
  | { kind: "balanced"; balanced: boolean };

/**
 * One requirement of a call that the hand does not meet. A bound of 0, or of
 * 13 cards or 37 points, is no bound at all.
 */
export type Miss =
  | {
      kind: "points";
      min: number;
      max: number;
      actual: number;
      /** The bounds are for this hand's shape, narrower than the rule's own. */
      withShape: boolean;
      /** For `withShape`: the part of the shape that alone narrows them. */
      shape?: ShapeFact;
    }
  | { kind: "length"; suit: SuitName; min: number; max: number; actual: number }
  | { kind: "balanced" }
  | { kind: "shape" }
  /** The shape and the points fit, the honors do not (a stopper, a suit's quality). */
  | { kind: "honors"; suit?: SuitName };

/** The entry of a rule's own order among its calls that ranked the better call. */
export interface PreferEntry {
  kind:
    | "longest"
    | "highest"
    | "higher_suit"
    | "lowest_level"
    | "named"
    | "conditional"
    | "unnamed";
  calls: Call[];
}

/** Why SAYC made another call than one this hand could have made. */
export interface Preference {
  /**
   * `purpose`: the other call is for something more important. `strain`:
   * the same purpose, which prefers the other call's strain. `fallback`: this
   * call is what its rule bids only when nothing better fits. `rule`: one
   * rule makes both, and its own order ranks the other first. `tie`: nothing
   * ranks them, and SAYC takes the other by its fixed tie-break.
   */
  kind: "purpose" | "strain" | "fallback" | "rule" | "tie";
  /** The call that ranked above this one. */
  over: Call;
  /** This call's purpose and the other's, as the engine names them. */
  purpose: string;
  overPurpose: string;
  /** For `rule`: the entry of the rule's order that decided it. */
  entry?: PreferEntry;
}

/**
 * An opening's point rule: the rule of 20 in first and second seat, of 19 in
 * third, of 15 in fourth (hcp plus spades).
 */
export type PointRule = "rule_of_20" | "rule_of_19" | "rule_of_15";

/** One legal call, weighed against a hand the user entered. */
export interface HandCallAnalysis extends CallInterpretation {
  fit: CallFit;
  /** On a call the hand does not fit: what it misses, the points first. */
  misses: Miss[];
  /**
   * The point rule that decided the call: on SAYC's call, what made a light
   * hand an opening; on a call the hand misses, what it falls short of.
   */
  pointRule?: PointRule;
  /** On a call the hand could make: why SAYC made another. */
  preference?: Preference;
}

/** Every legal call weighed against one hand. */
export interface HandAnalysis {
  /** The call SAYC makes with this hand. */
  call?: Call;
  category?: string[];
  calls: HandCallAnalysis[];
}

/** A board adaptive practice found, and the category of the call it asks for. */
export interface AdaptiveBoard {
  /** The bare board identifier, without calls. */
  identifier: string;
  category: string[];
}
