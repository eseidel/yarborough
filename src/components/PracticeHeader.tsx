import type { Position, Vulnerability } from "../bridge/types";
import { POSITION_NAMES } from "../bridge/types";
import type { HandSource } from "../practice/record/types";
import { SOURCE_OPTIONS, focusLabel } from "../practice/focus";

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

const ADAPTIVE_DISABLED_REASON =
  "Bid a few more hands first; this aims at what you have been missing.";

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
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-sm text-gray-600">
        <span className="min-w-0" data-testid="board-line">
          <span className="font-semibold text-gray-800">{boardNumber}</span>
          {" · "}
          {POSITION_NAMES[dealer]}
          {" · "}
          <span className={vulnerability === "None" ? "" : "text-red-700"}>
            {vulnerabilityWords(vulnerability)}
          </span>
        </span>
        <select
          aria-label="Focus"
          value={selected}
          onChange={(e) => onFocusChange(e.target.value as HandSource)}
          className="shrink-0 px-2 py-1 rounded-full text-xs font-semibold text-emerald-700 bg-white border border-gray-200 shadow-sm hover:border-gray-300"
        >
          {SOURCE_OPTIONS.map((option) => {
            const disabled = option.value === "Adaptive" && !adaptive.available;
            return (
              <option
                key={option.value}
                value={option.value}
                disabled={disabled}
                title={disabled ? ADAPTIVE_DISABLED_REASON : undefined}
              >
                {option.label}
              </option>
            );
          })}
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
