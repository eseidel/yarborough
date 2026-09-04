// Everything the practice page knows about one board: the auction, who is
// thinking, the engine's call for each of the user's turns, the review data,
// and the learner's record. The page itself is layout.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import { generateFilteredBoardId, parseBoardId } from "../bridge/identifier";
import {
  generateAdaptiveBoard,
  getOpeningLead,
  getSuggestedCall,
} from "../bridge/engine";
import { getDoubleDummyTable, getTricksAfterLead } from "../dds/dds";
import type { DoubleDummyAnalysis } from "../components/PlayAnalysis";
import type { AuctionPoint } from "../components/OptionsSheet";
import { useCallExplanation } from "../hooks/useCallExplanation";
import { trackEvent } from "../analytics";
import { useRecord, useSetting } from "./record/useRecord";
import type { HandRecord, HandSource } from "./record/types";
import { summarize } from "./stats";
import { computeInsights } from "./insights";
import {
  type AdaptiveSearchResult,
  type AdaptiveTarget,
  adaptiveTargets,
  describeTargets,
  searchAdaptiveBoard,
} from "./adaptive";
import {
  type CallVerdict,
  buildVerdicts,
  callIndicesFor,
  prefixKey,
  summarizeVerdicts,
} from "./verdicts";

export type FeedbackTiming = "immediate" | "end";

/** What the record keeps of a verdict. */
function toRecordedVerdict(verdict: CallVerdict) {
  return {
    index: verdict.index,
    call: callToString(verdict.call),
    saycCall: callToString(verdict.sayc.call),
    ...(verdict.sayc.ruleName ? { ruleName: verdict.sayc.ruleName } : {}),
    category: verdict.sayc.category ?? [],
    matched: verdict.matched,
    assisted: verdict.assisted,
  };
}

export type ParsedBoard = NonNullable<ReturnType<typeof parseBoardId>>;

/** What the page navigating here said about why: adaptive mode's doing. */
interface ArrivalState {
  adaptive?: {
    /** The category of the call this board practices. */
    category?: string[];
    targets?: string[][];
    /** No board was found in time; this one is random. */
    fallback?: boolean;
  };
  /** Deal an adaptive board for these targets straight away. */
  dealAdaptive?: { targets: string[][] };
}

export function usePracticeSession(
  boardId: string,
  parsed: ParsedBoard,
  userPosition: Position = "S",
) {
  const navigate = useNavigate();
  const location = useLocation();
  // Read once: the robots' replies rewrite the URL (replace, no state) and
  // would otherwise wipe what the page arrived with.
  const arrivalRef = useRef<ArrivalState | null>(
    (location.state ?? null) as ArrivalState | null,
  );
  const arrival = arrivalRef.current;
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
  /** Cancels the robots' reply in progress, if any. */
  const robotsInProgress = useRef<(() => void) | null>(null);
  const [retry, setRetry] = useState(0);

  // undefined while the engine bids the board out, null when that failed.
  const [saycAuction, setSaycAuction] = useState<
    CallHistory | null | undefined
  >(undefined);
  const [doubleDummy, setDoubleDummy] = useState<{
    key: string;
    analysis: DoubleDummyAnalysis | null;
    error: string | null;
  } | null>(null);

  const [dealType, setDealType] = useSetting<HandSource>("focus", "Random");
  const [pendingFocus, setPendingFocus] = useState<HandSource | null>(null);
  // A single weak spot chosen on the Progress tab; null means all of them.
  const [pinnedTargets, setPinnedTargets] = useSetting<string[][] | null>(
    "adaptiveTargets",
    null,
  );
  const [feedbackTiming, setFeedbackTiming] = useSetting<FeedbackTiming>(
    "feedbackTiming",
    "immediate",
  );
  const [options, setOptions] = useState<AuctionPoint | null>(null);
  const record = useRecord();
  const summary = useMemo(() => summarize(record.hands), [record.hands]);
  const weakSpots = useMemo(
    () => adaptiveTargets(computeInsights(record.hands)),
    [record.hands],
  );
  const targets: AdaptiveTarget[] = useMemo(
    () =>
      pinnedTargets
        ? pinnedTargets.map((path) => ({ path, weight: 1 }))
        : weakSpots,
    [pinnedTargets, weakSpots],
  );
  // The next adaptive board, found while the user bids the current one.
  const [nextBoard, setNextBoard] = useState<AdaptiveSearchResult | null>(null);
  const search = useRef<{ current: boolean } | null>(null);
  const [adaptiveStatus, setAdaptiveStatus] = useState<
    "idle" | "searching" | "fallback"
  >(arrival?.adaptive?.fallback ? "fallback" : "idle");
  const dealtOnArrival = useRef(false);
  // Set when the auction ended in this session, as opposed to arriving
  // complete from a permalink: only those hands go into the record.
  const completedHere = useRef(false);
  const firstCallAt = useRef<number | null>(null);
  // The record id of this auction's hand, once written, so the engine's
  // auction and the play analysis can be added to it when they arrive.
  const recorded = useRef<{ key: string; id: number | null } | null>(null);

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
          robotsInProgress.current = null;
          if (isAuctionComplete(next)) completedHere.current = true;
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
          robotsInProgress.current = null;
          setError(String(err));
          setThinking(false);
        });
      const cancel = () => {
        cancelled = true;
      };
      robotsInProgress.current = cancel;
      return cancel;
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
        if (!cancelled) setSaycAuction(null);
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

  // Record the hand once every one of the user's calls has its verdict, if
  // the auction ended here rather than arriving complete from a permalink.
  const { addHand, updateHand } = record;
  useEffect(() => {
    if (!auctionDone || !verdictsComplete || verdicts.length === 0) return;
    if (!completedHere.current || recorded.current?.key === auctionKey) return;
    recorded.current = { key: auctionKey, id: null };
    trackEvent(
      "Bidding",
      "Result",
      summarizeVerdicts(verdicts).onSystem
        ? "matched autobidder"
        : "differed from autobidder",
    );
    const contract = getContract(history);
    const completedAt = Date.now();
    const hand: HandRecord = {
      boardId: baseId,
      boardNumber: parsed.boardNumber,
      dealer: parsed.dealer,
      vulnerability: parsed.vulnerability,
      userPosition,
      source: arrival?.adaptive?.fallback ? "Random" : dealType,
      ...(dealType === "Adaptive" && arrival?.adaptive?.targets
        ? { targets: arrival.adaptive.targets }
        : {}),
      calls: history.calls.map(callToString),
      contract: contract
        ? `${contract.level}${contract.strain}${contract.doubled ?? ""}`
        : null,
      declarer: getDeclarer(history),
      saycCalls: saycAuction ? saycAuction.calls.map(callToString) : null,
      verdicts: verdicts.map(toRecordedVerdict),
      completedAt,
      durationMs:
        firstCallAt.current === null ? 0 : completedAt - firstCallAt.current,
    };
    const analysis =
      doubleDummy?.key === auctionKey ? doubleDummy.analysis : null;
    if (analysis) {
      hand.table = analysis.table;
      if (analysis.lead)
        hand.lead = `${analysis.lead.card.suit}${analysis.lead.card.rank}`;
      if (analysis.tricksAfterLead !== null)
        hand.tricksAfterLead = analysis.tricksAfterLead;
    }
    const written = recorded.current;
    addHand(hand).then((id) => {
      if (recorded.current === written) written.id = id;
    });
  }, [
    auctionDone,
    verdictsComplete,
    verdicts,
    auctionKey,
    dealType,
    history,
    baseId,
    parsed,
    userPosition,
    saycAuction,
    doubleDummy,
    addHand,
    arrival,
  ]);

  // The engine's auction and the play analysis usually land after the hand
  // was written; add them to it.
  useEffect(() => {
    const written = recorded.current;
    if (!written || written.key !== auctionKey || written.id === null) return;
    const patch: Partial<HandRecord> = {};
    if (saycAuction) patch.saycCalls = saycAuction.calls.map(callToString);
    const analysis =
      doubleDummy?.key === auctionKey ? doubleDummy.analysis : null;
    if (analysis) {
      patch.table = analysis.table;
      if (analysis.lead)
        patch.lead = `${analysis.lead.card.suit}${analysis.lead.card.rank}`;
      if (analysis.tricksAfterLead !== null)
        patch.tricksAfterLead = analysis.tricksAfterLead;
    }
    if (Object.keys(patch).length > 0) void updateHand(written.id, patch);
  }, [auctionKey, saycAuction, doubleDummy, updateHand]);

  const bid = useCallback(
    (call: Call) => {
      if (!userToCall) return;
      firstCallAt.current ??= Date.now();
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

  /**
   * Undo the user's latest call. The robots' replies to it are dropped (they
   * are deterministic, so nothing needs replaying), and if they are still
   * thinking their answer is discarded. The engine's calls are cached by the
   * auction before them, so the re-opened turn keeps its SAYC bid and, if
   * that bid was shown, its assisted mark.
   */
  const takeBack = useCallback(() => {
    const indices = callIndicesFor(history, userPosition);
    if (auctionDone || indices.length === 0) return;
    trackEvent("Bidding", "Boards", "take back call");
    robotsInProgress.current?.();
    robotsInProgress.current = null;
    setThinking(false);
    setHintKey(null);
    setOptions(null);
    explanation.reset();
    setError(null);
    const reopened: CallHistory = {
      ...history,
      calls: history.calls.slice(0, indices[indices.length - 1]),
    };
    setHistory(reopened);
    const calls = reopened.calls.map(callToString).join(",");
    navigate(`/bid/${baseId}${calls ? `:${calls}` : ""}`, { replace: true });
  }, [history, userPosition, auctionDone, explanation, navigate, baseId]);

  const restart = useCallback(() => {
    trackEvent("Bidding", "Boards", "rebid board");
    setHintKey(null);
    setOptions(null);
    setAssistedKeys(new Set());
    setSaycAuction(undefined);
    setDoubleDummy(null);
    completedHere.current = false;
    firstCallAt.current = null;
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

  /** Look for an adaptive board; resolves null when none turns up in time. */
  const findAdaptiveBoard = useCallback((forTargets: AdaptiveTarget[]) => {
    if (search.current) search.current.current = true;
    const cancelled = { current: false };
    search.current = cancelled;
    return searchAdaptiveBoard(forTargets, {
      generate: generateAdaptiveBoard,
      cancelled,
    }).finally(() => {
      if (search.current === cancelled) search.current = null;
    });
  }, []);

  // While the user bids in adaptive mode, find the next board in the
  // background so Next hand is usually instant.
  useEffect(() => {
    if ((pendingFocus ?? dealType) !== "Adaptive" || targets.length === 0)
      return;
    if (!(userToCall || auctionDone) || nextBoard || search.current) return;
    findAdaptiveBoard(targets)
      .then((result) => {
        if (result) setNextBoard(result);
      })
      .catch(() => {
        // The search on Next hand will report a failure if it persists.
      });
  }, [
    dealType,
    pendingFocus,
    targets,
    userToCall,
    auctionDone,
    nextBoard,
    findAdaptiveBoard,
  ]);

  useEffect(
    () => () => {
      if (search.current) search.current.current = true;
    },
    [],
  );

  /** Deal a new board for `focus`, remembering it as the session's focus. */
  const deal = useCallback(
    (
      focus: HandSource,
      label: "next hand" | "skip hand",
      forTargets: AdaptiveTarget[] = targets,
    ) => {
      trackEvent("Bidding", "Boards", label);
      void setDealType(focus);
      setPendingFocus(null);
      setThinking(true);
      setError(null);
      const fail = (err: unknown) => {
        setError(String(err));
        setThinking(false);
        setAdaptiveStatus("idle");
      };
      if (focus !== "Adaptive") {
        generateFilteredBoardId(focus)
          .then(({ id }) => navigate(`/bid/${id}`))
          .catch(fail);
        return;
      }
      const go = (result: AdaptiveSearchResult | null) => {
        if (result) {
          navigate(`/bid/${result.board.identifier}`, {
            state: {
              adaptive: {
                category: result.board.category,
                targets: forTargets.map((t) => t.path),
              },
            } satisfies ArrivalState,
          });
          return;
        }
        // Nothing turned up in time: a random hand rather than a wait.
        setAdaptiveStatus("fallback");
        generateFilteredBoardId("Random")
          .then(({ id }) =>
            navigate(`/bid/${id}`, {
              state: { adaptive: { fallback: true } } satisfies ArrivalState,
            }),
          )
          .catch(fail);
      };
      if (nextBoard) {
        setNextBoard(null);
        go(nextBoard);
        return;
      }
      if (forTargets.length === 0) {
        go(null);
        return;
      }
      setAdaptiveStatus("searching");
      findAdaptiveBoard(forTargets).then(go).catch(fail);
    },
    [navigate, setDealType, targets, nextBoard, findAdaptiveBoard],
  );

  // Sent here by "Practice this" on the Progress tab: deal for that weak
  // spot at once instead of bidding the random board the root route made.
  useEffect(() => {
    const request = arrival?.dealAdaptive;
    if (!request || dealtOnArrival.current) return;
    dealtOnArrival.current = true;
    deal(
      "Adaptive",
      "skip hand",
      request.targets.map((path) => ({ path, weight: 1 })),
    );
  }, [arrival, deal]);

  const dealNext = useCallback(
    (label: "next hand" | "skip hand") => deal(pendingFocus ?? dealType, label),
    [deal, pendingFocus, dealType],
  );

  // A new focus takes effect at once while nothing has been bid; mid-hand it
  // waits for the next deal, so a tap cannot throw away the auction.
  const changeFocus = useCallback(
    (focus: HandSource) => {
      if (focus === "Adaptive" && targets.length === 0) return;
      if (auctionDone || userCallCount === 0) {
        deal(focus, "skip hand");
      } else {
        setPendingFocus(focus === dealType ? null : focus);
      }
    },
    [auctionDone, userCallCount, dealType, deal, targets],
  );

  /** Aim adaptive mode at every weak spot again, not the one pinned. */
  const showAllWeakSpots = useCallback(() => {
    void setPinnedTargets(null);
    setNextBoard(null);
  }, [setPinnedTargets]);

  const resetProgress = useCallback(() => {
    void record.clearHands();
  }, [record]);

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
    saycAuction: saycAuction ?? null,
    doubleDummy: doubleDummy?.key === auctionKey ? doubleDummy : null,
    dealType,
    pendingFocus,
    /** Adaptive practice: what it can aim at and what it is doing. */
    adaptive: {
      available: targets.length > 0,
      pinned: pinnedTargets !== null,
      targetsLabel: describeTargets(targets.map((t) => t.path)),
      /** The family of call this board was dealt to practice, if any. */
      practicing:
        dealType === "Adaptive" && arrival?.adaptive?.category
          ? (arrival.adaptive.category[1] ?? null)
          : null,
      searching: adaptiveStatus === "searching",
      fallback: adaptiveStatus === "fallback",
    },
    showAllWeakSpots,
    /** Totals over the record, for the strip. */
    summary,
    recordAvailable: record.available,
    feedbackTiming,
    options,
    bid,
    showSaycBid,
    hideSaycBid,
    showOptions,
    closeOptions,
    /** True while there is a call of the user's to undo. */
    canTakeBack: !auctionDone && userCallCount > 0,
    takeBack,
    restart,
    dealNext,
    changeFocus,
    resetProgress,
    setFeedbackTiming,
  };
}
