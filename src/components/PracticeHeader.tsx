import type { Position, Vulnerability } from "../bridge/types";
import { POSITION_NAMES } from "../bridge/types";
import type { HandSource } from "../practice/record/types";
import { ADAPTIVE_OPTION, FOCUS_OPTIONS, focusLabel } from "../practice/focus";

export interface AdaptiveState {
  /** There is at least one weak spot to aim at. */
  available: boolean;
  /** Aimed at one weak spot chosen on the Progress tab. */
  pinned: boolean;
  /** "To 1NT and Takeout doubles". */
  targetsLabel: string;
  /** The family of call this board was dealt to practice, if any. */
  practicing: string | null;
  searching: boolean;
  fallback: boolean;
}

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
  adaptive,
  onShowAllWeakSpots,
}: {
  boardNumber: number;
  dealer: Position;
  vulnerability: Vulnerability;
  focus: HandSource;
  /** A focus chosen mid-hand, to be used for the next deal. */
  pendingFocus: HandSource | null;
  onFocusChange: (focus: HandSource) => void;
  adaptive: AdaptiveState;
  onShowAllWeakSpots: () => void;
}) {
  const selected = pendingFocus ?? focus;
  const options = [...FOCUS_OPTIONS, ADAPTIVE_OPTION];
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
        {options.map((option) => {
          const active = selected === option.value;
          const disabled = option.value === "Adaptive" && !adaptive.available;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onFocusChange(option.value)}
              aria-pressed={active}
              disabled={disabled}
              title={
                disabled
                  ? "Bid a few more hands first; this aims at what you have been missing."
                  : undefined
              }
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                active
                  ? "bg-emerald-700 border-emerald-700 text-white shadow-sm"
                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
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
      {selected === "Adaptive" && (
        <div
          className="text-center text-xs text-gray-600"
          data-testid="adaptive-status"
        >
          {adaptive.searching ? (
            <span className="animate-pulse">
              Finding a hand that practices {adaptive.targetsLabel}…
            </span>
          ) : adaptive.fallback ? (
            <>
              No hand for {adaptive.targetsLabel} turned up in time, so this one
              is random.
            </>
          ) : adaptive.practicing ? (
            <>
              This hand practices{" "}
              <span className="font-semibold">{adaptive.practicing}</span>.
            </>
          ) : (
            <>Aiming at {adaptive.targetsLabel}.</>
          )}
          {adaptive.pinned && (
            <>
              {" "}
              <button
                type="button"
                onClick={onShowAllWeakSpots}
                className="text-emerald-700 hover:underline"
              >
                All weak spots
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
