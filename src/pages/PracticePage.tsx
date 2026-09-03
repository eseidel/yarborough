import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { ErrorBar } from "../components/ErrorBar";
import { CardFan } from "../components/CardFan";
import { CallTable } from "../components/CallTable";
import { BiddingBox } from "../components/BiddingBox";
import { type Call, type CallInterpretation, handForPosition } from "../bridge";
import { CallDisplay } from "../components/CallDisplay";
import { ConstraintsDisplay } from "../components/ConstraintsDisplay";
import { AboutFooter } from "../components/AboutFooter";
import { DealStats } from "../components/DealStats";
import { AutobidResult } from "../components/AutobidResult";
import {
  DoubleDummyResult,
  type DoubleDummyAnalysis,
} from "../components/DoubleDummyResult";
import {
  parseBoardId,
  generateFilteredBoardId,
  explorePath,
  type DealType,
} from "../bridge/identifier";
import { DealSelector } from "../components/DealSelector";
import { ShareButton } from "../components/ShareButton";
import {
  isAuctionComplete,
  isPassOut,
  getContract,
  getDeclarer,
  addRobotBids,
  getFullAutobidAuction,
} from "../bridge/auction";
import { callToString } from "../bridge/types";
import { getSuggestedCall, getOpeningLead } from "../bridge/engine";
import { useCallExplanation } from "../hooks/useCallExplanation";
import { getDoubleDummyTable, getTricksAfterLead } from "../dds/dds";
import { initAnalytics, trackPageView, trackEvent } from "../analytics";
import { setCanonical, setTitle, CANONICAL_ORIGIN } from "../seo";
import type { CallHistory } from "../bridge";

export function PracticePage({ boardId: boardIdProp }: { boardId?: string }) {
  const { boardId: boardIdParam } = useParams<{ boardId: string }>();
  // The root route has no :boardId in the URL and supplies one instead.
  const boardId = boardIdParam ?? boardIdProp;
  const navigate = useNavigate();

  const parsed = useMemo(
    () => (boardId ? parseBoardId(boardId) : null),
    [boardId],
  );

  const [history, setHistory] = useState<CallHistory>({
    dealer: parsed?.dealer ?? "N",
    calls: parsed?.initialCalls ?? [],
  });
  const [loading, setLoading] = useState(
    !parsed || parsed.initialCalls.length === 0,
  );
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<CallInterpretation | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [dealType, setDealType] = useState<DealType>(() => {
    const saved = sessionStorage.getItem("yarborough_deal_type");
    return (saved as DealType) || "Random";
  });
  const [fullAutobid, setFullAutobid] = useState<CallHistory | null>(null);
  // Keyed by the auction it was solved for, so a result for an earlier auction
  // on this board (or another board) is never shown.
  const [doubleDummy, setDoubleDummy] = useState<{
    key: string;
    analysis: DoubleDummyAnalysis | null;
    error: string | null;
  } | null>(null);
  const trackedResultRef = useRef<string | null>(null);

  const auctionDone = isAuctionComplete(history);
  const auctionKey = boardId
    ? `${boardId.split(":")[0]}:${history.calls.map(callToString).join(",")}`
    : null;

  const handleExplanationError = useCallback((err: unknown) => {
    setError(String(err));
  }, []);
  const explanation = useCallExplanation(
    history,
    parsed?.vulnerability ?? "None",
    parsed?.boardNumber,
    handleExplanationError,
  );

  // Initialize analytics on mount
  useEffect(() => {
    initAnalytics();
  }, []);

  // Track pageview on boardId change
  useEffect(() => {
    trackPageView();
  }, [boardId]);

  // Fetch full autobidder auction when auction is complete
  useEffect(() => {
    if (!auctionDone || !boardId || !parsed) return;
    let cancelled = false;
    const baseId = boardId.split(":")[0];
    getFullAutobidAuction(baseId, parsed.dealer)
      .then((res) => {
        if (!cancelled) {
          setFullAutobid(res);
        }
      })
      .catch(() => {
        // Failures are non-fatal
      });
    return () => {
      cancelled = true;
    };
  }, [auctionDone, boardId, parsed]);

  // Solve the deal double-dummy when the auction is complete: the full table,
  // then the contract reached after the textbook opening lead.
  useEffect(() => {
    if (!auctionDone || !auctionKey || !parsed) return;
    let cancelled = false;
    const deal = parsed.deal;
    const contract = getContract(history);
    const declarer = getDeclarer(history);
    const identifier = auctionKey;
    (async () => {
      const table = await getDoubleDummyTable(deal);
      if (isPassOut(history) || !contract || !declarer) {
        return { table, lead: null, tricksAfterLead: null };
      }
      const lead = await getOpeningLead(identifier);
      const tricksAfterLead = await getTricksAfterLead(
        deal,
        contract.strain,
        declarer,
        lead.card,
      );
      return { table, lead, tricksAfterLead };
    })()
      .then((analysis) => {
        if (!cancelled) {
          setDoubleDummy({ key: identifier, analysis, error: null });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDoubleDummy({
            key: identifier,
            analysis: null,
            error: String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [auctionDone, auctionKey, parsed, history]);

  // On mount, run robot bids for the opening if calls are empty
  useEffect(() => {
    if (!boardId || !parsed) return;
    if (history.calls.length > 0) {
      return;
    }
    let cancelled = false;
    addRobotBids(
      { dealer: parsed.dealer, calls: [] },
      "S",
      boardId.split(":")[0],
    )
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
  }, [boardId, parsed, history.calls.length, navigate]); // boardId changed means a new hand or a manual URL edit

  useEffect(() => {
    if (auctionDone) {
      setTitle("Bidding Results - SAYC Bridge");
    } else {
      setTitle("Bidding Practice - SAYC Bridge");
    }
    // Board permalinks canonicalize to themselves; eleven of them are indexed
    // and earn traffic. See src/seo.ts.
    setCanonical(boardIdParam ? `/bid/${boardIdParam}` : "/");
  }, [auctionDone, boardIdParam]);

  useEffect(() => {
    if (auctionDone && fullAutobid && boardId) {
      const userCallsStr = history.calls.map(callToString).join(",");
      const key = `${boardId}:${userCallsStr}`;
      if (trackedResultRef.current !== key) {
        trackedResultRef.current = key;
        const autobidCallsStr = fullAutobid.calls.map(callToString).join(",");
        const matched = userCallsStr === autobidCallsStr;
        trackEvent(
          "Bidding",
          "Result",
          matched ? "matched autobidder" : "differed from autobidder",
        );
      }
    }
  }, [auctionDone, fullAutobid, boardId, history.calls]);

  const handleSuggest = useCallback(() => {
    if (!boardId) return;
    trackEvent("Bidding", "Help", "Suggest Bid");
    setSuggestLoading(true);
    const baseId = boardId.split(":")[0];
    const callsStr = history.calls.map(callToString).join(",");
    const identifier = callsStr.length > 0 ? `${baseId}:${callsStr}` : baseId;
    getSuggestedCall(identifier)
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
      explanation.reset();
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
    [boardId, history, navigate, explanation],
  );

  const handleRedeal = useCallback(() => {
    trackEvent("Bidding", "Boards", auctionDone ? "next hand" : "skip hand");
    setLoading(true);
    setError(null);
    generateFilteredBoardId(dealType)
      .then(({ id }) => {
        navigate(`/bid/${id}`);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [navigate, dealType, auctionDone]);

  const handleDealTypeChange = useCallback(
    (newType: DealType) => {
      setLoading(true);
      setDealType(newType);
      sessionStorage.setItem("yarborough_deal_type", newType);
      generateFilteredBoardId(newType)
        .then(({ id }) => {
          navigate(`/bid/${id}`);
        })
        .catch((err) => {
          setError(String(err));
          setLoading(false);
        });
    },
    [navigate],
  );

  const handleRebid = useCallback(() => {
    if (!boardId || !parsed) return;
    trackEvent("Bidding", "Boards", "rebid board");
    setLoading(true);
    setSuggestion(null);
    explanation.reset();
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
  }, [boardId, parsed, navigate, explanation]);

  // Track the "explain this bid" interaction here rather than inside the
  // shared hook, since only the live auction view (not the autobidder's)
  // reports it to analytics.
  const handleCallClick = useCallback(
    (callIndex: number) => {
      if (explanation.selectedCallIndex !== callIndex) {
        trackEvent("Bidding", "Help", "Explain Bid");
      }
      explanation.handleCallClick(callIndex);
    },
    [explanation],
  );

  if (!parsed) {
    // Only reachable from a hand-edited /bid/<board> URL; the id the root
    // route generates always parses.
    return boardIdParam ? <Navigate to="/" replace /> : null;
  }

  const { deal, vulnerability } = parsed;
  const southHand = handForPosition(deal, "S");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar />
      {error && <ErrorBar message={error} onDismiss={() => setError(null)} />}
      <div className="flex-1 flex flex-col max-w-md mx-auto w-full p-4 gap-4">
        <div className="flex justify-end">
          <ShareButton
            url={`${CANONICAL_ORIGIN}/bid/${boardId}`}
            title="SAYC Bridge Practice Hand"
            text={`Board ${parsed.boardNumber} — try this bridge bidding hand`}
          />
        </div>

        {/* Auction table */}
        <CallTable
          callHistory={history}
          vulnerability={vulnerability}
          onCallClick={handleCallClick}
          selectedCallIndex={explanation.selectedCallIndex}
          callExplanation={explanation.callExplanation}
          explanationLoading={explanation.explanationLoading}
          exploreLink={explanation.exploreLink}
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
            <AutobidResult
              userHistory={history}
              autobidHistory={fullAutobid}
              loading={!fullAutobid}
              vulnerability={vulnerability}
              boardNumber={parsed.boardNumber}
            />
            <DoubleDummyResult
              history={history}
              analysis={
                doubleDummy?.key === auctionKey ? doubleDummy.analysis : null
              }
              loading={doubleDummy?.key !== auctionKey}
              error={doubleDummy?.key === auctionKey ? doubleDummy.error : null}
            />
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
            <DealStats deal={deal} />
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
                      <div className="text-amber-800 mt-1 font-semibold">
                        {suggestion.ruleName}
                      </div>
                    )}
                    {suggestion.constraints && (
                      <div className="text-amber-800 text-xs mt-0.5">
                        <ConstraintsDisplay
                          constraints={suggestion.constraints}
                        />
                      </div>
                    )}
                    {suggestion.description && (
                      <div className="text-amber-700 text-xs mt-0.5">
                        {suggestion.description}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      navigate(explorePath(parsed.boardNumber, history.calls))
                    }
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
