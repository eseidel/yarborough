import type {
  Call,
  CallInterpretation,
  Hand,
  HandAnalysis,
} from "../bridge/types";
import { callLabel } from "../bridge/types";
import { saycBidReasons } from "../practice/hand-reasons";
import { ConstraintsDisplay } from "./ConstraintsDisplay";
import { HandReasons } from "./HandReasons";
import { SuitText } from "./SuitText";

/**
 * The engine's call for the position, shown on request, with one tap to make
 * it. `null` while the engine is still working it out.
 *
 * The learner asked for the answer, so given their hand and the engine's
 * analysis of it the hint explains all of it: the numbers SAYC's call is
 * chosen on, and why SAYC ranks each other call the hand could make lower.
 */
export function SaycHint({
  suggestion,
  hand,
  analysis,
  onBid,
}: {
  suggestion: CallInterpretation | null;
  /** The user's hand. */
  hand?: Hand;
  /** The hand weighed at this call: undefined while the engine works. */
  analysis?: HandAnalysis | null;
  onBid: (call: Call) => void;
}) {
  if (!suggestion) {
    return (
      <div
        className="animate-rise rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        data-testid="sayc-hint-loading"
      >
        <span className="animate-pulse">Working out the SAYC bid…</span>
      </div>
    );
  }
  return (
    <div
      // In place of the wait, when there was one.
      className="animate-fade bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm"
      data-testid="sayc-hint"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-amber-900">
            SAYC bids{" "}
            <span className="text-base">
              <SuitText text={callLabel(suggestion.call)} />
            </span>
            {suggestion.ruleName && (
              <span className="font-normal">: {suggestion.ruleName}</span>
            )}
          </div>
          {suggestion.constraints && (
            <div className="text-amber-800 text-xs mt-0.5">
              <ConstraintsDisplay constraints={suggestion.constraints} />
            </div>
          )}
          {suggestion.description && (
            <div className="text-amber-700 text-xs mt-0.5">
              {suggestion.description}
            </div>
          )}
          {hand && analysis !== undefined && (
            <HandReasons
              lines={saycBidReasons(hand, suggestion.call, analysis)}
              className="mt-1.5 text-xs text-amber-900"
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => onBid(suggestion.call)}
          className="shrink-0 px-3 py-2 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition-colors"
        >
          Bid <SuitText text={callLabel(suggestion.call)} />
        </button>
      </div>
      <div className="text-xs text-amber-700/80 mt-1.5">
        This call will not count towards your accuracy.
      </div>
    </div>
  );
}
