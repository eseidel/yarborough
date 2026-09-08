import type { CallInterpretation } from "../bridge";
import { CallDisplay } from "./CallDisplay";
import { ConstraintsDisplay } from "./ConstraintsDisplay";

/**
 * Every legal call at a point in an auction with what SAYC would mean by it.
 * With `onSelect` each row is a button that makes the call; without it the
 * list is read-only.
 */
export function CallMenu({
  interpretations,
  onSelect,
}: {
  interpretations: CallInterpretation[];
  onSelect?: (interp: CallInterpretation) => void;
}) {
  return (
    <div className="divide-y divide-gray-200">
      {interpretations.map((interp, i) => {
        const content = (
          <>
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold shrink-0">
              <CallDisplay call={interp.call} />
            </div>
            <div className="min-w-0">
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
            </div>
          </>
        );
        const className = "flex items-center gap-4 w-full px-4 py-3 text-left";
        return onSelect ? (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(interp)}
            className={`${className} hover:bg-gray-50 transition-colors`}
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
