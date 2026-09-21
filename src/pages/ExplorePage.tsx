import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { NavBar } from "../components/NavBar";
import { ErrorBar } from "../components/ErrorBar";
import { BoardPicker } from "../components/BoardPicker";
import { CallTable } from "../components/CallTable";
import { CallMenu } from "../components/CallMenu";
import { CardFan } from "../components/CardFan";
import { HandEntry } from "../components/HandEntry";
import type {
  CallHistory,
  CallInterpretation,
  EnteredHands,
  Hand,
  HandAnalysis,
  Position,
} from "../bridge";
import {
  vulnerabilityFromBoardNumber,
  callToString,
  handToCdhsString,
  stringToCall,
  POSITION_NAMES,
} from "../bridge";
import { currentPlayer, isAuctionComplete } from "../bridge/auction";
import { loadHands, saveHands } from "../bridge/entered-hands";
import { getCallInterpretations, getHandAnalysis } from "../bridge/engine";
import { dealerFromBoardNumber, explorePath } from "../bridge/identifier";
import { initAnalytics, trackPageView } from "../analytics";
import { setCanonical, setTitle } from "../seo";
import { CARD, EYEBROW, TEXT_BUTTON } from "../components/ui";

/**
 * What the seat to call is being shown.
 *
 * Explore is meant to work at a live table, where the phone goes round and
 * whoever is to call picks it up. So the screen starts at `closed` on every
 * turn: the auction is public, and the cards -- and with them everything the
 * cards decide -- have to be asked for.
 */
type Reveal = "closed" | "open";

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
  const seat = currentPlayer(history);
  const complete = isAuctionComplete(history);

  const [interpretations, setInterpretations] = useState<CallInterpretation[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [prevHistory, setPrevHistory] = useState(history);
  const [prevVuln, setPrevVuln] = useState(vulnerability);

  if (history !== prevHistory || vulnerability !== prevVuln) {
    setPrevHistory(history);
    setPrevVuln(vulnerability);
    setLoading(true);
    setError(null);
  }

  // A hand per seat, kept in the tab and never in the URL: see entered-hands.
  const [hands, setHands] = useState<EnteredHands>(() =>
    loadHands(boardNumber),
  );
  const [reveal, setReveal] = useState<Reveal>("closed");
  const [entering, setEntering] = useState(false);
  const [analysis, setAnalysis] = useState<HandAnalysis | null>(null);
  /** What the analysis on screen was asked about, so a stale one shows as
      work in progress rather than as an answer about these cards. */
  const [analysisOf, setAnalysisOf] = useState<string | null>(null);

  // Every call hands the phone on, so the screen closes itself over again. A
  // new board is a new deal, and its hands are a different storage key.
  const [prevBoard, setPrevBoard] = useState(boardNumber);
  const [prevRevealed, setPrevRevealed] = useState(history);
  if (boardNumber !== prevBoard) {
    setPrevBoard(boardNumber);
    setHands(loadHands(boardNumber));
  }
  if (history !== prevRevealed) {
    setPrevRevealed(history);
    setReveal("closed");
    setEntering(false);
    // Cleared here rather than left to the effect below, so no call ever
    // carries the last seat's verdict for even one frame.
    setAnalysis(null);
    setAnalysisOf(null);
  }

  const hand = hands[seat];

  const callsString = useMemo(
    () => history.calls.map(callToString).join(","),
    [history],
  );

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

  const handleSelect = useCallback(
    (interp: CallInterpretation) => {
      const newCalls = [...history.calls, interp.call];
      navigate(explorePath(boardNumber, newCalls));
    },
    [history, boardNumber, navigate],
  );

  const handleClear = useCallback(() => {
    // The calls only: coming back to try a different auction with the same
    // cards is what Explore is for.
    navigate(explorePath(boardNumber, []));
  }, [navigate, boardNumber]);

  const handleBoardSelect = useCallback(
    (nextBoard: number) => {
      navigate(explorePath(nextBoard, []));
    },
    [navigate],
  );

  const handleHandEntered = useCallback(
    (entered: Hand) => {
      const next = { ...hands, [seat]: entered };
      setHands(next);
      saveHands(boardNumber, next);
      setEntering(false);
      setReveal("open");
    },
    [boardNumber, hands, seat],
  );

  /** The question the call menu is showing an answer to, or none. */
  const asking =
    reveal === "open" && hand
      ? `${handToCdhsString(hand)}@${callsString}`
      : null;
  const analysisWorking = asking !== null && asking !== analysisOf;

  // Once the seat has its cards on screen, the calls are weighed against
  // them. Nothing here runs while the slot is closed, so the engine is never
  // asked about a hand its owner has not put up.
  useEffect(() => {
    if (!asking || !hand) return;
    let cancelled = false;
    getHandAnalysis(hand, callsString, history.dealer, vulnerability)
      .then((result) => {
        if (cancelled) return;
        setAnalysis(result);
        setAnalysisOf(asking);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        // The question is answered, badly: stop saying it is being weighed.
        setAnalysisOf(asking);
      });
    return () => {
      cancelled = true;
    };
  }, [asking, hand, callsString, history.dealer, vulnerability]);

  // Closing the slot takes the verdict down with the cards: they are the
  // same secret, and the call menu is where the verdict shows.
  const handleHide = useCallback(() => {
    setReveal("closed");
    setAnalysis(null);
    setAnalysisOf(null);
  }, []);

  const handleForget = useCallback(() => {
    const next = { ...hands };
    delete next[seat];
    setHands(next);
    saveHands(boardNumber, next);
    handleHide();
  }, [boardNumber, hands, handleHide, seat]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar />
      {error && <ErrorBar message={error} onDismiss={() => setError(null)} />}
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full p-4 gap-4">
        {/* One line: it is the dealer and the vulnerability that matter, and
            they used to take a whole strip to say. */}
        <BoardPicker boardNumber={boardNumber} onSelect={handleBoardSelect} />

        <CallTable callHistory={history} />

        {!complete &&
          (entering ? (
            <HandEntry
              position={seat}
              initialHand={hand}
              onDone={handleHandEntered}
              onCancel={() => setEntering(false)}
            />
          ) : (
            <HandSlot
              seat={seat}
              hand={hand}
              reveal={reveal}
              working={analysisWorking}
              onEnter={() => {
                setEntering(true);
                setAnalysis(null);
                setAnalysisOf(null);
              }}
              onShow={() => setReveal("open")}
              onClose={handleHide}
              onForget={handleForget}
            />
          ))}

        <div className={`${CARD} flex-1 overflow-y-auto`}>
          {loading ? (
            <div className="p-4 text-center text-gray-400">Loading...</div>
          ) : (
            <CallMenu
              interpretations={interpretations}
              // Never a verdict about cards other than the ones on screen.
              analysis={analysisWorking ? null : analysis}
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

/**
 * Where the hand of the seat to call would be.
 *
 * Closed, it is a strip the height of a couple of cards that offers to open:
 * that is all four people at the table see between turns, and all anyone
 * sees who picks the phone up out of turn. Opening it is the one deliberate
 * act, and it puts up the cards and, in the call menu below, what SAYC makes
 * of them. The whole thing folds shut again the moment a call is made.
 */
function HandSlot({
  seat,
  hand,
  reveal,
  working,
  onEnter,
  onShow,
  onClose,
  onForget,
}: {
  seat: Position;
  hand?: Hand;
  reveal: Reveal;
  /** The calls are being weighed against the hand. */
  working: boolean;
  onEnter: () => void;
  onShow: () => void;
  onClose: () => void;
  onForget: () => void;
}) {
  const name = POSITION_NAMES[seat];

  if (reveal === "closed") {
    return (
      <button
        type="button"
        onClick={hand ? onShow : onEnter}
        className={`${CARD} flex min-h-20 w-full flex-col items-center justify-center gap-0.5 p-3 text-center transition-colors hover:bg-gray-50`}
        data-testid="hand-slot"
      >
        <span className="font-semibold text-emerald-800">
          {hand ? `Show ${name}'s hand` : `Enter ${name}'s hand`}
        </span>
        <span className="text-xs text-gray-500">
          {hand
            ? `${name} is to call. The cards stay hidden until ${name} asks.`
            : `${name} is to call. Explore can say what to bid with them.`}
        </span>
      </button>
    );
  }

  return (
    <div className={`${CARD} flex flex-col gap-2 p-3`} data-testid="hand-slot">
      {/* Everything that acts on the hand sits in one row above it. */}
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <span className={EYEBROW}>{name}</span>
        <div className="flex items-baseline gap-4">
          <button type="button" onClick={onEnter} className={TEXT_BUTTON}>
            Edit
          </button>
          <button type="button" onClick={onForget} className={TEXT_BUTTON}>
            Forget
          </button>
          <button type="button" onClick={onClose} className={TEXT_BUTTON}>
            Hide
          </button>
        </div>
      </div>

      {hand && <CardFan hand={hand} framed={false} />}

      {working && (
        <p className="text-center text-xs text-gray-500">
          Weighing the calls against these cards...
        </p>
      )}
    </div>
  );
}
