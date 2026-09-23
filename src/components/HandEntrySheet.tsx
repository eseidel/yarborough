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

/** How long the sheet takes to slide away. */
export const SLIDE_MS = 220;
/** How far down the sheet has to be dragged to dismiss it. */
const DISMISS_DRAG_PX = 80;

type Closing = "done" | "cancel" | "forget";

/**
 * The spot-card row: 12px a side and 8px between the cards. The tray holds
 * the cards held with 4px all round, which leaves the same 4px between the
 * tray and the next card.
 */
const SPOT_GAP_PX = 8;
const TRAY_PAD_PX = 4;
const TRAY_GRID_PX = 12 * 2 + 7 * SPOT_GAP_PX;

/**
 * The face of one spot card: x for its rank, its suit's pip. Lit, it is a
 * card that rises into place after `delay`, fixed when it first appears so a
 * later render cannot restart it.
 */
function SpotFace({
  lit,
  delay,
  symbol,
}: {
  lit: boolean;
  delay: number;
  symbol: string;
}) {
  const [rise] = useState(delay);
  return (
    <span
      aria-hidden
      className={`absolute -inset-px rounded-md ${lit ? "animate-deal border border-gray-300 bg-white shadow-sm" : "opacity-30"}`}
      style={
        lit
          ? { animationDelay: `${rise}ms`, animationFillMode: "backwards" }
          : undefined
      }
    >
      <span className="absolute top-0.5 left-1 text-[15px] leading-none font-semibold">
        x
      </span>
      <span className="absolute right-0.5 bottom-0 text-3xl leading-none">
        {symbol}
      </span>
    </span>
  );
}

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
 * held, then the spot cards, drawn as a row of x cards of the suit. A tap on
 * the third holds three of them, and a finger can slide along the row too.
 * The first spot cards of a suit move the entry on to the next suit; the
 * check lights up once the hand has thirteen cards, and the player confirms
 * it there. Tapping above the sheet or pulling it down puts it away.
 *
 * A miscount does not stop the entry: a suit given a card too many takes it,
 * the player enters the rest, and the sheet says the hand has fourteen cards
 * until a tap on the wrong suit in the fan puts it right.
 *
 * Opened on a finished hand (`editing`), the entry stays on its suit.
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

  const busy = closing !== null;
  const shown = entered && closing === null;
  const total = entryTotal(entry);
  const complete = isComplete(entry);
  const problem =
    total > 13 || (allCounted(entry) && total < 13) ? miscount(total) : null;

  function buzz() {
    try {
      navigator.vibrate?.(6);
    } catch {
      // Haptics are a nicety; a browser that refuses them loses nothing.
    }
  }

  function apply(next: HandEntry) {
    if (busy || next === entry) return;
    buzz();
    setEntry(next);
  }

  /**
   * Hold `count` small cards of the suit. The first count a suit is given
   * moves on to the next suit.
   */
  function holdSmall(count: number) {
    if (busy) return;
    const first = entry[suit].small === null;
    const next = setSmall(entry, suit, count);
    apply(next);
    if (first && !editing) {
      const following = nextSuit(next, suit);
      if (following) setSuit(following);
    }
  }

  /** A tap on a spot card holds up to it; on the last one held, gives it back. */
  function tapSmall(count: number) {
    holdSmall(entry[suit].small === count ? count - 1 : count);
  }

  // A finger can also slide along the spot cards: the run it covers lights
  // up as it goes, and lifting the finger holds that many.
  const rowRef = useRef<HTMLDivElement>(null);
  const scrub = useRef<{ start: number; moved: boolean } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  function countAt(clientX: number): number {
    const cards = rowRef.current?.querySelectorAll("button") ?? [];
    let count = 0;
    cards.forEach((card, i) => {
      if (clientX >= card.getBoundingClientRect().left) count = i + 1;
    });
    return count;
  }
  function onRowDown(event: PointerEvent<HTMLDivElement>) {
    if (busy) return;
    const count = countAt(event.clientX);
    if (!count) return;
    scrub.current = { start: count, moved: false };
    setPreview(count);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Without capture the slide still works while the finger stays on it.
    }
  }
  function onRowMove(event: PointerEvent<HTMLDivElement>) {
    if (!scrub.current) return;
    const count = countAt(event.clientX);
    if (count !== preview) {
      scrub.current.moved = true;
      setPreview(count);
      buzz();
    }
  }
  function onRowUp() {
    if (!scrub.current) return;
    const { start, moved } = scrub.current;
    scrub.current = null;
    setPreview(null);
    if (moved) holdSmall(preview ?? 0);
    else tapSmall(start);
  }
  function onRowCancel() {
    scrub.current = null;
    setPreview(null);
  }

  // The spot cards already standing when a change came, so that the ones it
  // adds rise one after another, left to right.
  const shownSmall = preview ?? entry[suit].small ?? 0;
  const [rising, setRising] = useState({ suit, count: shownSmall, from: 0 });
  if (rising.suit !== suit || rising.count !== shownSmall) {
    setRising({
      suit,
      count: shownSmall,
      from: rising.suit === suit ? rising.count : 0,
    });
  }
  const risingFrom = rising.from;

  function done() {
    if (busy || !complete) return;
    buzz();
    setClosing("done");
  }

  // Enter confirms a whole hand, for the odd player with a keyboard.
  const doneRef = useRef(done);
  useEffect(() => {
    doneRef.current = done;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") doneRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
          <div className="flex min-h-10 items-center">
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
                aria-label="Done"
                disabled={!complete}
                onClick={done}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${complete ? "bg-emerald-700 text-white shadow-sm active:bg-emerald-800" : "bg-gray-100 text-gray-300"}`}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
                  <path
                    d="m4 10.5 4 4 8-9"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
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
                  onClick={() => apply(toggleHonor(entry, suit, rank))}
                  className={`h-14 rounded-xl border text-[22px] font-semibold shadow-[0_1px_0_rgba(0,0,0,0.04)] transition active:scale-95 ${held ? `${HELD[suit]} border-transparent text-white` : `border-gray-200 bg-white ${color}`}`}
                >
                  {displayRank(rank)}
                </button>
              );
            })}
          </div>
          {/*
           * The spot cards, x for their rank as in a bridge diagram: the ones
           * held stand as cards on a tray that runs from the first of them,
           * the rest wait as outlines. Holding the fourth fills the tray to
           * it, four cards rising in turn, so the row reads as a number of
           * cards without a label or a digit that could pass for a rank.
           */}
          <div
            ref={rowRef}
            className="relative grid touch-none grid-cols-8 gap-2 px-3 pt-3 pb-1"
            data-testid="small-cards"
            onPointerDown={onRowDown}
            onPointerMove={onRowMove}
            onPointerUp={onRowUp}
            onPointerCancel={onRowCancel}
          >
            <span
              aria-hidden
              data-testid="small-tray"
              data-count={shownSmall}
              className="absolute top-2 left-2 h-16 rounded-[10px] bg-emerald-700/10 ring-1 ring-emerald-700/15 ring-inset transition-[width,opacity] duration-150 ease-out"
              style={{
                // The cards held, a column of the grid each, and the gaps
                // between them, with the tray's own padding either side.
                width: `calc((100% - ${TRAY_GRID_PX}px) / 8 * ${shownSmall} + ${Math.max(0, shownSmall - 1) * SPOT_GAP_PX + 2 * TRAY_PAD_PX}px)`,
                opacity: shownSmall ? 1 : 0,
              }}
            />
            {Array.from({ length: MAX_SMALL }, (_, i) => {
              const count = i + 1;
              const held = count <= (current.small ?? 0);
              const lit = count <= shownSmall;
              return (
                <button
                  key={count}
                  type="button"
                  aria-pressed={held}
                  aria-label={`${count} small ${count === 1 ? "card" : "cards"}`}
                  // A finger is handled by the row; this is for keys.
                  onClick={(event) => event.detail === 0 && tapSmall(count)}
                  className={`relative h-14 rounded-md border-[1.5px] border-dashed border-gray-300 ${color}`}
                >
                  <SpotFace
                    key={lit ? `lit-${suit}` : "ghost"}
                    lit={lit}
                    delay={
                      lit && count > risingFrom
                        ? (count - risingFrom - 1) * 45
                        : 0
                    }
                    symbol={SUITS[suit].symbol}
                  />
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
