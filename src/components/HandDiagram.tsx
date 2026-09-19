import {
  type Card,
  type Deal,
  type Position,
  type SuitName,
  type Vulnerability,
  FAN_SUIT_ORDER,
  POSITION_NAMES,
  SUITS,
  cardsBySuit,
  displayRank,
  handForPosition,
  highCardPoints,
  vulnerabilityLabel,
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

/** Which edge of its cell a block of the diagram hugs. */
type Align = "start" | "center" | "end";

const CELL_ALIGN: Record<Align, string> = {
  start: "text-left",
  center: "text-center",
  end: "text-right",
};

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

/**
 * One hand of the diagram: its seat, its points, and a line per suit. The
 * hand sits in its cell as one block, so its suit symbols line up in a
 * column of their own however the cell is aligned.
 */
function TextHand({
  deal,
  position,
  isUser,
  align,
}: {
  deal: Deal;
  position: Position;
  isUser: boolean;
  align: Align;
}) {
  const hand = handForPosition(deal, position);
  const bySuit = cardsBySuit(hand);
  return (
    <div className={CELL_ALIGN[align]}>
      <div
        className="inline-block text-left text-sm"
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
              "HCP" as well, and the sides' totals beside it do say it. */}
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
    </div>
  );
}

/**
 * What a side holds and what it is worth: points, fits, and the contracts
 * it can make on best play. The last comes from the double-dummy solver and
 * joins the others here, since all three are facts about the cards rather
 * than about the auction. It is left off until the solver answers.
 */
function SideSummary({
  deal,
  side,
  table,
  align,
}: {
  deal: Deal;
  side: Side;
  table: DoubleDummyTable | null;
  align: Align;
}) {
  const fits = sideFits(deal, side);
  return (
    <div
      className={`${CELL_ALIGN[align]} text-[11px] leading-tight text-gray-600`}
      data-testid={`side-${side}`}
    >
      <div className="font-semibold text-gray-700">
        {SIDE_LABEL[side]} {sideHcp(deal, side)} HCP
      </div>
      <div>
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
      </div>
      {table && (
        <div data-testid={`makeable-${side}`}>
          can make{" "}
          <SuitText text={listMakeable(makeableContracts(table, side))} />
        </div>
      )}
    </div>
  );
}

/** The board's own particulars, where a printed diagram keeps them. */
function BoardNote({
  boardNumber,
  dealer,
  vulnerability,
}: {
  boardNumber: number;
  dealer: Position;
  vulnerability: Vulnerability;
}) {
  return (
    <div
      className="self-center text-center text-[11px] leading-tight text-gray-500"
      data-testid="board-note"
    >
      <div className="font-semibold text-gray-700">Board {boardNumber}</div>
      <div>{POSITION_NAMES[dealer]} deals</div>
      <div className={vulnerability === "None" ? "" : "text-red-700"}>
        {vulnerabilityLabel(vulnerability)}
      </div>
    </div>
  );
}

/**
 * All four hands as a bridge diagram: North on top, West and East to either
 * side, South below. The holdings are text rather than card images, since
 * the same four hands as fanned cards stand 708px tall on a phone, which by
 * itself pushed the review's buttons a screen and a half out of reach.
 *
 * A cross leaves its middle and its corners empty, which on a phone is most
 * of the width. They carry what a printed diagram would put there: the
 * board, its dealer and its vulnerability in the middle, and beside North
 * what each side's cards are worth.
 */
export function HandDiagram({
  deal,
  userPosition,
  table = null,
  boardNumber,
  dealer,
  vulnerability,
}: {
  deal: Deal;
  userPosition?: Position;
  /** The double-dummy table, or null until the solver has answered. */
  table?: DoubleDummyTable | null;
  boardNumber: number;
  dealer: Position;
  vulnerability: Vulnerability;
}) {
  const hand = (position: Position, align: Align) => (
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
      <SideSummary deal={deal} side="NS" table={table} align="start" />
      {hand("N", "center")}
      <SideSummary deal={deal} side="EW" table={table} align="end" />
      {hand("W", "start")}
      <BoardNote
        boardNumber={boardNumber}
        dealer={dealer}
        vulnerability={vulnerability}
      />
      {hand("E", "end")}
      <div />
      {hand("S", "center")}
      <div />
    </div>
  );
}
