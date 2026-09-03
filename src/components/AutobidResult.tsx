import { useCallback, useState } from "react";
import type {
  CallHistory,
  CallInterpretation,
  Vulnerability,
} from "../bridge/types";
import { callToString, findCallInterpretation } from "../bridge/types";
import { formatContractAndDeclarer } from "../bridge/auction";
import { getCallInterpretations } from "../bridge/engine";
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
  const [selectedCallIndex, setSelectedCallIndex] = useState<number | null>(
    null,
  );
  const [callExplanation, setCallExplanation] =
    useState<CallInterpretation | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);

  const handleCallClick = useCallback(
    (callIndex: number) => {
      if (!autobidHistory) return;
      if (selectedCallIndex === callIndex) {
        setSelectedCallIndex(null);
        setCallExplanation(null);
        return;
      }
      setSelectedCallIndex(callIndex);
      setCallExplanation(null);
      setExplanationLoading(true);
      const callsBefore = autobidHistory.calls.slice(0, callIndex);
      const callsStr = callsBefore.map(callToString).join(",");
      const clickedCall = autobidHistory.calls[callIndex];
      getCallInterpretations(
        callsStr,
        autobidHistory.dealer,
        vulnerability ?? "None",
      )
        .then((interps) => {
          setCallExplanation(findCallInterpretation(interps, clickedCall));
          setExplanationLoading(false);
        })
        .catch(() => {
          setExplanationLoading(false);
        });
    },
    [autobidHistory, selectedCallIndex, vulnerability],
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
            onCallClick={handleCallClick}
            selectedCallIndex={selectedCallIndex}
            callExplanation={callExplanation}
            explanationLoading={explanationLoading}
            exploreLink={
              selectedCallIndex !== null && boardNumber !== undefined
                ? `/explore/${boardNumber}${
                    selectedCallIndex > 0
                      ? ":" +
                        autobidHistory.calls
                          .slice(0, selectedCallIndex)
                          .map(callToString)
                          .join(",")
                      : ""
                  }`
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
