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
 */
export function buildVerdicts(
  history: CallHistory,
  position: Position,
  saycCalls: Record<string, CallInterpretation>,
  assistedKeys: ReadonlySet<string>,
): CallVerdict[] {
  const verdicts: CallVerdict[] = [];
  for (const index of callIndicesFor(history, position)) {
    const key = prefixKey(history, index);
    const sayc = saycCalls[key];
    if (!sayc) continue;
    const call = history.calls[index];
    verdicts.push({
      index,
      call,
      sayc,
      matched: callsEqual(call, sayc.call),
      assisted: assistedKeys.has(key),
    });
  }
  return verdicts;
}

export interface VerdictSummary {
  total: number;
  matched: number;
  assisted: number;
  missed: CallVerdict[];
  /** Every call matched and none was assisted. */
  onSystem: boolean;
}

export function summarizeVerdicts(verdicts: CallVerdict[]): VerdictSummary {
  const missed = verdicts.filter((v) => !v.matched);
  const assisted = verdicts.filter((v) => v.assisted).length;
  return {
    total: verdicts.length,
    matched: verdicts.length - missed.length,
    assisted,
    missed,
    onSystem: verdicts.length > 0 && missed.length === 0 && assisted === 0,
  };
}
