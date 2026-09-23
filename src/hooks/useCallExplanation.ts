import { useCallback, useState } from "react";
import type {
  CallHistory,
  CallInterpretation,
  Hand,
  Position,
} from "../bridge/types";
import { callToString, findCallInterpretation } from "../bridge/types";
import { getCallInterpretations } from "../bridge/engine";
import { seatForCall } from "../practice/verdicts";
import { yourCallReasons } from "../practice/hand-reasons";
import { useHandAnalysis } from "../practice/useHandAnalysis";

/** The user's own seat and hand, to explain their calls against. */
export interface YourHand {
  seat: Position;
  hand: Hand;
}

/**
 * Drives the click-to-explain interaction on a `CallTable`: clicking a call
 * fetches z3b's interpretation of it and tracks which call is selected, so
 * the table can show the explanation inline. Shared by the live auction view
 * and the engine's own auction in the review, which both embed a `CallTable`
 * and need the same behavior.
 *
 * Given the user's seat and hand, a call of that seat is also weighed against
 * the hand (`handReasons`). Another seat's call never is: its explanation is
 * the rule it follows, whatever cards are behind it.
 */
export function useCallExplanation(
  history: CallHistory | null,
  vulnerability: string = "None",
  onError?: (error: unknown) => void,
  yourHand?: YourHand,
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

  const yours =
    history &&
    yourHand &&
    selectedCallIndex !== null &&
    selectedCallIndex < history.calls.length &&
    seatForCall(history, selectedCallIndex) === yourHand.seat
      ? { history, index: selectedCallIndex }
      : null;
  const analysis = useHandAnalysis(
    yours && yourHand ? { hand: yourHand.hand, ...yours, vulnerability } : null,
  );
  const handReasons =
    yours && yourHand && analysis !== undefined
      ? yourCallReasons(
          yourHand.hand,
          yours.history.calls[yours.index],
          analysis,
        )
      : [];

  return {
    selectedCallIndex,
    callExplanation,
    explanationLoading,
    /** What the user's hand says about the selected call, if it is theirs. */
    handReasons,
    handleCallClick,
    reset,
  };
}
