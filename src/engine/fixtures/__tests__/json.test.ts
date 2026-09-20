// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// json.ts against Python's `json.dumps`: literal strings for the layout
// rules (sorted keys, empty containers, indentation, escapes, raw non-ASCII),
// and the committed fixtures themselves, which Python wrote: every record
// parsed and serialized again must give back its own bytes.

import { describe, expect, it } from "vitest";
import categoriesText from "../../../../tests/engine-fixtures/categories.json?raw";
import coreCasesText from "../../../../tests/engine-fixtures/core-cases.json?raw";
import decisionsText from "../../../../tests/engine-fixtures/decisions.jsonl?raw";
import interpretationsText from "../../../../tests/engine-fixtures/interpretations.jsonl?raw";
import meaningsText from "../../../../tests/engine-fixtures/meanings.jsonl?raw";
import randomDealsText from "../../../../tests/engine-fixtures/random-deals.jsonl?raw";
import rulesManifestText from "../../../../tests/engine-fixtures/rules-manifest.json?raw";
import snapshotsText from "../../../../tests/engine-fixtures/auction-snapshots.jsonl?raw";
import vocabularyText from "../../../../tests/engine-fixtures/vocabulary.json?raw";
import {
  jsonFileText,
  jsonlFileText,
  pyJsonCompact,
  pyJsonIndented,
  sortedKeys,
} from "../json";

describe("pyJsonCompact", () => {
  it("sorts keys and uses no spaces, like separators=(',', ':')", () => {
    expect(
      pyJsonCompact({ b: 1, a: [true, null, "x"], c: { z: 0, y: {} } }),
    ).toBe('{"a":[true,null,"x"],"b":1,"c":{"y":{},"z":0}}');
  });

  it("sorts keys by code point, as Python sorts str", () => {
    // "10" < "2" as strings, and upper case before lower case.
    expect(pyJsonCompact({ "2": 0, "10": 0, "1": 0, b: 0, B: 0, _: 0 })).toBe(
      '{"1":0,"10":0,"2":0,"B":0,"_":0,"b":0}',
    );
    expect(sortedKeys({ b: 0, a: 0, Z: 0 })).toEqual(["Z", "a", "b"]);
  });

  it("writes non-ASCII raw (ensure_ascii=False) and escapes as Python does", () => {
    expect(pyJsonCompact("After 2♣")).toBe('"After 2♣"');
    expect(pyJsonCompact('say "hi"\n\t\\ \u0001')).toBe(
      '"say \\"hi\\"\\n\\t\\\\ \\u0001"',
    );
  });

  it("refuses a float, which Python would print differently", () => {
    expect(() => pyJsonCompact({ a: 1.5 })).toThrow(
      /\$\.a: 1\.5 is not an integer/,
    );
    expect(pyJsonCompact({ a: -3, b: 0 })).toBe('{"a":-3,"b":0}');
  });

  it("refuses what JSON cannot hold", () => {
    expect(() => pyJsonCompact({ a: undefined })).toThrow(
      /\$\.a: cannot serialize/,
    );
  });
});

describe("pyJsonIndented", () => {
  it("lays out nested containers as indent=2 does, with empty ones inline", () => {
    const text = pyJsonIndented({
      roles: [{ calls: "", role: "Opening" }, []],
      rules: {},
      known: ["a", "b"],
      n: null,
    });
    expect(text).toBe(
      [
        "{",
        '  "known": [',
        '    "a",',
        '    "b"',
        "  ],",
        '  "n": null,',
        '  "roles": [',
        "    {",
        '      "calls": "",',
        '      "role": "Opening"',
        "    },",
        "    []",
        "  ],",
        '  "rules": {}',
        "}",
      ].join("\n"),
    );
  });

  it("ends a .json file with one newline and a .jsonl file with one per record", () => {
    expect(jsonFileText([])).toBe("[]\n");
    expect(jsonlFileText([{ a: 1 }, [2]])).toBe('{"a":1}\n[2]\n');
    expect(jsonlFileText([])).toBe("");
  });
});

describe("the committed fixtures, written by Python", () => {
  it.each([
    ["vocabulary.json", vocabularyText],
    ["categories.json", categoriesText],
    ["core-cases.json", coreCasesText],
    ["rules-manifest.json", rulesManifestText],
  ])("%s comes back byte for byte from jsonFileText", (_name, text) => {
    expect(jsonFileText(JSON.parse(text))).toBe(text);
  });

  it.each([
    ["auction-snapshots.jsonl", snapshotsText],
    ["meanings.jsonl", meaningsText],
    ["decisions.jsonl", decisionsText],
    ["interpretations.jsonl", interpretationsText],
    ["random-deals.jsonl", randomDealsText],
  ])("%s comes back byte for byte from jsonlFileText", (_name, text) => {
    // The first records of each file, and the ones with escapes, are enough
    // to pin the layout; every record would be a needless second parse of
    // seventeen megabytes.
    const lines = text.split("\n").filter((line) => line.length > 0);
    const sample = [
      ...lines.slice(0, 20),
      ...lines.filter((line) => line.includes("\\")).slice(0, 5),
    ];
    expect(sample.length).toBeGreaterThan(0);
    expect(jsonlFileText(sample.map((line) => JSON.parse(line)))).toBe(
      sample.map((line) => `${line}\n`).join(""),
    );
  });
});
