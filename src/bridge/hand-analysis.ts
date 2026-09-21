import {
  SUITS,
  callToString,
  type HandAnalysis,
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
