import { useState, useCallback } from 'react';
import { NavBar } from '../components/NavBar';
import { HandDisplay } from '../components/HandDisplay';
import { CallTable } from '../components/CallTable';
import { BiddingBox } from '../components/BiddingBox';
import {
  type Deal,
  type Call,
  type CallHistory,
  type Position,
  randomDeal,
  handForPosition,
  highCardPoints,
} from '../bridge';

const POSITION_ORDER: Position[] = ['N', 'E', 'S', 'W'];

function currentPlayer(history: CallHistory): Position {
  const dealerIdx = POSITION_ORDER.indexOf(history.dealer);
  return POSITION_ORDER[(dealerIdx + history.calls.length) % 4];
}

function isAuctionComplete(history: CallHistory): boolean {
  const { calls } = history;
  if (calls.length < 4) return false;
  return calls.slice(-3).every(c => c.type === 'pass');
}

/** Find the last actual bid (not pass/double/redouble) in the call history. */
function lastBidCall(history: CallHistory): Call | undefined {
  return [...history.calls].reverse().find(c => c.type === 'bid');
}

/** Add robot passes until it's South's turn or the auction completes. */
function addRobotPasses(history: CallHistory): CallHistory {
  let h = history;
  while (!isAuctionComplete(h) && currentPlayer(h) !== 'S') {
    h = { ...h, calls: [...h.calls, { type: 'pass' as const }] };
  }
  return h;
}

export function PracticePage() {
  const [deal, setDeal] = useState<Deal>(() => randomDeal());
  const [history, setHistory] = useState<CallHistory>(() =>
    addRobotPasses({ dealer: 'N', calls: [] }),
  );

  const auctionDone = isAuctionComplete(history);
  const southHand = handForPosition(deal, 'S');
  const hcp = highCardPoints(southHand);

  const handleBid = useCallback((call: Call) => {
    setHistory(prev => {
      const afterUser = { ...prev, calls: [...prev.calls, call] };
      return addRobotPasses(afterUser);
    });
  }, []);

  const handleRedeal = useCallback(() => {
    setDeal(randomDeal());
    setHistory(addRobotPasses({ dealer: 'N', calls: [] }));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar title="Practice Bidding" />
      <div className="flex-1 flex flex-col max-w-md mx-auto w-full p-4 gap-4">
        {/* User's hand */}
        <div className="flex flex-col items-center gap-1">
          <HandDisplay hand={southHand} position="S" />
          <div className="text-sm text-gray-500 font-medium">{hcp} HCP</div>
        </div>

        {/* Auction table */}
        <CallTable callHistory={history} />

        {/* Bidding box or results */}
        {auctionDone ? (
          <div className="space-y-3">
            <div className="text-center text-sm font-semibold text-gray-600">
              Auction Complete
            </div>
            <div className="grid grid-cols-3 gap-2 justify-items-center">
              <HandDisplay hand={handForPosition(deal, 'W')} position="W" />
              <HandDisplay hand={handForPosition(deal, 'N')} position="N" />
              <HandDisplay hand={handForPosition(deal, 'E')} position="E" />
            </div>
          </div>
        ) : (
          <BiddingBox onBid={handleBid} lastBid={lastBidCall(history)} />
        )}
      </div>

      {/* Re-deal button */}
      <button
        onClick={handleRedeal}
        className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-700 text-white rounded-full shadow-lg hover:bg-emerald-600 transition-colors flex items-center justify-center text-xl"
        aria-label="Deal new hand"
      >
        &#x21bb;
      </button>
    </div>
  );
}
