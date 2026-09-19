// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Randomness is not behavior: `Hand.random`, `Deal.random` and `Board.random`
// use Python's RNG, and the port does not try to reproduce its stream. What it
// does provide is an injectable source, so a test can deal the same board
// twice.

/** A source of numbers in [0, 1), like `Math.random`. */
export type Rng = () => number;

export const defaultRng: Rng = Math.random;

/** A small seeded generator (mulberry32), for deterministic tests. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [0, bound), from `rng`. */
export function randomBelow(bound: number, rng: Rng): number {
  return Math.floor(rng() * bound);
}

/** Shuffles `values` in place, the way Python's `random.shuffle` does. */
export function shuffle<T>(values: T[], rng: Rng): T[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1, rng);
    const swapped = values[i];
    values[i] = values[j];
    values[j] = swapped;
  }
  return values;
}
