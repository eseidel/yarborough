import type { Hand, Position } from "./types";
import { handFromCdhsString, handToCdhsString } from "./types";

/** The hands the players at the table have entered, by seat. */
export type EnteredHands = Partial<Record<Position, Hand>>;

const POSITIONS: Position[] = ["N", "E", "S", "W"];

/**
 * Where the entered hands are kept: the tab's session storage.
 *
 * Not the URL, and not local storage. Explore is meant to be used at a live
 * table with the phone passed round, where the address bar is on screen, so a
 * link must carry no cards and nothing may outlive the tab. The hands belong
 * to the deal in front of the table, not to a board number: picking a board
 * number corrects the dealer and vulnerability of that deal, and it is Next
 * board that forgets them.
 */
export const HANDS_KEY = "yarborough.explore.hands";

/** The hands as "N=<hand>,S=<hand>", each hand written C.D.H.S. */
export function serializeHands(hands: EnteredHands): string {
  return POSITIONS.filter((position) => hands[position])
    .map((position) => `${position}=${handToCdhsString(hands[position]!)}`)
    .join(",");
}

/** Read what `serializeHands` wrote, dropping anything unreadable. */
export function deserializeHands(text: string): EnteredHands {
  const hands: EnteredHands = {};
  for (const entry of text.split(",")) {
    const [position, handText] = entry.split("=");
    if (!handText || !POSITIONS.includes(position as Position)) continue;
    const hand = handFromCdhsString(handText);
    if (hand) hands[position as Position] = hand;
  }
  return hands;
}

/**
 * Session storage throws in a browser with site data blocked, so every touch
 * of it is optional: the hands are a convenience across a reload, never the
 * state of record.
 */
function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadHands(): EnteredHands {
  try {
    const text = sessionStore()?.getItem(HANDS_KEY);
    return text ? deserializeHands(text) : {};
  } catch {
    return {};
  }
}

export function saveHands(hands: EnteredHands): void {
  try {
    const store = sessionStore();
    if (!store) return;
    const text = serializeHands(hands);
    if (text) store.setItem(HANDS_KEY, text);
    else store.removeItem(HANDS_KEY);
  } catch {
    // A tab that cannot keep them still works for the auction in front of it.
  }
}
