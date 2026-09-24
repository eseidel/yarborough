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
import { sideHcp } from "../practice/deal";
import { SuitText } from "./SuitText";
import { CARD } from "./ui";

/** Which edge of its cell a block of the diagram hugs. */
type Align = "start" | "center" | "end";

const CELL_ALIGN: Record<Align, string> = {
  start: "text-left",
  center: "text-center",
  end: "text-right",
};

/**
 * Every rank centred in a box of its own width, so the cards of one hand
 * line up in columns down the four suits. The font is the page's, not a
 * monospaced one, and its ranks are far from equal: a J is 0.296em wide
 * against a Q's 0.788em, which is enough to throw a holding out of line
 * with the one above it.
 *
 * The box is a shade wider than the widest rank, so no glyph spills over
 * its edges into the space of the card beside it — at 0.72em a Q did, and
 * a Q before a 9 read as tight. It is the narrowest width that cannot,
 * which keeps the hand as close to the room it took ragged as boxes allow.
 */
const RANK_CELL = "inline-block w-[0.8em] text-center";

/**
 * The suit's own box, wider and centred, so the symbols line up as a column
 * whatever their widths — they are often a fallback font's, and need not
 * match each other at all.
 */
const SUIT_CELL = "inline-block w-[1em] text-center font-bold";

/**
 * One suit's holding, "♠AK32", or a dash where the hand is void.
 *
 * A holding is one line, whatever its length: wrapped, a seven-card suit
 * took two lines and pushed the three suits under it a line down, out of
 * step with the hand across the diagram from it. Kept whole, the holding
 * instead asks its column for the room it needs, and the grid's columns
 * take their minimum from it.
 */
function SuitLine({ suit, cards }: { suit: SuitName; cards: Card[] }) {
  return (
    <div
      className="whitespace-nowrap leading-tight"
      data-testid={`suit-line-${suit}`}
    >
      <span className={`${SUITS[suit].color} ${SUIT_CELL} mr-1`}>
        {SUITS[suit].symbol}
      </span>
      {cards.length === 0 ? (
        <span className={`${RANK_CELL} text-gray-400`}>&mdash;</span>
      ) : (
        // The rank as the deck writes it: a ten is a T, one glyph in one
        // column, where "10" reads as two cards.
        cards.map((card) => (
          <span key={card.rank} className={RANK_CELL}>
            {card.rank}
          </span>
        ))
      )}
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
        {/* The seat's line may wrap where the column is tight, since the
            holdings under it may not: a seat whose name held its own line
            open — "SOUTH (you) 17" is wider than eight cards — took the
            room from the long suit beside it. */}
        <div
          className="text-xs font-semibold uppercase tracking-wider text-gray-500"
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
 * What a side holds and what it could have made on best play: the two
 * things about its cards that the diagram beside it cannot be read off at
 * a glance. Its fits can be — they are four holdings away, in front of the
 * reader — so they are not spelled out.
 *
 * The contracts need no words in front of them: a list of them under a
 * side's points, beside the deal, is read for what it is. They wait on the
 * double-dummy solver, so the line is left off until it answers, and is a
 * dash where the side can make nothing.
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
  const makeable = table ? listMakeable(makeableContracts(table, side)) : null;
  return (
    <div
      className={`${CELL_ALIGN[align]} text-xs leading-tight text-gray-600`}
      data-testid={`side-${side}`}
    >
      <div className="font-semibold text-gray-700">
        {SIDE_LABEL[side]} {sideHcp(deal, side)} HCP
      </div>
      {makeable !== null && (
        <div data-testid={`makeable-${side}`}>
          {makeable === "" ? (
            <span className="text-gray-400">&mdash;</span>
          ) : (
            <SuitText text={makeable} />
          )}
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
      className="self-center rounded-lg bg-gray-50 px-2 py-1.5 text-center text-xs leading-snug text-gray-500"
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
 * what each side holds and could have made.
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
      // The middle column takes its width from what is in it, so North and
      // South share one left edge instead of being centred separately and
      // landing at two, and the equal sides keep the pair in the middle.
      className={`${CARD} animate-rise grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-2 p-3`}
      data-testid="hand-diagram"
    >
      <SideSummary deal={deal} side="NS" table={table} align="start" />
      {hand("N", "start")}
      <SideSummary deal={deal} side="EW" table={table} align="end" />
      {hand("W", "start")}
      <BoardNote
        boardNumber={boardNumber}
        dealer={dealer}
        vulnerability={vulnerability}
      />
      {hand("E", "end")}
      <div />
      {hand("S", "start")}
      <div />
    </div>
  );
}
