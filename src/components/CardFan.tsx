import {
  type Hand,
  type Card,
  type Position,
  SUITS,
  FAN_SUIT_ORDER,
  POSITION_NAMES,
  cardsBySuit,
  displayRank,
  highCardPoints,
} from "../bridge/types";

function MiniCard({ card }: { card: Card }) {
  const suit = SUITS[card.suit];
  return (
    <div
      className="relative w-10 h-14 bg-white rounded-md border border-gray-300 shadow-sm select-none shrink-0"
      data-testid="mini-card"
    >
      <span
        className={`${suit.color} absolute top-0 left-1 text-lg font-bold leading-none`}
      >
        {displayRank(card.rank)}
      </span>
      <span
        className={`${suit.color} absolute bottom-0 right-0.5 text-3xl leading-none`}
      >
        {suit.symbol}
      </span>
    </div>
  );
}

/**
 * One suit's cards, overlapped. Every card but the last sits in a slot that
 * is at most half a card wide and shrinks further when the row runs out of
 * room, so a long suit in a narrow column overlaps more instead of spilling
 * out of its box.
 */
function SuitRow({ cards }: { cards: Card[] }) {
  return (
    <div className="flex min-w-0">
      {cards.map((card, i) => (
        <div
          key={`${card.suit}${card.rank}`}
          className={
            i < cards.length - 1
              ? "flex-1 min-w-0 max-w-5 relative"
              : "shrink-0"
          }
        >
          <MiniCard card={card} />
        </div>
      ))}
    </div>
  );
}

/**
 * A hand as mini cards, either fanned by suit in a row (`fan`, for a hand
 * that has the full width) or one suit per line (`list`, for a hand sharing
 * a row with another).
 */
export function CardFan({
  hand,
  position,
  variant = "fan",
  showPoints = false,
  isUser = false,
}: {
  hand: Hand;
  position?: Position;
  variant?: "fan" | "list";
  /** Show the hand's high-card points beside its name. */
  showPoints?: boolean;
  /** Mark the hand as the user's. */
  isUser?: boolean;
}) {
  const bySuit = cardsBySuit(hand);

  return (
    <div
      className="bg-white rounded-lg shadow p-3 min-w-0"
      data-testid={position ? `hand-${position}` : undefined}
    >
      {(position || showPoints) && (
        <div className="flex items-baseline justify-between gap-2 mb-2">
          {position && (
            <div
              data-testid={`position-label-${position}`}
              className="font-bold text-xs text-gray-500 uppercase tracking-wider"
            >
              {POSITION_NAMES[position]}
              {isUser && (
                <span className="ml-1 text-emerald-700 normal-case tracking-normal">
                  (you)
                </span>
              )}
            </div>
          )}
          {showPoints && (
            <div className="text-xs text-gray-500 tabular-nums">
              {highCardPoints(hand)} HCP
            </div>
          )}
        </div>
      )}
      <div
        className={`flex ${variant === "fan" ? "justify-center flex-wrap gap-1.5 items-end min-h-[60px]" : "flex-col gap-1"}`}
      >
        {FAN_SUIT_ORDER.map((suit) => {
          const cards = bySuit[suit];
          if (cards.length === 0) return null;
          return <SuitRow key={suit} cards={cards} />;
        })}
      </div>
    </div>
  );
}
