import {
  type Hand,
  type Card,
  type SuitName,
  SUITS,
  cardsBySuit,
  displayRank,
} from "../bridge";

/** Suit display order for the card fan: D, C, H, S (left to right). */
export const FAN_SUIT_ORDER: SuitName[] = ["D", "C", "H", "S"];

/** Return all cards from a hand in fan display order (DCHS, high-to-low within each suit). */
export function fanOrderCards(hand: Hand): Card[] {
  const bySuit = cardsBySuit(hand);
  return FAN_SUIT_ORDER.flatMap((suit) => bySuit[suit]);
}

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

export function CardFan({ hand }: { hand: Hand }) {
  const bySuit = cardsBySuit(hand);

  return (
    <div className="inline-flex items-end gap-1.5">
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
  );
}
