import type { Deal, SuitName } from "../bridge/types";
import {
  highCardPoints,
  cardsBySuit,
  SUIT_ORDER,
  SUITS,
} from "../bridge/types";

export function DealStats({ deal }: { deal: Deal }) {
  const northSuitCards = cardsBySuit(deal.north);
  const southSuitCards = cardsBySuit(deal.south);
  const eastSuitCards = cardsBySuit(deal.east);
  const westSuitCards = cardsBySuit(deal.west);

  const nsHcp = highCardPoints(deal.north) + highCardPoints(deal.south);
  const ewHcp = highCardPoints(deal.east) + highCardPoints(deal.west);

  const renderSuitCounts = (
    hand1Cards: Record<SuitName, unknown[]>,
    hand2Cards: Record<SuitName, unknown[]>,
  ) => {
    return (
      <span className="inline-flex items-center gap-2">
        {SUIT_ORDER.map((suit) => {
          const count = hand1Cards[suit].length + hand2Cards[suit].length;
          const suitInfo = SUITS[suit];
          return (
            <span key={suit} className="inline-flex items-center font-medium">
              <span>{count}</span>
              <span className={`${suitInfo.color} ml-0.5 font-bold`}>
                {suitInfo.symbol}
              </span>
            </span>
          );
        })}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow p-3 text-sm text-gray-700">
      <div className="flex flex-col gap-1.5">
        <div
          className="flex justify-between items-center"
          data-testid="deal-stats-ns"
        >
          <span className="font-semibold text-gray-800">N-S: {nsHcp} HCP</span>
          {renderSuitCounts(northSuitCards, southSuitCards)}
        </div>
        <div
          className="flex justify-between items-center"
          data-testid="deal-stats-ew"
        >
          <span className="font-semibold text-gray-800">E-W: {ewHcp} HCP</span>
          {renderSuitCounts(eastSuitCards, westSuitCards)}
        </div>
      </div>
    </div>
  );
}
