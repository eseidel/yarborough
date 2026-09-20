// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/model.py.  The hand model: the integer variables
// (suit lengths, honor bits, points), the axioms that tie them together, and
// the named expressions the rules use.  Every expression is built with the
// same operators, in the same order and with the same nesting as the Python,
// so that the constraints the rules build print the same text; in particular
// Python's `sum` starts from 0 (`pySum`) and `2 * x` is `z3.mul(2, x)`, not
// `x.mul(2)`.

import { makeEnum } from "./enum";
import type { Hand } from "../core/hand";
import {
  CLUBS,
  DIAMONDS,
  HEARTS,
  SPADES,
  type Strain,
  SUITS,
} from "../core/suit";
import { type Expr, pySum, type Solver, z3 } from "./z3";

const _honorNames = ["ace", "king", "queen", "jack", "ten"];
const _honorValues = [4, 3, 2, 1, 0];

function _honorVars(suit: Strain): Expr[] {
  return _honorNames.map((honor) =>
    z3.Int(`${honor}_of_${suit.name.toLowerCase()}`),
  );
}

function _suitCountVar(suit: Strain): Expr {
  return z3.Int(suit.name.toLowerCase());
}

export const [clubs, diamonds, hearts, spades] = SUITS.map(_suitCountVar);

export function exprForSuit(suit: Strain): Expr {
  return [clubs, diamonds, hearts, spades][suit.index];
}

export const [
  aceOfSpades,
  kingOfSpades,
  queenOfSpades,
  jackOfSpades,
  tenOfSpades,
] = _honorVars(SPADES);
export const [
  aceOfHearts,
  kingOfHearts,
  queenOfHearts,
  jackOfHearts,
  tenOfHearts,
] = _honorVars(HEARTS);
export const [
  aceOfDiamonds,
  kingOfDiamonds,
  queenOfDiamonds,
  jackOfDiamonds,
  tenOfDiamonds,
] = _honorVars(DIAMONDS);
export const [aceOfClubs, kingOfClubs, queenOfClubs, jackOfClubs, tenOfClubs] =
  _honorVars(CLUBS);

export const highCardPoints = z3.Int("high_card_points");
export const points = z3.Int("points");
export const playingPoints = z3.Int("playing_points");
export const lengthPoints = z3.Int("length_points");

export const pointsSupportingSpades = z3.Int("points_supporting_spades");
export const pointsSupportingHearts = z3.Int("points_supporting_hearts");
export const pointsSupportingDiamonds = z3.Int("points_supporting_diamonds");
export const pointsSupportingClubs = z3.Int("points_supporting_clubs");

export const voidInSpades = z3.Int("void_in_spades");
export const voidInHearts = z3.Int("void_in_hearts");
export const voidInDiamonds = z3.Int("void_in_diamonds");
export const voidInClubs = z3.Int("void_in_clubs");
export const singletonInSpades = z3.Int("singleton_in_spades");
export const singletonInHearts = z3.Int("singleton_in_hearts");
export const singletonInDiamonds = z3.Int("singleton_in_diamonds");
export const singletonInClubs = z3.Int("singleton_in_clubs");
export const doubletonInSpades = z3.Int("doubleton_in_spades");
export const doubletonInHearts = z3.Int("doubleton_in_hearts");
export const doubletonInDiamonds = z3.Int("doubleton_in_diamonds");
export const doubletonInClubs = z3.Int("doubleton_in_clubs");

export const voids = z3.Int("voids");
export const singletons = z3.Int("singletons");
export const doubletons = z3.Int("doubletons");

export function namedCountExpr(countName: string, count: number): Expr {
  const suitCountVars = SUITS.map(exprForSuit);
  // void_in_spades, etc.
  const suitMatchesCountVars = SUITS.map((s) =>
    z3.Int(`${countName}_in_${s.name.toLowerCase()}`),
  );
  const exprs = suitCountVars.map((suitCount, index) => {
    const suitMatchesCount = suitMatchesCountVars[index];
    // FIXME: Can z3 support writing this as "void_in_spades == (spades == 0)"?
    return z3.Or(
      z3.And(suitCount.eq(count), suitMatchesCount.eq(1)),
      z3.And(suitCount.ne(count), suitMatchesCount.eq(0)),
    );
  });
  exprs.push(z3.Int(countName + "s").eq(pySum(suitMatchesCountVars)));
  return z3.And(...exprs);
}

export function constrainHonorsExpr(): Expr {
  const exprs: Expr[] = [];
  for (const honorSuit of SUITS) {
    // The easiest way to have an Int var and constrain it to bool values is to just:
    // z3.And(0 <= ace_of_spades, ace_of_spades <= 1)
    const honorVars = _honorVars(honorSuit);
    exprs.push(
      ...honorVars.map((honorVar) => z3.And(honorVar.ge(0), honorVar.le(1))),
    );
    // Also make sure that total number of honors is <= total number of cards
    exprs.push(pySum(honorVars).le(exprForSuit(honorSuit)));
  }
  return z3.And(...exprs);
}

function _supportPointsAxiom(suitCount: Expr, pointsSupporting: Expr): Expr {
  return z3.Or(
    z3.And(suitCount.le(2), pointsSupporting.eq(highCardPoints)),
    z3.And(
      suitCount.eq(3),
      pointsSupporting.eq(
        highCardPoints
          .add(doubletons)
          .add(z3.mul(2, singletons))
          .add(z3.mul(3, voids)),
      ),
    ),
    z3.And(
      suitCount.ge(4),
      pointsSupporting.eq(
        highCardPoints
          .add(doubletons)
          .add(z3.mul(3, singletons))
          .add(z3.mul(5, voids)),
      ),
    ),
  );
}

export const axioms: Expr[] = [
  spades.add(hearts).add(diamonds).add(clubs).eq(13),
  spades.ge(0),
  hearts.ge(0),
  diamonds.ge(0),
  clubs.ge(0),
  highCardPoints.ge(0),
  highCardPoints.le(37),
  points.eq(highCardPoints),
  // Length points: one per card beyond four in each suit (p26).  Playing points are hcp plus
  // length points, the hand's value for a suit contract with no fit known yet.
  lengthPoints.eq(
    z3.Sum(
      [spades, hearts, diamonds, clubs].map((suitCount) =>
        z3.If(suitCount.gt(4), suitCount.sub(4), 0),
      ),
    ),
  ),
  playingPoints.eq(highCardPoints.add(lengthPoints)),

  namedCountExpr("void", 0),
  namedCountExpr("singleton", 1),
  namedCountExpr("doubleton", 2),
  constrainHonorsExpr(),

  _supportPointsAxiom(spades, pointsSupportingSpades),
  _supportPointsAxiom(hearts, pointsSupportingHearts),
  _supportPointsAxiom(diamonds, pointsSupportingDiamonds),
  _supportPointsAxiom(clubs, pointsSupportingClubs),

  pySum(
    // Sum the sums for all suits.
    SUITS.map(_honorVars).map((honorVars) =>
      // Sum the honors for a single suit
      pySum(honorVars.map((b, index) => z3.mul(_honorValues[index], b))),
    ),
  ).eq(highCardPoints), // The total is our hcp.
];

export const minHcpForOpen = 8;

function _exprForPointRule(count: number): Expr {
  return z3.And(
    highCardPoints.ge(minHcpForOpen),
    playingPoints.ge(12),
    z3.Or(
      spades.add(hearts).add(highCardPoints).ge(count),
      spades.add(diamonds).add(highCardPoints).ge(count),
      spades.add(clubs).add(highCardPoints).ge(count),
      hearts.add(diamonds).add(highCardPoints).ge(count),
      hearts.add(clubs).add(highCardPoints).ge(count),
      diamonds.add(clubs).add(highCardPoints).ge(count),
    ),
  );
}

export const ruleOfTwenty = _exprForPointRule(20);
export const ruleOfNineteen = _exprForPointRule(19);

// FIXME: This rule probably needs to consider min_hcp_for_open
export const ruleOfFifteen = z3.And(
  spades.add(highCardPoints).ge(15),
  highCardPoints.ge(minHcpForOpen),
);

export const twoOfTheTopThreeSpades = aceOfSpades
  .add(kingOfSpades)
  .add(queenOfSpades)
  .ge(2);
export const twoOfTheTopThreeHearts = aceOfHearts
  .add(kingOfHearts)
  .add(queenOfHearts)
  .ge(2);
export const twoOfTheTopThreeDiamonds = aceOfDiamonds
  .add(kingOfDiamonds)
  .add(queenOfDiamonds)
  .ge(2);
export const twoOfTheTopThreeClubs = aceOfClubs
  .add(kingOfClubs)
  .add(queenOfClubs)
  .ge(2);

// Two of the top five: the suit quality a weak two-suiter (Michaels) needs in each suit.
export const twoOfTheTopFiveSpades = aceOfSpades
  .add(kingOfSpades)
  .add(queenOfSpades)
  .add(jackOfSpades)
  .add(tenOfSpades)
  .ge(2);
export const twoOfTheTopFiveHearts = aceOfHearts
  .add(kingOfHearts)
  .add(queenOfHearts)
  .add(jackOfHearts)
  .add(tenOfHearts)
  .ge(2);
export const twoOfTheTopFiveDiamonds = aceOfDiamonds
  .add(kingOfDiamonds)
  .add(queenOfDiamonds)
  .add(jackOfDiamonds)
  .add(tenOfDiamonds)
  .ge(2);
export const twoOfTheTopFiveClubs = aceOfClubs
  .add(kingOfClubs)
  .add(queenOfClubs)
  .add(jackOfClubs)
  .add(tenOfClubs)
  .ge(2);

export const threeOfTheTopFiveSpades = aceOfSpades
  .add(kingOfSpades)
  .add(queenOfSpades)
  .add(jackOfSpades)
  .add(tenOfSpades)
  .ge(3);
export const threeOfTheTopFiveHearts = aceOfHearts
  .add(kingOfHearts)
  .add(queenOfHearts)
  .add(jackOfHearts)
  .add(tenOfHearts)
  .ge(3);
export const threeOfTheTopFiveDiamonds = aceOfDiamonds
  .add(kingOfDiamonds)
  .add(queenOfDiamonds)
  .add(jackOfDiamonds)
  .add(tenOfDiamonds)
  .ge(3);
export const threeOfTheTopFiveClubs = aceOfClubs
  .add(kingOfClubs)
  .add(queenOfClubs)
  .add(jackOfClubs)
  .add(tenOfClubs)
  .ge(3);

export const threeOfTheTopFiveSpadesOrBetter = z3.Or(
  twoOfTheTopThreeSpades,
  threeOfTheTopFiveSpades,
);
export const threeOfTheTopFiveHeartsOrBetter = z3.Or(
  twoOfTheTopThreeHearts,
  threeOfTheTopFiveHearts,
);
export const threeOfTheTopFiveDiamondsOrBetter = z3.Or(
  twoOfTheTopThreeDiamonds,
  threeOfTheTopFiveDiamonds,
);
export const threeOfTheTopFiveClubsOrBetter = z3.Or(
  twoOfTheTopThreeClubs,
  threeOfTheTopFiveClubs,
);

export const thirdRoundStopperSpades = z3.Or(
  aceOfSpades.eq(1),
  z3.And(kingOfSpades.eq(1), spades.ge(2)),
  z3.And(queenOfSpades.eq(1), spades.ge(3)),
);
export const thirdRoundStopperHearts = z3.Or(
  aceOfHearts.eq(1),
  z3.And(kingOfHearts.eq(1), hearts.ge(2)),
  z3.And(queenOfHearts.eq(1), hearts.ge(3)),
);
export const thirdRoundStopperDiamonds = z3.Or(
  aceOfDiamonds.eq(1),
  z3.And(kingOfDiamonds.eq(1), diamonds.ge(2)),
  z3.And(queenOfDiamonds.eq(1), diamonds.ge(3)),
);
export const thirdRoundStopperClubs = z3.Or(
  aceOfClubs.eq(1),
  z3.And(kingOfClubs.eq(1), clubs.ge(2)),
  z3.And(queenOfClubs.eq(1), clubs.ge(3)),
);

export const numberOfAces = aceOfSpades
  .add(aceOfHearts)
  .add(aceOfDiamonds)
  .add(aceOfClubs);
export const numberOfKings = kingOfSpades
  .add(kingOfHearts)
  .add(kingOfDiamonds)
  .add(kingOfClubs);

export const balanced = z3.And(doubletons.le(1), singletons.eq(0), voids.eq(0));
export const semiBalanced = z3.And(singletons.eq(0), voids.eq(0));

export const aFiveCardSuit = z3.Or(
  spades.ge(5),
  hearts.ge(5),
  diamonds.ge(5),
  clubs.ge(5),
);

export const atMostOneFiveCardSuit = z3
  .Sum(
    [spades, hearts, diamonds, clubs].map((suitCount) =>
      z3.If(suitCount.ge(5), 1, 0),
    ),
  )
  .le(1);

export const stopperSpades = z3.Or(
  aceOfSpades.eq(1),
  z3.And(kingOfSpades.eq(1), spades.ge(2)),
  z3.And(queenOfSpades.eq(1), spades.ge(3)),
  z3.And(jackOfSpades.eq(1), tenOfSpades.eq(1), spades.ge(4)),
);
export const stopperHearts = z3.Or(
  aceOfHearts.eq(1),
  z3.And(kingOfHearts.eq(1), hearts.ge(2)),
  z3.And(queenOfHearts.eq(1), hearts.ge(3)),
  z3.And(jackOfHearts.eq(1), tenOfHearts.eq(1), hearts.ge(4)),
);
export const stopperDiamonds = z3.Or(
  aceOfDiamonds.eq(1),
  z3.And(kingOfDiamonds.eq(1), diamonds.ge(2)),
  z3.And(queenOfDiamonds.eq(1), diamonds.ge(3)),
  z3.And(jackOfDiamonds.eq(1), tenOfDiamonds.eq(1), diamonds.ge(4)),
);
export const stopperClubs = z3.Or(
  aceOfClubs.eq(1),
  z3.And(kingOfClubs.eq(1), clubs.ge(2)),
  z3.And(queenOfClubs.eq(1), clubs.ge(3)),
  z3.And(jackOfClubs.eq(1), tenOfClubs.eq(1), clubs.ge(4)),
);

export const NO_CONSTRAINTS = z3.BoolVal(true);

export function stopperExprForSuit(suit: Strain): Expr {
  return [stopperClubs, stopperDiamonds, stopperHearts, stopperSpades][
    suit.index
  ];
}

export function supportPointsExprForSuit(suit: Strain): Expr {
  return [
    pointsSupportingClubs,
    pointsSupportingDiamonds,
    pointsSupportingHearts,
    pointsSupportingSpades,
  ][suit.index];
}

/** Python's `int('A' in cards)`. */
function has(cards: string, card: string): number {
  return cards.includes(card) ? 1 : 0;
}

export function exprForHand(hand: Hand): Expr {
  const cardsInSpades = hand.cardsInSuit(SPADES);
  const cardsInHearts = hand.cardsInSuit(HEARTS);
  const cardsInDiamonds = hand.cardsInSuit(DIAMONDS);
  const cardsInClubs = hand.cardsInSuit(CLUBS);

  return z3.And(
    spades.eq(cardsInSpades.length),
    hearts.eq(cardsInHearts.length),
    diamonds.eq(cardsInDiamonds.length),
    clubs.eq(cardsInClubs.length),

    aceOfSpades.eq(has(cardsInSpades, "A")),
    kingOfSpades.eq(has(cardsInSpades, "K")),
    queenOfSpades.eq(has(cardsInSpades, "Q")),
    jackOfSpades.eq(has(cardsInSpades, "J")),
    tenOfSpades.eq(has(cardsInSpades, "T")),

    aceOfHearts.eq(has(cardsInHearts, "A")),
    kingOfHearts.eq(has(cardsInHearts, "K")),
    queenOfHearts.eq(has(cardsInHearts, "Q")),
    jackOfHearts.eq(has(cardsInHearts, "J")),
    tenOfHearts.eq(has(cardsInHearts, "T")),

    aceOfDiamonds.eq(has(cardsInDiamonds, "A")),
    kingOfDiamonds.eq(has(cardsInDiamonds, "K")),
    queenOfDiamonds.eq(has(cardsInDiamonds, "Q")),
    jackOfDiamonds.eq(has(cardsInDiamonds, "J")),
    tenOfDiamonds.eq(has(cardsInDiamonds, "T")),

    aceOfClubs.eq(has(cardsInClubs, "A")),
    kingOfClubs.eq(has(cardsInClubs, "K")),
    queenOfClubs.eq(has(cardsInClubs, "Q")),
    jackOfClubs.eq(has(cardsInClubs, "J")),
    tenOfClubs.eq(has(cardsInClubs, "T")),
  );
}

export const positions = makeEnum("RHO", "Partner", "LHO", "Me");

export function isCertain(solver: Solver, expr: Expr): boolean {
  solver.push();
  solver.add(z3.Not(expr));
  const result = solver.check() === "unsat";
  solver.pop();
  return result;
}

export function isPossible(solver: Solver, expr: Expr): boolean {
  solver.push();
  solver.add(expr);
  const result = solver.check() === "sat";
  solver.pop();
  return result;
}
