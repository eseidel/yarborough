// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/core/suit.py.

import { assert } from "./assert";

const STRAIN_CACHE = new Map<number, Strain>();

export class Strain {
  readonly index: number;

  constructor(index: number, thisShouldNotBeCalledDirectly = false) {
    assert(thisShouldNotBeCalledDirectly);
    this.index = index;
  }

  static readonly ALL_NAMES = [
    "Clubs",
    "Diamonds",
    "Hearts",
    "Spades",
    "Notrump",
  ];
  // Spelled `All_CHARS` in the Python.
  static readonly ALL_CHARS = ["C", "D", "H", "S", "N"];

  isSuit(): boolean {
    return SUITS.includes(this);
  }

  toString(): string {
    return this.name;
  }

  repr(): string {
    return `Strain(${this.name})`;
  }

  equals(other: Strain | null | undefined): boolean {
    return other != null && this.index === other.index;
  }

  /** Strains are singletons, so `fromIndex` hands back the same object. */
  static fromIndex(index: number): Strain {
    assert(index >= 0 && index < 5 && Number.isInteger(index));
    const cached = STRAIN_CACHE.get(index);
    if (cached) {
      return cached;
    }
    const strain = new Strain(index, true);
    STRAIN_CACHE.set(index, strain);
    return strain;
  }

  static fromName(name: string): Strain {
    const index = Strain.ALL_NAMES.indexOf(name);
    assert(index !== -1, `${name} is not a valid strain name`);
    return Strain.fromIndex(index);
  }

  static fromChar(char: string): Strain {
    const index = Strain.ALL_CHARS.indexOf(char);
    assert(index !== -1, `${char} is not a valid strain char`);
    return Strain.fromIndex(index);
  }

  get name(): string {
    return Strain.ALL_NAMES[this.index];
  }

  get char(): string {
    return this.name[0];
  }

  otherMinor(): Strain {
    assert(MINORS.includes(this));
    return this === CLUBS ? DIAMONDS : CLUBS;
  }

  otherMajor(): Strain {
    assert(MAJORS.includes(this));
    return this === HEARTS ? SPADES : HEARTS;
  }
}

/** Python's `Strain.__lt__`: `C D H S N`, by index. */
export function compareStrains(a: Strain, b: Strain): number {
  return a.index - b.index;
}

export function sortStrains(strains: Strain[]): Strain[] {
  return [...strains].sort(compareStrains);
}

// These are never instantiated, but rather just used to add asserts.
// Cards use Suits, but Calls use Strains. They both end up using
// Strain objects, but Card-related calls use Suit.from* to catch typos.
export class Suit {
  static readonly SUIT_NAMES = ["Clubs", "Diamonds", "Hearts", "Spades"];
  static readonly SUIT_CHARS = ["C", "D", "H", "S"];

  static fromIndex(index: number): Strain {
    assert(index >= 0 && index < 4 && Number.isInteger(index));
    return Strain.fromIndex(index);
  }

  static fromChar(char: string): Strain {
    assert(Suit.SUIT_CHARS.includes(char));
    return Strain.fromChar(char);
  }
}

// FIXME: These should eventually all move onto Strain e.g. Strain.SUITS, Strain.MINORS, etc.
export const SUITS: Strain[] = [0, 1, 2, 3].map((index) =>
  Strain.fromIndex(index),
);
export const [CLUBS, DIAMONDS, HEARTS, SPADES] = SUITS;
export const NOTRUMP = Strain.fromIndex(4);
export const STRAINS: Strain[] = [0, 1, 2, 3, 4].map((index) =>
  Strain.fromIndex(index),
);

export const MINORS: Strain[] = [CLUBS, DIAMONDS];
export const MAJORS: Strain[] = [HEARTS, SPADES];
