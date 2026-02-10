import { type Card, SUITS, type SuitName, displayRank } from "../bridge";

export function SuitLine({ suit, cards }: { suit: SuitName; cards: Card[] }) {
  const suitInfo = SUITS[suit];
  return (
    <div className="flex items-center gap-1 font-mono">
      <span className={`${suitInfo.color} text-lg`}>{suitInfo.symbol}</span>
      <span className="text-sm tracking-wide">
        {cards.length > 0
          ? cards.map((c) => displayRank(c.rank)).join(" ")
          : "\u2014"}
      </span>
    </div>
  );
}
