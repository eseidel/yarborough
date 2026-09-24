import { type Hand, type Position, POSITION_NAMES } from "../bridge";
import { Fan } from "./CardFan";
import { CARD, EYEBROW, QUIET_BUTTON } from "./ui";

/** Thirteen card backs: a hand is here, and nothing about it shows. */
function CardBacks() {
  return (
    <span className="relative block h-[38px] w-[98px] shrink-0" aria-hidden>
      {Array.from({ length: 13 }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 h-[38px] w-[26px] rounded border-2 border-white bg-emerald-800 shadow-[0_0_0_1px_rgba(6,95,70,0.35),0_1px_2px_rgba(0,0,0,0.12)]"
          style={{
            left: i * 6,
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.14) 0 2px, transparent 2px 5px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.14) 0 2px, transparent 2px 5px)",
          }}
        />
      ))}
    </span>
  );
}

/** Three blank cards, the invitation's picture. */
function GhostCards() {
  return (
    <span className="relative block h-9 w-11 shrink-0" aria-hidden>
      {[-8, 0, 8].map((turn, i) => (
        <span
          key={turn}
          className="absolute top-0.5 h-8 w-6 rounded border-[1.5px] border-gray-300 bg-white"
          style={{ left: i * 9, transform: `rotate(${turn}deg)` }}
        />
      ))}
    </span>
  );
}

/**
 * The hand of the seat to call, between the auction and the calls.
 *
 * The phone goes round the table, so what this shows depends on the seat
 * asking: an invitation when the seat has entered nothing, the backs of its
 * cards when it has, and its cards only once someone taps them. The page
 * turns them face down again on every call.
 *
 * Each of these arrives with a fade, keyed so that one replacing another
 * starts afresh, and none of them lingers on its way out: face down is at
 * once.
 */
export function SeatHand({
  seat,
  hand,
  shown,
  weighing = false,
  onEnter,
  onShow,
  onHide,
  onEdit,
}: {
  seat: Position;
  hand?: Hand;
  shown: boolean;
  /** The engine is still weighing the calls against these cards. */
  weighing?: boolean;
  onEnter: () => void;
  onShow: () => void;
  onHide: () => void;
  onEdit: () => void;
}) {
  const name = POSITION_NAMES[seat];

  if (!hand) {
    return (
      <button
        key="enter"
        type="button"
        onClick={onEnter}
        className="animate-fade flex w-full items-center gap-3 rounded-xl border-[1.5px] border-dashed border-gray-300 px-3.5 py-3 text-left transition-colors hover:bg-gray-100/70 active:bg-gray-100"
      >
        <GhostCards />
        <span>
          <span className="block text-[15px] font-semibold text-emerald-700">
            Enter {name}'s hand
          </span>
          <span className="block text-xs text-gray-500">
            See what SAYC bids with it, and why
          </span>
        </span>
      </button>
    );
  }

  if (!shown) {
    return (
      <button
        key="backs"
        type="button"
        onClick={onShow}
        aria-label={`Show ${name}'s hand`}
        className={`${CARD} animate-fade flex w-full items-center gap-3.5 px-3.5 py-3 text-left active:bg-gray-50`}
      >
        <CardBacks />
        <span className="text-[15px] font-semibold text-gray-900">
          {name}'s hand
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
          >
            <path
              d="M1.8 10S4.8 4.5 10 4.5 18.2 10 18.2 10 15.2 15.5 10 15.5 1.8 10 1.8 10Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <circle
              cx="10"
              cy="10"
              r="2.4"
              stroke="currentColor"
              strokeWidth="1.7"
            />
          </svg>
          Show
        </span>
      </button>
    );
  }

  return (
    <section
      key="cards"
      className={`${CARD} animate-fade px-3.5 pt-1.5 pb-3`}
      data-testid={`hand-${seat}`}
    >
      <div className="flex min-h-9 items-center">
        <span className={EYEBROW}>{name}</span>
        {weighing && (
          <span className="animate-fade-late ml-2 text-xs text-gray-400">
            <span className="animate-pulse">Weighing the calls…</span>
          </span>
        )}
        <span className="-mr-2 ml-auto flex">
          <button type="button" className={QUIET_BUTTON} onClick={onEdit}>
            Edit
          </button>
          <button type="button" className={QUIET_BUTTON} onClick={onHide}>
            Hide
          </button>
        </span>
      </div>
      <Fan hand={hand} small />
    </section>
  );
}
