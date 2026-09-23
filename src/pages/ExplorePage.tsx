import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { ErrorBar } from "../components/ErrorBar";
import { CallTable } from "../components/CallTable";
import { CallMenu } from "../components/CallMenu";
import { CallDisplay } from "../components/CallDisplay";
import { HandEntrySheet } from "../components/HandEntrySheet";
import { SeatHand } from "../components/SeatHand";
import type {
  Call,
  CallHistory,
  CallInterpretation,
  Hand,
  HandAnalysis,
  Position,
  Vulnerability,
} from "../bridge";
import {
  POSITION_NAMES,
  vulnerabilityFromBoardNumber,
  callToString,
  stringToCall,
  handFromCdhsString,
  handToCdhsString,
} from "../bridge";
import {
  currentPlayer,
  getContract,
  getDeclarer,
  isAuctionComplete,
} from "../bridge/auction";
import { getCallInterpretations, getHandAnalysis } from "../bridge/engine";
import { dealerFromBoardNumber, explorePath } from "../bridge/identifier";
import {
  type EnteredHands,
  loadHands,
  saveHands,
} from "../bridge/entered-hands";
import {
  type HandEntry,
  emptyEntry,
  entryFromHand,
  entryTotal,
} from "../bridge/hand-entry";
import { initAnalytics, trackPageView } from "../analytics";
import { setCanonical, setTitle } from "../seo";
import { CARD, PRIMARY_BUTTON, QUIET_BUTTON } from "../components/ui";

/** The bar's actions, a little tighter so that both fit beside the board. */
const BAR_BUTTON = QUIET_BUTTON.replace("px-2.5", "px-2");

/** A session at a club: the boards the menu offers. */
const BOARD_COUNT = 36;

const VULNERABILITY_TEXT: Record<Vulnerability, string> = {
  None: "None vul",
  NS: "N-S vul",
  EW: "E-W vul",
  Both: "Both vul",
};

function boardLine(boardNumber: number): string {
  const dealer = POSITION_NAMES[dealerFromBoardNumber(boardNumber)];
  return `${dealer} deals · ${VULNERABILITY_TEXT[vulnerabilityFromBoardNumber(boardNumber)]}`;
}

/**
 * Which board this is, with a way to pick another, and the two ways to
 * leave the auction: over again with the same hands, or on to the next deal.
 */
function BoardBar({
  boardNumber,
  canRestart,
  onPick,
  onRestart,
  onNext,
}: {
  boardNumber: number;
  canRestart: boolean;
  onPick: (boardNumber: number) => void;
  onRestart: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-100 py-2 pr-2 pl-3.5">
      <label className="relative flex shrink-0 flex-col">
        <span className="inline-flex items-center gap-1 text-base font-semibold text-gray-900">
          Board {boardNumber}
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            className="text-gray-400"
            aria-hidden
          >
            <path
              d="m5.5 8 4.5 4.5L14.5 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="text-xs whitespace-nowrap text-gray-500">
          {boardLine(boardNumber)}
        </span>
        <select
          aria-label="Board number"
          value={boardNumber}
          onChange={(event) => onPick(Number(event.target.value))}
          className="absolute inset-0 w-full cursor-pointer appearance-none text-base opacity-0"
        >
          {Array.from({ length: BOARD_COUNT }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              Board {n} · {boardLine(n)}
            </option>
          ))}
          {boardNumber > BOARD_COUNT && (
            <option value={boardNumber}>
              Board {boardNumber} · {boardLine(boardNumber)}
            </option>
          )}
        </select>
      </label>
      <span className="ml-auto flex items-center">
        <button
          type="button"
          className={BAR_BUTTON}
          disabled={!canRestart}
          onClick={onRestart}
          aria-label="Restart this board"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
          >
            <path
              d="M3.5 10a6.5 6.5 0 1 0 2-4.7M3.5 3.5v3.2h3.2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Restart
        </button>
        <button type="button" className={BAR_BUTTON} onClick={onNext}>
          Next board
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
          >
            <path
              d="M7.5 4.5 13 10l-5.5 5.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </span>
    </div>
  );
}

/** Where the auction ended, in place of a hand once no one is left to call. */
function Result({
  history,
  onNext,
}: {
  history: CallHistory;
  onNext: () => void;
}) {
  const contract = getContract(history);
  const declarer = getDeclarer(history);
  const bid: Call | null = contract
    ? { type: "bid", level: contract.level, strain: contract.strain }
    : null;
  return (
    <section
      className={`${CARD} flex items-center gap-3 px-3.5 py-4`}
      data-testid="explore-result"
    >
      <div>
        <div className="text-xs text-gray-500">
          {bid ? "Contract" : "Passed out"}
        </div>
        <div className="text-lg font-semibold text-gray-900">
          {bid && declarer ? (
            <>
              <CallDisplay call={bid} />
              {contract?.doubled && ` ${contract.doubled}`}{" "}
              <span className="text-[15px] font-normal text-gray-500">
                by {POSITION_NAMES[declarer]}
              </span>
            </>
          ) : (
            "No contract"
          )}
        </div>
      </div>
      <button
        type="button"
        className={`${PRIMARY_BUTTON} ml-auto`}
        onClick={onNext}
      >
        Next board
      </button>
    </section>
  );
}

/** The auction's first pixel, so the table sees the call that was just made. */
function scrollToTop() {
  document.scrollingElement?.scrollTo?.({ top: 0, behavior: "smooth" });
}

/**
 * Explore: walk an auction one call at a time, with what SAYC means by each.
 *
 * At a live table the phone goes round to whoever is to call. That seat can
 * enter its hand, and then the menu weighs every call against it. Hands stay
 * face down until their seat asks, and turn face down again after each call.
 */
export function ExplorePage() {
  const { exploreId } = useParams<{ exploreId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    initAnalytics();
    // "Bid Explorer" is what the old site titled this page, and what it is
    // known by in search results.
    setTitle("Bid Explorer - SAYC Bridge");
    setCanonical("/explore");
    trackPageView();
  }, [exploreId]);

  const history = useMemo<CallHistory>(() => {
    if (!exploreId) return { dealer: "N", calls: [] };
    const parts = exploreId.split(":");
    const boardNum = parseInt(parts[0], 10) || 1;
    const callsStr = parts[1];
    const calls = callsStr ? callsStr.split(",").map(stringToCall) : [];
    return { dealer: dealerFromBoardNumber(boardNum), calls };
  }, [exploreId]);

  const boardNumber = parseInt(exploreId?.split(":")[0] || "1", 10) || 1;
  const vulnerability = vulnerabilityFromBoardNumber(boardNumber);
  const complete = isAuctionComplete(history);
  const seat = currentPlayer(history);
  const callsString = history.calls.map(callToString).join(",");

  const [interpretations, setInterpretations] = useState<CallInterpretation[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [hands, setHandsState] = useState<EnteredHands>(loadHands);
  const [drafts, setDrafts] = useState<Partial<Record<Position, HandEntry>>>(
    {},
  );
  const [shown, setShown] = useState(false);
  const [sheet, setSheet] = useState<{
    seat: Position;
    editing: boolean;
  } | null>(null);
  const [analysis, setAnalysis] = useState<{
    key: string;
    result: HandAnalysis | null;
  } | null>(null);

  const setHands = useCallback((next: EnteredHands) => {
    setHandsState(next);
    saveHands(next);
  }, []);

  const [prevHistory, setPrevHistory] = useState(history);
  const [prevVuln, setPrevVuln] = useState(vulnerability);

  if (history !== prevHistory || vulnerability !== prevVuln) {
    setPrevHistory(history);
    setPrevVuln(vulnerability);
    setLoading(true);
    setError(null);
    // The phone goes to the next seat: whatever was face up goes face down.
    setShown(false);
  }

  useEffect(() => {
    let cancelled = false;

    getCallInterpretations(callsString, history.dealer, vulnerability)
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
  }, [callsString, history.dealer, vulnerability]);

  // Weigh the calls against the seat's hand as soon as there is one, face
  // down or not, so that showing it shows the answer.
  const hand: Hand | undefined = complete ? undefined : hands[seat];
  const handString = hand ? handToCdhsString(hand) : null;
  const analysisKey = handString
    ? `${handString}|${callsString}|${history.dealer}|${vulnerability}`
    : null;

  useEffect(() => {
    const weighedHand = handString ? handFromCdhsString(handString) : null;
    if (!weighedHand) return;
    const key = `${handString}|${callsString}|${history.dealer}|${vulnerability}`;
    let cancelled = false;
    getHandAnalysis(weighedHand, callsString, history.dealer, vulnerability)
      .then((result) => {
        if (!cancelled) setAnalysis({ key, result });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setAnalysis({ key, result: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handString, callsString, history.dealer, vulnerability]);

  const weighed =
    analysisKey && analysis?.key === analysisKey ? analysis.result : null;
  const weighing =
    shown && Boolean(analysisKey) && analysis?.key !== analysisKey;

  const handleSelect = useCallback(
    (interp: CallInterpretation) => {
      try {
        navigator.vibrate?.(8);
      } catch {
        // Haptics are a nicety.
      }
      navigate(explorePath(boardNumber, [...history.calls, interp.call]));
      scrollToTop();
    },
    [history, boardNumber, navigate],
  );

  const restart = useCallback(() => {
    navigate(explorePath(boardNumber, []));
  }, [navigate, boardNumber]);

  const nextBoard = useCallback(() => {
    setHands({});
    setDrafts({});
    navigate(explorePath((boardNumber % BOARD_COUNT) + 1, []));
    scrollToTop();
  }, [navigate, boardNumber, setHands]);

  const pickBoard = useCallback(
    (n: number) => navigate(explorePath(n, [])),
    [navigate],
  );

  const closeSheet = () => setSheet(null);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar />
      {error && <ErrorBar message={error} onDismiss={() => setError(null)} />}
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full p-3 pb-8 gap-3">
        <CallTable
          callHistory={history}
          vulnerability={vulnerability}
          header={
            <BoardBar
              boardNumber={boardNumber}
              canRestart={history.calls.length > 0}
              onPick={pickBoard}
              onRestart={restart}
              onNext={nextBoard}
            />
          }
        />
        {complete ? (
          <Result history={history} onNext={nextBoard} />
        ) : (
          <>
            <SeatHand
              key={seat}
              seat={seat}
              hand={hand}
              shown={shown}
              weighing={weighing}
              onEnter={() => setSheet({ seat, editing: false })}
              onShow={() => setShown(true)}
              onHide={() => setShown(false)}
              onEdit={() => setSheet({ seat, editing: true })}
            />
            <div className={`${CARD} overflow-hidden`}>
              {loading ? (
                <div className="p-4 text-center text-gray-400">Loading…</div>
              ) : (
                <CallMenu
                  interpretations={interpretations}
                  analysis={shown ? weighed : null}
                  hand={shown ? (hand ?? null) : null}
                  onSelect={handleSelect}
                />
              )}
            </div>
          </>
        )}
      </div>
      {sheet && (
        <HandEntrySheet
          key={sheet.seat}
          seatName={POSITION_NAMES[sheet.seat]}
          editing={sheet.editing}
          initial={
            sheet.editing && hands[sheet.seat]
              ? entryFromHand(hands[sheet.seat]!)
              : (drafts[sheet.seat] ?? emptyEntry())
          }
          onDone={(entered) => {
            setHands({ ...hands, [sheet.seat]: entered });
            setDrafts({ ...drafts, [sheet.seat]: undefined });
            setShown(true);
            closeSheet();
          }}
          onCancel={(entry) => {
            if (!sheet.editing) {
              setDrafts({
                ...drafts,
                [sheet.seat]: entryTotal(entry) ? entry : undefined,
              });
            }
            closeSheet();
          }}
          onForget={
            sheet.editing
              ? () => {
                  const rest = { ...hands };
                  delete rest[sheet.seat];
                  setHands(rest);
                  setShown(false);
                  closeSheet();
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
