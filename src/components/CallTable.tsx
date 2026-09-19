import { Fragment } from "react";
import {
  type Call,
  type CallHistory,
  type CallInterpretation,
  type Position,
  type Vulnerability,
  CALL_TABLE_ORDER,
  POSITION_NAMES,
} from "../bridge";
import { isAuctionComplete } from "../bridge/auction";
import { CallDisplay } from "./CallDisplay";
import { ConstraintsDisplay } from "./ConstraintsDisplay";
import { CARD, EYEBROW, LINK_SMALL } from "./ui";

function isVulnerable(pos: string, vulnerability: Vulnerability): boolean {
  if (vulnerability === "Both") return true;
  if (vulnerability === "None") return false;
  if (vulnerability === "NS") return pos === "N" || pos === "S";
  return pos === "E" || pos === "W";
}

export function CallTable({
  callHistory,
  vulnerability,
  userPosition,
  verdicts,
  thinking = false,
  onCallClick,
  selectedCallIndex,
  callExplanation,
  explanationLoading,
  onShowOptions,
}: {
  callHistory: CallHistory;
  vulnerability?: Vulnerability;
  /** The seat the user bids from; its column is labelled "you". */
  userPosition?: Position;
  /** Call index to whether it matched SAYC; shown as a tick or a cross. */
  verdicts?: Record<number, boolean>;
  /** The engine is bidding: the pending cell pulses. */
  thinking?: boolean;
  onCallClick?: (callIndex: number) => void;
  selectedCallIndex?: number | null;
  callExplanation?: CallInterpretation | null;
  explanationLoading?: boolean;
  /** Offered in the explanation: every call that was legal at that point. */
  onShowOptions?: (callIndex: number) => void;
}) {
  const { dealer, calls } = callHistory;
  const dealerIndex = CALL_TABLE_ORDER.indexOf(dealer);

  // Create a combined list of actual calls and the "?" marker if the auction is not complete.
  const displayCalls: (Call | null)[] = [...calls];
  const auctionDone = isAuctionComplete(callHistory);
  if (!auctionDone) {
    displayCalls.push(null);
  }

  // Determine which call index ends the row containing the selected call.
  // After that cell we insert the explanation as a full-width grid row.
  let insertAfterIndex: number | null = null;
  if (selectedCallIndex != null && selectedCallIndex < displayCalls.length) {
    const selectedGridPos = dealerIndex + selectedCallIndex;
    const selectedRow = Math.floor(selectedGridPos / 4);
    const lastGridPosOnRow = (selectedRow + 1) * 4 - 1;
    const lastCallIndexOnRow = lastGridPosOnRow - dealerIndex;
    insertAfterIndex = Math.min(lastCallIndexOnRow, displayCalls.length - 1);
  }

  const showExplanation =
    selectedCallIndex != null && (explanationLoading || callExplanation);

  return (
    <div className={`${CARD} p-3`} data-testid="call-table">
      <div className="grid grid-cols-4 gap-1 text-center">
        {CALL_TABLE_ORDER.map((pos) => {
          // Red is the table's own mark for vulnerable, as on a board.
          const vul = vulnerability && isVulnerable(pos, vulnerability);
          return (
            <div
              key={pos}
              className={`${EYEBROW} rounded py-1 leading-tight ${vul ? "bg-red-50 text-red-700" : ""}`}
            >
              {POSITION_NAMES[pos]}
              {pos === userPosition && (
                // On a line of its own: a seat's column is too narrow to
                // carry the name and the marker side by side.
                <div className="font-bold normal-case tracking-normal text-emerald-700">
                  you
                </div>
              )}
            </div>
          );
        })}
        {Array.from({ length: dealerIndex }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {displayCalls.map((call, i) => {
          const isSelected = selectedCallIndex === i;
          const clickable = onCallClick != null && call !== null;
          const verdict = verdicts?.[i];
          return (
            <Fragment key={i}>
              <div
                className={`relative rounded py-1.5 text-base ${clickable ? "cursor-pointer hover:bg-gray-100" : ""} ${isSelected ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200" : ""}`}
                onClick={clickable ? () => onCallClick(i) : undefined}
                role={clickable ? "button" : undefined}
                data-testid={call ? `call-${i}` : "pending-call"}
              >
                {call ? (
                  <CallDisplay call={call} />
                ) : (
                  <span
                    className={`text-gray-400 ${thinking ? "animate-pulse" : ""}`}
                  >
                    {thinking ? "…" : "?"}
                  </span>
                )}
                {verdict !== undefined && (
                  <span
                    className={`absolute top-0.5 right-1 text-xs font-bold leading-none ${verdict ? "text-emerald-600" : "text-red-600"}`}
                    aria-label={verdict ? "matched SAYC" : "differed from SAYC"}
                  >
                    {verdict ? "✓" : "✗"}
                  </span>
                )}
              </div>
              {i === insertAfterIndex && showExplanation && (
                <div
                  className="col-span-4 rounded-lg bg-gray-50 p-2 text-left text-sm"
                  data-testid="call-explanation"
                >
                  {explanationLoading ? (
                    <span className="text-gray-500">Loading...</span>
                  ) : (
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        {callExplanation?.ruleName ? (
                          <>
                            <div className="font-semibold text-gray-900">
                              {callExplanation.ruleName}
                            </div>
                            {callExplanation.constraints && (
                              <div className="mt-0.5 text-xs text-gray-700">
                                <ConstraintsDisplay
                                  constraints={callExplanation.constraints}
                                />
                              </div>
                            )}
                            {callExplanation.description && (
                              <div className="mt-0.5 text-xs text-gray-600">
                                {callExplanation.description}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-500">
                            SAYC has no rule for this call here
                          </span>
                        )}
                      </div>
                      {onShowOptions && selectedCallIndex != null && (
                        <button
                          type="button"
                          onClick={() => onShowOptions(selectedCallIndex)}
                          className={`${LINK_SMALL} mt-0.5 whitespace-nowrap`}
                        >
                          All options here
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
