import { useState } from "react";
import type { CallHistory, Vulnerability } from "../bridge/types";
import { callToString } from "../bridge/types";
import { formatContractAndDeclarer } from "../bridge/auction";
import { useCallExplanation } from "../hooks/useCallExplanation";
import { CallTable } from "./CallTable";

export function AutobidResult({
  userHistory,
  autobidHistory,
  loading = false,
  vulnerability,
  boardNumber,
}: {
  userHistory: CallHistory;
  autobidHistory: CallHistory | null;
  loading?: boolean;
  vulnerability?: Vulnerability;
  boardNumber?: number;
}) {
  const [showTable, setShowTable] = useState(false);
  const explanation = useCallExplanation(
    autobidHistory,
    vulnerability,
    boardNumber,
  );

  if (loading || !autobidHistory) {
    return null;
  }

  const userCallsStr = userHistory.calls.map(callToString).join(",");
  const autobidCallsStr = autobidHistory.calls.map(callToString).join(",");
  const matched = userCallsStr === autobidCallsStr;

  if (matched) {
    return (
      <div
        className="text-center font-semibold text-emerald-700 text-sm py-1"
        data-testid="autobid-result-match"
      >
        ✓ matches autobidder
      </div>
    );
  }

  const resultText = formatContractAndDeclarer(autobidHistory);

  return (
    <div
      className="flex flex-col items-center text-sm py-1"
      data-testid="autobid-result-differ"
    >
      <div className="flex items-center gap-1.5 text-gray-700">
        <span>Autobidder:</span>
        <button
          type="button"
          onClick={() => setShowTable((prev) => !prev)}
          className="text-blue-600 hover:underline font-semibold cursor-pointer"
          data-testid="autobid-table-toggle"
        >
          {resultText || "View auction"}
        </button>
      </div>
      {showTable && (
        <div className="w-full mt-3" data-testid="autobid-call-table">
          <CallTable
            callHistory={autobidHistory}
            vulnerability={vulnerability}
            onCallClick={explanation.handleCallClick}
            selectedCallIndex={explanation.selectedCallIndex}
            callExplanation={explanation.callExplanation}
            explanationLoading={explanation.explanationLoading}
            exploreLink={explanation.exploreLink}
          />
        </div>
      )}
    </div>
  );
}
