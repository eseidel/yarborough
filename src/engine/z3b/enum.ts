// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/enum.py: an ordered enumeration whose values compare
// by index within one enum (values of different enums are unordered), used
// for the annotations, the rule categories and the positions.

export class EnumValue {
  readonly enum: Enum<string>;
  readonly index: number;
  readonly key: string;

  constructor(owner: Enum<string>, index: number, key: string) {
    this.enum = owner;
    this.index = index;
    this.key = key;
  }

  /** Python's `__repr__`. */
  repr(): string {
    return this.key;
  }

  toString(): string {
    return this.key;
  }

  /** Python's `__lt__`: only values of the same enum are ordered. */
  lt(other: EnumValue): boolean {
    return this.enum === other.enum && this.index < other.index;
  }

  /** The rest of `functools.total_ordering`, derived from `__lt__` and `__eq__`. */
  le(other: EnumValue): boolean {
    return this.lt(other) || this === other;
  }

  gt(other: EnumValue): boolean {
    return !this.le(other);
  }

  ge(other: EnumValue): boolean {
    return !this.lt(other);
  }
}

export class Enum<K extends string> {
  private readonly _values: EnumValue[];

  constructor(...keys: K[]) {
    this._values = keys.map((key, index) => new EnumValue(this, index, key));
    for (const value of this._values) {
      Object.defineProperty(this, value.key, { value, enumerable: true });
    }
  }

  get(key: K): EnumValue {
    const value = (this as Record<string, unknown>)[key];
    if (!(value instanceof EnumValue)) {
      throw new Error(`${key} is not a value of this enum`);
    }
    return value;
  }

  /** Python's `__len__`. */
  get length(): number {
    return this._values.length;
  }

  /** Python's `__getitem__`. */
  at(index: number): EnumValue {
    return this._values[index];
  }

  /** Every value in order (Python's `__iter__`). */
  get values(): readonly EnumValue[] {
    return this._values;
  }

  [Symbol.iterator](): Iterator<EnumValue> {
    return this._values[Symbol.iterator]();
  }
}

/** An Enum whose values are also properties: `annotations.Opening`. */
export type EnumOf<K extends string> = Enum<K> & {
  readonly [P in K]: EnumValue;
};

export function makeEnum<const K extends string>(...keys: K[]): EnumOf<K> {
  return new Enum(...keys) as EnumOf<K>;
}

/** A new array of the values in enum order (`sorted(values, key=index)`). */
export function sortedEnumValues(values: Iterable<EnumValue>): EnumValue[] {
  return [...values].sort((a, b) => a.index - b.index);
}
