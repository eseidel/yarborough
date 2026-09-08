import {
  type Deal,
  type Position,
  SUITS,
  handForPosition,
} from "../bridge/types";
import { SIDE_LABEL, type Side } from "../practice/analysis";
import { sideFits, sideHcp } from "../practice/deal";
import { CardFan } from "./CardFan";

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
 * All four hands as cards, laid out as at the table: North across the top,
 * West and East side by side, South across the bottom, each with its points,
 * and each side's total and fits underneath.
 */
export function HandDiagram({
  deal,
  userPosition,
}: {
  deal: Deal;
  userPosition?: Position;
}) {
  const hand = (position: Position, variant: "fan" | "list") => (
    <CardFan
      hand={handForPosition(deal, position)}
      position={position}
      variant={variant}
      showPoints
      isUser={position === userPosition}
      align={position === "E" ? "end" : "start"}
    />
  );
  return (
    <div className="space-y-2" data-testid="hand-diagram">
      {hand("N", "fan")}
      <div className="grid grid-cols-2 gap-2">
        {hand("W", "list")}
        {hand("E", "list")}
      </div>
      {hand("S", "fan")}
      <div className="bg-white rounded-lg shadow p-3 text-sm space-y-1">
        <SideLine deal={deal} side="NS" />
        <SideLine deal={deal} side="EW" />
      </div>
    </div>
  );
}
