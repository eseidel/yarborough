import {
  type Hand,
  type Card,
  type Position,
  SUITS,
  FAN_SUIT_ORDER,
  POSITION_NAMES,
  cardsBySuit,
  displayRank,
} from "../bridge/types";
import { CARD, EYEBROW } from "./ui";

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
 * A hand as mini cards, fanned by suit in a wrapped row. The user bids
 * looking at this; the review shows all four hands as text instead, which
 * costs a fraction of the height.
 */
export function CardFan({
  hand,
  position,
}: {
  hand: Hand;
  position?: Position;
}) {
  const bySuit = cardsBySuit(hand);

  return (
    <div
      className={`${CARD} min-w-0 p-3`}
      data-testid={position ? `hand-${position}` : undefined}
    >
      {position && (
        <div
          data-testid={`position-label-${position}`}
          className={`${EYEBROW} mb-2`}
        >
          {POSITION_NAMES[position]}
        </div>
      )}
      <div
        data-testid="suit-rows"
        className="flex justify-center flex-wrap gap-1.5 items-end min-h-[60px]"
      >
        {FAN_SUIT_ORDER.map((suit) => {
          const cards = bySuit[suit];
          // A fan is one wrapped row, so a void is simply fewer cards.
          if (cards.length === 0) return null;
          return <SuitRow key={suit} cards={cards} />;
        })}
      </div>
    </div>
  );
}
