import { Fragment, type ReactNode, useState } from "react";
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
import { HandReasons } from "./HandReasons";
import { CARD, EYEBROW, LINK_SMALL } from "./ui";

function isVulnerable(pos: string, vulnerability: Vulnerability): boolean {
  if (vulnerability === "Both") return true;
  if (vulnerability === "None") return false;
  if (vulnerability === "NS") return pos === "N" || pos === "S";
  return pos === "E" || pos === "W";
}

/** Between one call landing in the auction and the next, when several land at once. */
export const CALL_STAGGER_MS = 90;

/**
 * Where the calls that have just arrived start: the calls from this index on
 * land one after another. The calls on the table when it first shows are
 * already there, and a call taken back lands nothing, so it is the length of
 * the auction until the auction grows.
 */
function useFirstArrival(length: number): number {
  const [seen, setSeen] = useState({ length, firstArrival: length });
  if (seen.length !== length) {
    const next = {
      length,
      firstArrival: length > seen.length ? seen.length : length,
    };
    setSeen(next);
    return next.firstArrival;
  }
  return seen.firstArrival;
}

/** How a verdict looks on the call it judges. */
const VERDICT_MARKS: Record<
  string,
  { mark: string; label: string; className: string }
> = {
  true: { mark: "✓", label: "matched SAYC", className: "text-emerald-600" },
  false: { mark: "✗", label: "differed from SAYC", className: "text-red-600" },
  // Amber, the palette's color for help taken: SAYC's call, on a second try.
  retried: {
    mark: "↺",
    label: "matched SAYC on a retry",
    className: "text-amber-600",
  },
};

export function CallTable({
  callHistory,
  vulnerability,
  userPosition,
  verdicts,
  held = false,
  thinking = false,
  onCallClick,
  selectedCallIndex,
  callExplanation,
  explanationLoading,
  onShowOptions,
  onPendingClick,
  handReasons,
  header,
}: {
  callHistory: CallHistory;
  vulnerability?: Vulnerability;
  /** The seat the user bids from; its column is labelled "you". */
  userPosition?: Position;
  /**
   * Call index to whether it matched SAYC, shown as a tick or a cross, or
   * "retried" for SAYC's call found after taking back another.
   */
  verdicts?: Record<number, boolean | "retried">;
  /**
   * The last call is the user's, held while they look at why it differs
   * from SAYC: outlined as not yet made, and nobody is to call after it.
   */
  held?: boolean;
  /** The engine is bidding: the pending cell pulses. */
  thinking?: boolean;
  onCallClick?: (callIndex: number) => void;
  selectedCallIndex?: number | null;
  callExplanation?: CallInterpretation | null;
  explanationLoading?: boolean;
  /** Offered in the explanation: every call that was legal at that point. */
  onShowOptions?: (callIndex: number) => void;
  /** The "?" for the next call is tappable: the options at that point. */
  onPendingClick?: () => void;
  /** What the user's own hand says about the selected call, when it is theirs. */
  handReasons?: string[];
  /** Sits above the seats, inside the same panel: what board this is. */
  header?: ReactNode;
}) {
  const { dealer, calls } = callHistory;
  const dealerIndex = CALL_TABLE_ORDER.indexOf(dealer);

  // Create a combined list of actual calls and the "?" marker if the auction is not complete.
  const displayCalls: (Call | null)[] = [...calls];
  const auctionDone = isAuctionComplete(callHistory);
  if (!auctionDone && !held) {
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

  const firstArrival = useFirstArrival(calls.length);

  const showExplanation =
    selectedCallIndex != null && (explanationLoading || callExplanation);

  return (
    <div className={CARD} data-testid="call-table">
      {header}
      <div className="grid grid-cols-4 gap-1 p-3 text-center">
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
          const isHeld = held && i === calls.length - 1;
          const onClick =
            call === null
              ? thinking
                ? undefined
                : onPendingClick
              : isHeld || onCallClick == null
                ? undefined
                : () => onCallClick(i);
          const clickable = onClick != null;
          const verdict = verdicts?.[i];
          // The calls just made land in turn, and the next seat's marker
          // after them.
          const arriving =
            firstArrival < calls.length && i >= firstArrival
              ? call
                ? "animate-pop"
                : "animate-fade"
              : "";
          return (
            <Fragment key={i}>
              <div
                className={`relative rounded py-1.5 text-base transition-colors ${arriving} ${clickable ? "cursor-pointer hover:bg-gray-100" : ""} ${isSelected ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200" : ""} ${isHeld ? "bg-red-50/60 text-gray-500 outline-dashed outline-1 -outline-offset-2 outline-red-300" : ""}`}
                onClick={onClick}
                role={clickable ? "button" : undefined}
                aria-label={
                  clickable && call === null
                    ? "Options for your call"
                    : undefined
                }
                data-testid={call ? `call-${i}` : "pending-call"}
                data-held={isHeld || undefined}
                style={
                  arriving
                    ? {
                        animationDelay: `${(i - firstArrival) * CALL_STAGGER_MS}ms`,
                      }
                    : undefined
                }
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
                    className={`animate-pop absolute top-0.5 right-1 text-xs font-bold leading-none ${VERDICT_MARKS[String(verdict)].className}`}
                    aria-label={VERDICT_MARKS[String(verdict)].label}
                  >
                    {VERDICT_MARKS[String(verdict)].mark}
                  </span>
                )}
              </div>
              {i === insertAfterIndex && showExplanation && (
                <div
                  className="animate-rise col-span-4 rounded-lg bg-gray-50 p-2 text-left text-sm"
                  data-testid="call-explanation"
                >
                  {explanationLoading ? (
                    <span className="animate-fade-late block text-gray-500">
                      Loading...
                    </span>
                  ) : (
                    <div className="animate-fade flex justify-between items-start gap-2">
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
                        {handReasons && (
                          <HandReasons
                            lines={handReasons}
                            className="mt-1 text-xs text-gray-800"
                          />
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
