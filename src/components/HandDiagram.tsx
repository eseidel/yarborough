import {
  type Deal,
  type Hand,
  type Position,
  POSITION_NAMES,
  SUITS,
  SUIT_ORDER,
  cardsBySuit,
  displayRank,
  handForPosition,
  highCardPoints,
} from "../bridge/types";
import { SIDE_LABEL, type Side } from "../practice/analysis";
import { sideFits, sideHcp } from "../practice/deal";

function HandCard({
  hand,
  position,
  isUser,
}: {
  hand: Hand;
  position: Position;
  isUser: boolean;
}) {
  const bySuit = cardsBySuit(hand);
  return (
    <div
      className="bg-white rounded-lg shadow p-2.5 min-w-0"
      data-testid={`hand-${position}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span
          data-testid={`position-label-${position}`}
          className="font-bold text-xs text-gray-500 uppercase tracking-wider"
        >
          {POSITION_NAMES[position]}
          {isUser && (
            <span className="ml-1 text-emerald-700 normal-case tracking-normal">
              (you)
            </span>
          )}
        </span>
        <span className="text-xs text-gray-500 tabular-nums">
          {highCardPoints(hand)} HCP
        </span>
      </div>
      {SUIT_ORDER.map((suit) => {
        const cards = bySuit[suit];
        return (
          <div key={suit} className="flex items-baseline gap-1.5 leading-snug">
            <span className={`${SUITS[suit].color} text-base w-4 text-center`}>
              {SUITS[suit].symbol}
            </span>
            <span className="text-sm font-medium tracking-wide text-gray-800 break-all">
              {cards.length > 0
                ? cards.map((card) => displayRank(card.rank)).join(" ")
                : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SideLine({ deal, side }: { deal: Deal; side: Side }) {
  const fits = sideFits(deal, side);
  return (
    <div
      className="flex items-center justify-between gap-2"
      data-testid={`side-${side}`}
    >
      <span className="font-semibold text-gray-800">
        {SIDE_LABEL[side]}: {sideHcp(deal, side)} HCP
      </span>
      <span className="text-gray-600">
        {fits.length === 0
          ? "no 8-card fit"
          : fits.map((fit, i) => (
              <span key={fit.suit}>
                {i > 0 && ", "}
                {fit.length}-card{" "}
                <span className={`${SUITS[fit.suit].color} font-bold`}>
                  {SUITS[fit.suit].symbol}
                </span>{" "}
                fit
              </span>
            ))}
      </span>
    </div>
  );
}

/**
 * All four hands laid out as at the table, North at the top, with each side's
 * points and fits underneath.
 */
export function HandDiagram({
  deal,
  userPosition,
}: {
  deal: Deal;
  userPosition?: Position;
}) {
  const card = (position: Position) => (
    <HandCard
      hand={handForPosition(deal, position)}
      position={position}
      isUser={position === userPosition}
    />
  );
  return (
    <div className="space-y-2" data-testid="hand-diagram">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 mx-auto w-1/2 min-w-[9rem]">{card("N")}</div>
        {card("W")}
        {card("E")}
        <div className="col-span-2 mx-auto w-1/2 min-w-[9rem]">{card("S")}</div>
      </div>
      <div className="bg-white rounded-lg shadow p-3 text-sm space-y-1">
        <SideLine deal={deal} side="NS" />
        <SideLine deal={deal} side="EW" />
      </div>
    </div>
  );
}
