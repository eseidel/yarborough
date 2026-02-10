import { useState, useEffect } from "react";
import { NavBar } from "../components/NavBar";
import { CallTable } from "../components/CallTable";
import { CallMenu } from "../components/CallMenu";
import type { CallHistory, CallInterpretation, Call } from "../bridge";
import { getInterpretations } from "../bridge/engine";

function callToString(call: Call): string {
  if (call.type === "pass") return "Pass";
  if (call.type === "double") return "X";
  if (call.type === "redouble") return "XX";
  const strainMap = { C: "C", D: "D", H: "H", S: "S", N: "N" } as const;
  return `${call.level}${strainMap[call.strain!]}`;
}

export function ExplorePage() {
  const [history, setHistory] = useState<CallHistory>({
    dealer: "N",
    calls: [],
  });
  const [interpretations, setInterpretations] = useState<CallInterpretation[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const callsString = history.calls.map(callToString).join(",");
    getInterpretations(callsString, history.dealer).then((result) => {
      if (!cancelled) {
        setInterpretations(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [history]);

  function handleSelect(interp: CallInterpretation) {
    setLoading(true);
    setHistory((prev) => ({
      ...prev,
      calls: [...prev.calls, interp.call],
    }));
  }

  function handleClear() {
    setLoading(true);
    setHistory({ dealer: "N", calls: [] });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar title="Bid Explorer" />
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full p-4 gap-4">
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
