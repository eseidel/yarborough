import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { ErrorBar } from "../components/ErrorBar";
import { CallTable } from "../components/CallTable";
import { CallMenu } from "../components/CallMenu";
import type { CallHistory, CallInterpretation } from "../bridge";
import {
  vulnerabilityLabel,
  vulnerabilityFromBoardNumber,
  callToString,
  stringToCall,
} from "../bridge";
import { getInterpretations } from "../bridge/engine";
import { dealerFromBoardNumber } from "../bridge/identifier";

export function ExplorePage() {
  const { exploreId } = useParams<{ exploreId: string }>();
  const navigate = useNavigate();

  const [history, setHistory] = useState<CallHistory>(() => {
    if (!exploreId) return { dealer: "N", calls: [] };
    const parts = exploreId.split(":");
    const boardNum = parseInt(parts[0], 10) || 1;
    const callsStr = parts[1];
    const calls = callsStr ? callsStr.split(",").map(stringToCall) : [];
    return { dealer: dealerFromBoardNumber(boardNum), calls };
  });

  const boardNumber = parseInt(exploreId?.split(":")[0] || "1", 10) || 1;
  const vulnerability = vulnerabilityFromBoardNumber(boardNumber);

  const [interpretations, setInterpretations] = useState<CallInterpretation[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const callsString = history.calls.map(callToString).join(",");
    getInterpretations(callsString, history.dealer, vulnerability)
      .then((result) => {
        if (!cancelled) {
          setError(null);
          setInterpretations(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [history, vulnerability]);

  const handleSelect = useCallback(
    (interp: CallInterpretation) => {
      setLoading(true);
      const newCalls = [...history.calls, interp.call];
      const callsStr = newCalls.map(callToString).join(",");
      setHistory({ ...history, calls: newCalls });
      navigate(`/explore/${boardNumber}${callsStr ? `:${callsStr}` : ""}`, {
        replace: true,
      });
    },
    [history, boardNumber, navigate],
  );

  const handleClear = useCallback(() => {
    setLoading(true);
    setHistory({ dealer: "N", calls: [] });
    navigate("/explore/1", { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar />
      {error && <ErrorBar message={error} onDismiss={() => setError(null)} />}
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full p-4 gap-4">
        <div className="text-sm text-gray-500 font-medium text-center">
          {vulnerabilityLabel(vulnerability)}
        </div>
        <CallTable callHistory={history} />
        <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow">
          {loading ? (
            <div className="p-4 text-center text-gray-400">Loading...</div>
          ) : (
            <CallMenu
              interpretations={interpretations}
              onSelect={handleSelect}
            />
          )}
        </div>
        {history.calls.length > 0 && (
          <button
            onClick={handleClear}
            className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-700 text-white rounded-full shadow-lg hover:bg-emerald-600 transition-colors flex items-center justify-center text-2xl"
            aria-label="Clear history"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
}
