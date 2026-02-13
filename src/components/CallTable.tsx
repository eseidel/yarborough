import { Fragment } from "react";
import {
  type Call,
  type CallHistory,
  type CallInterpretation,
  type Vulnerability,
  CALL_TABLE_ORDER,
  POSITION_NAMES,
} from "../bridge";
import { isAuctionComplete } from "../bridge/auction";
import { CallDisplay } from "./CallDisplay";

function isVulnerable(pos: string, vulnerability: Vulnerability): boolean {
  if (vulnerability === "Both") return true;
  if (vulnerability === "None") return false;
  if (vulnerability === "NS") return pos === "N" || pos === "S";
  return pos === "E" || pos === "W";
}

export function CallTable({
  callHistory,
  vulnerability,
  onCallClick,
  selectedCallIndex,
  callExplanation,
  explanationLoading,
}: {
  callHistory: CallHistory;
  vulnerability?: Vulnerability;
  onCallClick?: (callIndex: number) => void;
  selectedCallIndex?: number | null;
  callExplanation?: CallInterpretation | null;
  explanationLoading?: boolean;
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
    <div className="bg-gray-100 rounded-lg p-4" data-testid="call-table">
      <div className="grid grid-cols-4 gap-1 text-center">
        {CALL_TABLE_ORDER.map((pos) => {
          const vul = vulnerability && isVulnerable(pos, vulnerability);
          return (
            <div
              key={pos}
              className={`font-bold text-sm py-1 rounded ${vul ? "bg-red-100 text-red-700" : "text-gray-600"}`}
            >
              {POSITION_NAMES[pos]}
            </div>
          );
        })}
        {Array.from({ length: dealerIndex }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {displayCalls.map((call, i) => {
          const isSelected = selectedCallIndex === i;
          const clickable = onCallClick != null && call !== null;
          return (
            <Fragment key={i}>
              <div
                className={`py-1 ${clickable ? "cursor-pointer hover:bg-amber-100 rounded" : ""} ${isSelected ? "bg-amber-200 rounded" : ""}`}
                onClick={clickable ? () => onCallClick(i) : undefined}
              >
                {call ? (
                  <CallDisplay call={call} />
                ) : (
                  <span className="text-gray-400">?</span>
                )}
              </div>
              {i === insertAfterIndex && showExplanation && (
                <div
                  className="col-span-4 bg-blue-50 rounded p-2 text-left text-sm"
                  data-testid="call-explanation"
                >
                  {explanationLoading ? (
                    <span className="text-blue-600">Loading...</span>
                  ) : callExplanation?.ruleName ? (
                    <>
                      <span className="font-semibold text-blue-900">
                        {callExplanation.ruleName}
                      </span>
                      {callExplanation.description && (
                        <span className="text-blue-700 text-xs ml-1">
                          {callExplanation.description}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-blue-600">
                      No interpretation available
                    </span>
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
