// The learner's record, kept on the device in localStorage. Nothing here is
// sent anywhere; the site's analytics see only match/differ per hand.

import type { DealType } from "../bridge/identifier";
import type { CallVerdict } from "./verdicts";
import { summarizeVerdicts } from "./verdicts";

export interface HandStats {
  /** Hands reviewed. */
  hands: number;
  /** Hands where every call matched SAYC without help. */
  handsOnSystem: number;
  /** Calls checked, not counting calls made after the SAYC bid was shown. */
  calls: number;
  callsMatched: number;
}

export interface Progress {
  version: 1;
  total: HandStats;
  byFocus: Partial<Record<DealType, HandStats>>;
  /** Consecutive hands bid entirely on system, ending with the latest hand. */
  streak: number;
  bestStreak: number;
  /** Keys of the most recent hands recorded, so a reload does not count twice. */
  recorded: string[];
}

export const PROGRESS_STORAGE_KEY = "yarborough_progress_v1";
const RECORDED_LIMIT = 50;

export const EMPTY_STATS: HandStats = {
  hands: 0,
  handsOnSystem: 0,
  calls: 0,
  callsMatched: 0,
};

export const EMPTY_PROGRESS: Progress = {
  version: 1,
  total: EMPTY_STATS,
  byFocus: {},
  streak: 0,
  bestStreak: 0,
  recorded: [],
};

function isStats(value: unknown): value is HandStats {
  if (typeof value !== "object" || value === null) return false;
  const stats = value as Record<string, unknown>;
  return (["hands", "handsOnSystem", "calls", "callsMatched"] as const).every(
    (field) => Number.isInteger(stats[field]) && (stats[field] as number) >= 0,
  );
}

/** Parse a stored record, falling back to an empty one for anything unusable. */
export function parseProgress(json: string | null): Progress {
  if (!json) return EMPTY_PROGRESS;
  try {
    const value = JSON.parse(json) as Partial<Progress>;
    if (value.version !== 1 || !isStats(value.total)) return EMPTY_PROGRESS;
    const byFocus: Progress["byFocus"] = {};
    for (const [focus, stats] of Object.entries(value.byFocus ?? {})) {
      if (isStats(stats)) byFocus[focus as DealType] = stats;
    }
    return {
      version: 1,
      total: value.total,
      byFocus,
      streak: Number.isInteger(value.streak) ? (value.streak as number) : 0,
      bestStreak: Number.isInteger(value.bestStreak)
        ? (value.bestStreak as number)
        : 0,
      recorded: Array.isArray(value.recorded)
        ? value.recorded.filter((k): k is string => typeof k === "string")
        : [],
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function loadProgress(storage: Storage | undefined): Progress {
  try {
    return parseProgress(storage?.getItem(PROGRESS_STORAGE_KEY) ?? null);
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function saveProgress(
  storage: Storage | undefined,
  progress: Progress,
): void {
  try {
    storage?.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Private mode or a full quota: the record simply does not persist.
  }
}

function addHand(stats: HandStats, verdicts: CallVerdict[]): HandStats {
  const summary = summarizeVerdicts(verdicts);
  const unassisted = verdicts.filter((v) => !v.assisted);
  return {
    hands: stats.hands + 1,
    handsOnSystem: stats.handsOnSystem + (summary.onSystem ? 1 : 0),
    calls: stats.calls + unassisted.length,
    callsMatched:
      stats.callsMatched + unassisted.filter((v) => v.matched).length,
  };
}

/**
 * Record one reviewed hand. `key` identifies the board and the auction, so
 * the same result is counted once however often the page is reloaded.
 * Returns `progress` itself when the hand is already recorded.
 */
export function recordHand(
  progress: Progress,
  key: string,
  focus: DealType,
  verdicts: CallVerdict[],
): Progress {
  if (verdicts.length === 0 || progress.recorded.includes(key)) {
    return progress;
  }
  const onSystem = summarizeVerdicts(verdicts).onSystem;
  const streak = onSystem ? progress.streak + 1 : 0;
  return {
    version: 1,
    total: addHand(progress.total, verdicts),
    byFocus: {
      ...progress.byFocus,
      [focus]: addHand(progress.byFocus[focus] ?? EMPTY_STATS, verdicts),
    },
    streak,
    bestStreak: Math.max(progress.bestStreak, streak),
    recorded: [...progress.recorded, key].slice(-RECORDED_LIMIT),
  };
}

/** Share of checked calls that matched SAYC, or null before any call was checked. */
export function accuracy(stats: HandStats): number | null {
  if (stats.calls === 0) return null;
  return stats.callsMatched / stats.calls;
}

export function formatAccuracy(stats: HandStats): string {
  const value = accuracy(stats);
  return value === null ? "–" : `${Math.round(value * 100)}%`;
}
