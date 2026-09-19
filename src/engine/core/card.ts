// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/core/card.py.

import { assert } from "./assert";
import { Strain, Suit, SUITS } from "./suit";

const VALUE_TO_INDEX: Record<string, number> = {
  "2": 0,
  "3": 1,
  "4": 2,
  "5": 3,
  "6": 4,
  "7": 5,
  "8": 6,
  "9": 7,
  T: 8,
  J: 9,
  Q: 10,
  K: 11,
  A: 12,
};

const INDEX_TO_VALUE: Record<number, string> = Object.fromEntries(
  Object.entries(VALUE_TO_INDEX).map(([value, index]) => [index, value]),
);

const HIGH_CARD_POINTS: Record<string, number> = { J: 1, Q: 2, K: 3, A: 4 };
const CONTROL_COUNT: Record<string, number> = { K: 1, A: 2 };

const VALUE_CHARS = [
  "A",
  "K",
  "Q",
  "J",
  "T",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
];

export class Card {
  static readonly valueToIndex = VALUE_TO_INDEX;
  static readonly indexToValue = INDEX_TO_VALUE;

  readonly suit: Strain;
  readonly valueChar: string;

  static indexForCard(valueChar: string | number): number {
    const index = VALUE_TO_INDEX[String(valueChar)];
    assert(index !== undefined, `${valueChar} is not a valid card value`);
    return index;
  }

  static cardForIndex(index: number): string {
    const value = INDEX_TO_VALUE[index];
    assert(value !== undefined, `${index} is not a valid card index`);
    return value;
  }

  static identifierForCard(suit: Strain, value: string | number): number {
    return suit.index * 13 + Card.indexForCard(value);
  }

  static suitAndIndexFromIdentifier(identifier: number): [Strain, number] {
    const suitIndex = Math.floor(identifier / 13);
    const cardIndex = identifier - suitIndex * 13;
    return [Suit.fromIndex(suitIndex), cardIndex];
  }

  static suitAndValueFromIdentifier(identifier: number): [Strain, string] {
    const [suit, index] = Card.suitAndIndexFromIdentifier(identifier);
    return [suit, Card.cardForIndex(index)];
  }

  static cardName(suit: Strain, valueChar: string): string {
    return `${valueChar} of ${suit.name}`;
  }

  static highCardPoints(valueChar: string): number {
    return HIGH_CARD_POINTS[valueChar] ?? 0;
  }

  static controlCount(valueChar: string): number {
    return CONTROL_COUNT[valueChar] ?? 0;
  }

  constructor(suit: Strain, valueChar: string) {
    this.suit = suit;
    assert(SUITS.includes(suit));
    this.valueChar = valueChar;
    assert(VALUE_CHARS.includes(valueChar));
  }

  displayValue(): string {
    if (this.valueChar === "T") {
      return "10";
    }
    return this.valueChar;
  }

  get name(): string {
    return `${this.displayValue()}${this.suit.char}`;
  }

  index(): number {
    return Card.indexForCard(this.valueChar);
  }
}
