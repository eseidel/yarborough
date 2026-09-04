// Everything the practice page knows about one board: the auction, who is
// thinking, the engine's call for each of the user's turns, the review data,
// and the learner's record. The page itself is layout.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  Call,
  CallHistory,
  CallInterpretation,
  Position,
} from "../bridge/types";
import { callToString } from "../bridge/types";
import {
  addRobotBids,
  currentPlayer,
  getContract,
  getDeclarer,
  getFullAutobidAuction,
  isAuctionComplete,
  isPassOut,
} from "../bridge/auction";
import {
  type DealType,
  generateFilteredBoardId,
  parseBoardId,
} from "../bridge/identifier";
import { getOpeningLead, getSuggestedCall } from "../bridge/engine";
import { getDoubleDummyTable, getTricksAfterLead } from "../dds/dds";
import type { DoubleDummyAnalysis } from "../components/PlayAnalysis";
import type { AuctionPoint } from "../components/OptionsSheet";
import { useCallExplanation } from "../hooks/useCallExplanation";
import { trackEvent } from "../analytics";
import {
  type Progress,
  EMPTY_PROGRESS,
  loadProgress,
  recordHand,
  saveProgress,
} from "./progress";
import {
  type CallVerdict,
  buildVerdicts,
  callIndicesFor,
  prefixKey,
  summarizeVerdicts,
} from "./verdicts";

export type FeedbackTiming = "immediate" | "end";

const DEAL_TYPE_KEY = "yarborough_deal_type";
const FEEDBACK_TIMING_KEY = "yarborough_feedback_timing";
const DEAL_TYPES: DealType[] = ["Random", "Notrump", "Preempt", "Strong2C"];

function storage(kind: "local" | "session"): Storage | undefined {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
}

function readDealType(): DealType {
  try {
    const saved = storage("session")?.getItem(DEAL_TYPE_KEY);
    return DEAL_TYPES.includes(saved as DealType)
      ? (saved as DealType)
      : "Random";
  } catch {
    return "Random";
  }
}

function readFeedbackTiming(): FeedbackTiming {
  try {
    return storage("local")?.getItem(FEEDBACK_TIMING_KEY) === "end"
      ? "end"
      : "immediate";
  } catch {
    return "immediate";
  }
}

export type ParsedBoard = NonNullable<ReturnType<typeof parseBoardId>>;

export function usePracticeSession(
  boardId: string,
  parsed: ParsedBoard,
  userPosition: Position = "S",
) {
  const navigate = useNavigate();
  const baseId = boardId.split(":")[0];

  const [history, setHistory] = useState<CallHistory>({
    dealer: parsed.dealer,
    calls: parsed.initialCalls,
  });
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The engine's call at each of the user's turns, by the auction before it.
  const [saycCalls, setSaycCalls] = useState<
    Record<string, CallInterpretation>
  >({});
  const [assistedKeys, setAssistedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [hintKey, setHintKey] = useState<string | null>(null);
  // Mirrors hintKey for the fetch effect, which must not rerun on hint changes.
  const hintKeyRef = useRef<string | null>(null);
  hintKeyRef.current = hintKey;
  const inFlight = useRef(new Set<string>());
  const failed = useRef(new Set<string>());
  const [retry, setRetry] = useState(0);

  const [saycAuction, setSaycAuction] = useState<CallHistory | null>(null);
  const [doubleDummy, setDoubleDummy] = useState<{
    key: string;
    analysis: DoubleDummyAnalysis | null;
    error: string | null;
  } | null>(null);

  const [dealType, setDealType] = useState<DealType>(readDealType);
  const [pendingFocus, setPendingFocus] = useState<DealType | null>(null);
  const [progress, setProgress] = useState<Progress>(() =>
    loadProgress(storage("local")),
  );
  const [feedbackTiming, setFeedbackTimingState] =
    useState<FeedbackTiming>(readFeedbackTiming);
  const [options, setOptions] = useState<AuctionPoint | null>(null);
  const trackedResult = useRef<string | null>(null);

  const auctionDone = isAuctionComplete(history);
  const callsKey = history.calls.map(callToString).join(",");
  const auctionKey = `${baseId}:${callsKey}`;
  const userToCall =
    !auctionDone && !thinking && currentPlayer(history) === userPosition;
  const currentKey = userToCall
    ? prefixKey(history, history.calls.length)
    : null;

  const handleError = useCallback((err: unknown) => {
    setError(String(err));
  }, []);
  const explanation = useCallExplanation(
    history,
    parsed.vulnerability,
    handleError,
  );

  const verdicts: CallVerdict[] = useMemo(
    () => buildVerdicts(history, userPosition, saycCalls, assistedKeys),
    [history, userPosition, saycCalls, assistedKeys],
  );
  const userCallCount = callIndicesFor(history, userPosition).length;
  const verdictsComplete = verdicts.length === userCallCount;

  /** Run the engine for the other seats until it is the user's turn again. */
  const runRobots = useCallback(
    (from: CallHistory) => {
      setThinking(true);
      let cancelled = false;
      addRobotBids(from, userPosition, baseId)
        .then((next) => {
          if (cancelled) return;
          setError(null);
          setHistory(next);
          setThinking(false);
          const calls = next.calls.map(callToString).join(",");
          navigate(`/bid/${baseId}${calls ? `:${calls}` : ""}`, {
            replace: true,
          });
        })
        .catch((err) => {
          if (cancelled) return;
          setError(String(err));
          setThinking(false);
        });
      return () => {
        cancelled = true;
      };
    },
    [baseId, navigate, userPosition],
  );

  // On mount, let the other seats bid if it is not the user's turn.
  useEffect(() => {
    if (auctionDone || currentPlayer(history) === userPosition) return;
    return runRobots(history);
    // Only on mount: later robot runs are started by the user's actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ask the engine what it would call at each of the user's turns: the
  // current one, while the user is still thinking, and any earlier ones a
  // permalink brought in.
  useEffect(() => {
    const keys = callIndicesFor(history, userPosition).map((index) =>
      prefixKey(history, index),
    );
    if (currentKey !== null) keys.push(currentKey);
    for (const key of keys) {
      if (
        saycCalls[key] ||
        inFlight.current.has(key) ||
        failed.current.has(key)
      )
        continue;
      inFlight.current.add(key);
      const identifier = key ? `${baseId}:${key}` : baseId;
      Promise.resolve(getSuggestedCall(identifier))
        .then((interpretation) => {
          if (interpretation) {
            setSaycCalls((prev) => ({ ...prev, [key]: interpretation }));
          }
        })
        .catch((err) => {
          failed.current.add(key);
          // A background check failing is not the user's problem until they
          // ask for the SAYC bid; then the failure is reported.
          if (hintKeyRef.current === key) setError(String(err));
        })
        .finally(() => {
          inFlight.current.delete(key);
        });
    }
  }, [history, userPosition, currentKey, saycCalls, baseId, retry]);

  // The engine's own auction and the double-dummy analysis, once the auction is over.
  useEffect(() => {
    if (!auctionDone) return;
    let cancelled = false;
    getFullAutobidAuction(baseId, parsed.dealer)
      .then((auction) => {
        if (!cancelled) setSaycAuction(auction);
      })
      .catch(() => {
        // Non-fatal: the review simply omits where SAYC would have ended.
      });
    return () => {
      cancelled = true;
    };
  }, [auctionDone, baseId, parsed.dealer]);

  useEffect(() => {
    if (!auctionDone) return;
    let cancelled = false;
    const deal = parsed.deal;
    const contract = getContract(history);
    const declarer = getDeclarer(history);
    const key = auctionKey;
    (async () => {
      const table = await getDoubleDummyTable(deal);
      if (isPassOut(history) || !contract || !declarer) {
        return { table, lead: null, tricksAfterLead: null };
      }
      const lead = await getOpeningLead(key);
      const tricksAfterLead = await getTricksAfterLead(
        deal,
        contract.strain,
        declarer,
        lead.card,
      );
      return { table, lead, tricksAfterLead };
    })()
      .then((analysis) => {
        if (!cancelled) setDoubleDummy({ key, analysis, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setDoubleDummy({ key, analysis: null, error: String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [auctionDone, auctionKey, parsed.deal, history]);

  // Record the hand once every one of the user's calls has its verdict.
  useEffect(() => {
    if (!auctionDone || !verdictsComplete || verdicts.length === 0) return;
    setProgress((prev) => {
      const next = recordHand(prev, auctionKey, dealType, verdicts);
      if (next !== prev) saveProgress(storage("local"), next);
      return next;
    });
    if (trackedResult.current !== auctionKey) {
      trackedResult.current = auctionKey;
      trackEvent(
        "Bidding",
        "Result",
        summarizeVerdicts(verdicts).onSystem
          ? "matched autobidder"
          : "differed from autobidder",
      );
    }
  }, [auctionDone, verdictsComplete, verdicts, auctionKey, dealType]);

  const bid = useCallback(
    (call: Call) => {
      if (!userToCall) return;
      setHintKey(null);
      setOptions(null);
      explanation.reset();
      const afterUser: CallHistory = {
        ...history,
        calls: [...history.calls, call],
      };
      setHistory(afterUser);
      runRobots(afterUser);
    },
    [userToCall, history, explanation, runRobots],
  );

  const showSaycBid = useCallback(() => {
    if (currentKey === null) return;
    trackEvent("Bidding", "Help", "Suggest Bid");
    setAssistedKeys((prev) => new Set(prev).add(currentKey));
    setHintKey(currentKey);
    if (failed.current.has(currentKey)) {
      failed.current.delete(currentKey);
      setRetry((n) => n + 1);
    }
  }, [currentKey]);

  const hideSaycBid = useCallback(() => setHintKey(null), []);

  const showOptions = useCallback((point: AuctionPoint) => {
    trackEvent("Bidding", "Help", "Options");
    setOptions(point);
  }, []);
  const closeOptions = useCallback(() => setOptions(null), []);

  const restart = useCallback(() => {
    trackEvent("Bidding", "Boards", "rebid board");
    setHintKey(null);
    setOptions(null);
    setAssistedKeys(new Set());
    setSaycAuction(null);
    setDoubleDummy(null);
    explanation.reset();
    setError(null);
    const empty: CallHistory = { dealer: parsed.dealer, calls: [] };
    setHistory(empty);
    if (currentPlayer(empty) === userPosition) {
      navigate(`/bid/${baseId}`, { replace: true });
    } else {
      runRobots(empty);
    }
  }, [parsed.dealer, userPosition, navigate, baseId, runRobots, explanation]);

  /** Deal a new board for `focus`, remembering it as the session's focus. */
  const deal = useCallback(
    (focus: DealType, label: "next hand" | "skip hand") => {
      trackEvent("Bidding", "Boards", label);
      setDealType(focus);
      setPendingFocus(null);
      try {
        storage("session")?.setItem(DEAL_TYPE_KEY, focus);
      } catch {
        // The focus simply will not survive a reload.
      }
      setThinking(true);
      setError(null);
      generateFilteredBoardId(focus)
        .then(({ id }) => navigate(`/bid/${id}`))
        .catch((err) => {
          setError(String(err));
          setThinking(false);
        });
    },
    [navigate],
  );

  const dealNext = useCallback(
    (label: "next hand" | "skip hand") => deal(pendingFocus ?? dealType, label),
    [deal, pendingFocus, dealType],
  );

  // A new focus takes effect at once while nothing has been bid; mid-hand it
  // waits for the next deal, so a tap cannot throw away the auction.
  const changeFocus = useCallback(
    (focus: DealType) => {
      if (auctionDone || userCallCount === 0) {
        deal(focus, "skip hand");
      } else {
        setPendingFocus(focus === dealType ? null : focus);
      }
    },
    [auctionDone, userCallCount, dealType, deal],
  );

  const resetProgress = useCallback(() => {
    setProgress(EMPTY_PROGRESS);
    saveProgress(storage("local"), EMPTY_PROGRESS);
  }, []);

  const setFeedbackTiming = useCallback((timing: FeedbackTiming) => {
    setFeedbackTimingState(timing);
    try {
      storage("local")?.setItem(FEEDBACK_TIMING_KEY, timing);
    } catch {
      // Falls back to the default next time.
    }
  }, []);

  return {
    baseId,
    history,
    thinking,
    auctionDone,
    userToCall,
    error,
    setError,
    reportError: handleError,
    explanation,
    verdicts,
    verdictsComplete,
    /** The engine's call for the current turn, once known. */
    suggestion: currentKey !== null ? (saycCalls[currentKey] ?? null) : null,
    hintShown: hintKey !== null && hintKey === currentKey,
    saycAuction,
    doubleDummy: doubleDummy?.key === auctionKey ? doubleDummy : null,
    dealType,
    pendingFocus,
    progress,
    feedbackTiming,
    options,
    bid,
    showSaycBid,
    hideSaycBid,
    showOptions,
    closeOptions,
    restart,
    dealNext,
    changeFocus,
    resetProgress,
    setFeedbackTiming,
  };
}
