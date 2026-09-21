import type { EnteredHands, Position } from "./types";
import { handFromCdhsString, handToCdhsString } from "./types";

const POSITIONS: Position[] = ["N", "E", "S", "W"];

/**
 * Where one board's entered hands are kept.
 *
 * Not the URL, and not local storage. Explore is meant to be usable at a
 * live table, where the address bar is on screen and the phone is passed
 * round, so a link must carry no cards and nothing may outlive the tab. A
 * different board number is a different deal and so a different key, which
 * is what clears the hands when the board changes.
 */
export function handsStorageKey(boardNumber: number): string {
  return `yarborough.explore.hands.${boardNumber}`;
}

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
 * Session storage is absent in a worker and throws in a browser with site
 * data blocked, so every touch of it is optional: the hands are a
 * convenience across a reload, never the state of record.
 */
function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadHands(boardNumber: number): EnteredHands {
  try {
    const text = sessionStore()?.getItem(handsStorageKey(boardNumber));
    return text ? deserializeHands(text) : {};
  } catch {
    return {};
  }
}

export function saveHands(boardNumber: number, hands: EnteredHands): void {
  const key = handsStorageKey(boardNumber);
  try {
    const store = sessionStore();
    if (!store) return;
    const text = serializeHands(hands);
    if (text) {
      store.setItem(key, text);
    } else {
      store.removeItem(key);
    }
  } catch {
    // A tab that cannot store them still works for the auction in front of it.
  }
}
