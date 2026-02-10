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

export function BiddingBox({
  onBid,
  callHistory,
}: {
  onBid: (call: Call) => void;
  callHistory: CallHistory;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-3 space-y-2">
      {/* Pass button */}
      <button
        onClick={() => onBid({ type: "pass" })}
        className="w-full py-2 rounded bg-gray-200 hover:bg-gray-300 font-semibold text-gray-600 transition-colors"
      >
        Pass
      </button>

      {/* Bid grid: 7 levels × 5 strains */}
      <div className="grid grid-cols-5 gap-1">
        {LEVELS.map((level) =>
          STRAINS.map((strain) => {
            const call: Call = { type: "bid", level, strain };
            const legal = isCallLegal(call, callHistory);
            return (
              <button
                key={`${level}${strain}`}
                disabled={!legal}
                onClick={() => onBid(call)}
                className={`py-1.5 rounded text-sm font-semibold transition-colors ${
                  legal
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
    </div>
  );
}
