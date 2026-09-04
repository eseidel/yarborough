// What the record keeps for every hand the user bids. See
// docs/progress-plan.md, section 2.

import type { Position, Vulnerability } from "../../bridge/types";
import type { DealType } from "../../bridge/identifier";
import type { DoubleDummyTable } from "../../dds/dds-core";

/** How a hand was dealt: a practice focus, or adaptive mode. */
export type HandSource = DealType | "Adaptive";

/** One of the user's calls, checked against the engine's call in its place. */
export interface RecordedVerdict {
  /** Index of the call in `HandRecord.calls`. */
  index: number;
  /** The user's call, in the engine's spelling: "P", "X", "XX", "1S", "3N". */
  call: string;
  /** The engine's call there, in the same spelling. */
  saycCall: string;
  ruleName?: string;
  /**
   * The engine's three-level category for its call (python/categories.py).
   * Empty when the engine did not provide one.
   */
  category: string[];
  matched: boolean;
  /** The engine's call was shown before the user called. */
  assisted: boolean;
}

export interface HandRecord {
  /** Assigned by the store on insert. */
  id?: number;
  /** The board without any calls: "<number>-<26 hex chars>". */
  boardId: string;
  boardNumber: number;
  dealer: Position;
  vulnerability: Vulnerability;
  userPosition: Position;
  source: HandSource;
  /** Categories adaptive mode was aiming at, when `source` is "Adaptive". */
  targets?: string[][];
  /** The auction as bid, in the engine's spelling. */
  calls: string[];
  /** "4S", "3NX", or null when passed out. */
  contract: string | null;
  declarer: Position | null;
  /** The engine's own auction for the board, when it was bid out. */
  saycCalls: string[] | null;
  verdicts: RecordedVerdict[];
  /** Double-dummy results, when the solver finished before the hand was left. */
  table?: DoubleDummyTable;
  /** The textbook opening lead, "D4", and declarer's tricks after it. */
  lead?: string;
  tricksAfterLead?: number;
  /** Milliseconds since the epoch. */
  completedAt: number;
  /** From the user's first call to the auction's end. */
  durationMs: number;
}

/** Keys of the `settings` store. */
export type SettingKey = "feedbackTiming" | "focus";
