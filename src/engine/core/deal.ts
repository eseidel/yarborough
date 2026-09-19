// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/core/deal.py.

import { assert } from "./assert";
import { Card } from "./card";
import { Hand } from "./hand";
import { POSITIONS, Position } from "./position";
import { defaultRng, shuffle, type Rng } from "./random";
import { Suit, SUITS } from "./suit";

const HEX_CHARS = "0123456789abcdef";

export class Deal {
  hands: Hand[];

  constructor(hands: Hand[]) {
    this.hands = hands;
    this._validate();
  }

  private static _emptyHands(): string[][] {
    return POSITIONS.map(() => SUITS.map(() => ""));
  }

  static random(rng: Rng = defaultRng): Deal {
    // FIXME: A better random would generate a random identifier
    // and use fromIdentifier.  However our current identifier
    // space is not compact.  We can generate identifiers
    // which are not valid deals.
    const hands = Deal._emptyHands();
    const shuffledCards = shuffle(
      Array.from({ length: 52 }, (_, index) => index),
      rng,
    );
    shuffledCards.forEach((cardIdentifier, indexInDeck) => {
      const position = indexInDeck % POSITIONS.length;
      const [suit, card] = Card.suitAndValueFromIdentifier(cardIdentifier);
      hands[position][suit.index] += card;
    });
    return new Deal(hands.map((cards) => new Hand(cards)));
  }

  static fromString(string: string): Deal {
    const handStrings = string.split(" ");
    // Deal takes strings, not hand objects, currently.
    return new Deal(handStrings.map((hand) => Hand.fromCdhsString(hand)));
  }

  static fromHexIdentifier(identifier: string): Deal {
    const hands = Deal._emptyHands();
    [...identifier].forEach((hexChar, charIndex) => {
      const hexIndex = HEX_CHARS.indexOf(hexChar);
      assert(hexIndex !== -1, `${hexChar} is not a hex character`);
      const highHandIndex = Math.floor(hexIndex / 4);
      const lowHandIndex = hexIndex - highHandIndex * 4;
      const [highSuit, highCard] = Card.suitAndValueFromIdentifier(
        charIndex * 2 + 0,
      );
      const [lowSuit, lowCard] = Card.suitAndValueFromIdentifier(
        charIndex * 2 + 1,
      );
      hands[highHandIndex][highSuit.index] += highCard;
      hands[lowHandIndex][lowSuit.index] += lowCard;
    });
    return new Deal(hands.map((cards) => new Hand(cards)));
  }

  static fromOldIdentifier(identifier: string): Deal {
    // A 52-digit number in base four, one digit per card, is too large for a
    // JavaScript number, so the arithmetic is done with BigInt.
    let remaining = BigInt(identifier);
    const hands = Deal._emptyHands();
    for (let cardIdentifier = 51; cardIdentifier >= 0; cardIdentifier--) {
      const powerOfFour = 4n ** BigInt(cardIdentifier);
      const position = remaining / powerOfFour;
      remaining -= powerOfFour * position;
      const [suit, card] = Card.suitAndValueFromIdentifier(cardIdentifier);
      hands[Number(position)][suit.index] += card;
    }
    return new Deal(hands.map((cards) => new Hand(cards)));
  }

  static fromIdentifier(identifier: string): Deal {
    if (identifier.length > 29) {
      return Deal.fromOldIdentifier(identifier);
    }
    return Deal.fromHexIdentifier(identifier);
  }

  private _positionForCard(): number[] {
    const positionForCard: number[] = new Array<number>(52).fill(-1);
    this.hands.forEach((hand, positionIndex) => {
      hand.cardsBySuitIndex.forEach((cards, suitIndex) => {
        for (const card of cards) {
          const suit = Suit.fromIndex(suitIndex);
          const cardIdentifier = Card.identifierForCard(suit, card);
          positionForCard[cardIdentifier] = positionIndex;
        }
      });
    });
    return positionForCard;
  }

  get identifier(): string {
    const positionForCard = this._positionForCard();

    // positionForCard represents a 52-digit number in base 4
    // We're going to split it into 4-digit hunks and convert to base 16.
    let identifier = "";
    for (let offset = 0; offset < 26; offset++) {
      // A single hex digit encodes 4 bits where as our previous encoding was 2.
      const hexIndex =
        positionForCard[offset * 2 + 0] * 4 + positionForCard[offset * 2 + 1];
      identifier += HEX_CHARS[hexIndex];
    }
    return identifier;
  }

  // This is not maximally efficient, we could use
  // combinadics to use 96bits instead of 104.
  get oldIdentifier(): string {
    // We're constructing a 52 digit number in base 4,
    // converted to base-10, its our identifier.
    let identifier = 0n;
    this.hands.forEach((hand, position) => {
      hand.cardsBySuitIndex.forEach((cards, suitIndex) => {
        for (const card of cards) {
          const suit = Suit.fromIndex(suitIndex);
          const cardIdentifier = Card.identifierForCard(suit, card);
          identifier += BigInt(position) * 4n ** BigInt(cardIdentifier);
        }
      });
    });
    return identifier.toString();
  }

  toJson(indent?: number): string {
    const dealDict: Record<string, string> = {};
    POSITIONS.forEach((position, index) => {
      dealDict[position.name.toLowerCase()] = this.hands[index].cdhsDotString();
    });
    if (indent === undefined) {
      // Python's `json.dumps` puts a space after each separator by default.
      const entries = Object.entries(dealDict).map(
        ([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`,
      );
      return `{${entries.join(", ")}}`;
    }
    return JSON.stringify(dealDict, null, indent);
  }

  prettyOneLine(): string {
    return POSITIONS.map(
      (position) =>
        `${position.char}: ${this.handFor(position).prettyOneLine()}`,
    ).join(" ");
  }

  handFor(position: Position): Hand {
    return this.hands[position.index];
  }

  private _validate(): void {
    const allCards = new Set<number>();
    for (const hand of this.hands) {
      for (const suit of SUITS) {
        for (const card of hand.cardsInSuit(suit)) {
          const cardIdentifier = Card.identifierForCard(suit, card);
          assert(
            !allCards.has(cardIdentifier),
            `Already seen ${Card.cardName(suit, card)}`,
          );
          allCards.add(cardIdentifier);
        }
      }
    }
    assert(allCards.size === 52);
  }
}
