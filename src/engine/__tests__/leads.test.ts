// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// A translation of python/tests/test_leads.py, plus cases whose expected card
// and reason were read off the Python `leads` module, one branch at a time.
// `OpeningLeadAdapterTest` there exercises the JSON adapter and moves over with
// the adapter in phase 7 of docs/typescript-engine-plan.md.

import { describe, expect, it } from "vitest";
import {
  bidSuits,
  cardInSuitVsNt,
  cardInSuitVsSuit,
  choose,
  parse,
  strength,
  touching,
} from "../leads";

type Case = readonly [
  hand: string,
  strain: string,
  partner: readonly string[],
  theirs: readonly string[],
  blind: boolean,
  want: string,
  why: string,
];

// hand (S.H.D.C), strain, partner's suits, their suits, blind, expected card, why
const GOLDEN: readonly Case[] = [
  [
    "KQJ3.A82.T97.J54",
    "N",
    [],
    [],
    false,
    "SK",
    "top of sequence, 4-card suit",
  ],
  [
    "K9742.A82.T97.J5",
    "N",
    [],
    [],
    false,
    "S4",
    "fourth best from the longest suit",
  ],
  [
    "K9742.A82.T97.J5",
    "N",
    ["H"],
    [],
    false,
    "H2",
    "partner's suit beats our own; low from three to an honor",
  ],
  ["Q53.J9.KJT4.T862", "N", [], [], false, "DJ", "interior sequence KJT -> J"],
  [
    "Q53.J9.K84.T8632",
    "N",
    [],
    ["C"],
    false,
    "D4",
    "avoid their suit; low from three to an honor",
  ],
  [
    "Q53.J9.K84.T8632",
    "N",
    [],
    ["C"],
    true,
    "C3",
    "blind: longest suit regardless of the auction, fourth best",
  ],
  [
    "8.KJ75.Q9642.J73",
    "S",
    [],
    [],
    false,
    "D4",
    "spades are trumps so S8 is not a side singleton; side suit without an ace, 4th best",
  ],
  [
    "K5.8.Q9642.J7532",
    "S",
    [],
    [],
    false,
    "H8",
    "singleton side suit with 2 trumps",
  ],
  [
    "A9.KQ7.J8642.T73",
    "S",
    [],
    [],
    false,
    "HK",
    "top of KQ sequence rather than underleading the ace",
  ],
  [
    "A9.A74.J8642.T73",
    "S",
    [],
    [],
    false,
    "D4",
    "side suit without an ace, fourth best",
  ],
  ["A9.AK4.A8642.AT7", "S", [], [], false, "HK", "K from AK"],
  [
    "973.A74.A86.AT73",
    "S",
    [],
    [],
    false,
    "S3",
    "every side suit headed by an ace: low trump",
  ],
  [
    "A9.A74.A86.AT732",
    "S",
    [],
    [],
    false,
    "CA",
    "nothing safer: ace of the longest side suit (trumps too good to lead)",
  ],
  [
    "Q53.J9.K84.T8632",
    "H",
    ["D"],
    [],
    false,
    "D4",
    "partner's suit vs a suit contract, low from three to an honor",
  ],
  [
    "T9.KJ75.Q96.J732",
    "N",
    [],
    [],
    false,
    "H5",
    "fourth best from the longest suit (KJ75 over J732 on strength)",
  ],
  [
    "KJT73.Q52.987.64",
    "N",
    ["C"],
    [],
    false,
    "SJ",
    "own strong 5-card suit (KJT: interior sequence -> J) beats partner's minor",
  ],
  [
    "Q9742.Q52.987.64",
    "N",
    ["C"],
    [],
    false,
    "C6",
    "a ragged 5-card suit does not beat partner's suit",
  ],
  [
    "KQJT5.Q52.987.64",
    "N",
    ["C"],
    [],
    false,
    "SK",
    "own solid 5-card suit beats partner's suit",
  ],
  [
    "QJT73.Q52.987.64",
    "N",
    [],
    ["S"],
    false,
    "SQ",
    "lead through their suit from a solid sequence",
  ],
  ["Q52.KT94.987.J64", "N", [], [], false, "HT", "KT9x: T"],
  [
    "KQJT5.6.987.J643",
    "H",
    ["D"],
    [],
    false,
    "SK",
    "vs a suit: a solid 3-card sequence beats partner's suit",
  ],
  [
    "KQ75.6.987.J6432",
    "H",
    ["D"],
    [],
    false,
    "D9",
    "vs a suit: KQ alone does not beat partner's suit",
  ],
  [
    "KQ75.J643.9.J643",
    "H",
    ["D"],
    [],
    false,
    "SK",
    "vs a suit: singleton in partner's suit with a KQ sequence elsewhere -> the sequence",
  ],
];

// hand, strain, partner's suits, their suits, blind, expected card, expected
// reason, the branch the case covers. Every row is what python/leads.py
// returns for that call.
type ReasonCase = readonly [
  hand: string,
  strain: string,
  partner: readonly string[],
  theirs: readonly string[],
  blind: boolean,
  wantCard: string,
  wantReason: string,
  branch: string,
];

const BRANCHES: readonly ReasonCase[] = [
  [
    "AK32.765.9876.54",
    "N",
    [],
    [],
    false,
    "SK",
    "longest/strongest suit, K from AK",
    "vs NT: AK in the longest suit",
  ],
  [
    "AQJ2.765.9876.54",
    "N",
    [],
    [],
    false,
    "SQ",
    "longest/strongest suit, top of interior/broken sequence",
    "vs NT: AQJ",
  ],
  [
    "KQT2.765.9876.54",
    "N",
    [],
    [],
    false,
    "SK",
    "longest/strongest suit, top of interior/broken sequence",
    "vs NT: KQT",
  ],
  [
    "QJ92.765.9876.54",
    "N",
    [],
    [],
    false,
    "SQ",
    "longest/strongest suit, top of interior/broken sequence",
    "vs NT: QJ9",
  ],
  [
    "KJT2.765.9876.54",
    "N",
    [],
    [],
    false,
    "SJ",
    "longest/strongest suit, top of interior/broken sequence",
    "vs NT: KJT",
  ],
  [
    "AJT2.765.9876.54",
    "N",
    [],
    [],
    false,
    "SJ",
    "longest/strongest suit, top of interior/broken sequence",
    "vs NT: AJT",
  ],
  [
    "KT92.765.9876.54",
    "N",
    [],
    [],
    false,
    "ST",
    "longest/strongest suit, top of interior/broken sequence",
    "vs NT: KT9",
  ],
  [
    "AT92.765.9876.54",
    "N",
    [],
    [],
    false,
    "ST",
    "longest/strongest suit, top of interior/broken sequence",
    "vs NT: AT9",
  ],
  [
    "QT92.765.9876.54",
    "N",
    [],
    [],
    false,
    "ST",
    "longest/strongest suit, top of interior/broken sequence",
    "vs NT: QT9",
  ],
  [
    "JT82.765.9876.54",
    "N",
    [],
    [],
    false,
    "SJ",
    "longest/strongest suit, top of interior/broken sequence",
    "vs NT: JT8",
  ],
  [
    "T982.765.9876.54",
    "N",
    [],
    [],
    false,
    "ST",
    "longest/strongest suit, top of sequence",
    "vs NT: T98 is a three-card sequence",
  ],
  [
    "QJ98.765.9876.54",
    "N",
    [],
    [],
    false,
    "SQ",
    "longest/strongest suit, top of interior/broken sequence",
    "vs NT: QJ9 is an interior sequence",
  ],
  [
    "5.7642.9876.8432",
    "N",
    ["S"],
    [],
    false,
    "S5",
    "partner's suit, singleton",
    "vs NT: singleton in partner's suit",
  ],
  [
    "54.7642.9876.843",
    "N",
    ["S"],
    [],
    false,
    "S5",
    "partner's suit, top of doubleton",
    "vs NT: doubleton in partner's suit",
  ],
  [
    "987.7642.9876.54",
    "N",
    ["S"],
    [],
    false,
    "S9",
    "partner's suit, top of nothing",
    "vs NT: three small in partner's suit",
  ],
  [
    "KQJ.7642.9876.54",
    "N",
    ["S"],
    [],
    false,
    "SK",
    "partner's suit, top of sequence",
    "vs NT: a sequence in partner's suit",
  ],
  [
    "A8762.765.987.54",
    "N",
    ["H"],
    [],
    false,
    "S6",
    "longest/strongest suit, fourth best",
    "vs NT: our ace-fifth outranks partner's suit",
  ],
  [
    "A8762.765.987.54",
    "N",
    ["H"],
    [],
    true,
    "S6",
    "longest/strongest suit, fourth best",
    "vs NT: blind ignores partner's suit",
  ],
  [
    "5.7642.98765.843",
    "N",
    ["S"],
    [],
    false,
    "D6",
    "longest/strongest suit, fourth best",
    "vs NT: no singleton in partner's suit with five of our own",
  ],
  [
    "Q532.J9.K84.T863",
    "N",
    [],
    ["S"],
    false,
    "C3",
    "unbid longest/strongest suit, fourth best",
    "vs NT: avoid the suit they bid",
  ],
  [
    "Q532.J9.K84.T863",
    "N",
    [],
    ["S", "H", "D", "C"],
    false,
    "S2",
    "unbid longest/strongest suit, fourth best",
    "vs NT: they bid every suit",
  ],
  [
    "Q532.J9.K84.T863",
    "N",
    [],
    ["S"],
    true,
    "S2",
    "longest/strongest suit, fourth best",
    "vs NT: blind ignores the suits they bid",
  ],
  [
    "875.6.QJ642.J432",
    "S",
    [],
    [],
    false,
    "H6",
    "singleton, hoping to ruff",
    "vs a suit: a singleton with three trumps",
  ],
  [
    "8762.9.J864.QJ73",
    "S",
    [],
    [],
    false,
    "CQ",
    "top of sequence",
    "vs a suit: four trumps, no ruffing singleton",
  ],
  [
    "872.A.J8642.QJ73",
    "S",
    [],
    [],
    false,
    "CQ",
    "top of sequence",
    "vs a suit: a singleton ace is not led for a ruff",
  ],
  [
    "8752.6.QJ642.J73",
    "H",
    ["S"],
    [],
    false,
    "S2",
    "partner's suit, fourth best",
    "vs a suit: partner's suit, fourth best",
  ],
  [
    "A762.6532.Q42.87",
    "H",
    ["S"],
    [],
    false,
    "SA",
    "partner's suit, ace (never underlead an ace vs a suit)",
    "vs a suit: the ace of partner's suit",
  ],
  [
    "87.6532.QT42.J74",
    "H",
    ["S"],
    [],
    false,
    "S8",
    "partner's suit, top of doubleton",
    "vs a suit: a doubleton in partner's suit",
  ],
  [
    "875.6432.QJ64.J7",
    "H",
    ["H"],
    [],
    false,
    "DQ",
    "top of sequence",
    "vs a suit: partner bid the trump suit",
  ],
  [
    "KQ75.6.9876.J643",
    "H",
    ["D"],
    [],
    true,
    "SK",
    "top of sequence",
    "vs a suit: blind ignores partner",
  ],
  [
    "KQ7.642.QJ64.J73",
    "S",
    [],
    [],
    false,
    "DQ",
    "top of sequence",
    "vs a suit: the longer sequence suit first",
  ],
  [
    "9876.65.Q42.8752",
    "S",
    [],
    [],
    false,
    "C2",
    "side suit without an ace, fourth best",
    "vs a suit: a doubleton beats a tripleton",
  ],
  [
    "9876.653.Q42.875",
    "S",
    [],
    [],
    false,
    "D2",
    "side suit without an ace, low from three to an honor",
    "vs a suit: low from three to an honor",
  ],
  [
    "987.6532.Q42.875",
    "S",
    [],
    [],
    false,
    "H2",
    "side suit without an ace, fourth best",
    "vs a suit: fourth best of the longest side suit",
  ],
  [
    "8765.432.765.987",
    "S",
    [],
    [],
    false,
    "H4",
    "side suit without an ace, top of nothing",
    "vs a suit: three small, top of nothing",
  ],
  [
    "9876.65.Q42.8752",
    "S",
    [],
    ["H"],
    false,
    "C2",
    "side suit without an ace, fourth best",
    "vs a suit: prefer an unbid side suit",
  ],
  [
    "A98.A32.J65.A752",
    "D",
    [],
    [],
    false,
    "D5",
    "low trump (every side suit is headed by the ace)",
    "vs a suit: aces everywhere, a low trump",
  ],
  [
    "A98.A32.A65.KQ72",
    "C",
    [],
    [],
    false,
    "SA",
    "ace of the longest side suit (nothing safer)",
    "vs a suit: the trumps are too good to lead",
  ],
];

describe("leads", () => {
  it("chooses the golden lead for every pinned hand", () => {
    for (const [hand, strain, partner, theirs, blind, want, why] of GOLDEN) {
      const [card, reason] = choose(hand, strain, partner, theirs, blind);
      expect(
        card,
        `${hand} vs ${strain}: got ${card} (${reason}), want ${want} -- ${why}`,
      ).toBe(want);
    }
  });

  it("gives a lead, with the Python reason, on every rule branch", () => {
    for (const [
      hand,
      strain,
      partner,
      theirs,
      blind,
      wantCard,
      wantReason,
      branch,
    ] of BRANCHES) {
      const lead = choose(hand, strain, partner, theirs, blind);
      expect(lead, branch).toEqual([wantCard, wantReason]);
    }
  });

  it("leads a card it holds from every hand and every strain", () => {
    // A lead for every strain from a few shapes, always a card in the hand.
    for (const hand of [
      "AKQJ.AKQJ.AKQ.AK",
      "2.3.4.AKQJT98765",
      "AKQJT98765.2.3.4",
      "9876.9876.987.98",
    ]) {
      for (const strain of "SHDCN") {
        const [card] = choose(hand, strain);
        const suits = parse(hand);
        expect(suits[card[0]], `${hand} ${strain} ${card}`).toContain(card[1]);
      }
    }
  });

  it("reads the naturally bid suits out of an auction", () => {
    // N 1H, E P, S 2H, W P, N 4H: N declares, E leads; hearts were bid by the
    // declaring side.
    expect(bidSuits(["1H", "P", "2H", "P", "4H", "P", "P", "P"], 0, 1)).toEqual(
      [[], ["H", "H", "H"]],
    );
    // N 1D, E 1S, S 3N: S declares, W leads; partner (E) bid spades.
    expect(bidSuits(["1D", "1S", "3N", "P", "P", "P"], 0, 3)).toEqual([
      ["S"],
      ["D"],
    ]);
    // Artificial calls are not suits: 1N P 2C(Stayman) P 2D(no major) P 3N;
    // W leads.
    const calls = ["1N", "P", "2C", "P", "2D", "P", "3N", "P", "P", "P"];
    const flags = [
      false,
      false,
      true,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ];
    expect(bidSuits(calls, 0, 3, flags)).toEqual([[], []]);
    expect(bidSuits(calls, 0, 3)[1]).toEqual(["C", "D"]);
  });

  it("reads bid suits from more auctions, as Python does", () => {
    expect(bidSuits([], 0, 0)).toEqual([[], []]);
    expect(bidSuits(["P", "P", "P", "P"], 2, 3)).toEqual([[], []]);
    // Dealer East, North leads: doubles and redoubles are not suits, and the
    // leader's own 2S is neither partner's nor theirs.
    expect(bidSuits(["1C", "X", "XX", "2S", "P", "P", "P"], 1, 0)).toEqual([
      [],
      ["C"],
    ]);
    // Dealer West, North leads: their spades counted once per call.
    expect(bidSuits(["1S", "2H", "4S", "P", "P", "P"], 3, 0)).toEqual([
      [],
      ["S", "S"],
    ]);
    // Dealer South, East leads: partner (West) never bid a suit.
    expect(
      bidSuits(["1D", "P", "1H", "1S", "2H", "P", "4H", "P", "P", "P"], 2, 1),
    ).toEqual([[], ["D", "H", "H", "H"]]);
    // 2N P 3C(Stayman) P 3S: only the spades are natural.
    expect(
      bidSuits(["2N", "P", "3C", "P", "3S", "P", "4S", "P", "P", "P"], 0, 1, [
        false,
        false,
        true,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
      ]),
    ).toEqual([[], ["S"]]);
    // Notrump is not a suit.
    expect(bidSuits(["7N", "P", "P", "P"], 1, 2)).toEqual([[], []]);
    // An artificial flag drops partner's 2S but not their hearts.
    expect(
      bidSuits(["1H", "1S", "2H", "2S", "4H", "P", "P", "P"], 0, 1, [
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
      ]),
    ).toEqual([[], ["H", "H", "H"]]);
  });

  it("sorts each suit from the ace down and rejects a malformed hand", () => {
    expect(parse("32KQ.A82.T97.J54")).toEqual({
      S: "KQ32",
      H: "A82",
      D: "T97",
      C: "J54",
    });
    expect(() => parse("KQJ3.A82.T97")).toThrow();
    expect(() => parse("KQJ32.A82.T97.J54")).toThrow();
    expect(() => choose("KQJ3.A82.T97.J54", "X")).toThrow();
  });

  it("finds a sequence of touching honors at the head of a holding", () => {
    expect(touching("KQJ", 3)).toBe("K");
    expect(touching("KQJ", 2)).toBe("K");
    expect(touching("KQ9", 3)).toBeNull();
    expect(touching("AKQ", 2)).toBe("A");
    expect(touching("Q", 1)).toBe("Q");
    expect(touching("987", 2)).toBeNull();
    expect(touching("JT98", 4)).toBe("J");
  });

  it("counts honor strength the way Python does", () => {
    expect(strength("AKQJT")).toBe(10.5);
    expect(strength("AT")).toBe(4.5);
    expect(strength("9876")).toBe(0);
    expect(strength("")).toBe(0);
  });

  it("picks the card within a suit against notrump and against a suit", () => {
    const cases: readonly (readonly [
      cards: string,
      vsNt: readonly [string, string],
      vsSuit: readonly [string, string],
    ])[] = [
      ["A", ["A", "singleton"], ["A", "singleton"]],
      ["AK", ["A", "top of doubleton"], ["A", "top of doubleton"]],
      ["KQJ", ["K", "top of sequence"], ["K", "top of sequence"]],
      ["AKQ", ["A", "top of sequence"], ["K", "K from AK"]],
      ["AK32", ["K", "K from AK"], ["K", "K from AK"]],
      [
        "AQJ2",
        ["Q", "top of interior/broken sequence"],
        ["A", "ace (never underlead an ace vs a suit)"],
      ],
      ["T982", ["T", "top of sequence"], ["T", "top of sequence"]],
      ["987", ["9", "top of nothing"], ["9", "top of nothing"]],
      [
        "K93",
        ["3", "low from three to an honor"],
        ["3", "low from three to an honor"],
      ],
      [
        "AJT9",
        ["J", "top of interior/broken sequence"],
        ["A", "ace (never underlead an ace vs a suit)"],
      ],
      ["QJ32", ["2", "fourth best"], ["Q", "top of sequence"]],
    ];
    for (const [cards, vsNt, vsSuit] of cases) {
      expect(cardInSuitVsNt(cards), cards).toEqual(vsNt);
      expect(cardInSuitVsSuit(cards), cards).toEqual(vsSuit);
    }
  });

  it("leads a low trump from a trump holding", () => {
    // Only reachable through the trump path: `choose` handles trumps itself.
    expect(cardInSuitVsSuit("9876", true)).toEqual(["6", "low trump"]);
    expect(cardInSuitVsSuit("Q98", true)).toEqual(["8", "low trump"]);
    expect(cardInSuitVsSuit("KQJ", true)).toEqual(["K", "top of sequence"]);
    expect(cardInSuitVsSuit("AKQ", true)).toEqual(["K", "K from AK"]);
    expect(cardInSuitVsSuit("98", true)).toEqual(["9", "top of doubleton"]);
  });
});
