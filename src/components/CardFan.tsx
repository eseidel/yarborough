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
import { CARD, EYEBROW } from "./ui";

/** Between one card of a fresh deal landing and the next. */
export const DEAL_STAGGER_MS = 15;

/** Ranks below the ten: what a player enters only as a count. */
const SMALL_RANKS = new Set(["2", "3", "4", "5", "6", "7", "8", "9"]);

/**
 * One card. With `small`, a card below the ten shows an x for its rank, the
 * way a bridge diagram writes AQxxx: an entered hand says how many spot
 * cards a suit has, never which.
 */
export function MiniCard({
  card,
  small = false,
  compact = false,
  className = "",
}: {
  card: Card;
  small?: boolean;
  /** A size down, for a hand that has to fit one line of a phone. */
  compact?: boolean;
  className?: string;
}) {
  const suit = SUITS[card.suit];
  const blank = small && SMALL_RANKS.has(card.rank);
  const rank = blank
    ? compact
      ? "top-px left-1 text-[15px] font-semibold"
      : "top-0.5 left-1 text-base font-semibold"
    : compact
      ? `top-0 left-[3px] ${card.rank === "T" ? "text-[13px] tracking-[-0.06em]" : "text-[15px]"} font-bold`
      : "top-0 left-1 text-lg font-bold";
  return (
    <div
      className={`relative ${compact ? "w-9 h-[50px]" : "w-10 h-14"} bg-white rounded-md border border-gray-300 shadow-sm select-none shrink-0 ${className}`}
      data-testid="mini-card"
    >
      <span className={`${suit.color} absolute leading-none ${rank}`}>
        {blank ? "x" : displayRank(card.rank)}
      </span>
      <span
        className={`${suit.color} absolute bottom-0 right-0.5 ${compact ? "text-2xl" : "text-3xl"} leading-none`}
      >
        {suit.symbol}
      </span>
    </div>
  );
}

/**
 * One suit's cards, overlapped. Every card but the last sits in a slot that
 * is at most half a card wide and shrinks further when the row runs out of
 * room, so a long suit in a narrow column overlaps more instead of spilling
 * out of its box.
 */
function SuitRow({
  cards,
  small,
  compact,
  dealFrom,
}: {
  cards: Card[];
  small?: boolean;
  compact?: boolean;
  /** Deal the cards in, the first as the hand's card number `dealFrom`. */
  dealFrom?: number;
}) {
  return (
    <div className="flex min-w-0">
      {cards.map((card, i) => (
        <div
          key={`${card.suit}${card.rank}`}
          className={`${
            i < cards.length - 1
              ? `flex-1 min-w-0 ${compact ? (card.rank === "T" ? "max-w-5" : "max-w-4") : "max-w-5"} relative`
              : "shrink-0"
          } ${dealFrom === undefined ? "" : "animate-deal"}`}
          style={
            dealFrom === undefined
              ? undefined
              : {
                  animationDelay: `${(dealFrom + i) * DEAL_STAGGER_MS}ms`,
                  animationFillMode: "backwards",
                }
          }
        >
          <MiniCard card={card} small={small} compact={compact} />
        </div>
      ))}
    </div>
  );
}

/**
 * The suits of a hand side by side on one line, spades first, with no box
 * around them: what a seat sees of its own entered hand. The cards are a size
 * down so that thirteen fit the width of a phone.
 */
export function Fan({ hand, small = false }: { hand: Hand; small?: boolean }) {
  const bySuit = cardsBySuit(hand);
  return (
    <div data-testid="fan" className="flex items-end gap-1.5">
      {FAN_SUIT_ORDER.map((suit) =>
        bySuit[suit].length ? (
          <SuitRow key={suit} cards={bySuit[suit]} small={small} compact />
        ) : null,
      )}
    </div>
  );
}

/**
 * A hand as mini cards, fanned by suit in a wrapped row. The user bids
 * looking at this; the review shows all four hands as text instead, which
 * costs a fraction of the height. A new hand is dealt in, card by card,
 * in a fraction of a second.
 */
export function CardFan({
  hand,
  position,
}: {
  hand: Hand;
  position?: Position;
}) {
  const bySuit = cardsBySuit(hand);
  // Where each suit's cards come in the deal: after the suits left of it.
  const dealFrom = FAN_SUIT_ORDER.map((_, i) =>
    FAN_SUIT_ORDER.slice(0, i).reduce((n, s) => n + bySuit[s].length, 0),
  );

  return (
    <div
      className={`${CARD} min-w-0 p-3`}
      data-testid={position ? `hand-${position}` : undefined}
    >
      {position && (
        <div
          data-testid={`position-label-${position}`}
          className={`${EYEBROW} mb-2`}
        >
          {POSITION_NAMES[position]}
        </div>
      )}
      <div
        data-testid="suit-rows"
        className="flex justify-center flex-wrap gap-1.5 items-end min-h-[60px]"
      >
        {FAN_SUIT_ORDER.map((suit, i) => {
          const cards = bySuit[suit];
          // A fan is one wrapped row, so a void is simply fewer cards.
          if (cards.length === 0) return null;
          return <SuitRow key={suit} cards={cards} dealFrom={dealFrom[i]} />;
        })}
      </div>
    </div>
  );
}
