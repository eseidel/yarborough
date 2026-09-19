// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/core/hand.py.

import { assert } from "./assert";
import { Card } from "./card";
import { defaultRng, shuffle, type Rng } from "./random";
import { CLUBS, DIAMONDS, HEARTS, SPADES, Strain, SUITS } from "./suit";

function handSorter(cards: string): string {
  return [...cards]
    .sort((a, b) => Card.indexForCard(b) - Card.indexForCard(a))
    .join("");
}

export class Hand {
  cardsBySuitIndex: string[];

  constructor(cardsBySuit: string[]) {
    this.cardsBySuitIndex = cardsBySuit.map((cards) =>
      handSorter(cards.toUpperCase()),
    );
    this._validate();
  }

  static random(rng: Rng = defaultRng): Hand {
    const shuffledCards = shuffle(
      Array.from({ length: 52 }, (_, index) => index),
      rng,
    );
    const cardsBySuitIndex = SUITS.map(() => "");
    for (const cardIdentifier of shuffledCards.slice(0, 13)) {
      const [suit, card] = Card.suitAndValueFromIdentifier(cardIdentifier);
      cardsBySuitIndex[suit.index] += card;
    }
    return new Hand(cardsBySuitIndex);
  }

  private _validate(): void {
    assert(
      SUITS.reduce((total, suit) => total + this.lengthOfSuit(suit), 0) === 13,
      `${this.cardsBySuitIndex}`,
    );
  }

  // This is also referred to as "pbn notation": http://www.tistis.nl/pbn/
  // "The cards of each hand are given in the order:  spades, hearts, diamonds, clubs."
  // Gib (and likely other bridge programs) use this notation.
  shdcDotString(): string {
    return [SPADES, HEARTS, DIAMONDS, CLUBS]
      .map((suit) => this.cardsInSuit(suit))
      .join(".");
  }

  // This is the notation we use throughout sayc bridge code.
  cdhsDotString(): string {
    return [CLUBS, DIAMONDS, HEARTS, SPADES]
      .map((suit) => this.cardsInSuit(suit))
      .join(".");
  }

  playCard(suit: Strain, cardValue: string): void {
    assert(this.cardsBySuitIndex[suit.index].includes(cardValue));
    this.cardsBySuitIndex[suit.index] = this.cardsBySuitIndex[
      suit.index
    ].replace(cardValue, "");
  }

  static fromCdhsString(string: string): Hand {
    return new Hand(string.split("."));
  }

  private _allCards(): string {
    return this.cardsBySuitIndex.join("");
  }

  highCardPoints(): number {
    return [...this._allCards()].reduce(
      (total, card) => total + Card.highCardPoints(card),
      0,
    );
  }

  hcpInSuit(suit: Strain): number {
    return [...this.cardsBySuitIndex[suit.index]].reduce(
      (total, card) => total + Card.highCardPoints(card),
      0,
    );
  }

  cardsInSuit(suit: Strain): string {
    return this.cardsBySuitIndex[suit.index];
  }

  highCardInSuit(suit: Strain): string {
    // FIXME: It's possible we could just return this.cardsInSuit(suit)[0], depending on what cardsInSuit guarantees.
    const cards = [...this.cardsInSuit(suit)].sort(
      (a, b) => Card.indexForCard(a) - Card.indexForCard(b),
    );
    assert(cards.length, "highCardInSuit of an empty suit");
    return cards[cards.length - 1];
  }

  private _countOfCard(card: string): number {
    return SUITS.filter((suit) => this.cardsInSuit(suit).includes(card)).length;
  }

  aceCount(): number {
    return this._countOfCard("A");
  }

  kingCount(): number {
    return this._countOfCard("K");
  }

  hasAtLeast(count: number, cards: string, suit: Strain): boolean {
    return (
      [...this.cardsInSuit(suit)].filter((card) => cards.includes(card))
        .length >= count
    );
  }

  hasFirstRoundStopper(suit: Strain): boolean {
    // A singleton is only a stopper if it's an ace.
    return this.cardsInSuit(suit).includes("A");
  }

  hasSecondRoundStopper(suit: Strain): boolean {
    // A singly protected king is a 66% chance stopper, so we're not treating it as one.
    // if (this.lengthOfSuit(suit) >= 2)
    //     return "AK".includes(this.highCardInSuit(suit));
    const cards = this.cardsInSuit(suit);
    if (cards.includes("K") && cards.includes("Q")) {
      // KQ is a 100% 2nd round stopper.
      return true;
    }
    return this.hasFirstRoundStopper(suit);
  }

  hasThirdRoundStopper(suit: Strain): boolean {
    if (this.lengthOfSuit(suit) >= 3) {
      // Qxx is a 87.5% stopper (if I did my math correctly).
      return "AKQ".includes(this.highCardInSuit(suit));
    }
    return this.hasSecondRoundStopper(suit);
  }

  hasFourthRoundStopper(suit: Strain): boolean {
    const cards = this.cardsInSuit(suit);
    if (cards.length >= 5) {
      // 5 spot cards is almost always a stopper.
      return true;
    }
    if (cards.length >= 4) {
      // 4 cards in the suit is also almost always a stopper,
      // but for now we're being conservative and requiring an honor.
      return "AKQJT".includes(this.highCardInSuit(suit));
    }
    return this.hasThirdRoundStopper(suit);
  }

  lengthOfSuit(suit: Strain): number {
    return this.cardsBySuitIndex[suit.index].length;
  }

  isLongestSuit(suit: Strain, exceptSuits?: Strain[] | null): boolean {
    const except = exceptSuits || [];
    if (except.includes(suit)) {
      return false;
    }
    const longestSuitLength = this.lengthOfSuit(suit);
    for (const shorterSuit of SUITS) {
      if (except.includes(shorterSuit)) {
        continue;
      }
      if (
        shorterSuit !== suit &&
        this.lengthOfSuit(shorterSuit) > longestSuitLength
      ) {
        return false;
      }
    }
    return true;
  }

  suitLengths(): number[] {
    return this.cardsBySuitIndex.map((cards) => cards.length);
  }

  longestSuits(): Strain[] {
    const longestSuitLength = Math.max(...this.suitLengths());
    return SUITS.filter(
      (suit) => this.cardsBySuitIndex[suit.index].length === longestSuitLength,
    );
  }

  lengthPoints(): number {
    // FIXME: Should lengthPoints return highCardPoints() - 1 for a flat hand?
    return (
      this.highCardPoints() +
      SUITS.reduce(
        (total, suit) => total + Math.max(this.lengthOfSuit(suit) - 4, 0),
        0,
      )
    );
  }

  // For this value to be useful, it needs to be compared against the "control-neutral" table
  // http://en.wikipedia.org/wiki/Hand_evaluation#Control_count
  controlCount(): number {
    return [...this._allCards()].reduce(
      (total, card) => total + Card.controlCount(card),
      0,
    );
  }

  // FIXME: We shouldn't discount non-working honors for suits that partner has bid (or at least shown stoppers in).
  _supportPointAdjustmentForNonWorkingHonors(trump: Strain): number {
    // We'll overbid if we count holdings like 'K' or 'Qx' for both HCPs and support points.
    let pointAdjustment = 0;
    for (const suit of SUITS) {
      const cards = this.cardsBySuitIndex[suit.index];
      if (suit === trump || (cards.length !== 1 && cards.length !== 2)) {
        continue;
      }
      if (cards.length === 1) {
        if (cards[0] !== "A") {
          pointAdjustment -= Card.highCardPoints(cards[0]);
        }
        continue;
      }
      if (cards[cards.length - 1] !== "K") {
        pointAdjustment -= Card.highCardPoints(cards[cards.length - 1]);
      }
      if (cards[0] !== "A" && cards[0] !== "K") {
        pointAdjustment -= Card.highCardPoints(cards[0]);
      }
    }
    return pointAdjustment;
  }

  supportPoints(trump: Strain): number {
    assert(
      SUITS.includes(trump),
      "supportPoints only makes sense for suited contracts",
    );
    // Support points don't make sense when we don't have a fit, but returning length points
    // here makes some of the logic in responding to a major easier to read.
    if (this.lengthOfSuit(trump) < 3) {
      return this.lengthPoints();
    }

    const minimumTrumpPoints: Record<number, number> = { 2: 1, 1: 2, 0: 3 };
    const fourPlusTrumpPoints: Record<number, number> = { 2: 1, 1: 3, 0: 5 };
    const shortSuitPoints =
      this.lengthOfSuit(trump) < 4 ? minimumTrumpPoints : fourPlusTrumpPoints;
    let supportBonus = SUITS.filter((suit) => suit !== trump).reduce(
      (total, suit) => total + (shortSuitPoints[this.lengthOfSuit(suit)] ?? 0),
      0,
    );
    supportBonus += this._supportPointAdjustmentForNonWorkingHonors(trump);
    return supportBonus + this.highCardPoints();
  }

  genericSupportPoints(): number {
    // Support-points are all the same, assuming 3-card trump support.
    return this.supportPoints(this.longestSuits()[0]);
  }

  isBalanced(): boolean {
    // Balanced hands have no suit longer than 5 and not more than one doubleton.
    // Checking more than one doubleton is sufficient.
    let doubletons = 0;
    for (const length of this.suitLengths()) {
      if (length < 2 || length > 5) {
        return false;
      }
      if (length === 2) {
        doubletons += 1;
      }
    }
    return doubletons < 2;
  }

  isFlat(): boolean {
    const lengths = [...this.suitLengths()].sort((a, b) => a - b);
    return lengths.join(",") === "3,3,3,4";
  }

  repr(): string {
    return `Hand([${this.cardsBySuitIndex.map((cards) => `'${cards}'`).join(", ")}])`;
  }

  toString(): string {
    return this.repr();
  }

  prettyOneLine(): string {
    return `${this.cdhsDotString()} (hcp: ${this.highCardPoints()} lp: ${this.lengthPoints()} sp: ${this.genericSupportPoints()})`;
  }
}
