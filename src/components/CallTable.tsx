import {
  type CallHistory,
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
}: {
  callHistory: CallHistory;
  vulnerability?: Vulnerability;
}) {
  const { dealer, calls } = callHistory;
  const dealerIndex = CALL_TABLE_ORDER.indexOf(dealer);

  return (
    <div className="bg-gray-100 rounded-lg p-4">
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
