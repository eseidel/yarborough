import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { ErrorBar } from "../components/ErrorBar";
import { CardFan } from "../components/CardFan";
import { CallTable } from "../components/CallTable";
import { BiddingBox } from "../components/BiddingBox";
import { type Call, type CallInterpretation, handForPosition } from "../bridge";
import { CallDisplay } from "../components/CallDisplay";
import { AboutFooter } from "../components/AboutFooter";
import {
  parseBoardId,
  generateFilteredBoardId,
  type DealType,
} from "../bridge/identifier";
import { DealSelector } from "../components/DealSelector";
import {
  isAuctionComplete,
  addRobotBids,
} from "../bridge/auction";
import { callToString } from "../bridge/types";
import { getSuggestedBid, getInterpretations } from "../bridge/engine";
import type { CallHistory } from "../bridge";

export function PracticePage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();

  const parsed = boardId ? parseBoardId(boardId) : null;

  const [history, setHistory] = useState<CallHistory>({
    dealer: parsed?.dealer ?? "N",
    calls: parsed?.initialCalls ?? [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<CallInterpretation | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selectedCallIndex, setSelectedCallIndex] = useState<number | null>(
    null,
  );
  const [callExplanation, setCallExplanation] =
    useState<CallInterpretation | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [dealType, setDealType] = useState<DealType>(() => {
    const saved = sessionStorage.getItem("yarborough_deal_type");
    return (saved as DealType) || "Random";
  });

  // On mount, run robot bids for the opening if calls are empty
  useEffect(() => {
    if (!boardId || !parsed) return;
    if (history.calls.length > 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    addRobotBids({ dealer: parsed.dealer, calls: [] }, "S", boardId.split(":")[0])
      .then((h) => {
        if (!cancelled) {
          setError(null);
          setHistory(h);
          setLoading(false);
          const baseId = boardId.split(":")[0];
          const callsStr = h.calls.map(callToString).join(",");
          if (callsStr) {
            navigate(`/bid/${baseId}:${callsStr}`, { replace: true });
          }
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
  }, [boardId, parsed?.dealer]); // boardId changed means a new hand or a manual URL edit

  const auctionDone = isAuctionComplete(history);

  const handleSuggest = useCallback(() => {
    if (!boardId) return;
    setSuggestLoading(true);
    const baseId = boardId.split(":")[0];
    const callsStr = history.calls.map(callToString).join(",");
    const identifier = callsStr.length > 0 ? `${baseId}:${callsStr}` : baseId;
    getSuggestedBid(identifier)
      .then((interp) => {
        setSuggestion(interp);
        setSuggestLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setSuggestLoading(false);
      });
  }, [boardId, history.calls]);

  const handleBid = useCallback(
    (call: Call) => {
      if (!boardId) return;
      setLoading(true);
      setSuggestion(null);
      setSelectedCallIndex(null);
      setCallExplanation(null);
      const baseId = boardId.split(":")[0];
      const afterUser: CallHistory = {
        ...history,
        calls: [...history.calls, call],
      };
      setHistory(afterUser);
      addRobotBids(afterUser, "S", baseId)
        .then((h) => {
          setError(null);
          setHistory(h);
          setLoading(false);
          const callsStr = h.calls.map(callToString).join(",");
          navigate(`/bid/${baseId}:${callsStr}`, { replace: true });
        })
        .catch((err) => {
          setError(String(err));
          setLoading(false);
        });
    },
    [boardId, history, navigate],
  );

  const handleRedeal = useCallback(() => {
    generateFilteredBoardId(dealType).then(({ id }) => {
      navigate(`/bid/${id}`);
    });
  }, [navigate, dealType]);

  const handleDealTypeChange = useCallback(
    (newType: DealType) => {
      setLoading(true);
      setDealType(newType);
      sessionStorage.setItem("yarborough_deal_type", newType);
      generateFilteredBoardId(newType).then(({ id }) => {
        navigate(`/bid/${id}`);
      });
    },
    [navigate],
  );

  const handleRebid = useCallback(() => {
    if (!boardId || !parsed) return;
    setLoading(true);
    setSuggestion(null);
    setSelectedCallIndex(null);
    setCallExplanation(null);
    setError(null);
    const initialHistory: CallHistory = {
      dealer: parsed.dealer,
      calls: [],
    };
    const baseId = boardId.split(":")[0];
    addRobotBids(initialHistory, "S", baseId)
      .then((h) => {
        setHistory(h);
        setLoading(false);
        const callsStr = h.calls.map(callToString).join(",");
        navigate(`/bid/${baseId}${callsStr ? `:${callsStr}` : ""}`, {
          replace: true,
        });
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [boardId, parsed, navigate]);

  const handleCallClick = useCallback(
    (callIndex: number) => {
      if (selectedCallIndex === callIndex) {
        setSelectedCallIndex(null);
        setCallExplanation(null);
        return;
      }
      setSelectedCallIndex(callIndex);
      setCallExplanation(null);
      setExplanationLoading(true);
      const callsBefore = history.calls.slice(0, callIndex);
      const callsStr = callsBefore.map(callToString).join(",");
      const clickedCall = history.calls[callIndex];
      getInterpretations(
        callsStr,
        history.dealer,
        parsed?.vulnerability ?? "None",
      )
        .then((interps) => {
          const match = interps.find(
            (i) =>
              i.call.type === clickedCall.type &&
              i.call.level === clickedCall.level &&
              i.call.strain === clickedCall.strain,
          );
          setCallExplanation(
            match ?? {
              call: clickedCall,
              ruleName: undefined,
              description: undefined,
            },
          );
          setExplanationLoading(false);
        })
        .catch((err) => {
          setError(String(err));
          setExplanationLoading(false);
        });
    },
    [history, selectedCallIndex, parsed?.vulnerability],
  );

  if (!parsed) {
    return <Navigate to="/" replace />;
  }

  const { deal, vulnerability } = parsed;
  const southHand = handForPosition(deal, "S");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar />
      {error && <ErrorBar message={error} onDismiss={() => setError(null)} />}
      <div className="flex-1 flex flex-col max-w-md mx-auto w-full p-4 gap-4">
        {/* Auction table */}
        <CallTable
          callHistory={history}
          vulnerability={vulnerability}
          onCallClick={handleCallClick}
          selectedCallIndex={selectedCallIndex}
          callExplanation={callExplanation}
          explanationLoading={explanationLoading}
          exploreLink={
            selectedCallIndex !== null
              ? `/explore/${parsed.boardNumber}${
                  history.calls.slice(0, selectedCallIndex + 1).length > 0
                    ? ":" +
                      history.calls
                        .slice(0, selectedCallIndex + 1)
                        .map(callToString)
                        .join(",")
                    : ""
                }`
              : undefined
          }
        />

        {/* User's hand - only show during auction */}
        {!auctionDone && <CardFan hand={southHand} position="S" />}

        {/* Bidding box or results */}
        {loading ? (
          <div className="text-center text-sm text-gray-400">Thinking...</div>
        ) : auctionDone ? (
          <div className="space-y-4">
            <div className="text-center text-sm font-semibold text-gray-600">
              Auction Complete
            </div>
            <div className="flex flex-col gap-4">
              <CardFan hand={handForPosition(deal, "N")} position="N" />
              <div className="grid grid-cols-2 gap-4">
                <CardFan
                  hand={handForPosition(deal, "W")}
                  position="W"
                  variant="list"
                />
                <CardFan
                  hand={handForPosition(deal, "E")}
                  position="E"
                  variant="list"
                />
              </div>
              <CardFan hand={southHand} position="S" />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRedeal}
                className="flex-1 py-2 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold text-sm transition-colors"
              >
                Next Hand
              </button>
              <button
                onClick={handleRebid}
                className="flex-1 py-2 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 font-semibold text-sm transition-colors"
              >
                Rebid Hand
              </button>
            </div>
          </div>
        ) : (
          <BiddingBox onBid={handleBid} callHistory={history} />
        )}

        {/* Suggest bid / Skip hand buttons + result */}
        {!loading && !auctionDone && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                onClick={handleSuggest}
                disabled={suggestLoading}
                className="flex-1 py-2 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold text-sm transition-colors disabled:opacity-50"
              >
                {suggestLoading ? "Thinking..." : "Suggest Bid"}
              </button>
              <button
                onClick={handleRedeal}
                className="flex-1 py-2 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold text-sm transition-colors"
              >
                Skip Hand
              </button>
              <button
                onClick={handleRebid}
                className="flex-1 py-2 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 font-semibold text-sm transition-colors"
              >
                Rebid
              </button>
            </div>
            {suggestion && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="font-semibold text-amber-900">
                      Autobidder says: <CallDisplay call={suggestion.call} />
                    </div>
                    {suggestion.ruleName && (
                      <div className="text-amber-800 mt-1">
                        {suggestion.ruleName}
                      </div>
                    )}
                    {suggestion.description && (
                      <div className="text-amber-700 text-xs mt-0.5">
                        {suggestion.description}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      const callsStr = history.calls
                        .map(callToString)
                        .join(",");
                      navigate(
                        `/explore/${parsed.boardNumber}${callsStr ? `:${callsStr}` : ""}`,
                      );
                    }}
                    className="text-amber-600 hover:underline text-xs whitespace-nowrap mt-0.5"
                  >
                    Explore &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-gray-100 pt-4 mt-2">
          <DealSelector value={dealType} onChange={handleDealTypeChange} />
        </div>
        <AboutFooter />
      </div>
    </div>
  );
}
