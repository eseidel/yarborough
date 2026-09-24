// What the user's own hand says about a call, in sentences for Practice: why
// SAYC's call suits it, and where one of the user's calls stands with it.

import type {
  Call,
  Hand,
  HandAnalysis,
  HandCallAnalysis,
  PointRule,
} from "../bridge/types";
import { callLabel, callToString } from "../bridge/types";
import {
  chosenText,
  missesText,
  pointRuleText,
  preferenceText,
} from "../bridge/hand-analysis";

/** The analysis of one call, when the engine weighed it. */
export function weighedCall(
  analysis: HandAnalysis | null | undefined,
  call: Call,
): HandCallAnalysis | null {
  const name = callToString(call);
  return (
    analysis?.calls.find((weighed) => callToString(weighed.call) === name) ??
    null
  );
}

/**
 * Where a call the user made stands with their hand, in a sentence or two:
 * "2♥ doesn't fit your hand. Needs 6–10 hcp, you have 14."
 */
export function yourCallText(weighed: HandCallAnalysis): string {
  const label = callLabel(weighed.call);
  switch (weighed.fit) {
    case "chosen":
      return `${label} is SAYC's call with your hand.`;
    case "possible":
      return weighed.preference
        ? `${label} fits your hand too. ${preferenceText(weighed.call, weighed.preference)}`
        : `${label} fits your hand too.`;
    case "unfit":
      return weighed.misses.length
        ? `${label} doesn't fit your hand. ${missesText(weighed.misses)}`
        : `${label} doesn't fit your hand.`;
    case "planned":
      return `SAYC bids ${label} here only as part of a plan, such as a slam try.`;
    case "no_rule":
      return `SAYC has no rule for ${label} here.`;
  }
}

/**
 * The other calls the hand could make, each with why SAYC made its call
 * instead: "Why not 1NT? SAYC prefers 1♠: …". The first `limit`, in bidding
 * order. A call the auction merely allows (a pass with an opening hand) is
 * left out: that it is for a hand with nothing better to say teaches nothing
 * once SAYC's better call is on show.
 */
export function alternativesText(
  analysis: HandAnalysis | null | undefined,
  limit = 3,
): string[] {
  return (analysis?.calls ?? [])
    .filter(
      (weighed) =>
        weighed.fit === "possible" && weighed.preference?.purpose !== "Forced",
    )
    .slice(0, limit)
    .map((weighed) =>
      weighed.preference
        ? `Why not ${callLabel(weighed.call)}? ${preferenceText(weighed.call, weighed.preference)}`
        : `${callLabel(weighed.call)} fits your hand too.`,
    );
}

/**
 * The point rules that decided SAYC's call and the user's, SAYC's first:
 * named on the miss card, each with a way to read what it is.
 */
export function missPointRules(
  yours: Call,
  sayc: Call,
  analysis: HandAnalysis | null,
): PointRule[] {
  const rules: PointRule[] = [];
  for (const call of [sayc, yours]) {
    const rule = weighedCall(analysis, call)?.pointRule;
    if (rule && !rules.includes(rule)) rules.push(rule);
  }
  return rules;
}

/**
 * Why SAYC bids `sayc` rather than the user's `yours`, from the hand: the
 * numbers SAYC's call is chosen on, then where the user's call stands. A
 * point rule that decided either call is counted out after it: "Rule of 20:
 * 11 hcp + 5 ♠ + 3 ♥ = 19, short of 20."
 */
export function missReasons(
  hand: Hand,
  yours: Call,
  sayc: Call,
  analysis: HandAnalysis | null,
): string[] {
  const lines = [chosenText(hand, sayc)];
  const chosen = weighedCall(analysis, sayc);
  if (chosen?.fit === "chosen" && chosen.pointRule) {
    lines.push(`${pointRuleText(chosen.pointRule, hand)}.`);
  }
  const weighed = weighedCall(analysis, yours);
  if (weighed && weighed.fit !== "chosen") {
    lines.push(yourCallText(weighed));
    if (weighed.pointRule && weighed.pointRule !== chosen?.pointRule) {
      lines.push(`${pointRuleText(weighed.pointRule, hand)}.`);
    }
  }
  return lines;
}

/** Everything the hand says about SAYC's call, for the SAYC bid on request. */
export function saycBidReasons(
  hand: Hand,
  sayc: Call,
  analysis: HandAnalysis | null,
): string[] {
  return [chosenText(hand, sayc), ...alternativesText(analysis)];
}

/** What the hand says about one call the user made, in the auction. */
export function yourCallReasons(
  hand: Hand,
  call: Call,
  analysis: HandAnalysis | null,
): string[] {
  const weighed = weighedCall(analysis, call);
  if (!weighed) return [];
  if (weighed.fit === "chosen") {
    return [`${yourCallText(weighed)} ${chosenText(hand, call)}`];
  }
  return [yourCallText(weighed)];
}
