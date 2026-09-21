import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Card,
  type Hand,
  type Position,
  type SuitName,
  FAN_SUIT_ORDER,
  POSITION_NAMES,
  RANK_ORDER,
  SUITS,
  displayRank,
} from "../bridge/types";
import {
  type CardKey,
  cardKey,
  handFromKeys,
  isComplete,
  toggleCard,
} from "../bridge/hand-entry";
import { MiniCard } from "./CardFan";
import { CARD, EYEBROW, TEXT_BUTTON } from "./ui";

/**
 * The deck's four colors, in the three places a row needs them. Tailwind
 * only sees class names it can read in the source, so they are spelled out.
 */
const SUIT_STYLE: Record<
  SuitName,
  {
    /** The cell once the card is taken, and the rail down the row. */
    fill: string;
  }
> = {
  S: { fill: "bg-black" },
  H: { fill: "bg-red-600" },
  D: { fill: "bg-orange-600" },
  C: { fill: "bg-blue-900" },
};

/** How far up a card has to be dragged before it leaves the hand, in px. */
export const FLICK_DISTANCE = 26;

/**
 * A card in the entry's fan, which can be flicked out of the hand.
 *
 * The fan is where a wrong card is noticed, so it is where it is put back:
 * drag the card up and let go. The card follows the finger and fades on the
 * way, so the gesture says what it will do before it is finished.
 */
function FanCard({
  card,
  onRemove,
}: {
  card: Card;
  onRemove: (key: CardKey) => void;
}) {
  const [lift, setLift] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(0);

  // The finger leaves the card almost at once on a flick, so the drag is
  // followed on the window rather than on the element it started from. That
  // also means it works where a browser refuses to capture the pointer.
  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      setLift(Math.min(0, event.clientY - start.current));
    };
    const up = (event: PointerEvent) => {
      const moved = Math.min(0, event.clientY - start.current);
      setDragging(false);
      setLift(0);
      if (-moved >= FLICK_DISTANCE) onRemove(cardKey(card));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [card, dragging, onRemove]);

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`fan-card-${cardKey(card)}`}
      aria-label={`${displayRank(card.rank)} of ${SUITS[
        card.suit
      ].displayName.toLowerCase()}, flick up to put it back`}
      onPointerDown={(event) => {
        start.current = event.clientY;
        setDragging(true);
      }}
      onKeyDown={(event) => {
        if (
          event.key !== "Enter" &&
          event.key !== " " &&
          event.key !== "Backspace"
        ) {
          return;
        }
        event.preventDefault();
        onRemove(cardKey(card));
      }}
      className="touch-none"
      style={{
        transform: lift ? `translateY(${Math.round(lift)}px)` : undefined,
        opacity: lift ? Math.max(0.35, 1 + lift / 90) : undefined,
      }}
    >
      <MiniCard card={card} />
    </div>
  );
}

/**
 * The hand as it is being entered, in the same faces the rest of the app
 * deals. It is the only feedback the entry gives: no count and no point
 * total, because this is what gets held up beside the physical cards.
 */
function EntryFan({
  hand,
  onRemove,
}: {
  hand: Hand;
  onRemove: (key: CardKey) => void;
}) {
  return (
    <div className="flex min-h-19 items-center" data-testid="entry-fan">
      {hand.cards.length === 0 ? (
        <span className="px-1 text-sm text-gray-500">
          Your hand builds here as you take the cards.
        </span>
      ) : (
        <div className="flex w-full min-w-0 items-center">
          {hand.cards.map((card, index) => {
            const next = hand.cards[index + 1];
            return (
              <div key={cardKey(card)} className="flex min-w-0">
                <div
                  className={next ? "min-w-0 max-w-[21px] flex-1" : "shrink-0"}
                >
                  <FanCard card={card} onRemove={onRemove} />
                </div>
                {/* A gap between suits, so the fan reads as four holdings. */}
                {next && next.suit !== card.suit && (
                  <div className="w-[7px] shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Entering the thirteen cards of one seat's hand.
 *
 * The suits run down in the order the hand diagram prints them and the ranks
 * run ace to two across, the order they lie in the fan, so nothing has to be
 * translated between the screen and the cards in the player's other hand. The
 * four rows are 196px of the sheet, which leaves the auction visible above it
 * on every iPhone, so there is no reason to page a suit at a time.
 *
 * Dragging along a row takes the cards the finger crosses, which is one
 * movement for a run. The grid claims only the horizontal axis (`touch-pan-y`)
 * so the page still scrolls.
 */
export function HandEntry({
  position,
  initialHand,
  onDone,
  onCancel,
}: {
  position: Position;
  /** The seat's hand when it is being corrected rather than entered. */
  initialHand?: Hand;
  onDone: (hand: Hand) => void;
  onCancel: () => void;
}) {
  const [held, setHeld] = useState<ReadonlySet<CardKey>>(
    () => new Set((initialHand?.cards ?? []).map(cardKey)),
  );
  /** What the stroke in progress is doing to every card it crosses. */
  const painting = useRef<boolean | null>(null);
  const full = isComplete(held);

  const endStroke = useCallback(() => {
    painting.current = null;
  }, []);

  // A stroke that leaves the grid ends where the finger is lifted, which may
  // be anywhere. Pointer capture usually delivers that, but a browser can
  // refuse the capture, so the window is what actually ends every stroke.
  useEffect(() => {
    window.addEventListener("pointerup", endStroke);
    window.addEventListener("pointercancel", endStroke);
    return () => {
      window.removeEventListener("pointerup", endStroke);
      window.removeEventListener("pointercancel", endStroke);
    };
  }, [endStroke]);

  // The thirteenth card finishes the hand: there is nothing left to say and
  // nothing left to take. Opening a hand that is already thirteen does not
  // close it, since that is someone coming back to correct a card -- only
  // taking the card that completes the hand does.
  const completed = useRef(full);
  useEffect(() => {
    if (!full) {
      completed.current = false;
      return;
    }
    if (completed.current) return;
    completed.current = true;
    onDone(handFromKeys(held));
  }, [full, held, onDone]);

  const remove = useCallback((key: CardKey) => {
    setHeld((keys) => {
      if (!keys.has(key)) return keys;
      const next = new Set(keys);
      next.delete(key);
      return next;
    });
  }, []);

  const cardAt = useCallback((x: number, y: number): CardKey | null => {
    const element = document.elementFromPoint(x, y);
    const cell = element?.closest<HTMLButtonElement>("[data-card]");
    return cell && !cell.disabled ? (cell.dataset.card ?? null) : null;
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      const cell = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-card]",
      );
      const key = cell?.dataset.card;
      if (!key || cell.disabled) return;
      painting.current = !held.has(key);
      setHeld((keys) => toggleCard(keys, key));
      try {
        // Nice to have on a real finger; refused for a synthetic pointer, and
        // the window listener above covers that.
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // The stroke still ends on the window's pointerup.
      }
    },
    [held],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const taking = painting.current;
      if (taking === null) return;
      const key = cardAt(event.clientX, event.clientY);
      if (!key) return;
      setHeld((keys) =>
        keys.has(key) === taking ? keys : toggleCard(keys, key),
      );
    },
    [cardAt],
  );

  return (
    <div className={`${CARD} flex flex-col gap-2 p-2`} data-testid="hand-entry">
      {/* The seat's name and the way out, in the row the open hand uses. */}
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <span className={EYEBROW}>{POSITION_NAMES[position]}</span>
        <button type="button" onClick={onCancel} className={TEXT_BUTTON}>
          Cancel
        </button>
      </div>

      <EntryFan hand={handFromKeys(held)} onRemove={remove} />

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        className="-mx-2 flex touch-pan-y flex-col gap-px select-none"
        data-testid="rank-grid"
      >
        {FAN_SUIT_ORDER.map((suit) => (
          <SuitRow key={suit} suit={suit} held={held} full={full} />
        ))}
      </div>
    </div>
  );
}

/**
 * One suit's thirteen ranks, ace first.
 *
 * The suit gets no column of its own: at 18px it was costing more than a
 * card's width across the row, and the ranks carry it for free in the deck's
 * own four colors, with a rail down the left edge so the suit does not rest
 * on color alone. The order is the one every bridge player reads a hand in,
 * so it needs no label. That leaves about 25px a rank on an iPhone.
 */
function SuitRow({
  suit,
  held,
  full,
}: {
  suit: SuitName;
  held: ReadonlySet<CardKey>;
  full: boolean;
}) {
  const { fill } = SUIT_STYLE[suit];
  const { color, displayName } = SUITS[suit];
  return (
    <div
      role="group"
      aria-label={displayName}
      className="grid h-[46px] grid-cols-[3px_repeat(13,minmax(0,1fr))] gap-px"
      data-testid={`rank-row-${suit}`}
    >
      <div aria-hidden="true" className={`rounded-full ${fill}`} />
      {RANK_ORDER.map((rank) => {
        const key = suit + rank;
        const taken = held.has(key);
        return (
          <button
            key={rank}
            type="button"
            data-card={key}
            aria-pressed={taken}
            aria-label={`${displayRank(rank)} of ${displayName.toLowerCase()}`}
            disabled={full && !taken}
            className={`flex items-center justify-center rounded border text-sm font-semibold transition-colors disabled:opacity-30 ${
              taken
                ? `${fill} border-transparent text-white`
                : `border-gray-200 bg-white ${color}`
            }`}
          >
            {/* The rank as the deck writes it: a ten is a T, one glyph in a
                column 25px wide, where "10" reads as two cards. */}
            {rank}
          </button>
        );
      })}
    </div>
  );
}
