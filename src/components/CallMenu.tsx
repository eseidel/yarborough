import { useMemo } from "react";
import type { CallInterpretation, HandAnalysis } from "../bridge";
import { callToString } from "../bridge";
import { callsByName, unfitSummary } from "../bridge/hand-analysis";
import { CallDisplay } from "./CallDisplay";
import { ConstraintsDisplay } from "./ConstraintsDisplay";
import { SuitText } from "./SuitText";

/** The small label that says how a call stands with the hand. */
const BADGE =
  "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold";

/**
 * Every legal call at a point in an auction with what SAYC would mean by it.
 * With `onSelect` each row is a button that makes the call; without it the
 * list is read-only.
 *
 * Given an `analysis`, every row also says how the call stands with the hand
 * the seat entered: the one SAYC makes, the ones that fit but say less, and
 * the ones the hand cannot make, each with the requirement it misses. That
 * is the whole point of entering a hand, so it belongs on the calls
 * themselves rather than in a panel beside them.
 */
export function CallMenu({
  interpretations,
  analysis,
  onSelect,
}: {
  interpretations: CallInterpretation[];
  /** Absent until the seat to call asks; then the rows are annotated. */
  analysis?: HandAnalysis | null;
  onSelect?: (interp: CallInterpretation) => void;
}) {
  const weighed = useMemo(() => callsByName(analysis), [analysis]);

  return (
    <div className="divide-y divide-gray-200">
      {interpretations.map((interp, i) => {
        const fitted = weighed.get(callToString(interp.call));
        const chosen = fitted?.fit === "chosen";
        const unfit = fitted?.fit === "unfit";
        const content = (
          <>
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                chosen ? "bg-emerald-700 text-white" : "bg-gray-200"
              }`}
            >
              <CallDisplay call={interp.call} />
            </div>
            <div className="min-w-0 flex-1">
              {interp.ruleName && (
                <div className="font-semibold text-sm">{interp.ruleName}</div>
              )}
              {interp.constraints && (
                <div className="text-sm text-gray-700">
                  <ConstraintsDisplay constraints={interp.constraints} />
                </div>
              )}
              {interp.description && (
                <div className="text-sm text-gray-500">
                  {interp.description}
                </div>
              )}
              {!interp.ruleName &&
                !interp.constraints &&
                !interp.description && (
                  <div className="text-sm text-gray-400">
                    Not a SAYC call here
                  </div>
                )}
              {unfit && fitted.unfitReason && (
                <div
                  className="text-sm font-medium text-amber-700"
                  data-testid={`unfit-${callToString(interp.call)}`}
                >
                  <SuitText text={unfitSummary(fitted.unfitReason)} />
                </div>
              )}
            </div>
            {chosen && (
              <span className={`${BADGE} bg-emerald-700 text-white`}>
                SAYC bids this
              </span>
            )}
            {fitted?.fit === "possible" && (
              <span className={`${BADGE} bg-gray-100 text-gray-600`}>
                Also fits
              </span>
            )}
          </>
        );
        // A call the hand cannot make is still a call it may make here, so
        // the row stays live; it is only quieter than the ones that fit.
        const className = `flex items-center gap-3 w-full px-4 py-3 text-left ${
          chosen ? "bg-emerald-50" : unfit ? "opacity-60" : ""
        }`;
        return onSelect ? (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(interp)}
            className={`${className} transition-colors ${
              chosen ? "hover:bg-emerald-100" : "hover:bg-gray-50"
            }`}
          >
            {content}
          </button>
        ) : (
          <div key={i} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
