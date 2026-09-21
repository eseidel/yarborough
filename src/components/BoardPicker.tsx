import {
  type Position,
  POSITION_NAMES,
  vulnerabilityFromBoardNumber,
  vulnerabilityLabel,
} from "../bridge/types";
import { dealerFromBoardNumber } from "../bridge/identifier";
import { CARD } from "./ui";

/** The boards of one round of a duplicate set, which is what a number means. */
export const BOARD_NUMBERS = Array.from(
  { length: 16 },
  (_, index) => index + 1,
);

/**
 * Which board is being explored.
 *
 * A board number is only worth anything for what it decides -- who deals and
 * who is vulnerable -- so the line says that, and the number itself is a
 * dropdown: one control that works the same under a thumb and under a mouse,
 * and that costs one line whether or not anyone opens it.
 */
export function BoardPicker({
  boardNumber,
  onSelect,
}: {
  boardNumber: number;
  onSelect: (boardNumber: number) => void;
}) {
  const dealer: Position = dealerFromBoardNumber(boardNumber);
  const vulnerability = vulnerabilityFromBoardNumber(boardNumber);

  return (
    <div
      className={`${CARD} flex items-center gap-2 px-3 py-2 text-sm`}
      data-testid="board-picker"
    >
      <label htmlFor="board-number" className="sr-only">
        Board number
      </label>
      <select
        id="board-number"
        value={boardNumber}
        onChange={(event) => onSelect(Number(event.target.value))}
        className="min-h-9 rounded-lg border border-gray-200 bg-white px-2 font-semibold text-gray-900 tabular-nums"
      >
        {BOARD_NUMBERS.map((number) => (
          <option key={number} value={number}>
            Board {number}
          </option>
        ))}
      </select>
      <span className="text-gray-600">
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
    </div>
  );
}
