import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  type Hand,
  type SuitName,
  FAN_SUIT_ORDER,
  SUITS,
  cardsBySuit,
  displayRank,
} from "../bridge";
import {
  type HandEntry,
  HONOR_RANKS,
  MAX_SMALL,
  allCounted,
  entryTotal,
  handFromEntry,
  isComplete,
  nextSuit,
  setSmall,
  suitLength,
  toggleHonor,
} from "../bridge/hand-entry";
import { MiniCard } from "./CardFan";
import { QUIET_BUTTON } from "./ui";

const SUIT_NAMES: Record<SuitName, string> = {
  S: "Spades",
  H: "Hearts",
  D: "Diamonds",
  C: "Clubs",
};

/** A held honor is filled with its suit's own color. */
const HELD: Record<SuitName, string> = {
  C: "bg-blue-900",
  D: "bg-orange-600",
  H: "bg-red-600",
  S: "bg-black",
};

/** How long the whole hand stays in view before the sheet closes itself. */
export const FINISH_DELAY_MS = 420;
/** How long the sheet takes to slide away. */
export const SLIDE_MS = 220;
/** How far down the sheet has to be dragged to dismiss it. */
const DISMISS_DRAG_PX = 80;

type Closing = "done" | "cancel" | "forget";

/** What is wrong with a hand whose suits are all counted, if anything. */
function miscount(total: number): string {
  const off = Math.abs(total - 13);
  const amount = off === 1 ? "one" : String(off);
  return total > 13
    ? `${total} cards, ${amount} too many`
    : `${total} cards, ${amount} short`;
}

/**
 * Entering the hand of the seat to call, one suit at a time: tap the honors
 * held, then how many small cards. The count moves on to the next suit, and
 * counting the last suit of a thirteen-card hand closes the sheet, so a hand
 * is about eight taps with nothing to confirm.
 *
 * A miscount does not stop the entry: a suit given a card too many takes it,
 * the player enters the rest, and the sheet stays open saying the hand has
 * fourteen cards until a tap on the wrong suit in the fan puts it right.
 *
 * Opened on a finished hand (`editing`), the count stays on its suit, and
 * the sheet closes when a change makes the hand whole again.
 */
export function HandEntrySheet({
  seatName,
  initial,
  editing,
  onDone,
  onCancel,
  onForget,
}: {
  seatName: string;
  initial: HandEntry;
  editing: boolean;
  onDone: (hand: Hand) => void;
  /** Dismissed without finishing: the entry as it stands. */
  onCancel: (entry: HandEntry) => void;
  onForget?: () => void;
}) {
  const [entry, setEntry] = useState(initial);
  const [suit, setSuit] = useState<SuitName>(() =>
    editing
      ? "S"
      : (FAN_SUIT_ORDER.find((s) => initial[s].small === null) ?? "S"),
  );
  const [entered, setEntered] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [closing, setClosing] = useState<Closing | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);
  // The page passes fresh callbacks on every render; the closing timer must
  // not restart for each of them.
  const callbacks = useRef({ onDone, onCancel, onForget });
  useEffect(() => {
    callbacks.current = { onDone, onCancel, onForget };
  });

  // Slide in once mounted, so the transform has somewhere to come from.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!finishing) return;
    const timer = setTimeout(() => setClosing("done"), FINISH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [finishing]);

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => {
      const { onDone, onCancel, onForget } = callbacks.current;
      if (closing === "done") onDone(handFromEntry(entry));
      else if (closing === "forget") onForget?.();
      else onCancel(entry);
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [closing, entry]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setClosing((c) => c ?? "cancel");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const busy = finishing || closing !== null;
  const shown = entered && closing === null;
  const total = entryTotal(entry);
  const problem =
    total > 13 || (allCounted(entry) && total < 13) ? miscount(total) : null;

  function apply(next: HandEntry, counted: boolean) {
    if (busy || next === entry) return;
    try {
      navigator.vibrate?.(6);
    } catch {
      // Haptics are a nicety; a browser that refuses them loses nothing.
    }
    setEntry(next);
    if (!isComplete(entry) && isComplete(next)) {
      setFinishing(true);
    } else if (counted && !editing) {
      const following = nextSuit(next, suit);
      if (following) setSuit(following);
    }
  }

  function onGrabDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    dragFrom.current = event.clientY;
    setDrag(0);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Without capture the drag still works while the pointer stays on it.
    }
  }
  function onGrabMove(event: PointerEvent<HTMLDivElement>) {
    if (dragFrom.current === null) return;
    setDrag(Math.max(0, event.clientY - dragFrom.current));
  }
  function onGrabUp() {
    if (dragFrom.current === null) return;
    dragFrom.current = null;
    if ((drag ?? 0) > DISMISS_DRAG_PX) setClosing("cancel");
    setDrag(null);
  }

  const hand = handFromEntry(entry);
  const bySuit = cardsBySuit(hand);
  const current = entry[suit];
  const color = SUITS[suit].color;

  return (
    <div className="fixed inset-0 z-40">
      <div
        className={`absolute inset-0 bg-gray-900/30 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={() => !busy && setClosing("cancel")}
        data-testid="sheet-scrim"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${seatName}'s hand`}
        data-testid="hand-entry"
        className={`absolute inset-x-0 bottom-0 mx-auto max-w-2xl rounded-t-2xl bg-white pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] ${drag === null ? "transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]" : ""}`}
        style={{
          transform: shown
            ? `translateY(${drag ?? 0}px)`
            : "translateY(calc(100% + 48px))",
        }}
      >
        <div
          className="flex cursor-grab touch-none flex-col px-3 pt-2 pl-[18px]"
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
        >
          <span className="mb-1.5 h-[5px] w-9 self-center rounded-full bg-gray-300" />
          <div className="flex min-h-9 items-center">
            <h2 className="text-[17px] font-semibold text-gray-900">
              {seatName}
            </h2>
            <span className="ml-auto flex items-center gap-1">
              {onForget && (
                <button
                  type="button"
                  className={QUIET_BUTTON}
                  onClick={() => !busy && setClosing("forget")}
                >
                  Forget
                </button>
              )}
              <button
                type="button"
                aria-label="Cancel"
                onClick={() => !busy && setClosing("cancel")}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 active:bg-gray-200"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
                  <path
                    d="M5 5l10 10M15 5 5 15"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </span>
          </div>
        </div>

        <div
          className="flex min-h-[76px] items-end gap-1.5 px-3 pt-3 pb-1.5"
          data-testid="entry-fan"
        >
          {FAN_SUIT_ORDER.map((s) => {
            const cards = bySuit[s];
            const counted = entry[s].small !== null;
            return (
              <button
                key={s}
                type="button"
                aria-label={SUIT_NAMES[s]}
                aria-current={s === suit}
                onClick={() => setSuit(s)}
                className={`relative flex min-w-0 rounded-t-md px-0.5 pb-2 after:absolute after:inset-x-1 after:bottom-0 after:h-[3px] after:rounded-full after:transition-colors ${s === suit ? "after:bg-emerald-700" : "after:bg-transparent"}`}
              >
                {cards.length ? (
                  // As in the seat's fan, every card but the last sits in a
                  // slot that narrows when a miscounted hand needs the room.
                  cards.map((card, i) => (
                    <span
                      key={card.rank}
                      className={
                        i < cards.length - 1
                          ? "min-w-0 flex-1 basis-4 max-w-4"
                          : "shrink-0"
                      }
                    >
                      <MiniCard card={card} small className="animate-deal" />
                    </span>
                  ))
                ) : (
                  <span
                    className={`flex h-14 items-center justify-center rounded-md ${SUITS[s].color} ${counted ? "w-7 text-sm text-gray-400" : "w-10 border-[1.5px] border-dashed border-gray-300 text-lg opacity-60"}`}
                  >
                    {counted ? "—" : SUITS[s].symbol}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div key={suit} className="animate-deal">
          <div
            className={`flex items-baseline gap-2 px-[18px] pt-2.5 pb-2 text-[15px] font-semibold ${color}`}
          >
            <span className="text-xl leading-none">{SUITS[suit].symbol}</span>
            {SUIT_NAMES[suit]}
            {problem && (
              <span
                className="ml-auto text-[13px] font-medium text-red-600"
                data-testid="miscount"
              >
                {problem}
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-1.5 px-3">
            {HONOR_RANKS.map((rank) => {
              const held = current.honors.includes(rank);
              return (
                <button
                  key={rank}
                  type="button"
                  aria-pressed={held}
                  aria-label={`${displayRank(rank)} of ${SUIT_NAMES[suit].toLowerCase()}`}
                  onClick={() => apply(toggleHonor(entry, suit, rank), false)}
                  className={`h-14 rounded-xl border text-[22px] font-semibold shadow-[0_1px_0_rgba(0,0,0,0.04)] transition active:scale-95 ${held ? `${HELD[suit]} border-transparent text-white` : `border-gray-200 bg-white ${color}`}`}
                >
                  {displayRank(rank)}
                </button>
              );
            })}
          </div>
          <div
            className="px-[18px] pt-3.5 pb-1.5 text-[13px] text-gray-600"
            id="small-cards-label"
          >
            How many small cards?{" "}
            <span className="text-gray-400">9 down to 2</span>
          </div>
          {/* A count, not a card: a selector on a track, unlike the keys. */}
          <div
            role="radiogroup"
            aria-labelledby="small-cards-label"
            className="mx-3 grid grid-cols-9 rounded-xl bg-gray-100 p-1"
          >
            {Array.from({ length: MAX_SMALL + 1 }, (_, count) => {
              const chosen = current.small === count;
              return (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  aria-label={`${count} small ${count === 1 ? "card" : "cards"}`}
                  onClick={() => apply(setSmall(entry, suit, count), true)}
                  className={`h-11 rounded-lg text-[17px] font-semibold tabular-nums transition ${chosen ? "bg-white text-emerald-800 shadow-sm ring-1 ring-black/5" : "text-gray-500 active:bg-gray-200"}`}
                >
                  {count}
                </button>
              );
            })}
          </div>
        </div>
        <span className="sr-only" aria-live="polite">
          {`${suitLength(entry, suit)} ${SUIT_NAMES[suit].toLowerCase()}, ${total} of 13 cards${problem ? `: ${problem}` : ""}`}
        </span>
      </div>
    </div>
  );
}
