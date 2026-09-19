// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// A translation of python/z3b/test_prefer.py: a rule's own preference among
// its calls, the fallback levels, the purpose strain preferences and the
// priority ordering.  OrderingTest uses two exemplar rules as the two
// distinct rule identities the Python takes from Raise and
// RaiseOverTakeoutDouble; the collision test (PossibleCalls, the production
// order) and the per-call preconditions test wait for the kernel (phase 6)
// and RaiseOverTakeoutDouble (phase 5).

import { describe, expect, it } from "vitest";
import { Call } from "../../core/call";
import { hearts, spades } from "../model";
import * as prefer from "../prefer";
import { Cheapest, HigherSuit, Highest, Longest, LowestLevel } from "../prefer";
import { printedForm } from "../printed";
import { Priority } from "../purposes";
import * as purposes from "../purposes";
import { PriorityOrdering, RuleCompiler, rule } from "../rule_compiler";
import { NotrumpOpening, OneLevelSuitOpening } from "../rules";
import { z3 } from "../z3";

/** call name -> sorted keys of its variants, with no history (unconditional entries only). */
function keys(
  entries: prefer.PreferList,
  names: string[],
): Record<string, [number, number][]> {
  const calls = names.map((n) => Call.fromString(n));
  return Object.fromEntries(
    names.map((n) => [
      n,
      prefer
        .variants(entries, calls, null, Call.fromString(n))
        .map(([key]) => [key[0], key[1]] as [number, number])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    ]),
  );
}

describe("prefer entries", () => {
  it("ranks a plain name at its entry and unnamed calls last, cheapest first", () => {
    const k = keys(["2S", "2H"], ["2C", "2D", "2H", "2S"]);
    expect(k["2S"]).toEqual([[0, 0]]);
    expect(k["2H"]).toEqual([[1, 0]]);
    expect(k["2C"]).toEqual([[2, 0]]);
    expect(k["2D"]).toEqual([[2, 1]]);
  });

  it("Highest is the dearer level then the higher suit", () => {
    const k = keys([new Highest("2H", "2S", "3H")], ["2H", "2S", "3H"]);
    expect(k["3H"]).toEqual([[0, 0]]);
    expect(k["2S"]).toEqual([[0, 1]]);
    expect(k["2H"]).toEqual([[0, 2]]);
  });

  it("HigherSuit ignores the level", () => {
    const k = keys([new HigherSuit("2S", "3C", "3H")], ["2S", "3C", "3H"]);
    expect(k["2S"]).toEqual([[0, 0]]);
    expect(k["3H"]).toEqual([[0, 1]]);
    expect(k["3C"]).toEqual([[0, 2]]);
  });

  it("LowestLevel then the higher suit", () => {
    const k = keys([new LowestLevel("2C", "2S", "3C")], ["2C", "2S", "3C"]);
    expect(k["2S"]).toEqual([[0, 0]]);
    expect(k["2C"]).toEqual([[0, 1]]);
    expect(k["3C"]).toEqual([[0, 2]]);
  });

  it("Cheapest is the default", () => {
    expect(keys([], ["1H", "1S"])).toEqual({ "1H": [[0, 0]], "1S": [[0, 1]] });
    expect(keys([new Cheapest("1S", "1H")], ["1H", "1S"])).toEqual({
      "1H": [[0, 0]],
      "1S": [[0, 1]],
    });
  });

  it("Longest adds a variant whose condition compares the suits", () => {
    const calls = ["1H", "1S"].map((n) => Call.fromString(n));
    const variants = prefer.variants(
      [new Longest("1H", "1S")],
      calls,
      null,
      Call.fromString("1H"),
    );
    expect(variants.map(([key]) => [...key])).toEqual([
      [0, 0],
      [1, 0],
    ]);
    const condition = variants[0][1];
    expect(printedForm(condition as never)).toBe("(and (> hearts spades))");
    expect(
      printedForm(
        z3.simplify(z3.Implies(condition as never, hearts.gt(spades))),
      ),
    ).toBe("true");
    expect(variants[1][1]).toBeNull();
  });

  it("a conditional entry may name its tie order", () => {
    const calls = ["2D", "2H", "2S"].map((n) => Call.fromString(n));
    const first = prefer.variants(
      [[["2D", "2H", "2S"], spades.ge(4), Highest]],
      calls,
      null,
      Call.fromString("2S"),
    )[0][0];
    expect([...first]).toEqual([0, 0]);
  });

  it("names lists every call mentioned", () => {
    expect(
      prefer.names([
        "2S",
        new Longest("1H", "1S"),
        [["2D"], hearts.gt(spades)],
      ]),
    ).toEqual(new Set(["2S", "1H", "1S", "2D"]));
  });

  it("the compiler rejects a preference for a call the rule cannot make", () => {
    class Wrong extends OneLevelSuitOpening {
      static override dsl = rule({ prefer: ["5H"] });
    }
    expect(() => RuleCompiler.compile(Wrong)).toThrow(
      /prefer names calls it cannot make: \["5H"\]/,
    );
  });

  it("rejects an entry that is neither a name, a tuple nor an Entry", () => {
    expect(() => prefer._normalize([["1C", "1D"] as never])).toThrow(
      /prefer entry/,
    );
  });
});

describe("priority ordering", () => {
  const lt = (left: Priority, right: Priority) =>
    new PriorityOrdering().lt(left, right);
  const rule1 = RuleCompiler.compile(OneLevelSuitOpening);
  const other = RuleCompiler.compile(NotrumpOpening);

  it("purpose first", () => {
    expect(lt(new Priority("Game"), new Priority("Answer"))).toBe(true);
    expect(lt(new Priority("Answer"), new Priority("Game"))).toBe(false);
  });

  it("strain preference before fallback", () => {
    const major = new Priority("Game", { rule: rule1, strain: 0, fallback: 1 });
    const notrump = new Priority("Game", { rule: other, strain: 1 });
    expect(lt(notrump, major)).toBe(true);
    expect(lt(major, notrump)).toBe(false);
  });

  it("a deeper fallback loses", () => {
    const specific = new Priority("SupportMajors", { rule: rule1 });
    const backstop = new Priority("SupportMajors", {
      rule: other,
      fallback: 1,
    });
    const deeper = new Priority("SupportMajors", { rule: other, fallback: 2 });
    expect(lt(backstop, specific)).toBe(true);
    expect(lt(deeper, backstop)).toBe(true);
    expect(lt(specific, backstop)).toBe(false);
  });

  it("the key orders one rule's calls and two rules collide", () => {
    const better = new Priority("SupportMajors", { rule: rule1, key: [0, 0] });
    const worse = new Priority("SupportMajors", { rule: rule1, key: [1, 0] });
    expect(lt(worse, better)).toBe(true);
    const elsewhere = new Priority("SupportMajors", {
      rule: other,
      key: [0, 0],
    });
    expect(lt(worse, elsewhere)).toBe(false);
    expect(lt(elsewhere, worse)).toBe(false);
    // Rules compare by name too (a recompiled rule is the same rule).
    const sameName = new Priority("SupportMajors", {
      rule: { name: rule1.name },
      key: [0, 0],
    });
    expect(lt(worse, sameName)).toBe(true);
    // A strain of null is incomparable with a strain: the key decides.
    const unranked = new Priority("Game", { rule: rule1, key: [0, 1] });
    const ranked = new Priority("Game", {
      rule: rule1,
      strain: 2,
      key: [0, 0],
    });
    expect(lt(unranked, ranked)).toBe(true);
    expect(lt(ranked, unranked)).toBe(false);
  });
});

describe("strain preference", () => {
  it("Game prefers a major, then stopped notrump, then a minor", () => {
    expect(purposes.strainVariants("Game", Call.fromString("4H"))).toEqual([
      [0, null],
    ]);
    expect(purposes.strainVariants("Game", Call.fromString("3N"))).toEqual([
      [1, "stopped"],
      [3, null],
    ]);
    expect(purposes.strainVariants("Game", Call.fromString("5C"))).toEqual([
      [2, null],
    ]);
    expect(purposes.strainVariants("Slam", Call.fromString("6N"))).toEqual([
      [2, null],
    ]);
    expect(purposes.strainVariants("Support", Call.fromString("4H"))).toEqual([
      [null, null],
    ]);
    expect(purposes.strainVariants("Game", Call.fromString("P"))).toEqual([
      [null, null],
    ]);
  });
});
