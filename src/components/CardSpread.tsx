import { type Hand, type Card, SUITS, RANK_ORDER, displayRank } from '../bridge';

const SPREAD_SUIT_ORDER = ['S', 'H', 'C', 'D'] as const;

export function CardSpread({
  hand,
  selectedCard,
  onSelectCard,
}: {
  hand: Hand;
  selectedCard?: Card | null;
  onSelectCard?: (card: Card) => void;
}) {
  const sorted = [...hand.cards].sort((a, b) => {
    const suitDiff =
      SPREAD_SUIT_ORDER.indexOf(a.suit as (typeof SPREAD_SUIT_ORDER)[number]) -
      SPREAD_SUIT_ORDER.indexOf(b.suit as (typeof SPREAD_SUIT_ORDER)[number]);
    if (suitDiff !== 0) return suitDiff;
    return RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
  });

  const isSelected = (card: Card) =>
    selectedCard?.suit === card.suit && selectedCard?.rank === card.rank;

  return (
    <div className="flex">
      {sorted.map(card => (
        <button
          key={`${card.suit}${card.rank}`}
          onClick={() => onSelectCard?.(card)}
          className={`flex flex-col items-center px-1.5 py-1 border border-gray-300
            first:rounded-l-md last:rounded-r-md -ml-px first:ml-0 text-sm
            ${isSelected(card) ? 'bg-amber-200 z-10' : 'bg-white hover:bg-gray-50'}
            transition-colors`}
        >
          <span className="font-bold">{displayRank(card.rank)}</span>
          <span className={SUITS[card.suit].color}>{SUITS[card.suit].symbol}</span>
        </button>
      ))}
    </div>
  );
}
