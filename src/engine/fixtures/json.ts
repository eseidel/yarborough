// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Python's `json.dumps` as python/tests/export_fixtures.py called it, byte for
// byte, so the regenerated fixtures diff clean against the files Python wrote:
//
// - `.jsonl` records: `json.dumps(record, sort_keys=True, separators=(",", ":"),
//   ensure_ascii=False)`, one per line.
// - `.json` files: `json.dump(data, f, indent=2, sort_keys=True,
//   ensure_ascii=False)` followed by one newline.
//
// What that means in detail: keys sorted by code point at every level; with
// `indent=2` the item separator is "," at the end of the line and the key
// separator ": ", an empty list or object prints as `[]` or `{}` on its own,
// and every other container opens and closes on lines of their own with each
// item indented one more level; `ensure_ascii=False` writes non-ASCII text
// (the ♣ of a category name) raw, and escapes only `"`, `\`, and the control
// characters (short escapes for \b \f \n \r \t, `\u00xx` in lowercase for the
// rest), which is exactly what `JSON.stringify` does to a string.  Integers
// print as integers; the fixtures hold no float, so a non-integral number is
// refused rather than guessed at (Python would print `1.0` where JavaScript
// prints `1`).

/** What the fixture writers produce: JSON values with string keys. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Python's `sorted(keys)` for `str` keys: by code point, not by locale. */
export function sortedKeys(object: object): string[] {
  return Object.keys(object).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function scalar(value: unknown, path: string): string {
  if (value === null) {
    return "null";
  }
  if (value === true || value === false) {
    return value ? "true" : "false";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(
        `${path}: ${value} is not an integer (no fixture holds a float)`,
      );
    }
    return String(value);
  }
  throw new Error(`${path}: cannot serialize ${typeof value}`);
}

/**
 * `json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`.
 * The value is typed `unknown` because the records are plain interfaces
 * without index signatures; what it may hold is checked here (`JsonValue`).
 */
export function pyJsonCompact(value: unknown, path = "$"): string {
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => pyJsonCompact(item, `${path}[${index}]`)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as { readonly [key: string]: unknown };
    return `{${sortedKeys(record)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${pyJsonCompact(record[key], `${path}.${key}`)}`,
      )
      .join(",")}}`;
  }
  return scalar(value, path);
}

/** `json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False)`. */
export function pyJsonIndented(value: unknown, level = 0, path = "$"): string {
  const indent = "  ".repeat(level + 1);
  const close = "  ".repeat(level);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    const items = value.map(
      (item, index) =>
        `${indent}${pyJsonIndented(item, level + 1, `${path}[${index}]`)}`,
    );
    return `[\n${items.join(",\n")}\n${close}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as { readonly [key: string]: unknown };
    const keys = sortedKeys(record);
    if (keys.length === 0) {
      return "{}";
    }
    const items = keys.map(
      (key) =>
        `${indent}${JSON.stringify(key)}: ${pyJsonIndented(record[key], level + 1, `${path}.${key}`)}`,
    );
    return `{\n${items.join(",\n")}\n${close}}`;
  }
  return scalar(value, path);
}

/** The text of a `.json` fixture: `_write_json`. */
export function jsonFileText(data: unknown): string {
  return `${pyJsonIndented(data)}\n`;
}

/** The text of a `.jsonl` fixture: `_write_jsonl`. */
export function jsonlFileText(records: readonly unknown[]): string {
  return records.map((record) => `${pyJsonCompact(record)}\n`).join("");
}
