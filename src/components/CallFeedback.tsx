import { useState } from "react";
import { callLabel } from "../bridge/types";
import type { CallVerdict } from "../practice/verdicts";
import { ConstraintsDisplay } from "./ConstraintsDisplay";
import { SuitText } from "./SuitText";

/**
 * The verdict on the user's latest call, shown while the auction goes on:
 * a match in one line, a miss with what SAYC bids instead and why.
 */
export function CallFeedback({
  verdict,
  onShowOptions,
  onDefer,
}: {
  verdict: CallVerdict;
  /** Open every legal call at the point of this call. */
  onShowOptions?: () => void;
  /** Switch to feedback at the end of the hand instead. */
  onDefer?: () => void;
}) {
  const [why, setWhy] = useState(false);
  const { sayc } = verdict;

  if (verdict.matched) {
    return (
      <div
        className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        data-testid="call-feedback-match"
      >
        <span>
          <span className="font-bold">✓</span>{" "}
          <span className="font-semibold">
            <SuitText text={callLabel(verdict.call)} />
          </span>{" "}
          is the SAYC bid
          {sayc.ruleName && (
            <span className="text-emerald-700">: {sayc.ruleName}</span>
          )}
          {verdict.assisted && (
            <span className="text-emerald-700/80"> (shown first)</span>
          )}
        </span>
        {onDefer && (
          <button
            type="button"
            onClick={onDefer}
            className="text-xs text-emerald-700/80 hover:underline whitespace-nowrap"
          >
            Hide until the end
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 space-y-1"
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
