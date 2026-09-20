// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// A translation of RuleCompilerTest in python/tests/test_rule_compiler.py,
// plus the parts of the compiler the TypeScript convention adds: the field
// collection over a class chain with a mixin, the registry names, and the
// validation of a rule class.

import { afterAll, describe, expect, it } from "vitest";
import { Call } from "../../core/call";
import { CallHistory } from "../../core/callhistory";
import { History, Interpreter } from "../bidder";
import { NO_CONSTRAINTS, positions } from "../model";
import { annotations, UnbidSuit } from "../preconditions";
import {
  _isNotEmptyOrNone,
  CompiledRule,
  lookup,
  mro,
  Rule,
  RuleCompiler,
  categories,
  rule,
} from "../rule_compiler";
import {
  JumpShift,
  JumpShiftByOpener,
  OneLevelSuitOpening,
  Opening,
  RebidAfterOneLevelOpen,
  StrongTwoClubs,
} from "../rules";
import { DefaultPass } from "../natural";
import { RULE_CLASSES, StandardAmericanYellowCard } from "../sayc";

const interpreter = new Interpreter();
const interpreted: History[] = [];

/** The interpreted history of an auction; its solvers go back at the end. */
function historyFor(calls: string, vulnerability = "None") {
  const one = interpreter.createHistory(
    CallHistory.fromString(calls, "N", vulnerability),
  );
  interpreted.push(one);
  return one;
}

afterAll(() => {
  for (const one of interpreted) {
    one.release();
  }
});

describe("RuleCompiler", () => {
  it("is_not_empty_or_none", () => {
    expect(_isNotEmptyOrNone(null)).toBe(false);
    expect(_isNotEmptyOrNone([])).toBe(false);
    expect(_isNotEmptyOrNone({})).toBe(false);
    expect(_isNotEmptyOrNone([NO_CONSTRAINTS])).toBe(true);
    expect(_isNotEmptyOrNone(NO_CONSTRAINTS)).toBe(true); // a z3 expression, never compared with ==
  });

  it("gives each call of a converted rule its prefer variants", () => {
    // Each call carries its prefer key, a conditional entry adds a variant, and the keys
    // order the calls as the list reads.
    const compiled = RuleCompiler.compile(OneLevelSuitOpening);
    const history = historyFor("");
    const keys: Record<string, [number, number][]> = {};
    for (const name of ["1C", "1D", "1H", "1S"]) {
      const priorities = [
        ...compiled.meaningOf(history, Call.fromString(name)),
      ].map(([priority]) => priority);
      expect(priorities.every((p) => p.rule === compiled)).toBe(true);
      keys[name] = priorities
        .map((p) => [p.key[0], p.key[1]] as [number, number])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    }
    // 1S: the longest-major variant (entry 0), then the unconditional five-five entry (1).
    expect(keys["1S"][0][0]).toBe(0);
    expect(keys["1S"][keys["1S"].length - 1][0]).toBe(1);
    // 1C: longest minor (3), three-three (4), and last of all unconditionally (6).
    expect(keys["1C"].map((key) => key[0])).toEqual([3, 4, 6]);
    expect(keys["1D"][keys["1D"].length - 1][0]).toBe(5);
  });

  it("compiles a rule once and names it by the registry key", () => {
    expect(RuleCompiler.compile(OneLevelSuitOpening)).toBe(
      RuleCompiler.compile(OneLevelSuitOpening),
    );
    expect(RuleCompiler.compile(OneLevelSuitOpening).name).toBe(
      "OneLevelSuitOpening",
    );
    for (const [name, cls] of Object.entries(RULE_CLASSES)) {
      expect(RuleCompiler.compile(cls, name).name).toBe(name);
      expect(cls.name).toBe(name);
    }
    expect(StandardAmericanYellowCard.rules.map((r) => r.name)).toEqual(
      Object.keys(RULE_CLASSES).sort(),
    );
    // The registry holds every rule of the Python system: 217 of them, first
    // and last by name, and a few in between.
    const names = StandardAmericanYellowCard.rules.map((r) => r.name);
    expect(names).toHaveLength(217);
    expect(names[0]).toBe("AcceptTransferToClubs");
    expect(names[names.length - 1]).toBe("WeakNewSuitAfterOneNotrumpResponse");
    for (const name of [
      "BlackwoodForAces",
      "Cappelletti",
      "DefaultPass",
      "OneLevelSuitOpening",
      "TwoLevelStayman",
    ]) {
      expect(names, name).toContain(name);
    }
    expect(String(RuleCompiler.compile(DefaultPass))).toBe("DefaultPass");
    expect(RuleCompiler.compile(DefaultPass).repr()).toBe("DefaultPass");
  });

  it("collects a field from every class of the chain that defines it, ancestor first", () => {
    expect(mro(JumpShiftByOpener).map((cls) => cls.name)).toEqual([
      "JumpShiftByOpener",
      "JumpShift",
      "RebidAfterOneLevelOpen",
      "OpenerRebid",
      "Rule",
    ]);
    const compiled = RuleCompiler.compile(JumpShiftByOpener);
    expect(compiled.preconditions.map((p) => p.repr())).toEqual([
      "LastBidHasAnnotation('Me', 'Opening')",
      "LastBidHasAnnotation('Me', 'OneLevelSuitOpening')",
      "UnbidSuit()",
      "JumpFromLastContract(1)",
      "Not(LastBidHasAnnotation('Partner', 'NegativeDouble'))",
    ]);
    // A single-valued field is the nearest definition up the chain.
    expect(lookup(JumpShiftByOpener, "category")).toBe(categories.Default);
    expect(lookup(DefaultPass, "category")).toBe(categories.DefaultPass);
    expect(lookup(StrongTwoClubs, "purpose")).toBe("GameForce");
    expect(lookup(Opening, "purpose")).toBeNull();
    // The same mixin applied to another base keeps that base's fields.
    class Other extends JumpShift(RebidAfterOneLevelOpen) {
      static override dsl = rule({
        callNames: "2S",
        sharedConstraints: NO_CONSTRAINTS,
        preconditions: new UnbidSuit(),
      });
    }
    expect(mro(Other).map((cls) => cls.name)).toEqual([
      "Other",
      "JumpShift",
      "RebidAfterOneLevelOpen",
      "OpenerRebid",
      "Rule",
    ]);
    // Rule's own empty default counts too, as `vars(Rule)` does in Python.
    expect(
      RuleCompiler._collectFromAncestors(Other, "preconditions").length,
    ).toBe(5);
  });

  it("flattens tuple keys and joins annotations", () => {
    expect(
      RuleCompiler._flattenTupleKeyedDict({ "2D 2H 2S": 1, "3C": 2 }),
    ).toEqual({ "2D": 1, "2H": 1, "2S": 1, "3C": 2 });
    expect(() =>
      RuleCompiler._flattenTupleKeyedDict({ "2D 2H": 1, "2H": 2 }),
    ).toThrow(/listed twice/);
    const strongTwo = RuleCompiler.compile(StrongTwoClubs);
    expect([...strongTwo._annotations].map((a) => a.key).sort()).toEqual([
      "Artificial",
      "Opening",
      "StrongTwoClubOpening",
    ]);
    const opening = RuleCompiler.compile(OneLevelSuitOpening);
    expect(
      [...opening.annotationsForCall(Call.fromString("1H"))]
        .map((a) => a.key)
        .sort(),
    ).toEqual(["BidHearts", "OneLevelSuitOpening", "Opening"]);
    expect(opening.annotationsForCall(Call.fromString("2H"))).toBe(
      opening._annotations,
    );
    expect(opening.explanationForBid(Call.fromString("1H"))).toBeNull();
    expect(RuleCompiler._ensureList("1C")).toEqual(["1C"]);
    expect(RuleCompiler._ensureList(["1C"])).toEqual(["1C"]);
  });

  it("validates a rule class", () => {
    class NoConstraints extends Rule {
      static override dsl = rule({ callNames: "P" });
    }
    expect(() => RuleCompiler.compile(NoConstraints)).toThrow(
      /NoConstraints is missing constraints/,
    );
    class Extra extends Rule {
      static extra = 1;
      static override dsl = rule({
        callNames: "P",
        sharedConstraints: NO_CONSTRAINTS,
      });
    }
    expect(() => RuleCompiler.compile(Extra)).toThrow(
      /Extra defines unexpected properties: extra/,
    );
    class Unknown extends Rule {
      static override dsl = rule({
        callNames: "P",
        sharedConstraints: NO_CONSTRAINTS,
        ...({ purposePerCall: {} } as object),
      });
    }
    expect(() => RuleCompiler.compile(Unknown)).toThrow(
      /Unknown defines unexpected properties: purposePerCall/,
    );
    class NoCalls extends Rule {
      static override dsl = rule({ sharedConstraints: NO_CONSTRAINTS });
    }
    expect(() => RuleCompiler.compile(NoCalls)).toThrow(
      /NoCalls: call_names or a constraints map is required/,
    );
    expect(() => new Rule()).toThrow(/compiled/);
    expect(Rule.ALLOWED_KEYS.size).toBe(18);
  });

  it("asks a callable purpose and rejects a rule without one", () => {
    const history = historyFor("");
    class Callable extends Rule {
      static override dsl = rule({
        callNames: ["1H", "2C"],
        sharedConstraints: NO_CONSTRAINTS,
        purpose: (_history, call) =>
          call.level === 1 ? "Discovery" : "Support",
      });
    }
    const compiled = RuleCompiler.compile(Callable);
    expect(compiled.purposeForCall(history, Call.fromString("1H"))).toBe(
      "MajorDiscovery",
    );
    expect(compiled.purposeForCall(history, Call.fromString("2C"))).toBe(
      "SupportMinors",
    );
    class Silent extends Rule {
      static override dsl = rule({
        callNames: "P",
        sharedConstraints: NO_CONSTRAINTS,
      });
    }
    expect(() =>
      RuleCompiler.compile(Silent).purposeForCall(
        history,
        Call.fromString("P"),
      ),
    ).toThrow(/Silent declares no purpose/);
  });

  it("yields the calls a rule can make in Call order", () => {
    const history = historyFor("");
    const compiled: CompiledRule = RuleCompiler.compile(OneLevelSuitOpening);
    expect(
      [...compiled.callsOver(history)].map(([category, call]) => [
        category.key,
        call.name,
      ]),
    ).toEqual([
      ["Default", "1C"],
      ["Default", "1D"],
      ["Default", "1H"],
      ["Default", "1S"],
    ]);
    const after = historyFor("1S", "Both");
    expect([...compiled.callsOver(after)]).toEqual([]);
    expect(compiled.forcing).toBeNull();
    expect(compiled.requiresPlanning).toBe(false);
    expect(annotations.Opening.lt(positions.Me)).toBe(false);
  });
});
