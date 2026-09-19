// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// python/z3b/cappelletti.py has no unit test of its own: the convention is
// covered by the corpus and, here, by the fixture gate
// (dsl-fixtures.test.ts).  These are the facts of the port that the gate
// states only indirectly -- the shared call schedule as a mixin (the Python
// MRO), the balancing seat's one different entry, and the private copy of
// rules.py's balancing precondition.

import { describe, expect, it } from "vitest";
import { Call } from "../../core/call";
import {
  BalancingCappelletti,
  Cappelletti,
  RULE_CLASSES,
} from "../cappelletti";
import { printedForm } from "../printed";
import { mro, RuleCompiler } from "../rule_compiler";
import { StandardAmericanYellowCard } from "../sayc";
import {
  type AuctionSnapshot,
  type ManifestRule,
  readJsonFixture,
  readJsonlFixture,
} from "./fixtures";
import { RecordedHistories } from "./recorded-history";

const manifest = readJsonFixture<ManifestRule[]>("rules-manifest.json");
const store = new RecordedHistories(
  readJsonlFixture<AuctionSnapshot>("auction-snapshots.jsonl"),
  (name) => ({ name, forcing: null, requiresPlanning: false }),
);

const direct = RuleCompiler.compile(Cappelletti);
const balancing = RuleCompiler.compile(BalancingCappelletti);

function callNames(
  rule: typeof direct,
  dealer: string,
  vulnerability: string,
  calls: string,
): string[] {
  const history = store.historyFor(
    store.snapshot(dealer, vulnerability, calls)!,
  );
  return [...rule.callsOver(history)].map(([, call]) => call.name);
}

describe("the Cappelletti schedule", () => {
  it("is a mixin, so the class chain is the Python MRO", () => {
    expect(mro(Cappelletti).map((cls) => cls.name)).toEqual([
      "Cappelletti",
      "CappellettiEntries",
      "Rule",
    ]);
    expect(mro(BalancingCappelletti).map((cls) => cls.name)).toEqual([
      "BalancingCappelletti",
      "CappellettiEntries",
      "Rule",
    ]);
  });

  it("offers the same six calls over 1N in either seat", () => {
    const entries = ["X", "2C", "2D", "2H", "2S", "2N"];
    expect(direct.knownCalls.map((call) => call.name).sort()).toEqual(
      [...entries].sort(),
    );
    // RHO opened 1N; and, balancing, LHO opened it and two passes followed.
    expect(callNames(direct, "N", "Both", "1N")).toEqual(entries);
    expect(callNames(balancing, "N", "Both", "1N P P")).toEqual(entries);
    expect(callNames(direct, "N", "Both", "1N P P")).toEqual([]);
    expect(callNames(balancing, "N", "Both", "1N")).toEqual([]);
  });

  it("shares every entry but the double, which the balancer must hold balanced", () => {
    const history = store.historyFor(store.snapshot("N", "Both", "1N")!);
    for (const name of ["2C", "2D", "2H", "2S", "2N"]) {
      const call = Call.fromString(name);
      expect(
        printedForm(
          RuleCompiler.exprsFromConstraints(
            balancing.constraints[name],
            history,
            call,
          )[0],
        ),
        name,
      ).toBe(
        printedForm(
          RuleCompiler.exprsFromConstraints(
            direct.constraints[name],
            history,
            call,
          )[0],
        ),
      );
    }
    const double = Call.fromString("X");
    expect(
      printedForm(
        RuleCompiler.exprsFromConstraints(
          direct.constraints.X,
          history,
          double,
        )[0],
      ),
    ).toBe("(>= points 15)");
    expect(
      printedForm(
        RuleCompiler.exprsFromConstraints(
          balancing.constraints.X,
          history,
          double,
        )[0],
      ),
    ).toBe(
      "(and (>= points 15) (<= doubletons 1) (= singletons 0) (= voids 0))",
    );
  });

  it("balances behind the opening with the private copy of rules.py's precondition", () => {
    // The overcall section of rules.py owns `balancing_precondition`; until it
    // is ported this module declares the same AndPrecondition.
    expect(balancing.preconditions[0].repr()).toBe(
      "And(LastBidHasAnnotation('LHO', 'Opening'), LastBidWas('Partner', 'P'), LastBidWas('RHO', 'P'))",
    );
  });
});

describe("the rules of cappelletti.ts", () => {
  it("registers the Python module's concrete rules, and only those", () => {
    const names = Object.keys(RULE_CLASSES);
    expect(names).toHaveLength(12);
    const known = new Set(manifest.map((entry) => entry.name));
    const registered = new Set(
      StandardAmericanYellowCard.rules.map((rule) => rule.name),
    );
    for (const name of names) {
      expect(known.has(name), `${name} is not a Python rule`).toBe(true);
      expect(registered.has(name), `${name} is not in sayc.ts`).toBe(true);
    }
  });
});
