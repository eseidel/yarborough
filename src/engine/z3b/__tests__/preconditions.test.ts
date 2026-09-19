// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// A translation of python/tests/test_preconditions.py, plus the Python
// `repr` of every precondition form the rules manifest records (the manifest
// compares those strings), on histories answered from the recorded
// snapshots or, where only the calls matter, from the calls alone.

import { describe, expect, it } from "vitest";
import { Call } from "../../core/call";
import { CallHistory } from "../../core/callhistory";
import { CLUBS, DIAMONDS, HEARTS, NOTRUMP, SPADES } from "../../core/suit";
import { positions } from "../model";
import {
  AndPrecondition,
  annotations,
  didBidAnnotation,
  EitherPrecondition,
  ForcedToBid,
  HasBid,
  impliesArtificial,
  InvertedPrecondition,
  IsGame,
  Jump,
  JumpFromLastContract,
  JumpFromPartnerLastBid,
  LastBidHasAnnotation,
  LastBidHasStrain,
  LastBidHasSuit,
  LastBidWas,
  LastBidWasBelowGame,
  LastBidWasGameOrAbove,
  Level,
  MaxLevel,
  MaxShownLength,
  NoOpening,
  NotJumpFromLastContract,
  NotJumpFromMyLastBid,
  NotJumpFromPartnerLastBid,
  Opened,
  OpeningBidWas,
  PassedHand,
  StrainPrecondition,
  TheyOpened,
  UnbidSuitCountRange,
} from "../preconditions";
import { pyRepr, tuple } from "../py";
import { type AuctionSnapshot, readJsonlFixture } from "./fixtures";
import { RecordedHistories, UnrecordedError } from "./recorded-history";

const store = new RecordedHistories(
  readJsonlFixture<AuctionSnapshot>("auction-snapshots.jsonl"),
  (name) => ({ name, forcing: null, requiresPlanning: false }),
);

/** The history of an auction; recorded when the fixtures hold it, else the calls alone. */
function history(calls: string, dealer = "N") {
  return store.history(CallHistory.fromString(calls, dealer, "None"));
}

const call = (name: string) => Call.fromString(name);

describe("preconditions", () => {
  it("is_game", () => {
    const h = history("1H P");
    expect(new IsGame().fits(h, call("4H"))).toBe(true);
    expect(new IsGame().fits(h, call("3N"))).toBe(true);
    expect(new IsGame().fits(h, call("5C"))).toBe(true);
    expect(new IsGame().fits(h, call("3H"))).toBe(false);
    expect(new IsGame().fits(h, call("4C"))).toBe(false);
    expect(new IsGame().fits(h, call("P"))).toBe(false);
    expect(new LastBidWasBelowGame().fits(h, call("2H"))).toBe(true);
    const game = history("1H P 4H P");
    expect(new LastBidWasGameOrAbove().fits(game, call("P"))).toBe(true);
  });

  it("reads the calls: jumps, levels, the opening bid, a passed hand", () => {
    const h = history("1H P");
    expect(new JumpFromLastContract().fits(h, call("3H"))).toBe(true);
    expect(new JumpFromLastContract().fits(h, call("2H"))).toBe(false);
    expect(new JumpFromLastContract().fits(h, call("2S"))).toBe(true);
    expect(new JumpFromLastContract().fits(h, call("2D"))).toBe(false);
    expect(new JumpFromLastContract(1).fits(h, call("3D"))).toBe(true);
    expect(new JumpFromLastContract(1).fits(h, call("3S"))).toBe(false);
    expect(new NotJumpFromLastContract().fits(h, call("2D"))).toBe(true);
    expect(new NotJumpFromLastContract().fits(h, call("P"))).toBe(false);
    expect(new JumpFromPartnerLastBid().fits(h, call("3H"))).toBe(true);
    expect(new NotJumpFromPartnerLastBid().fits(h, call("2D"))).toBe(true);
    // A double is judged as the contract it doubles, compared with itself: a
    // "jump" of minus one, which the Python counts as a jump (and never as a
    // non-jump).
    const doubled = history("1H 1S");
    expect(new JumpFromLastContract().fits(doubled, call("X"))).toBe(true);
    expect(new NotJumpFromLastContract().fits(doubled, call("X"))).toBe(false);
    expect(new Level(1).fits(doubled, call("X"))).toBe(true);
    expect(new Level(2).fits(doubled, call("2S"))).toBe(true);
    expect(new Level(2).fits(doubled, call("P"))).toBe(false);
    expect(new MaxLevel(1).fits(doubled, call("X"))).toBe(true);
    expect(new MaxLevel(1).fits(doubled, call("2C"))).toBe(false);
    expect(new OpeningBidWas("1H").fits(history("P 1H P"), call("P"))).toBe(
      true,
    );
    expect(new OpeningBidWas("1H").fits(history("P P"), call("P"))).toBe(false);
    // After P P 1S: partner (the dealer) passed before the opening.
    expect(
      new PassedHand(positions.Partner).fits(history("P P 1S"), call("P")),
    ).toBe(true);
    expect(
      new PassedHand(positions.RHO).fits(history("P P 1S"), call("P")),
    ).toBe(false);
    expect(new PassedHand(positions.Me).fits(history("P P P"), call("P"))).toBe(
      false,
    );
  });

  it("reads the recorded auction: annotations, suits and lengths", () => {
    const h = history("1S", "N");
    expect(h.recorded).toBe(true);
    expect(new NoOpening().fits(h, call("P"))).toBe(false);
    expect(new NoOpening().fits(history("", "N"), call("P"))).toBe(true);
    expect(new TheyOpened().fits(h, call("P"))).toBe(true);
    expect(new Opened(positions.RHO).fits(h, call("P"))).toBe(true);
    expect(new Opened(positions.Partner).fits(h, call("P"))).toBe(false);
    expect(new HasBid(positions.RHO).fits(h, call("P"))).toBe(true);
    expect(new HasBid(positions.Me).fits(h, call("P"))).toBe(false);
    expect(
      new LastBidHasAnnotation(positions.RHO, annotations.Opening).fits(
        h,
        call("P"),
      ),
    ).toBe(true);
    expect(new LastBidHasStrain(positions.RHO, SPADES).fits(h, call("P"))).toBe(
      true,
    );
    expect(
      new LastBidHasStrain(positions.RHO, [CLUBS, DIAMONDS]).fits(h, call("P")),
    ).toBe(false);
    expect(new LastBidHasSuit(positions.RHO).fits(h, call("P"))).toBe(true);
    expect(new LastBidHasSuit().fits(h, call("P"))).toBe(true);
    expect(new LastBidWas(positions.RHO, "1S").fits(h, call("P"))).toBe(true);
    expect(new MaxShownLength(positions.RHO, 4).fits(h, call("2S"))).toBe(
      false,
    );
    expect(new MaxShownLength(positions.RHO, 5).fits(h, call("2S"))).toBe(true);
    expect(new UnbidSuitCountRange(3, 3).fits(h, call("P"))).toBe(true);
    expect(new StrainPrecondition(NOTRUMP).fits(h, call("1N"))).toBe(true);
    expect(new ForcedToBid().fits(h, call("P"))).toBe(false);
    expect(new InvertedPrecondition(new ForcedToBid()).fits(h, call("P"))).toBe(
      true,
    );
    expect(
      new EitherPrecondition(new NoOpening(), new TheyOpened()).fits(
        h,
        call("P"),
      ),
    ).toBe(true);
    expect(
      new AndPrecondition(new NoOpening(), new TheyOpened()).fits(h, call("P")),
    ).toBe(false);
  });

  it("throws on what an unrecorded prefix cannot answer", () => {
    const h = history("7N X XX", "N");
    expect(h.recorded).toBe(false);
    expect(new Level(7).fits(h, call("X"))).toBe(true);
    expect(() => new NoOpening().fits(h, call("P"))).toThrow(UnrecordedError);
  });

  it("prints its Python repr", () => {
    expect(new NoOpening().repr()).toBe("NoOpening()");
    expect(String(new Opened(positions.Partner))).toBe("Opened('Partner')");
    expect(new InvertedPrecondition(new ForcedToBid()).repr()).toBe(
      "Not(ForcedToBid())",
    );
    expect(
      new EitherPrecondition(
        new LastBidHasAnnotation(positions.RHO, annotations.Preemptive),
        new AndPrecondition(
          new LastBidWas(positions.Partner, "P"),
          new InvertedPrecondition(new HasBid(positions.Me)),
        ),
      ).repr(),
    ).toBe(
      "Either(LastBidHasAnnotation('RHO', 'Preemptive'), And(LastBidWas('Partner', 'P'), Not(HasBid('Me'))))",
    );
    expect(new LastBidHasStrain(positions.Me, [DIAMONDS]).repr()).toBe(
      "LastBidHasStrain('Me', [Strain(Diamonds)])",
    );
    expect(new LastBidHasStrain(positions.Me, DIAMONDS).repr()).toBe(
      "LastBidHasStrain('Me', [Strain(Diamonds)])",
    );
    expect(
      new LastBidHasStrain(positions.Partner, tuple(CLUBS, DIAMONDS)).repr(),
    ).toBe("LastBidHasStrain('Partner', (Strain(Clubs), Strain(Diamonds)))");
    expect(new LastBidHasStrain(positions.Partner, tuple(HEARTS)).repr()).toBe(
      "LastBidHasStrain('Partner', (Strain(Hearts),))",
    );
    expect(new LastBidHasSuit(positions.RHO).repr()).toBe(
      "LastBidHasSuit(\"'RHO'\")",
    );
    expect(new LastBidHasSuit().repr()).toBe("LastBidHasSuit(None)");
    expect(new MaxShownLength(positions.Me, 5).repr()).toBe(
      "MaxShownLength('Me', 5, None)",
    );
    expect(new MaxShownLength(positions.Me, 5, HEARTS).repr()).toBe(
      "MaxShownLength('Me', 5, Strain(Hearts))",
    );
    expect(new JumpFromLastContract().repr()).toBe(
      "JumpFromLastContract(None)",
    );
    expect(new JumpFromLastContract(1).repr()).toBe("JumpFromLastContract(1)");
    expect(new NotJumpFromLastContract().repr()).toBe(
      "NotJumpFromLastContract(0)",
    );
    expect(new NotJumpFromMyLastBid().repr()).toBe("NotJumpFromMyLastBid(0)");
    expect(new NotJumpFromPartnerLastBid().repr()).toBe(
      "NotJumpFromPartnerLastBid(0)",
    );
    expect(new UnbidSuitCountRange(2, 3).repr()).toBe(
      "UnbidSuitCountRange(2, 3)",
    );
    expect(new StrainPrecondition(NOTRUMP).repr()).toBe(
      "Strain(Strain(Notrump))",
    );
    expect(new Level(2).repr()).toBe("Level(2)");
    expect(new MaxLevel(2).repr()).toBe("MaxLevel(2)");
    expect(new OpeningBidWas("1N").repr()).toBe("OpeningBidWas('1N')");
    expect(new NotJumpFromLastContract()).toBeInstanceOf(Jump);
  });

  it("prints Python values", () => {
    expect(pyRepr("it's")).toBe('"it\'s"');
    expect(pyRepr('say "hi" it\'s')).toBe("'say \"hi\" it\\'s'");
    expect(pyRepr(null)).toBe("None");
    expect(pyRepr(true)).toBe("True");
    expect(pyRepr([1, "a"])).toBe("[1, 'a']");
    expect(pyRepr(tuple())).toBe("()");
    expect(pyRepr(call("1H"))).toBe("Call('1H')");
    expect(pyRepr(annotations.Opening)).toBe("Opening");
    expect(() => pyRepr(Symbol("x"))).toThrow(/no Python repr/);
  });

  it("knows which annotations imply Artificial and which suit each Bid annotation is", () => {
    expect(impliesArtificial.has(annotations.Stayman)).toBe(true);
    expect(impliesArtificial.has(annotations.Artificial)).toBe(false);
    expect(impliesArtificial.has(annotations.Opening)).toBe(false);
    expect(didBidAnnotation(SPADES)).toBe(annotations.BidSpades);
    expect(didBidAnnotation(CLUBS)).toBe(annotations.BidClubs);
    expect(
      () => new LastBidHasAnnotation(positions.Me, positions.Me),
    ).toThrow();
  });
});
