import { Fragment } from "react";
import { SUITS, type SuitName } from "../bridge/types";

const SYMBOL_TO_SUIT: Record<string, SuitName> = {
  "♠": "S",
  "♥": "H",
  "♦": "D",
  "♣": "C",
};

/** A sentence with its suit symbols coloured: "4♠ by North makes 4". */
export function SuitText({ text }: { text: string }) {
  const parts = text.split(/([♠♥♦♣])/);
  return (
    <>
      {parts.map((part, i) => {
        const suit = SYMBOL_TO_SUIT[part];
        return suit ? (
          <span key={i} className={`${SUITS[suit].color} font-semibold`}>
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        );
      })}
    </>
  );
}
