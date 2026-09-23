import type { Hand, HandAnalysis } from "../bridge/types";
import { callLabel } from "../bridge/types";
import { type CallVerdict, foundOnRetry } from "../practice/verdicts";
import { missReasons } from "../practice/hand-reasons";
import { HandReasons } from "./HandReasons";
import { SuitText } from "./SuitText";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "./ui";

/**
 * The verdict on the user's latest call, shown while the auction goes on.
 * A match needs no comment (the call table already ticks it); only a miss
 * gets a box, with what SAYC bids instead and why.
 *
 * Given the user's hand and the engine's analysis of it at this call, the
 * box says why in the hand's own numbers: what SAYC's call is chosen on, and
 * what the user's call misses or why SAYC ranked it lower.
 *
 * While the call is held out of the auction the box asks what next: try
 * again, or keep the call and let the table bid on. SAYC's call found on a
 * retry needs no box either; the call table marks it.
 */
export function CallFeedback({
  verdict,
  hand,
  analysis,
  onShowOptions,
  onDefer,
  onTryAgain,
  onKeep,
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
  /** The call is held: drop it and call again. */
  onTryAgain?: () => void;
  /** The call is held: make it after all. */
  onKeep?: () => void;
}) {
  const { sayc } = verdict;

  if (verdict.matched || foundOnRetry(verdict)) {
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
      {(onTryAgain || onKeep) && (
        <div className="flex gap-2 pt-1">
          {onTryAgain && (
            <button
              type="button"
              onClick={onTryAgain}
              className={`${PRIMARY_BUTTON} flex-1`}
            >
              Try again
            </button>
          )}
          {onKeep && (
            <button
              type="button"
              onClick={onKeep}
              className={`${SECONDARY_BUTTON} flex-1`}
            >
              Keep <SuitText text={callLabel(verdict.call)} />
            </button>
          )}
        </div>
      )}
      <div className="flex gap-3 text-xs">
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
