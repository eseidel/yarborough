import { useState } from "react";
import type { Hand, HandAnalysis } from "../bridge/types";
import { callLabel } from "../bridge/types";
import type { CallVerdict } from "../practice/verdicts";
import { missReasons } from "../practice/hand-reasons";
import { ConstraintsDisplay } from "./ConstraintsDisplay";
import { HandReasons } from "./HandReasons";
import { SuitText } from "./SuitText";

/**
 * The verdict on the user's latest call, shown while the auction goes on.
 * A match needs no comment (the call table already ticks it); only a miss
 * gets a box, with what SAYC bids instead and why.
 *
 * Given the user's hand and the engine's analysis of it at this call, the
 * box says why in the hand's own numbers: what SAYC's call is chosen on, and
 * what the user's call misses or why SAYC ranked it lower.
 */
export function CallFeedback({
  verdict,
  hand,
  analysis,
  onShowOptions,
  onDefer,
}: {
  verdict: CallVerdict;
  /** The user's hand. */
  hand?: Hand;
  /** The hand weighed at this call: undefined while the engine works. */
  analysis?: HandAnalysis | null;
  /** Open every legal call at the point of this call. */
  onShowOptions?: () => void;
  /** Switch to feedback at the end of the hand instead. */
  onDefer?: () => void;
}) {
  const [why, setWhy] = useState(false);
  const { sayc } = verdict;

  if (verdict.matched) {
    return null;
  }

  return (
    <div
      className="space-y-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
      data-testid="call-feedback-miss"
    >
      <div>
        <span className="font-bold">✗</span> You bid{" "}
        <span className="font-semibold">
          <SuitText text={callLabel(verdict.call)} />
        </span>
        ; SAYC bids{" "}
        <span className="font-semibold">
          <SuitText text={callLabel(sayc.call)} />
        </span>
        {sayc.ruleName && (
          <span className="text-red-800">: {sayc.ruleName}</span>
        )}
        .
      </div>
      {hand && analysis !== undefined && (
        <HandReasons
          lines={missReasons(hand, verdict.call, sayc.call, analysis)}
        />
      )}
      {why && (
        <div className="text-xs bg-white/70 rounded p-2 text-gray-800 space-y-0.5">
          {sayc.constraints && (
            <div>
              <ConstraintsDisplay constraints={sayc.constraints} />
            </div>
          )}
          {sayc.description && (
            <div className="text-gray-600">{sayc.description}</div>
          )}
        </div>
      )}
      <div className="flex gap-3 text-xs">
        {(sayc.constraints || sayc.description) && (
          <button
            type="button"
            onClick={() => setWhy((prev) => !prev)}
            className="text-red-800 hover:underline"
            aria-expanded={why}
          >
            {why ? "Hide why" : "Why?"}
          </button>
        )}
        {onShowOptions && (
          <button
            type="button"
            onClick={onShowOptions}
            className="text-red-800 hover:underline"
          >
            All options here
          </button>
        )}
        {onDefer && (
          <button
            type="button"
            onClick={onDefer}
            className="ml-auto text-red-800/70 hover:underline"
          >
            Hide until the end
          </button>
        )}
      </div>
    </div>
  );
}
