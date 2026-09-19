import {
  type Card,
  type Deal,
  type Position,
  type SuitName,
  FAN_SUIT_ORDER,
  POSITION_NAMES,
  SUITS,
  cardsBySuit,
  displayRank,
  handForPosition,
  highCardPoints,
} from "../bridge/types";
import type { DoubleDummyTable } from "../dds/dds-core";
import {
  SIDE_LABEL,
  type Side,
  listMakeable,
  makeableContracts,
} from "../practice/analysis";
import { sideFits, sideHcp } from "../practice/deal";
import { SuitText } from "./SuitText";

/** One suit's holding, "♠ AK32", or a dash where the hand is void. */
function SuitLine({ suit, cards }: { suit: SuitName; cards: Card[] }) {
  return (
    <div className="leading-tight" data-testid={`suit-line-${suit}`}>
      <span className={`${SUITS[suit].color} font-bold`}>
        {SUITS[suit].symbol}
      </span>{" "}
      <span className="tabular-nums tracking-wide">
        {cards.length === 0 ? (
          <span className="text-gray-400">&mdash;</span>
        ) : (
          cards.map((card) => displayRank(card.rank)).join("")
        )}
      </span>
    </div>
  );
}

/** One hand of the diagram: its seat, its points, and a line per suit. */
function TextHand({
  deal,
  position,
  isUser,
  align = "start",
}: {
  deal: Deal;
  position: Position;
  isUser: boolean;
  /** Which edge the hand hugs; East hugs the middle of the diagram. */
  align?: "start" | "end";
}) {
  const hand = handForPosition(deal, position);
  const bySuit = cardsBySuit(hand);
  return (
    <div
      className={`text-sm ${align === "end" ? "text-right" : "text-left"}`}
      data-testid={`hand-${position}`}
    >
      <div
        className="text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap"
        data-testid={`position-label-${position}`}
      >
        {POSITION_NAMES[position]}
        {isUser && (
          <span className="ml-1 text-emerald-700 normal-case tracking-normal">
            (you)
          </span>
        )}{" "}
        {/* The points alone: a seat's column is too narrow to spell out
            "HCP" as well, and the sides' totals below do say it. */}
        <span
          className="text-gray-400 tabular-nums"
          title={`${highCardPoints(hand)} high-card points`}
        >
          {highCardPoints(hand)}
        </span>
      </div>
      <div data-testid="suit-rows">
        {FAN_SUIT_ORDER.map((suit) => (
          <SuitLine key={suit} suit={suit} cards={bySuit[suit]} />
        ))}
      </div>
    </div>
  );
}

/**
 * What a side holds and what it is worth: points, fits, and the contracts
 * it can make on best play. The last comes from the double-dummy solver and
 * joins the others here, since all three are facts about the cards rather
 * than about the auction. It is left off until the solver answers.
 */
function SideLine({
  deal,
  side,
  table,
}: {
  deal: Deal;
  side: Side;
  table: DoubleDummyTable | null;
}) {
  const fits = sideFits(deal, side);
  return (
    <div data-testid={`side-${side}`}>
      <span className="font-semibold text-gray-700">
        {SIDE_LABEL[side]} {sideHcp(deal, side)} HCP
      </span>
      {" · "}
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
      {table && (
        <span data-testid={`makeable-${side}`}>
          {" · can make "}
          <SuitText text={listMakeable(makeableContracts(table, side))} />
        </span>
      )}
    </div>
  );
}

/**
 * All four hands as a bridge diagram: North on top, West and East to either
 * side, South below, each with its points, and under them what each side's
 * cards are worth. The holdings are text rather than card images: the same
 * four hands as fanned cards stand 708px tall on a phone, which by itself
 * pushed the review's buttons a screen and a half out of reach.
 */
export function HandDiagram({
  deal,
  userPosition,
  table = null,
}: {
  deal: Deal;
  userPosition?: Position;
  /** The double-dummy table, or null until the solver has answered. */
  table?: DoubleDummyTable | null;
}) {
  const hand = (position: Position, align?: "start" | "end") => (
    <TextHand
      deal={deal}
      position={position}
      isUser={position === userPosition}
      align={align}
    />
  );
  return (
    <div
      className="bg-white rounded-lg shadow p-3 grid grid-cols-3 gap-x-2 gap-y-1.5"
      data-testid="hand-diagram"
    >
      <div />
      {hand("N")}
      <div />
      {hand("W")}
      <div />
      {hand("E", "end")}
      <div />
      {hand("S")}
      <div />
      <div className="col-span-3 space-y-1 border-t border-gray-100 pt-2 text-[11px] leading-tight text-gray-600">
        <SideLine deal={deal} side="NS" table={table} />
        <SideLine deal={deal} side="EW" table={table} />
      </div>
    </div>
  );
}
