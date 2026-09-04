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
      <div
        className="flex flex-wrap items-center justify-center gap-1.5"
        role="group"
        aria-label="Practice focus"
      >
        {FOCUS_OPTIONS.map((option) => {
          const active = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onFocusChange(option.value)}
              aria-pressed={active}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                active
                  ? "bg-emerald-700 border-emerald-700 text-white shadow-sm"
                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {option.label}
            </button>
          );
        })}
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
