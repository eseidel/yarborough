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

export function BiddingBox({
  onBid,
  callHistory,
}: {
  onBid: (call: Call) => void;
  callHistory: CallHistory;
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

  return (
    <div className="bg-white rounded-lg shadow p-3 space-y-2">
      {/* Pass / Double / Redouble row */}
      <div className="flex gap-1">
        {(() => {
          const dblLegal = isCallLegal({ type: "double" }, callHistory);
          return (
            <button
              disabled={!dblLegal}
              onClick={() => onBid({ type: "double" })}
              className={`flex-1 py-2 rounded font-semibold transition-colors ${dblLegal
                  ? "bg-red-100 hover:bg-red-200 text-red-700"
                  : "bg-gray-50 text-gray-300 cursor-not-allowed"
                }`}
            >
              X
            </button>
          );
        })()}
        <button
          onClick={() => onBid({ type: "pass" })}
          className="flex-1 py-2 rounded bg-gray-200 hover:bg-gray-300 font-semibold text-gray-600 transition-colors"
        >
          Pass
        </button>
        {(() => {
          const rdblLegal = isCallLegal({ type: "redouble" }, callHistory);
          return (
            <button
              disabled={!rdblLegal}
              onClick={() => onBid({ type: "redouble" })}
              className={`flex-1 py-2 rounded font-semibold transition-colors ${rdblLegal
                  ? "bg-blue-100 hover:bg-blue-200 text-blue-700"
                  : "bg-gray-50 text-gray-300 cursor-not-allowed"
                }`}
            >
              XX
            </button>
          );
        })()}
      </div>

      {/* Bid grid: visible levels × 5 strains */}
      <div className="grid grid-cols-5 gap-1">
        {visibleLevels.map((level) =>
          STRAINS.map((strain) => {
            const call: Call = { type: "bid", level, strain };
            const legal = isCallLegal(call, callHistory);
            return (
              <button
                key={`${level}${strain}`}
                disabled={!legal}
                onClick={() => onBid(call)}
                className={`py-1.5 rounded text-sm font-semibold transition-colors ${legal
                    ? "bg-gray-100 hover:bg-emerald-100"
                    : "bg-gray-50 text-gray-300 cursor-not-allowed"
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
          className="w-full text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
