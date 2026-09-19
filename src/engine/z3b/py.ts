// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Python's `repr` for the values the DSL prints: the fixtures record the
// `repr` of every precondition (`LastBidHasStrain('Partner', (Strain(Clubs),
// Strain(Diamonds)))`), so the port must tell a tuple from a list and quote a
// string as Python does.  `tuple(...)` marks a Python tuple where a rule
// declares one; a plain array is a Python list.

import { Call } from "../core/call";
import { Strain } from "../core/suit";
import { EnumValue } from "./enum";

/** A Python tuple: an array that `pyRepr` prints with parentheses. */
export class PyTuple<T> extends Array<T> {}

export function tuple<T>(...items: T[]): PyTuple<T> {
  const result = new PyTuple<T>();
  result.push(...items);
  return result;
}

/** Something with a Python `__repr__` of its own. */
export interface HasRepr {
  repr(): string;
}

function hasRepr(value: object): value is HasRepr {
  return typeof (value as HasRepr).repr === "function";
}

/** Python's `repr` of a str: single quotes unless the text holds one and no double quote. */
export function pyStringRepr(text: string): string {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  let escaped = "";
  for (const char of text) {
    if (char === "\\") {
      escaped += "\\\\";
    } else if (char === quote) {
      escaped += "\\" + quote;
    } else if (char === "\n") {
      escaped += "\\n";
    } else if (char === "\t") {
      escaped += "\\t";
    } else {
      escaped += char;
    }
  }
  return quote + escaped + quote;
}

export function pyRepr(value: unknown): string {
  if (value === null || value === undefined) {
    return "None";
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return pyStringRepr(value);
  }
  if (value instanceof PyTuple) {
    if (value.length === 1) {
      return `(${pyRepr(value[0])},)`;
    }
    return `(${value.map(pyRepr).join(", ")})`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(pyRepr).join(", ")}]`;
  }
  if (
    value instanceof Strain ||
    value instanceof Call ||
    value instanceof EnumValue
  ) {
    return value.repr();
  }
  if (typeof value === "object" && hasRepr(value)) {
    return value.repr();
  }
  throw new Error(`no Python repr for ${String(value)}`);
}
