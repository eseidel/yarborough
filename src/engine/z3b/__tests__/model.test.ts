// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The hand model built through the binding prints what python/z3b/model.py
// printed: the axioms in order, the named expressions, a hand, the per-suit
// helpers and NO_CONSTRAINTS.  A handful of those printed forms are pinned
// below; the model as a whole is gated by the SAYC corpus baseline
// (`pnpm baseline:check`).  A mismatch here is a transcription slip in
// model.ts (or, for `(+ 0 ...)`, a `Sum` where Python summed).

import { describe, expect, it } from "vitest";
import { Hand } from "../../core/hand";
import { CLUBS, HEARTS, SUITS } from "../../core/suit";
import * as model from "../model";
import { printedForm } from "../printed";
import { z3 } from "../z3";

describe("model", () => {
  it("has the axioms of the Python model, in order", () => {
    const printed = model.axioms.map(printedForm);
    expect(printed).toHaveLength(19);
    expect(printed.slice(0, 9)).toEqual([
      "(= (+ spades hearts diamonds clubs) 13)",
      "(>= spades 0)",
      "(>= hearts 0)",
      "(>= diamonds 0)",
      "(>= clubs 0)",
      "(>= high_card_points 0)",
      "(<= high_card_points 37)",
      "(= points high_card_points)",
      "(= length_points (+ (ite (> spades 4) (- spades 4) 0) (ite (> hearts 4) (- hearts 4) 0) (ite (> diamonds 4) (- diamonds 4) 0) (ite (> clubs 4) (- clubs 4) 0)))",
    ]);
    // Python's `sum` starts from 0, so the high-card-point axiom opens with
    // `(+ 0 0 ...)` and each suit's run begins with another 0.
    expect(printed[printed.length - 1]).toBe(
      "(= (+ 0 0 (* 4 ace_of_clubs) (* 3 king_of_clubs) (* 2 queen_of_clubs) (* 1 jack_of_clubs) (* 0 ten_of_clubs) 0 (* 4 ace_of_diamonds) (* 3 king_of_diamonds) (* 2 queen_of_diamonds) (* 1 jack_of_diamonds) (* 0 ten_of_diamonds) 0 (* 4 ace_of_hearts) (* 3 king_of_hearts) (* 2 queen_of_hearts) (* 1 jack_of_hearts) (* 0 ten_of_hearts) 0 (* 4 ace_of_spades) (* 3 king_of_spades) (* 2 queen_of_spades) (* 1 jack_of_spades) (* 0 ten_of_spades)) high_card_points)",
    );
  });

  it("names the expressions the Python module names", () => {
    expect(printedForm(model.balanced)).toBe(
      "(and (<= doubletons 1) (= singletons 0) (= voids 0))",
    );
    expect(printedForm(model.aFiveCardSuit)).toBe(
      "(or (>= spades 5) (>= hearts 5) (>= diamonds 5) (>= clubs 5))",
    );
    expect(printedForm(model.atMostOneFiveCardSuit)).toBe(
      "(<= (+ (ite (>= spades 5) 1 0) (ite (>= hearts 5) 1 0) (ite (>= diamonds 5) 1 0) (ite (>= clubs 5) 1 0)) 1)",
    );
    expect(printedForm(model.threeOfTheTopFiveSpades)).toBe(
      "(>= (+ ace_of_spades king_of_spades queen_of_spades jack_of_spades ten_of_spades) 3)",
    );
    // A variable prints as its Python name.
    expect(printedForm(model.points)).toBe("points");
    expect(printedForm(model.voidInSpades)).toBe("void_in_spades");
  });

  it("describes a hand exactly as the Python model does", () => {
    // C.D.H.S: three clubs, a singleton diamond, five hearts, four spades.
    expect(
      printedForm(model.exprForHand(Hand.fromCdhsString("832.A.QJ652.JT73"))),
    ).toBe(
      "(and (= spades 4) (= hearts 5) (= diamonds 1) (= clubs 3) (= ace_of_spades 0) (= king_of_spades 0) (= queen_of_spades 0) (= jack_of_spades 1) (= ten_of_spades 1) (= ace_of_hearts 0) (= king_of_hearts 0) (= queen_of_hearts 1) (= jack_of_hearts 1) (= ten_of_hearts 0) (= ace_of_diamonds 1) (= king_of_diamonds 0) (= queen_of_diamonds 0) (= jack_of_diamonds 0) (= ten_of_diamonds 0) (= ace_of_clubs 0) (= king_of_clubs 0) (= queen_of_clubs 0) (= jack_of_clubs 0) (= ten_of_clubs 0))",
    );
  });

  it("picks the per-suit expressions by suit index", () => {
    expect(SUITS.map((suit) => printedForm(model.exprForSuit(suit)))).toEqual([
      "clubs",
      "diamonds",
      "hearts",
      "spades",
    ]);
    expect(printedForm(model.stopperExprForSuit(CLUBS))).toBe(
      "(or (= ace_of_clubs 1) (and (= king_of_clubs 1) (>= clubs 2)) (and (= queen_of_clubs 1) (>= clubs 3)) (and (= jack_of_clubs 1) (= ten_of_clubs 1) (>= clubs 4)))",
    );
    expect(printedForm(model.supportPointsExprForSuit(HEARTS))).toBe(
      "points_supporting_hearts",
    );
    expect(printedForm(model.NO_CONSTRAINTS)).toBe("true");
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
