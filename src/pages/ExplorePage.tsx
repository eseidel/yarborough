import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { ErrorBar } from "../components/ErrorBar";
import { CallTable } from "../components/CallTable";
import { CallMenu } from "../components/CallMenu";
import type {
  CallHistory,
  CallInterpretation,
  Vulnerability,
  Position,
} from "../bridge";
import { vulnerabilityLabel } from "../bridge";
import { getInterpretations } from "../bridge/engine";
import { callToString, stringToCall } from "../bridge/auction";

export function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [vulnerability] = useState<Vulnerability>("None");
  const [history, setHistory] = useState<CallHistory>(() => {
    const dealer = (searchParams.get("dealer") as Position) || "N";
    const callsStr = searchParams.get("calls");
    const calls = callsStr ? callsStr.split(",").map(stringToCall) : [];
    return { dealer, calls };
  });
  const [interpretations, setInterpretations] = useState<CallInterpretation[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const callsString = history.calls.map(callToString).join(",");
    getInterpretations(callsString, history.dealer)
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

    // Update URL
    const params: Record<string, string> = { dealer: history.dealer };
    if (history.calls.length > 0) {
      params.calls = history.calls.map(callToString).join(",");
    }
    setSearchParams(params, { replace: true });

    return () => {
      cancelled = true;
    };
  }, [history, setSearchParams]);

  const handleSelect = useCallback((interp: CallInterpretation) => {
    setLoading(true);
    setHistory((prev) => ({
      ...prev,
      calls: [...prev.calls, interp.call],
    }));
  }, []);

  const handleClear = useCallback(() => {
    setLoading(true);
    setHistory({ dealer: "N", calls: [] });
  }, []);

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
