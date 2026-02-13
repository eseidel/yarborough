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

function MiniCard({ card, overlap }: { card: Card; overlap: boolean }) {
  const suit = SUITS[card.suit];
  return (
    <div
      className={`${overlap ? "-ml-5" : ""} relative w-10 h-14 bg-white rounded-md border border-gray-300 shadow-sm select-none shrink-0`}
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

export function CardFan({ hand, position }: { hand: Hand; position?: Position }) {
  const bySuit = cardsBySuit(hand);

  return (
    <div className="bg-white rounded-lg shadow p-3">
      {position && (
        <div
          data-testid={`position-label-${position}`}
          className="font-bold text-xs text-gray-500 mb-2 uppercase tracking-wider text-center"
        >
          {POSITION_NAMES[position]}
        </div>
      )}
      <div className="flex justify-center flex-wrap gap-1.5 min-h-[60px] items-end">
        {FAN_SUIT_ORDER.map((suit) => {
          const cards = bySuit[suit];
          if (cards.length === 0) return null;
          return (
            <div key={suit} className="flex">
              {cards.map((card, i) => (
                <MiniCard
                  key={`${card.suit}${card.rank}`}
                  card={card}
                  overlap={i > 0}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
