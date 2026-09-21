import {
  SUITS,
  type Call,
  callLabel,
  callToString,
  type HandAnalysis,
  type PreferenceReason,
  type UnfitReason,
} from "./types";

/**
 * Why a hand cannot make a call, in a line that can be checked against the
 * cards on the table: "Shows 5+ ♥, you have 2".
 *
 * The numbers are the rule's own bounds, so the sentence never claims a rule
 * asked for something it did not.
 */
export function unfitSummary(reason: UnfitReason): string {
  const suit = reason.suit ? SUITS[reason.suit].symbol : "";
  switch (reason.kind) {
    case "hcp_low":
      return `Shows ${reason.shown}+ points, you have ${reason.actual}`;
    case "hcp_high":
      return `Shows at most ${reason.shown} points, you have ${reason.actual}`;
    case "suit_short":
      return `Shows ${reason.shown}+ ${suit}, you have ${reason.actual}`;
    case "suit_long":
      return `Shows at most ${reason.shown} ${suit}, you have ${reason.actual}`;
  }
}

/** Every weighed call of an analysis, by the string that names the call. */
export function callsByName(
  analysis: HandAnalysis | null | undefined,
): Map<string, HandAnalysis["calls"][number]> {
  const byName = new Map<string, HandAnalysis["calls"][number]>();
  for (const weighed of analysis?.calls ?? []) {
    byName.set(callToString(weighed.call), weighed);
  }
  return byName;
}

/**
 * Why a player makes a call, in words, for each of the engine's purposes.
 *
 * SAYC's whole ordering is over these: the bidder compares two calls a hand
 * could make by what they are for, so the reason one call beat another is
 * this phrase against that one. The names and the order are the engine's
 * (`z3b/purposes.ts`); an unknown one falls back to its own spelling, since
 * a purpose the engine gains should not stop the sentence being said.
 */
const PURPOSE_PHRASES: Readonly<Record<string, string>> = {
  Planned: "a call made to a plan",
  Answer: "answering partner's question",
  EnterNotrumpSystem: "showing a balanced hand in a notrump range",
  GameForce: "forcing to game with a hand too strong for anything else",
  Penalize: "defending their contract",
  Enough: "passing once the auction has found its level",
  SupportMajors: "raising partner's major",
  TwoSuiter: "showing two suits at once",
  RebidLongMajor: "showing a long major",
  BalancedLimit: "limiting a balanced hand in notrump",
  LongSuitInvitation: "inviting with a long suit",
  PreemptWeak: "preempting with a long weak hand",
  Ask: "asking a question",
  MajorDiscovery: "bidding a major you may fit",
  MinorDiscovery: "bidding a minor you may fit",
  SupportMinorWithFive: "raising partner's minor with five",
  RebidLongMajorMinimum: "rebidding a long major on a minimum",
  MinorDiscoveryWithFour: "bidding a four-card minor above the one level",
  Slam: "looking for a slam",
  RebidLongMinor: "rebidding a long minor",
  SupportMinorWithFour: "raising partner's minor with four",
  Game: "bidding a game",
  AskLater: "asking once the shape or the fit allows it",
  CharacterizeStrength: "limiting your strength",
  SupportMinors: "raising partner's minor",
  RebidSuit: "rebidding your own suit",
  Preempt: "obstructing with a long suit",
  Compete: "keeping the auction alive",
  Miscellaneous: "a call with no better reason",
  Forced: "doing the minimum the auction asks for",
};

/** A purpose in words, or its own name when the engine gains a new one. */
export function purposePhrase(purpose: string): string {
  return PURPOSE_PHRASES[purpose] ?? purpose;
}

/**
 * Why SAYC passed over a call this hand could have made.
 *
 * The four kinds are the four things that order two calls: what each is for,
 * which strain a purpose prefers, whether a call is a rule's last resort,
 * and a rule's own preference between the calls it offers.
 */
export function preferenceSummary(
  reason: PreferenceReason,
  chosen: Call,
  /** The chosen call's rule, for the case where one rule offers both. */
  chosenRuleName?: string,
): string {
  const preferred = `SAYC prefers ${callLabel(chosen)}`;
  switch (reason.kind) {
    case "purpose":
      return `${preferred}: ${purposePhrase(reason.chosenPurpose)} comes before ${purposePhrase(reason.purpose)}.`;
    case "strain":
      return `${preferred}: for ${purposePhrase(reason.purpose)}, that strain comes first.`;
    case "fallback":
      return `${preferred}: this is only bid when nothing better fits.`;
    case "rule":
      return `${preferred}: ${chosenRuleName ?? "one rule"} offers both, and picks that one with this hand.`;
  }
}
