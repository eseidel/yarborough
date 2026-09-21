import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Position,
  POSITION_NAMES,
  vulnerabilityFromBoardNumber,
  vulnerabilityLabel,
} from "../bridge/types";
import { dealerFromBoardNumber } from "../bridge/identifier";
import { CARD, TEXT_BUTTON } from "./ui";

/** The boards of one round of a duplicate set, which is what a number means. */
export const BOARD_NUMBERS = Array.from(
  { length: 16 },
  (_, index) => index + 1,
);

/** How long the strip has to sit still before a flick counts as a choice. */
const SETTLE_MS = 120;

/**
 * Which board is being explored, and the strip for changing it.
 *
 * A board number is only worth anything for what it decides -- who deals and
 * who is vulnerable -- so the line always says that, and the sixteen numbers
 * stay folded away until someone wants a different board. Open, a chip is a
 * button that picks its board, and the strip also scrolls: flicking it
 * settles on whichever chip ends up under the middle. Either way round, the
 * chip in the middle is the board being explored.
 */
export function BoardPicker({
  boardNumber,
  onSelect,
}: {
  boardNumber: number;
  onSelect: (boardNumber: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const settling = useRef<number | null>(null);

  const centre = useCallback((number: number, smooth: boolean) => {
    const strip = stripRef.current;
    const chip = strip?.querySelector<HTMLElement>(`[data-board="${number}"]`);
    // jsdom has no scrolling, so there the strip simply does not move.
    chip?.scrollIntoView?.({
      behavior: smooth ? "smooth" : "auto",
      block: "nearest",
      inline: "center",
    });
  }, []);

  // Opening the strip puts the board being explored under the middle.
  useEffect(() => {
    if (open) centre(boardNumber, false);
    // Only on opening: afterwards the strip follows the finger, and
    // re-centring on every change would fight a scroll in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(
    () => () => {
      if (settling.current !== null) window.clearTimeout(settling.current);
    },
    [],
  );

  const cancelSettle = useCallback(() => {
    if (settling.current !== null) {
      window.clearTimeout(settling.current);
      settling.current = null;
    }
  }, []);

  const handleScroll = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const middle = strip.scrollLeft + strip.clientWidth / 2;
    let nearest = boardNumber;
    let best = Infinity;
    for (const chip of strip.children as Iterable<HTMLElement>) {
      const distance = Math.abs(
        chip.offsetLeft + chip.offsetWidth / 2 - middle,
      );
      if (distance < best) {
        best = distance;
        nearest = Number(chip.dataset.board);
      }
    }
    // The strip reports every frame of a flick; the board changes once it
    // has settled, so a flick past six boards is one navigation, not six.
    cancelSettle();
    if (nearest !== boardNumber) {
      settling.current = window.setTimeout(() => onSelect(nearest), SETTLE_MS);
    }
  }, [boardNumber, cancelSettle, onSelect]);

  const handlePick = useCallback(
    (number: number) => {
      // A chip is a button first: a mouse has no flick, and a tap that only
      // scrolled the strip left the board unchanged on any browser that does
      // not animate scrolling. Selecting outright makes the two gestures
      // agree, and the smooth scroll afterwards shows which chip won.
      cancelSettle();
      if (number !== boardNumber) onSelect(number);
      centre(number, true);
    },
    [boardNumber, cancelSettle, centre, onSelect],
  );

  const dealer: Position = dealerFromBoardNumber(boardNumber);
  const vulnerability = vulnerabilityFromBoardNumber(boardNumber);

  return (
    <div className={`${CARD} px-3 py-2`} data-testid="board-picker">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-gray-600">
          <span className="font-semibold text-gray-900">
            Board {boardNumber}
          </span>
          {" · "}
          {POSITION_NAMES[dealer]} deals
          {" · "}
          <span
            className={
              vulnerability === "None" ? "" : "font-semibold text-red-700"
            }
          >
            {vulnerabilityLabel(vulnerability)}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-expanded={open}
          className={TEXT_BUTTON}
        >
          {open ? "Done" : "Change"}
        </button>
      </div>

      {open && (
        <div
          ref={stripRef}
          onScroll={handleScroll}
          role="radiogroup"
          aria-label="Board number"
          // The half-width padding is what lets the first and last chips
          // reach the middle of the strip.
          className="-mx-3 mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto px-[50%] pb-1 [scrollbar-width:none]"
        >
          {BOARD_NUMBERS.map((number) => (
            <button
              key={number}
              type="button"
              role="radio"
              data-board={number}
              aria-checked={number === boardNumber}
              aria-label={`Board ${number}`}
              onClick={() => handlePick(number)}
              className={`h-11 w-11 shrink-0 snap-center rounded-lg border text-base font-semibold tabular-nums transition-transform ${
                number === boardNumber
                  ? "scale-110 border-emerald-700 bg-emerald-700 text-white"
                  : "border-gray-200 bg-white text-gray-600"
              }`}
            >
              {number}
            </button>
          ))}
        </div>
      )}
      {open && (
        <p className="mt-1 text-center text-xs text-gray-500">
          Tap a number, or swipe the strip.
        </p>
      )}
    </div>
  );
}
