// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// A translation of EnumTest in python/tests/test_rule_compiler.py.

import { describe, expect, it } from "vitest";
import { Enum, makeEnum, sortedEnumValues } from "../enum";

describe("Enum", () => {
  it("orders its values by index and only within one enum", () => {
    const e = makeEnum("A", "B");
    expect(e.A.lt(e.B)).toBe(true);
    expect(e.A.lt(e.A)).toBe(false);
    expect(e.A.le(e.A)).toBe(true);
    expect(e.A.gt(e.A)).toBe(false);
    expect(e.B.gt(e.A)).toBe(true);
    expect(e.A.lt(makeEnum("A", "B").B)).toBe(false); // values of different enums are unordered
  });

  it("looks values up by key and by index", () => {
    const e = new Enum("A", "B", "C");
    expect(e.get("B").key).toBe("B");
    expect(e.get("B").index).toBe(1);
    expect(e.at(2).key).toBe("C");
    expect(e.length).toBe(3);
    expect([...e].map((value) => value.key)).toEqual(["A", "B", "C"]);
    expect(e.get("C").repr()).toBe("C");
    expect(String(e.get("C"))).toBe("C");
    expect(() => e.get("D" as "A")).toThrow(/not a value/);
    expect(sortedEnumValues([e.at(2), e.at(0)]).map((v) => v.key)).toEqual([
      "A",
      "C",
    ]);
  });
});
