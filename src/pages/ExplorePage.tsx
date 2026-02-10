import { useState } from 'react';
import { NavBar } from '../components/NavBar';
import { CallTable } from '../components/CallTable';
import { CallMenu } from '../components/CallMenu';
import { type CallHistory, type CallInterpretation, MOCK_INTERPRETATIONS } from '../bridge';

export function ExplorePage() {
  const [history, setHistory] = useState<CallHistory>({ dealer: 'N', calls: [] });

  function handleSelect(interp: CallInterpretation) {
    setHistory(prev => ({
      ...prev,
      calls: [...prev.calls, interp.call],
    }));
  }

  function handleClear() {
    setHistory({ dealer: 'N', calls: [] });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar title="Bid Explorer" />
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full p-4 gap-4">
        <CallTable callHistory={history} />
        <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow">
          <CallMenu interpretations={MOCK_INTERPRETATIONS} onSelect={handleSelect} />
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
