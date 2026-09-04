// Pure aggregation over the record. Everything the practice strip and the
// Progress tab show is computed from the hands in memory; nothing is stored
// pre-aggregated.

import type { HandRecord, HandSource } from "./record/types";

export interface Tally {
  /** Checked calls: the user's calls made without seeing the engine's bid. */
  calls: number;
  matched: number;
}

export interface HandTally extends Tally {
  hands: number;
  /** Hands where every call matched and none was assisted. */
  handsOnSystem: number;
}

export interface Summary extends HandTally {
  /** Consecutive hands on system, ending with the latest hand. */
  streak: number;
  bestStreak: number;
  bySource: Partial<Record<HandSource, HandTally>>;
}

export const EMPTY_TALLY: HandTally = {
  calls: 0,
  matched: 0,
  hands: 0,
  handsOnSystem: 0,
};

/** True when every call matched SAYC and none was assisted. */
export function handOnSystem(hand: HandRecord): boolean {
  return (
    hand.verdicts.length > 0 &&
    hand.verdicts.every((v) => v.matched && !v.assisted)
  );
}

function addHand(tally: HandTally, hand: HandRecord): HandTally {
  const checked = hand.verdicts.filter((v) => !v.assisted);
  return {
    calls: tally.calls + checked.length,
    matched: tally.matched + checked.filter((v) => v.matched).length,
    hands: tally.hands + 1,
    handsOnSystem: tally.handsOnSystem + (handOnSystem(hand) ? 1 : 0),
  };
}

/** Totals over `hands`, which must be in chronological order. */
export function summarize(hands: HandRecord[]): Summary {
  let total = EMPTY_TALLY;
  const bySource: Partial<Record<HandSource, HandTally>> = {};
  let streak = 0;
  let bestStreak = 0;
  for (const hand of hands) {
    total = addHand(total, hand);
    bySource[hand.source] = addHand(bySource[hand.source] ?? EMPTY_TALLY, hand);
    streak = handOnSystem(hand) ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }
  return { ...total, streak, bestStreak, bySource };
}

/** One checked call, as the statistics see it. */
export interface CallOutcome {
  matched: boolean;
  /** The engine's category for the call it wanted; empty when unknown. */
  category: string[];
  completedAt: number;
  handId?: number;
}

/** Every checked call in `hands`, in chronological order. */
export function callOutcomes(hands: HandRecord[]): CallOutcome[] {
  const outcomes: CallOutcome[] = [];
  for (const hand of hands) {
    for (const verdict of hand.verdicts) {
      if (verdict.assisted) continue;
      outcomes.push({
        matched: verdict.matched,
        category: verdict.category,
        completedAt: hand.completedAt,
        handId: hand.id,
      });
    }
  }
  return outcomes;
}

export function accuracy(tally: Tally): number | null {
  return tally.calls === 0 ? null : tally.matched / tally.calls;
}

export function formatAccuracy(tally: Tally): string {
  const value = accuracy(tally);
  return value === null ? "–" : `${Math.round(value * 100)}%`;
}
