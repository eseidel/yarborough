import { useCallback, useState } from "react";
import type { CallHistory, CallInterpretation } from "../bridge/types";
import { callToString, findCallInterpretation } from "../bridge/types";
import { explorePath } from "../bridge/identifier";
import { getCallInterpretations } from "../bridge/engine";

/**
 * Drives the click-to-explain interaction on a `CallTable`: clicking a call
 * fetches z3b's interpretation of it and tracks which call is selected, so
 * the table can show the explanation and an Explore link inline. Shared by
 * the live auction view and the autobidder's auction view, which both embed
 * a `CallTable` and need the same behavior.
 */
export function useCallExplanation(
  history: CallHistory | null,
  vulnerability: string = "None",
  boardNumber?: number,
  onError?: (error: unknown) => void,
) {
  const [selectedCallIndex, setSelectedCallIndex] = useState<number | null>(
    null,
  );
  const [callExplanation, setCallExplanation] =
    useState<CallInterpretation | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);

  const reset = useCallback(() => {
    setSelectedCallIndex(null);
    setCallExplanation(null);
  }, []);

  const handleCallClick = useCallback(
    (callIndex: number) => {
      if (!history) return;
      if (selectedCallIndex === callIndex) {
        reset();
        return;
      }
      setSelectedCallIndex(callIndex);
      setCallExplanation(null);
      setExplanationLoading(true);
      const callsBefore = history.calls.slice(0, callIndex);
      const clickedCall = history.calls[callIndex];
      getCallInterpretations(
        callsBefore.map(callToString).join(","),
        history.dealer,
        vulnerability,
      )
        .then((interpretations) => {
          setCallExplanation(
            findCallInterpretation(interpretations, clickedCall),
          );
          setExplanationLoading(false);
        })
        .catch((error: unknown) => {
          setExplanationLoading(false);
          onError?.(error);
        });
    },
    [history, selectedCallIndex, vulnerability, reset, onError],
  );

  const exploreLink =
    selectedCallIndex != null && boardNumber !== undefined && history
      ? explorePath(boardNumber, history.calls.slice(0, selectedCallIndex))
      : undefined;

  return {
    selectedCallIndex,
    callExplanation,
    explanationLoading,
    exploreLink,
    handleCallClick,
    reset,
  };
}
