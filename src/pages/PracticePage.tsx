import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { ErrorBar } from "../components/ErrorBar";
import { HandDisplay } from "../components/HandDisplay";
import { CallTable } from "../components/CallTable";
import { BiddingBox } from "../components/BiddingBox";
import {
  type Call,
  handForPosition,
  highCardPoints,
  vulnerabilityLabel,
} from "../bridge";
import { parseBoardId, generateBoardId } from "../bridge/identifier";
import {
  isAuctionComplete,
  lastBidCall,
  addRobotBids,
} from "../bridge/auction";
import type { CallHistory } from "../bridge";

export function PracticePage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();

  const parsed = boardId ? parseBoardId(boardId) : null;

  const [history, setHistory] = useState<CallHistory>({
    dealer: parsed?.dealer ?? "N",
    calls: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount, run robot bids for the opening
  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    addRobotBids({ dealer: parsed?.dealer ?? "N", calls: [] }, "S", boardId)
      .then((h) => {
        if (!cancelled) {
          setError(null);
          setHistory(h);
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
  }, [boardId, parsed?.dealer]);

  const auctionDone = isAuctionComplete(history);

  const handleBid = useCallback(
    (call: Call) => {
      if (!boardId) return;
      setLoading(true);
      const afterUser: CallHistory = {
        ...history,
        calls: [...history.calls, call],
      };
      setHistory(afterUser);
      addRobotBids(afterUser, "S", boardId)
        .then((h) => {
          setError(null);
          setHistory(h);
          setLoading(false);
        })
        .catch((err) => {
          setError(String(err));
          setLoading(false);
        });
    },
    [boardId, history],
  );

  const handleRedeal = useCallback(() => {
    const { id } = generateBoardId();
    navigate(`/bid/${id}`);
  }, [navigate]);

  if (!parsed) {
    return <Navigate to="/" replace />;
  }

  const { deal, vulnerability } = parsed;
  const southHand = handForPosition(deal, "S");
  const hcp = highCardPoints(southHand);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar />
      {error && <ErrorBar message={error} onDismiss={() => setError(null)} />}
      <div className="flex-1 flex flex-col max-w-md mx-auto w-full p-4 gap-4">
        {/* User's hand */}
        <div className="flex flex-col items-center gap-1">
          <HandDisplay hand={southHand} position="S" />
          <div className="text-sm text-gray-500 font-medium">
            {hcp} HCP &middot; {vulnerabilityLabel(vulnerability)}
          </div>
        </div>

        {/* Auction table */}
        <CallTable callHistory={history} />

        {/* Bidding box or results */}
        {loading ? (
          <div className="text-center text-sm text-gray-400">Thinking...</div>
        ) : auctionDone ? (
          <div className="space-y-3">
            <div className="text-center text-sm font-semibold text-gray-600">
              Auction Complete
            </div>
            <div className="grid grid-cols-3 gap-2 justify-items-center">
              <HandDisplay hand={handForPosition(deal, "W")} position="W" />
              <HandDisplay hand={handForPosition(deal, "N")} position="N" />
              <HandDisplay hand={handForPosition(deal, "E")} position="E" />
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
