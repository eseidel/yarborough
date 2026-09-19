// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/prefer.py.
//
// A rule's own preference among its calls (Rule.prefer).
//
//     static prefer = [
//       new Longest("1H", "1S"),                     // a five-card major, the longer first
//       "1S", "1H",                                  // five-five: spades
//       new Longest("1C", "1D"),                     // the longer minor
//       ["1C", z3.And(clubs.eq(3), diamonds.eq(3))], // three-three: clubs
//       "1D", "1C",                                  // four-four: diamonds
//     ];
//
// Entries are read best first.  A plain call name, Highest(...) and Cheapest(...) place their
// calls unconditionally; a call takes the first such entry that names it, and a call no entry
// names comes after every entry, cheapest first.  Longest(...) and [names, condition] add a
// variant of each named call that ranks at that entry when the hand meets the condition; the
// variant is negated for partner like any better unmade call, so bidding 1S with Longest
// in force denies that hearts are longer.  Within one entry, ties go to the cheaper call
// (Highest: the dearer level, then the higher suit; HigherSuit: the higher suit, then the
// cheaper level; LowestLevel: the lower level, then the higher suit).  The key of a variant is
// (entry index, tie index): a smaller key is a better call.

import { assert } from "../core/assert";
import { Call, compareCalls, sortCalls } from "../core/call";
import { sortStrains, type Strain } from "../core/suit";
import type { Constraints } from "./constraints";
import type { History } from "./history";
import * as model from "./model";
import type { PriorityKey } from "./purposes";
import { type Expr, z3 } from "./z3";

/** Python's tuple comparison of two order keys. */
function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return a.length - b.length;
}

export class Entry {
  static readonly conditional: boolean = false;
  readonly names: readonly string[];

  constructor(...names: string[]) {
    this.names = names;
  }

  get conditional(): boolean {
    return (this.constructor as typeof Entry).conditional;
  }

  condition(
    history: History | null,
    call: Call,
    others: Call[],
  ): Constraints | null {
    void history;
    void call;
    void others;
    return null;
  }

  /** Ties within the entry: the smaller key is the better call (cheapest first). */
  orderKey(call: Call): number[] | Call {
    return call;
  }

  /** `sorted(calls, key=self.order_key)`. */
  compare(a: Call, b: Call): number {
    const left = this.orderKey(a);
    const right = this.orderKey(b);
    if (left instanceof Call || right instanceof Call) {
      return compareCalls(a, b);
    }
    return compareKeys(left, right);
  }
}

/** The named call whose suit is strictly longer than every other named suit. */
export class Longest extends Entry {
  static override readonly conditional = true;

  override condition(
    history: History | null,
    call: Call,
    others: Call[],
  ): Expr {
    void history;
    const mine = model.exprForSuit(call.strain!);
    const otherStrains = sortStrains([
      ...new Set(
        others
          .filter((other) => other.strain !== call.strain)
          .map((other) => other.strain as Strain),
      ),
    ]);
    return z3.And(
      otherStrains.map((strain) => mine.gt(model.exprForSuit(strain))),
    );
  }
}

/** The named calls, the dearest first: the highest level the hand is worth. */
export class Highest extends Entry {
  override orderKey(call: Call): number[] {
    return [-call.level!, -call.strain!.index];
  }
}

/**
 * The named calls, the higher suit first whatever the level (a jump shift or a reverse
 * in spades before one in hearts); within a suit the cheaper call.
 */
export class HigherSuit extends Entry {
  override orderKey(call: Call): number[] {
    return [-call.strain!.index, call.level!];
  }
}

/**
 * The named calls, the lowest level first and the higher suit first within a level
 * (a natural part score: 2S before 2H before 3C).
 */
export class LowestLevel extends Entry {
  override orderKey(call: Call): number[] {
    return [call.level!, -call.strain!.index];
  }
}

/** The named calls, the cheapest first (the default for calls no entry names). */
export class Cheapest extends Entry {}

/** An `order` argument of Conditional: an Entry class for the ties. */
export type EntryClass = new (...names: string[]) => Entry;

/**
 * A [names, condition[, order]] entry: the named calls rank here when the hand meets
 * the condition; `order` is an Entry class (Cheapest, Highest, LowestLevel) for the ties.
 */
export class Conditional extends Entry {
  static override readonly conditional = true;
  readonly _condition: Constraints;
  readonly _order: Entry;

  constructor(
    names: readonly string[],
    condition: Constraints,
    order: EntryClass = Cheapest,
  ) {
    super(...names);
    this._condition = condition;
    this._order = new order();
  }

  override condition(
    history: History | null,
    call: Call,
    others: Call[],
  ): Constraints {
    void history;
    void call;
    void others;
    return this._condition;
  }

  override orderKey(call: Call): number[] | Call {
    return this._order.orderKey(call);
  }
}

/** A tuple entry: `[names, condition]` or `[names, condition, order]`. */
export type ConditionalTuple =
  | readonly [string | readonly string[], Constraints]
  | readonly [string | readonly string[], Constraints, EntryClass];

/** What Rule.prefer holds: entries, plain call names and conditional tuples. */
export type PreferEntry = Entry | string | ConditionalTuple;
export type PreferList = readonly PreferEntry[];

export function _normalize(prefer: PreferList): Entry[] {
  const entries: Entry[] = [];
  for (const entry of prefer) {
    if (entry instanceof Entry) {
      entries.push(entry);
    } else if (typeof entry === "string") {
      entries.push(new Cheapest(entry));
    } else if (
      Array.isArray(entry) &&
      (entry.length === 2 || entry.length === 3) &&
      typeof entry[1] !== "string"
    ) {
      const names = typeof entry[0] === "string" ? [entry[0]] : entry[0];
      entries.push(new Conditional(names, entry[1], entry[2]));
    } else {
      assert(
        false,
        `prefer entry ${JSON.stringify(entry)} is not a call name, a tuple (names, condition) or an Entry`,
      );
    }
  }
  return entries;
}

/**
 * (key, condition) pairs for `call`: one unconditional variant and one per conditional
 * entry naming the call.  `condition` is null or a z3 expression / Constraint to fold into
 * the meaning.
 */
export function variants(
  prefer: PreferList,
  knownCalls: readonly Call[],
  history: History | null,
  call: Call,
): [PriorityKey, Constraints | null][] {
  const entries = _normalize(prefer);
  let unconditional: [PriorityKey, Constraints | null] | null = null;
  const result: [PriorityKey, Constraints | null][] = [];
  entries.forEach((entry, index) => {
    if (!entry.names.includes(call.name)) {
      return;
    }
    const named = entry.names
      .map((name) => Call.fromString(name))
      .sort((a, b) => entry.compare(a, b));
    const tie = named.map((other) => other.name).indexOf(call.name);
    if (entry.conditional) {
      const others = named.filter((other) => other.name !== call.name);
      result.push([[index, tie], entry.condition(history, call, others)]);
    } else if (unconditional === null) {
      unconditional = [[index, tie], null];
    }
  });
  if (unconditional === null) {
    const unnamed = sortCalls(
      knownCalls.filter(
        (known) =>
          !entries.some(
            (entry) => !entry.conditional && entry.names.includes(known.name),
          ),
      ),
    );
    unconditional = [
      [entries.length, unnamed.map((known) => known.name).indexOf(call.name)],
      null,
    ];
  }
  result.push(unconditional);
  return result;
}

/** Every call name a prefer list mentions. */
export function names(prefer: PreferList): Set<string> {
  return new Set(_normalize(prefer).flatMap((entry) => [...entry.names]));
}
