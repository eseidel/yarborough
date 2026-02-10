import {
  type Hand,
  type Position,
  SUIT_ORDER,
  POSITION_NAMES,
  cardsBySuit,
} from "../bridge";
import { SuitLine } from "./SuitLine";

export function HandDisplay({
  hand,
  position,
}: {
  hand: Hand;
  position: Position;
}) {
  const bySuit = cardsBySuit(hand);
  return (
    <div className="bg-white rounded-lg shadow p-3">
      <div className="font-bold text-xs text-gray-500 mb-1 uppercase tracking-wider">
        {POSITION_NAMES[position]}
      </div>
      {SUIT_ORDER.map((suit) => (
        <SuitLine key={suit} suit={suit} cards={bySuit[suit]} />
      ))}
    </div>
  );
}
