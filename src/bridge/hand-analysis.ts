import {
  SUITS,
  type Call,
  type Hand,
  type Miss,
  type Preference,
  type PreferEntry,
  type SuitName,
  callLabel,
  cardsBySuit,
  callToString,
  type HandAnalysis,
  type HandCallAnalysis,
  highCardPoints,
} from "./types";

/** No void, no singleton, and at most one doubleton. */
export function isBalanced(hand: Hand): boolean {
  const lengths = Object.values(cardsBySuit(hand)).map((cards) => cards.length);
  return (
    lengths.every((length) => length >= 2) &&
    lengths.filter((length) => length === 2).length <= 1
  );
}

function range(min: number, max: number, unit: string, top: number): string {
  if (min === max) return `${min} ${unit}`;
  if (max >= top) return `${min}+ ${unit}`;
  if (min <= 0) return `at most ${max} ${unit}`;
  return `${min}–${max} ${unit}`;
}

/**
 * One requirement a hand misses, in a sentence to check against the cards:
 * "Needs 15–17 hcp, you have 13".
 */
export function missText(miss: Miss): string {
  switch (miss.kind) {
    case "points": {
      const needs = miss.withShape ? "With this shape, needs" : "Needs";
      return `${needs} ${range(miss.min, miss.max, "hcp", 37)}, you have ${miss.actual}`;
    }
    case "length": {
      const suit = SUITS[miss.suit].symbol;
      const wanted =
        miss.actual < miss.min
          ? miss.min === miss.max
            ? `${miss.min} ${suit}`
            : `${miss.min}+ ${suit}`
          : `at most ${miss.max} ${suit}`;
      return `Needs ${wanted}, you have ${miss.actual}`;
    }
    case "balanced":
      return "Needs a balanced hand";
    case "shape":
      return "Needs a different shape";
    case "honors":
      return miss.suit
        ? `Needs better ${SUITS[miss.suit].symbol} honors`
        : "Needs different honors";
  }
}

/** The misses worth reading: the first two, as sentences. */
export function missesText(misses: Miss[]): string {
  if (!misses.length) return "Doesn't fit this hand.";
  return misses
    .slice(0, 2)
    .map((miss) => `${missText(miss)}.`)
    .join(" ");
}

/**
 * What a call is for, for each of the engine's purposes (z3b/purposes.ts,
 * whose order these follow). SAYC compares two calls a hand could make by
 * these first. A purpose the engine gains later reads as its own name rather
 * than stopping the sentence.
 */
const PURPOSE_PHRASES: Readonly<Record<string, string>> = {
  Planned: "a call made to a plan",
  Answer: "answering partner's question",
  EnterNotrumpSystem: "showing a balanced hand in a notrump range",
  GameForce: "forcing to game",
  Penalize: "defending their contract",
  Enough: "stopping once the auction has found its level",
  SupportMajors: "raising partner's major",
  TwoSuiter: "showing two suits at once",
  RebidLongMajor: "showing a long major",
  BalancedLimit: "limiting a balanced hand in notrump",
  LongSuitInvitation: "inviting with a long suit",
  PreemptWeak: "preempting with a weak hand",
  Ask: "asking partner a question",
  MajorDiscovery: "showing a suit you may fit",
  MinorDiscovery: "showing a minor you may fit",
  SupportMinorWithFive: "raising partner's minor with five",
  RebidLongMajorMinimum: "rebidding a six-card major on a minimum",
  MinorDiscoveryWithFour: "showing a four-card minor",
  Slam: "bidding a slam",
  RebidLongMinor: "rebidding a long minor",
  SupportMinorWithFour: "raising partner's minor with four",
  Game: "bidding a game",
  AskLater: "asking a question the hand doesn't need yet",
  CharacterizeStrength: "limiting your strength",
  SupportMinors: "raising partner's minor",
  RebidSuit: "rebidding your own suit",
  Preempt: "preempting with a long suit",
  Compete: "competing in the balancing seat",
  Miscellaneous: "a call with no better reason",
  Forced: "the least the auction requires",
};

export function purposePhrase(purpose: string): string {
  return PURPOSE_PHRASES[purpose] ?? purpose;
}

/** The strain order a purpose keeps (z3b/purposes.ts PREFERENCES). */
const STRAIN_PHRASES: Readonly<Record<string, string>> = {
  Game: "a major game comes before notrump, and notrump before a minor",
  Slam: "a slam in a major comes before a minor, and a minor before notrump",
};

function list(calls: Call[]): string {
  const labels = calls.map(callLabel);
  return labels.length < 2
    ? (labels[0] ?? "")
    : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function entryPhrase(entry: PreferEntry | undefined, over: Call): string {
  switch (entry?.kind) {
    case "longest":
      return `the longest of ${list(entry.calls)} comes first`;
    case "highest":
      return "it bids the highest level the hand is worth";
    case "higher_suit":
      return "the higher suit comes first";
    case "lowest_level":
      return "the lowest level comes first";
    case "conditional":
      return `with this hand, ${callLabel(over)} comes first`;
    case "unnamed":
      return "the cheaper call comes first";
    default:
      return `${callLabel(over)} comes first in its order`;
  }
}

/**
 * Why SAYC made another call than `call`, which the hand could also make:
 * "SAYC prefers 3♥: raising partner's major comes before showing a suit you
 * may fit."
 */
export function preferenceText(call: Call, preference: Preference): string {
  const lead = `SAYC prefers ${callLabel(preference.over)}`;
  switch (preference.kind) {
    case "purpose":
      if (preference.purpose === "Forced") {
        return `${lead}. ${callLabel(call)} is for a hand with nothing better to say.`;
      }
      return `${lead}: ${purposePhrase(preference.overPurpose)} comes before ${purposePhrase(preference.purpose)}.`;
    case "strain":
      return `${lead}: ${STRAIN_PHRASES[preference.purpose] ?? "that strain comes first"}.`;
    case "fallback":
      return `${lead}. ${callLabel(call)} is only bid when nothing better fits.`;
    case "rule":
      return `${lead}: ${entryPhrase(preference.entry, preference.over)}.`;
    case "tie":
      return `${lead}. The rules don't rank these two, so SAYC takes the lower call.`;
  }
}

/** Why the chosen call suits the hand, in the numbers it is chosen on. */
export function chosenText(hand: Hand, call: Call): string {
  const parts = [`${highCardPoints(hand)} hcp`];
  if (call.type === "bid" && call.strain !== "N") {
    const length = cardsBySuit(hand)[call.strain as SuitName].length;
    parts.push(`${length} ${SUITS[call.strain as SuitName].symbol}`);
  } else if (call.type === "bid" && isBalanced(hand)) {
    parts.push("a balanced hand");
  }
  return `You have ${parts.join(" and ")}.`;
}

/** Every weighed call of an analysis, by the string that names the call. */
export function callsByName(
  analysis: HandAnalysis | null | undefined,
): Map<string, HandCallAnalysis> {
  const byName = new Map<string, HandCallAnalysis>();
  for (const weighed of analysis?.calls ?? []) {
    byName.set(callToString(weighed.call), weighed);
  }
  return byName;
}
