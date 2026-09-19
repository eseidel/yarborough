// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// printedForm reproduces the exporter's text (z3py's sexpr() with aliasing
// off and whitespace collapsed) from the binding's default printing, which
// aliases deep and shared subterms with `let`.  The expected strings and the
// hash were produced by z3py 5.1.0 with pp.min_alias_size and pp.max_depth
// raised, on the same constructions.

import { describe, expect, it } from "vitest";
import { printedForm, printedFormOfText } from "../printed";
import { z3 } from "../z3";
import { fixtureHash, sha256Hex } from "./fixtures";

describe("printedForm", () => {
  const spades = z3.Int("spades");
  const hearts = z3.Int("hearts");

  it("collapses whitespace when nothing is aliased", () => {
    const terms = Array.from({ length: 30 }, (_, i) => spades.gt(i));
    const expr = z3.And(terms);
    expect(expr.sexpr()).toContain("\n");
    expect(printedForm(expr)).toBe(
      `(and ${terms.map((term) => term.sexpr()).join(" ")})`,
    );
    expect(printedFormOfText("  (and\n   a   b)")).toBe("(and a b)");
  });

  it("keeps a shared inner conjunction nested, as Z3 prints it unaliased", () => {
    const shared = z3.And(spades.ge(3), hearts.ge(3));
    const expr = z3.And(
      z3.And(shared, spades.le(5)),
      z3.Or(shared, hearts.le(5)),
    );
    expect(printedForm(expr)).toBe(
      "(and (and (>= spades 3) (>= hearts 3)) (<= spades 5) (or (and (>= spades 3) (>= hearts 3)) (<= hearts 5)))",
    );
    // An unshared inner conjunction is flattened.
    expect(
      printedForm(z3.And(z3.And(spades.ge(3), hearts.ge(3)), spades.le(5))),
    ).toBe("(and (>= spades 3) (>= hearts 3) (<= spades 5))");
  });

  it("inlines the let aliases of a deep expression with a shared subterm", () => {
    const big = z3.And(Array.from({ length: 12 }, (_, i) => spades.ge(i)));
    let t = spades.ge(5);
    for (let i = 0; i < 7; i++) {
      t = z3.Or(z3.And(t, big), z3.Not(z3.And(t, big)));
    }
    expect(t.sexpr()).toContain("(let ");
    const printed = printedForm(t);
    expect(printed).not.toContain("let");
    expect(printed).not.toContain("a!");
    expect(printed).toHaveLength(49416);
    expect(fixtureHash(printed)).toBe("20808e69e30a34e9");
  });

  it("expands parallel and nested lets by scope", () => {
    expect(
      printedFormOfText("(let ((a!1 (f x)) (a!2 (g a!1))) (h a!1 a!2))"),
    ).toBe("(h (f x) (g a!1))");
    expect(
      printedFormOfText(
        "(let ((a!1 (f x)))\n(let ((a!2 (g a!1)))\n  (h a!1 a!2)))",
      ),
    ).toBe("(h (f x) (g (f x)))");
    expect(printedFormOfText("(let ((a!1 and)) (or a!1))")).toBe("(or and)");
  });

  it("rejects truncated or unbalanced text", () => {
    expect(() => printedFormOfText("(and a ...")).toThrow(/truncated/);
    expect(() => printedFormOfText("(let ((a!1 x)) (f a!1)")).toThrow(
      /unbalanced/,
    );
    expect(() => printedFormOfText("(let ((a!1 x)) (f a!1)))")).toThrow(
      /trailing/,
    );
  });

  it("hashes as hashlib does", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    // Longer than one block, and past the 56-byte padding boundary.
    expect(sha256Hex("a".repeat(56))).toBe(
      "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a",
    );
    expect(sha256Hex("a".repeat(1000))).toBe(
      "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
    );
    expect(fixtureHash("(and true)")).toHaveLength(16);
  });
});
