// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The phase 3 gate (docs/typescript-engine-plan.md): every printed form of the
// hand model built through the binding equals what python/z3b/model.py
// prints, as recorded in tests/engine-fixtures/model-expressions.json: the
// axioms in order, every named expression, the sample hands, the per-suit
// helpers and NO_CONSTRAINTS.  A mismatch is a transcription slip in
// model.ts (or, for `(+ 0 ...)`, a `Sum` where Python summed).

import { describe, expect, it } from "vitest";
import { Hand } from "../../core/hand";
import { SUITS } from "../../core/suit";
import * as model from "../model";
import { printedForm } from "../printed";
import { type Expr, z3 } from "../z3";
import type { ModelExpressionsFixture } from "../../fixtures/types";
import { readJsonFixture } from "./fixtures";

const fixture = readJsonFixture<ModelExpressionsFixture>(
  "model-expressions.json",
);

/** `void_in_spades` is `voidInSpades`; `NO_CONSTRAINTS` keeps its name. */
function camelCase(pythonName: string): string {
  if (pythonName === pythonName.toUpperCase()) {
    return pythonName;
  }
  return pythonName.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

describe("model", () => {
  it("has the axioms of the Python model, in order", () => {
    expect(model.axioms.map(printedForm)).toEqual(fixture.axioms);
  });

  it("names every expression the Python module names", () => {
    const exports = model as unknown as Record<string, unknown>;
    const printed: Record<string, string> = {};
    for (const name of Object.keys(fixture.named)) {
      const value = exports[camelCase(name)];
      expect(value, `${name} (${camelCase(name)})`).toBeDefined();
      printed[name] = printedForm(value as Expr);
    }
    expect(printed).toEqual(fixture.named);
    expect(Object.keys(fixture.named)).toHaveLength(81);
  });

  it("describes a hand exactly as the Python model does", () => {
    for (const [cdhs, expected] of Object.entries(fixture.hands)) {
      expect(printedForm(model.exprForHand(Hand.fromCdhsString(cdhs)))).toBe(
        expected,
      );
    }
  });

  it("picks the per-suit expressions by suit index", () => {
    const bySuit = {
      expr_for_suit: Object.fromEntries(
        SUITS.map((s) => [s.char, printedForm(model.exprForSuit(s))]),
      ),
      stopper_expr_for_suit: Object.fromEntries(
        SUITS.map((s) => [s.char, printedForm(model.stopperExprForSuit(s))]),
      ),
      support_points_expr_for_suit: Object.fromEntries(
        SUITS.map((s) => [
          s.char,
          printedForm(model.supportPointsExprForSuit(s)),
        ]),
      ),
    };
    expect(bySuit).toEqual(fixture.by_suit);
    expect(printedForm(model.NO_CONSTRAINTS)).toBe(fixture.NO_CONSTRAINTS);
  });

  it("orders the positions RHO, Partner, LHO, Me", () => {
    expect([...model.positions].map((p) => p.key)).toEqual([
      "RHO",
      "Partner",
      "LHO",
      "Me",
    ]);
    expect(model.positions.Me.index).toBe(3);
  });

  it("answers is_certain and is_possible on the axioms", () => {
    const solver = z3.SolverFor("QF_LIA");
    solver.add(model.axioms);
    expect(model.isPossible(solver, model.balanced)).toBe(true);
    expect(model.isCertain(solver, model.balanced)).toBe(false);
    expect(model.isCertain(solver, model.highCardPoints.le(37))).toBe(true);
    expect(model.isPossible(solver, model.highCardPoints.ge(38))).toBe(false);
    // A hand with two voids and at most a doubleton cannot hold twenty points.
    expect(
      model.isPossible(
        solver,
        z3.And(
          model.highCardPoints.ge(20),
          model.spades.eq(0),
          model.hearts.eq(0),
          model.diamonds.le(2),
        ),
      ),
    ).toBe(false);
    // The solver is back to the axioms alone after each query.
    expect(model.isPossible(solver, model.spades.eq(13))).toBe(true);
    const hand = Hand.fromCdhsString("KQ4.AQ8.K9873.K2");
    solver.push();
    solver.add(model.exprForHand(hand));
    // 3-3-5-2: seventeen high-card points, balanced, one length point, and
    // eighteen in support of hearts (the doubleton spade).
    expect(model.isCertain(solver, model.highCardPoints.eq(17))).toBe(true);
    expect(model.isCertain(solver, model.balanced)).toBe(true);
    expect(model.isCertain(solver, model.playingPoints.eq(18))).toBe(true);
    expect(model.isCertain(solver, model.pointsSupportingHearts.eq(18))).toBe(
      true,
    );
    expect(model.isCertain(solver, model.pointsSupportingSpades.eq(17))).toBe(
      true,
    );
    solver.pop();
  });
});
