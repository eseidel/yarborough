import { useState } from "react";
import {
  type Call,
  type CallHistory,
  type StrainName,
  strainSymbol,
  strainColor,
} from "../bridge";
import { isCallLegal } from "../bridge/auction";

const STRAINS: StrainName[] = ["C", "D", "H", "S", "N"];
const LEVELS = [1, 2, 3, 4, 5, 6, 7];
const MAX_VISIBLE_ROWS = 4;

/**
 * The bidding box. Illegal calls are dimmed; `disabled` dims everything
 * while the engine is bidding for the other seats, so the box keeps its
 * place on the page instead of disappearing.
 */
export function BiddingBox({
  onBid,
  callHistory,
  disabled = false,
}: {
  onBid: (call: Call) => void;
  callHistory: CallHistory;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  // Find levels that have at least one legal bid.
  const levelsWithLegal = LEVELS.filter((level) =>
    STRAINS.some((strain) =>
      isCallLegal({ type: "bid", level, strain }, callHistory),
    ),
  );

  const needsCollapse = levelsWithLegal.length > MAX_VISIBLE_ROWS;
  const visibleLevels =
    needsCollapse && !expanded
      ? levelsWithLegal.slice(0, MAX_VISIBLE_ROWS)
      : levelsWithLegal;

  const rdblLegal = !disabled && isCallLegal({ type: "redouble" }, callHistory);
  const dblLegal = !disabled && isCallLegal({ type: "double" }, callHistory);
  const passLegal = !disabled && isCallLegal({ type: "pass" }, callHistory);
  const idle = "bg-gray-50 text-gray-300 cursor-not-allowed";

  return (
    <div
      className={`bg-white rounded-lg shadow p-3 space-y-2 ${disabled ? "opacity-60" : ""}`}
      data-testid="bidding-box"
      aria-disabled={disabled}
    >
      {/* Pass / Double / Redouble row */}
      <div className="flex gap-1">
        <button
          disabled={!rdblLegal}
          onClick={() => onBid({ type: "redouble" })}
          className={`flex-1 py-2.5 rounded font-semibold transition-colors ${
            rdblLegal ? "bg-blue-100 hover:bg-blue-200 text-blue-700" : idle
          }`}
        >
          XX
        </button>
        <button
          disabled={!passLegal}
          onClick={() => onBid({ type: "pass" })}
          className={`flex-1 py-2.5 rounded font-semibold transition-colors ${
            passLegal ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : idle
          }`}
        >
          Pass
        </button>
        <button
          disabled={!dblLegal}
          onClick={() => onBid({ type: "double" })}
          className={`flex-1 py-2.5 rounded font-semibold transition-colors ${
            dblLegal ? "bg-red-100 hover:bg-red-200 text-red-700" : idle
          }`}
        >
          X
        </button>
      </div>

      {/* Bid grid: visible levels × 5 strains */}
      <div className="grid grid-cols-5 gap-1">
        {visibleLevels.map((level) =>
          STRAINS.map((strain) => {
            const call: Call = { type: "bid", level, strain };
            const legal = !disabled && isCallLegal(call, callHistory);
            return (
              <button
                key={`${level}${strain}`}
                disabled={!legal}
                onClick={() => onBid(call)}
                className={`py-2.5 rounded text-base font-semibold transition-colors ${
                  legal ? "bg-gray-100 hover:bg-emerald-100" : idle
                }`}
              >
                {level}
                <span className={legal ? strainColor(strain) : ""}>
                  {strainSymbol(strain)}
                </span>
              </button>
            );
          }),
        )}
      </div>

      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          {expanded ? "Show fewer levels" : "Show all levels"}
        </button>
      )}
    </div>
  );
}
