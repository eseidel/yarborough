import type { Position, Vulnerability } from "../bridge/types";
import { POSITION_NAMES } from "../bridge/types";
import type { DealType } from "../bridge/identifier";
import { FOCUS_OPTIONS, focusLabel } from "../practice/focus";

function vulnerabilityWords(vulnerability: Vulnerability): string {
  switch (vulnerability) {
    case "None":
      return "Nobody vulnerable";
    case "NS":
      return "N-S vulnerable";
    case "EW":
      return "E-W vulnerable";
    case "Both":
      return "Both vulnerable";
  }
}

/**
 * The board line and the practice focus. A focus change takes effect at once
 * when nothing has been bid yet; otherwise it waits for the next hand and
 * the row says so.
 */
export function PracticeHeader({
  boardNumber,
  dealer,
  vulnerability,
  focus,
  pendingFocus,
  onFocusChange,
}: {
  boardNumber: number;
  dealer: Position;
  vulnerability: Vulnerability;
  focus: DealType;
  /** A focus chosen mid-hand, to be used for the next deal. */
  pendingFocus: DealType | null;
  onFocusChange: (focus: DealType) => void;
}) {
  const selected = pendingFocus ?? focus;
  return (
    <div className="space-y-2">
      <div
        className="text-center text-sm text-gray-600"
        data-testid="board-line"
      >
        <span className="font-semibold text-gray-800">Board {boardNumber}</span>
        {" · "}Dealer {POSITION_NAMES[dealer]}
        {" · "}
        <span className={vulnerability === "None" ? "" : "text-red-700"}>
          {vulnerabilityWords(vulnerability)}
        </span>
      </div>
      <div className="flex items-center justify-center gap-2">
        <label
          htmlFor="practice-focus"
          className="text-xs font-semibold text-gray-500 uppercase tracking-wider"
        >
          Focus
        </label>
        <select
          id="practice-focus"
          value={selected}
          onChange={(e) => onFocusChange(e.target.value as DealType)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-700 bg-white border border-gray-200 shadow-sm hover:border-gray-300"
        >
          {FOCUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {pendingFocus && pendingFocus !== focus && (
        <div
          className="text-center text-xs text-gray-500"
          data-testid="pending-focus"
        >
          Next hand: {focusLabel(pendingFocus)}
        </div>
      )}
    </div>
  );
}
