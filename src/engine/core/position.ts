// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/core/position.py.

import { assert } from "./assert";

const POSITION_CACHE = new Map<number, Position>();

const POSITION_NAMES = ["North", "East", "South", "West"];
const POSITION_CHARS = ["N", "E", "S", "W"];

export class Position {
  readonly index: number;

  constructor(index: number, thisShouldNotBeCalledDirectly = false) {
    assert(thisShouldNotBeCalledDirectly);
    this.index = index;
  }

  /** Positions are singletons, so `fromIndex` hands back the same object. */
  static fromIndex(index: number): Position {
    assert(index >= 0 && index < 4 && Number.isInteger(index));
    const cached = POSITION_CACHE.get(index);
    if (cached) {
      return cached;
    }
    const position = new Position(index, true);
    POSITION_CACHE.set(index, position);
    return position;
  }

  static fromName(name: string): Position {
    const index = POSITION_NAMES.indexOf(name);
    assert(index !== -1, `${name} is not a valid position name`);
    return Position.fromIndex(index);
  }

  static fromChar(char: string): Position {
    const index = POSITION_CHARS.indexOf(char);
    assert(index !== -1, `${char} is not a valid position char`);
    return Position.fromIndex(index);
  }

  get name(): string {
    return POSITION_NAMES[this.index];
  }

  get char(): string {
    return this.name[0];
  }

  get lho(): Position {
    return this.positionAfterNCalls(1);
  }

  get partner(): Position {
    return this.positionAfterNCalls(2);
  }

  get rho(): Position {
    return this.positionAfterNCalls(3);
  }

  toString(): string {
    return this.name;
  }

  equals(other: Position | null | undefined): boolean {
    return other != null && this.index === other.index;
  }

  inPartnershipWith(position: Position | null | undefined): boolean {
    return position === this || position === this.partner;
  }

  positionAfterNCalls(offset: number): Position {
    const otherIndex = (((this.index + offset) % 4) + 4) % 4;
    return Position.fromIndex(otherIndex);
  }

  callsBetween(other: Position): number {
    return (((other.index - this.index) % 4) + 4) % 4;
  }
}

/** Python's `Position` has no ordering; this is the `N E S W` index order. */
export function comparePositions(a: Position, b: Position): number {
  return a.index - b.index;
}

// FIXME: Should these move on to Position as Position.NORTH and Position.ALL?
export const POSITIONS: Position[] = [0, 1, 2, 3].map((index) =>
  Position.fromIndex(index),
);
export const [NORTH, EAST, SOUTH, WEST] = POSITIONS;
