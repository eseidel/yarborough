// Per-call verdicts: each of the user's calls compared with what the engine
// would have bid in that exact position of the auction as it actually went.

import type {
  Call,
  CallHistory,
  CallInterpretation,
  Position,
} from "../bridge/types";
import { callToString } from "../bridge/types";

const SEAT_ORDER: Position[] = ["N", "E", "S", "W"];

/** The seat that made (or is to make) call `index`. */
export function seatForCall(history: CallHistory, index: number): Position {
  const dealerIndex = SEAT_ORDER.indexOf(history.dealer);
  return SEAT_ORDER[(dealerIndex + index) % 4];
}

export interface CallVerdict {
  /** Index of the user's call in `history.calls`. */
  index: number;
  /** What the user called. */
  call: Call;
  /** What SAYC calls there, with its rule. */
  sayc: CallInterpretation;
  matched: boolean;
  /** The SAYC call was shown before the user called. */
  assisted: boolean;
  /**
   * The user's first call at this turn, when they took it back and called
   * again. The first try is the one that counts, so a call found on a retry
   * is not a match.
   */
  firstCall?: Call;
}

/** The user found SAYC's call, but only after trying another first. */
export function foundOnRetry(verdict: CallVerdict): boolean {
  return (
    verdict.firstCall !== undefined &&
    callsEqual(verdict.call, verdict.sayc.call)
  );
}

export function callsEqual(a: Call, b: Call): boolean {
  return a.type === b.type && a.level === b.level && a.strain === b.strain;
}

/** The auction before call `index`, as the comma-separated key the engine uses. */
export function prefixKey(history: CallHistory, index: number): string {
  return history.calls.slice(0, index).map(callToString).join(",");
}

/** Indices in `history.calls` of the calls `position` made. */
export function callIndicesFor(
  history: CallHistory,
  position: Position,
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < history.calls.length; i++) {
    if (seatForCall(history, i) === position) indices.push(i);
  }
  return indices;
}

/**
 * Build the verdicts for `position`'s calls from the engine's calls known so
 * far, keyed by `prefixKey`. A call whose position the engine has not yet
 * answered for is left out, so `verdicts.length < callIndicesFor(...).length`
 * means the check is still running.
 *
 * `firstCalls` holds the first call the user made at each turn, by the same
 * key: a turn re-opened by a take back is judged on that first try.
 */
export function buildVerdicts(
  history: CallHistory,
  position: Position,
  saycCalls: Record<string, CallInterpretation>,
  assistedKeys: ReadonlySet<string>,
  firstCalls: Readonly<Record<string, Call>> = {},
): CallVerdict[] {
  const verdicts: CallVerdict[] = [];
  for (const index of callIndicesFor(history, position)) {
    const key = prefixKey(history, index);
    const sayc = saycCalls[key];
    if (!sayc) continue;
    const call = history.calls[index];
    const first = firstCalls[key];
    const retried = first !== undefined && !callsEqual(first, call);
    verdicts.push({
      index,
      call,
      sayc,
      matched: !retried && callsEqual(call, sayc.call),
      assisted: assistedKeys.has(key),
      ...(retried ? { firstCall: first } : {}),
    });
  }
  return verdicts;
}

export interface VerdictSummary {
  total: number;
  /** Calls that ended up as SAYC's, including those found on a retry. */
  matched: number;
  assisted: number;
  /** SAYC's calls found only after taking back another. */
  retried: number;
  /** Calls that stood as something other than SAYC's. */
  missed: CallVerdict[];
  /** Every call matched on its first try and none was assisted. */
  onSystem: boolean;
}

/**
 * How the auction as it stands compares with SAYC. A call taken back and
 * replaced by SAYC's reads as SAYC's here, as the auction does; the record
 * still judges it on its first try.
 */
export function summarizeVerdicts(verdicts: CallVerdict[]): VerdictSummary {
  const retried = verdicts.filter(foundOnRetry).length;
  const missed = verdicts.filter((v) => !v.matched && !foundOnRetry(v));
  const assisted = verdicts.filter((v) => v.assisted).length;
  return {
    total: verdicts.length,
    matched: verdicts.length - missed.length,
    assisted,
    retried,
    missed,
    onSystem:
      verdicts.length > 0 &&
      missed.length === 0 &&
      retried === 0 &&
      assisted === 0,
  };
}
