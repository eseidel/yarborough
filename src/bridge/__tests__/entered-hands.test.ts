import { afterEach, describe, it, expect, vi } from "vitest";
import { handFromCdhsString } from "../types";
import {
  HANDS_KEY,
  deserializeHands,
  loadHands,
  saveHands,
  serializeHands,
} from "../entered-hands";

const NORTH = handFromCdhsString("42.A973.K5.AQ982")!;
const SOUTH = handFromCdhsString("963.A52.Q83.KJ74")!;

describe("entered hands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("writes each seat's hand C.D.H.S, in seat order", () => {
    expect(serializeHands({ S: SOUTH, N: NORTH })).toBe(
      "N=42.A973.K5.AQ982,S=963.A52.Q83.KJ74",
    );
  });

  it("reads back what it wrote and drops what it cannot read", () => {
    expect(
      deserializeHands("N=42.A973.K5.AQ982,Q=42.A973.K5.AQ982,E=AKQ,S="),
    ).toEqual({ N: NORTH });
  });

  it("keeps the hands in the tab's session, never in local storage", () => {
    saveHands({ N: NORTH });
    expect(sessionStorage.getItem(HANDS_KEY)).toBe("N=42.A973.K5.AQ982");
    expect(localStorage.length).toBe(0);
    expect(loadHands()).toEqual({ N: NORTH });
  });

  it("forgets them all when there are none", () => {
    saveHands({ N: NORTH });
    saveHands({});
    expect(sessionStorage.getItem(HANDS_KEY)).toBeNull();
    expect(loadHands()).toEqual({});
  });

  it("works without storage when the browser refuses it", () => {
    // A browser with site data blocked throws on the property itself.
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveHands({ N: NORTH })).not.toThrow();
    expect(loadHands()).toEqual({});
  });
});
