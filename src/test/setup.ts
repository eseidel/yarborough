import "@testing-library/jest-dom";
import { beforeEach, vi } from "vitest";

// Mock matchMedia if needed by any components
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

/** mulberry32: small, fast, and good enough to stand in for Math.random. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// `randomDeal` shuffles with Math.random and `generateBoardId` draws a board
// number from it, which decides the vulnerability. Real randomness therefore
// made each run cover a different set of branches — CallTable.isVulnerable
// and the deal handling in bridge/types most visibly — so coverage moved by
// several tenths of a percent between identical runs and failed the Codecov
// project check on pull requests that touched no source at all.
//
// Reseeding per test rather than per file keeps the sequence independent of
// the order tests run in. Values still vary within a test, so anything relying
// on distinct deals still gets them; they are simply the same ones every time.
beforeEach(() => {
  vi.spyOn(Math, "random").mockImplementation(seededRandom(0x5eed));
});
