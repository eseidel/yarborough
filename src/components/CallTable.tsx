import { type CallHistory, CALL_TABLE_ORDER, POSITION_NAMES } from "../bridge";
import { CallDisplay } from "./CallDisplay";

function isAuctionComplete(history: CallHistory): boolean {
  const { calls } = history;
  if (calls.length < 4) return false;
  return calls.slice(-3).every((c) => c.type === "pass");
}

export function CallTable({ callHistory }: { callHistory: CallHistory }) {
  const { dealer, calls } = callHistory;
  const dealerIndex = CALL_TABLE_ORDER.indexOf(dealer);

  return (
    <div className="bg-gray-100 rounded-lg p-4">
      <div className="grid grid-cols-4 gap-1 text-center">
        {CALL_TABLE_ORDER.map((pos) => (
          <div key={pos} className="font-bold text-sm text-gray-600 py-1">
            {POSITION_NAMES[pos]}
          </div>
        ))}
        {Array.from({ length: dealerIndex }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {calls.map((call, i) => (
          <div key={i} className="py-1">
            <CallDisplay call={call} />
          </div>
        ))}
        {!isAuctionComplete(callHistory) && (
          <div className="py-1 text-gray-400">?</div>
        )}
      </div>
    </div>
  );
}
