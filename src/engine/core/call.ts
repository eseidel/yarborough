// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/core/call.py.

import { assert } from "./assert";
import { compareStrains, NOTRUMP, Strain, STRAINS, SUITS } from "./suit";

// FIXME: Doesn't python have a nicer way to do this?
function valuesBetween(
  start: string,
  stop: string,
  iterable: string[],
): string[] {
  // FIXME: Should assert that start/stop are in iterable?
  const values: string[] = [];
  let yielding = false;
  for (const value of iterable) {
    if (value === start) {
      yielding = true;
    }
    if (yielding) {
      values.push(value);
    }
    // Putting this after the push to make the range inclusive.
    if (value === stop) {
      break;
    }
  }
  return values;
}

const NON_CONTRACT_NAMES = ["P", "X", "XX"];

// Call objects should be global singletons and thus immutable.
const CALL_CACHE = new Map<string, Call>();

export class Call {
  readonly name: string;
  readonly strain: Strain | null;
  readonly level: number | null;

  constructor(name: string) {
    this.name = name.toUpperCase();
    if (NON_CONTRACT_NAMES.includes(this.name)) {
      this.strain = null;
      this.level = null;
    } else {
      assert(this.name.length === 2, `${this.name} is not a valid call name`);
      this.strain = Strain.fromChar(this.name[1]);
      this.level = this.isContract() ? Number.parseInt(this.name[0], 10) : null;
    }
    this._validate();
  }

  static readonly LEVELS = [1, 2, 3, 4, 5, 6, 7];

  toString(): string {
    return this.name;
  }

  repr(): string {
    return `Call('${this.name}')`;
  }

  private _validate(): void {
    if (this.isContract()) {
      assert(this.name.length === 2, `${this.name} is not a valid call name`);
      assert(
        this.level !== null &&
          Number.isInteger(this.level) &&
          this.level >= 0 &&
          this.level < 8 &&
          this.strain !== null &&
          STRAINS.includes(this.strain),
      );
    } else {
      assert(
        NON_CONTRACT_NAMES.includes(this.name),
        `${this.name} is not a valid call name`,
      );
    }
  }

  // Calls are cached so that the same name always hands back the same object.
  // (The Python caches on the string as passed; here the cache key is the
  // upper-cased name, so `fromString('p')` and `fromString('P')` are identical
  // as well as equal.)
  static fromString(string: string): Call {
    const key = string.toUpperCase();
    const cached = CALL_CACHE.get(key);
    if (cached) {
      return cached;
    }
    const call = new Call(string);
    CALL_CACHE.set(key, call);
    return call;
  }

  static fromLevelAndStrain(level: number, strain: Strain): Call {
    // Use fromString to share the cache.
    return Call.fromString(`${level}${strain.char}`);
  }

  // This is an odd way of saying "not pass, not double, not redouble"
  isContract(): boolean {
    return this.strain !== null;
  }

  isPass(): boolean {
    return this.name === "P";
  }

  isDouble(): boolean {
    // FIXME: It's unclear if double should include the information about the
    // bid it's doubling or not.  (i.e. 1NX)
    return this.name === "X";
  }

  isRedouble(): boolean {
    return this.name === "XX";
  }

  equals(other: Call | null | undefined): boolean {
    return other != null && this.name === other.name;
  }

  // These should also operate on Call objects and we should use calls.map(call => call.name)
  static suitedNames(): string[] {
    const names: string[] = [];
    for (const level of Call.LEVELS) {
      for (const strain of SUITS) {
        names.push(`${level}${strain.char}`);
      }
    }
    return names;
  }

  static suitedNamesBetween(startName: string, stopName: string): string[] {
    return valuesBetween(startName, stopName, Call.suitedNames());
  }

  static notrumpNames(): string[] {
    return Call.LEVELS.map((level) => `${level}${NOTRUMP.char}`);
  }

  static notrumpNamesBetween(startName: string, stopName: string): string[] {
    return valuesBetween(startName, stopName, Call.notrumpNames());
  }
}

/**
 * Python's `Call.__lt__`: non-contracts first in name order (P, X, XX), then
 * contracts by level, then by strain (C D H S N).
 */
export function compareCalls(a: Call, b: Call): number {
  // This will order all non-contracts before contract bids.
  // So we'll end up with 'P', 'X', 'XX', '1C', ... '7N'.
  if (a.isContract() !== b.isContract()) {
    return a.isContract() ? 1 : -1;
  }
  if (!a.isContract()) {
    // This should return 'P', 'X', 'XX' which seems reasonable.
    if (a.name === b.name) {
      return 0;
    }
    return a.name < b.name ? -1 : 1;
  }
  // Level comparisons are more important than suit comparisons, so 1S will be before 2C.
  if (a.level !== b.level) {
    return a.level! - b.level!;
  }
  // Using the suit enum, this comparison is very easy and will correctly order C, D, H, S
  return compareStrains(a.strain!, b.strain!);
}

/** A new array of `calls` in `compareCalls` order. */
export function sortCalls(calls: Call[]): Call[] {
  return [...calls].sort(compareCalls);
}

// This is a convenience for an old method of specifying calls.
export class Pass extends Call {
  constructor() {
    super("P");
  }
}
