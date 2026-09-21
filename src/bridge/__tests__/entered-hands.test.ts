import { afterEach, describe, expect, it } from "vitest";
import type { EnteredHands } from "../types";
import { handFromCdhsString } from "../types";
import {
  deserializeHands,
  handsStorageKey,
  loadHands,
  saveHands,
  serializeHands,
} from "../entered-hands";

const SOUTH = "42.A973.K5.AQ982";
const WEST = "AKQ.KQ.QJT.98765";

function hands(): EnteredHands {
  return {
    S: handFromCdhsString(SOUTH)!,
    W: handFromCdhsString(WEST)!,
  };
}

afterEach(() => {
  window.sessionStorage.clear();
});

describe("the hands a board has been given", () => {
  it("writes each seat's hand C.D.H.S", () => {
    expect(serializeHands(hands())).toBe(`S=${SOUTH},W=${WEST}`);
    expect(serializeHands({})).toBe("");
  });

  it("reads back what it wrote", () => {
    const read = deserializeHands(serializeHands(hands()));
    expect(Object.keys(read).sort()).toEqual(["S", "W"]);
    expect(read.S!.cards).toHaveLength(13);
    expect(serializeHands(read)).toBe(`S=${SOUTH},W=${WEST}`);
  });

  it("drops an entry it cannot read rather than the whole board", () => {
    const read = deserializeHands(`S=${SOUTH},E=nonsense,X=${WEST},N=`);
    expect(Object.keys(read)).toEqual(["S"]);
  });

  it("keeps each board's hands under its own key", () => {
    expect(handsStorageKey(1)).not.toBe(handsStorageKey(2));
    saveHands(1, hands());
    // A new board number is a new deal, so it starts with nothing.
    expect(loadHands(2)).toEqual({});
    expect(Object.keys(loadHands(1)).sort()).toEqual(["S", "W"]);
  });

  it("clears the key when the last hand is forgotten", () => {
    saveHands(3, hands());
    saveHands(3, {});
    expect(window.sessionStorage.getItem(handsStorageKey(3))).toBeNull();
    expect(loadHands(3)).toEqual({});
  });

  it("keeps the hands out of anything a link could carry", () => {
    saveHands(4, hands());
    // Session storage only: nothing is written where a shared URL or another
    // tab could pick it up.
    expect(window.localStorage.length).toBe(0);
    expect(window.location.search).toBe("");
  });
});
