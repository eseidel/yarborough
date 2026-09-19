// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// A translation of python/tests/test_categories.py, plus tables of
// `formatRuleName` and `categoryFor` answers read off the Python module.

// cspell:ignore Reponse

import { describe, expect, it } from "vitest";
import type {
  CategoryCall,
  CategoryHistory,
  CategoryPosition,
} from "../categories";
import {
  ADVANCING,
  COMPETING,
  LEVEL_ONE,
  NATURAL,
  OPENER_REBID,
  OPENING,
  PASSING,
  RESPONDER_REBID,
  RESPONDING,
  categoryFor,
  formatRuleName,
  knownRuleNames,
  roleFor,
} from "../categories";

// The rule classes z3b registers today, from
// `sorted(r.name for r in sayc.StandardAmericanYellowCard.rules)`. Phase 5 of
// docs/typescript-engine-plan.md ports the rules; this constant is replaced
// then by the real registry, so that a new rule without a category still
// fails here.
const REGISTERED_RULES: readonly string[] = [
  "AcceptTransferToClubs",
  "AcceptTransferToHearts",
  "AcceptTransferToSpades",
  "AcceptTransferToTwoClubs",
  "BalancingCappelletti",
  "BalancingDouble",
  "BalancingDoubleAfterNotrumpAuction",
  "BalancingDoubleOverRaise",
  "BalancingJumpSuitedOvercall",
  "BalancingMichaelsCuebid",
  "BalancingNotrumpOvercall",
  "BalancingSuitedOvercall",
  "BalancingSuitedOvercallOverRaise",
  "BlackwoodForAces",
  "BlackwoodForKings",
  "Cappelletti",
  "CappellettiMinorRequest",
  "CompleteOwnTransferToHeartsAfterDouble",
  "CompleteOwnTransferToSpadesAfterDouble",
  "CorrectMichaelsMinor",
  "CueBidAfterTakeoutDouble",
  "CueBidRebidAfterNegativeDouble",
  "CuebidReponseToNegativeDouble",
  "CuebidResponseToStandardOvercall",
  "CuebidResponseToTakeoutDouble",
  "DefaultPass",
  "DelayedSupportResponseToFourthSuitForcing",
  "DiamondStaymanResponse",
  "DirectMichaelsCuebid",
  "DirectOvercall1N",
  "ExtrasRebidAfterCuebidResponse",
  "FeatureResponseToTwoNotrumpFeatureRequest",
  "ForcedMajorRebid",
  "ForcedRebidOriginalSuitByOpener",
  "ForcedSuitResponseToTakeoutDouble",
  "FourthSuitResponseToFourthSuitForcing",
  "FreeSuitResponseToTakeoutDouble",
  "GameAccept",
  "GameForcingUnsupportedRebidByOpener",
  "GameRaiseAfterTransferToHearts",
  "GameRaiseAfterTransferToSpades",
  "GarbagePassStaymanRebid",
  "GerberForAces",
  "GerberForKings",
  "GrandSlamForce",
  "HeartsRebidAfterSpadesTransfer",
  "HelpSuitGameTry",
  "InvitationalUnsupportedRebidByOpener",
  "Jacoby2N",
  "JacobyTransfer",
  "JumpNewSuitAfterTakeoutDouble",
  "JumpNotrumpResponseToNegativeDouble",
  "JumpNotrumpResponseToTakeoutDouble",
  "JumpRaiseAfterTakeoutDouble",
  "JumpRaiseResponseToBalancingOvercall",
  "JumpRaiseResponseToNegativeDouble",
  "JumpShiftByOpener",
  "JumpShiftResponderRebid",
  "JumpShiftResponseToOpen",
  "JumpShiftResponseToOpenAfterRHODouble",
  "JumpSuitResponseToMichaelsMinorRequest",
  "JumpSuitResponseToTakeoutDouble",
  "JumpTwoNotrumpAfterTakeoutDouble",
  "LawOfTotalTricks",
  "LeadDirectingDoubleOfAceAskingResponse",
  "LeadDirectingDoubleOfArtificialSuitBid",
  "Lebensohl",
  "LongMajorSlamInvitation",
  "LongMinorGameInvitation",
  "MaximumNotrumpResponseToTwoNotrumpFeatureRequest",
  "MichaelsMinorPreference",
  "MichaelsMinorRequest",
  "MichaelsSimplePreferenceResponse",
  "MinimumRebidAfterCuebidResponse",
  "MinimumRebidOfPreemptSuit",
  "MinimumResponseToJacoby2N",
  "MinorGameForceRebid",
  "NaturalNotrump",
  "NaturalStaymanResponse",
  "NaturalSuited",
  "NewMinorRebidAfterJacobyTransfer",
  "NewOneLevelMajorByOpener",
  "NewSuitAfterPreempt",
  "NewSuitAfterTakeoutDouble",
  "NewSuitAtTheThreeLevelOverJumpOvercall",
  "NewSuitAtTheTwoLevel",
  "NewSuitAtTheTwoLevelAfterRHODouble",
  "NewSuitByOpener",
  "NewSuitResponseToMajorCappelletti",
  "NewSuitResponseToNegativeDouble",
  "NewSuitResponseToOneNotrumpPenaltyDouble",
  "NewSuitResponseToPreempt",
  "NewSuitResponseToStandardOvercall",
  "NonJumpFourthSuitForcing",
  "NonJumpTwoNotrumpAfterTakeoutDouble",
  "NotrumpAfterPreempt",
  "NotrumpAfterTakeoutDouble",
  "NotrumpGameAccept",
  "NotrumpGameInvitation",
  "NotrumpInvitationByOpener",
  "NotrumpJumpRebid",
  "NotrumpJumpResponseToFourthSuitForcing",
  "NotrumpOpening",
  "NotrumpRebidAfterJacobyTransfer",
  "NotrumpRebidOverTwoClubs",
  "NotrumpResponseToBalancingOvercall",
  "NotrumpResponseToFourthSuitForcing",
  "NotrumpResponseToJacoby2N",
  "NotrumpResponseToMinorOpen",
  "NotrumpResponseToNegativeDouble",
  "NotrumpResponseToStrongTwoClubs",
  "NotrumpResponseToTakeoutDouble",
  "NotrumpSlamIsRemote",
  "OneLevelNegativeDouble",
  "OneLevelNewSuitResponse",
  "OneLevelStandardOvercall",
  "OneLevelSuitOpening",
  "OneLevelTakeoutDouble",
  "OneNotrumpResponse",
  "OpenerSuitedJumpRebidAfterStrongTwoClubs",
  "OpenerSuitedRebidAfterStrongTwoClubs",
  "OtherMajorRebidAfterStayman",
  "PassAfterPreempt",
  "PassAfterSignoff",
  "PassAfterTakeoutDouble",
  "PassDoubledTransferToHearts",
  "PassDoubledTransferToSpades",
  "PassPassedHandResponse",
  "PassResponseOverOvercall",
  "PassResponseToLimitRaise",
  "PassResponseToMichaelsMinorRequest",
  "PassResponseToOneNotrumpPenaltyDouble",
  "PassResponseToPreempt",
  "PassResponseToSuitedOpen",
  "PassStaymanResponse",
  "PenaltyDoubleOfGameOpening",
  "PenaltyPassOfTakeoutDouble",
  "PreemptiveOpen",
  "PreemptiveOvercall",
  "QuantitativeFourNotrumpJump",
  "Raise",
  "RaiseAfterCappellettiMinorRequest",
  "RaiseAfterJumpShiftResponse",
  "RaiseAfterTakeoutDouble",
  "RaiseOfFirstSuitAfterReverse",
  "RaiseOfPartnersPreemptResponse",
  "RaiseOfReverseSuit",
  "RaiseOverTakeoutDouble",
  "RaiseResponseToMajorCappelletti",
  "RaiseResponseToNegativeDouble",
  "RaiseResponseToStandardOvercall",
  "RebidFirstSuitAfterLebensohl",
  "RebidOneNotrumpByOpener",
  "RebidOwnSuitAfterFourthSuitForcing",
  "RebidResponderSuitByResponder",
  "RebidResponseToFourthSuitForcing",
  "RebidSuitAfterSecondNegative",
  "RedoubleAfterDoubledStayman",
  "RedoubleDoubledTransfer",
  "RedoubleResponseAfterRHOTakeoutDouble",
  "RedoubleTransferToMinor",
  "ReopeningDouble",
  "ResponderNotrumpInvitation",
  "ResponderReverse",
  "ResponderSignoffInPartnersSuit",
  "ResponseAfterTransferToClubs",
  "ResponseAfterTransferToTwoClubs",
  "ResponseToBlackwood",
  "ResponseToCappellettiMinorRequest",
  "ResponseToCappellettiTwoClubs",
  "ResponseToCappellettiTwoDiamonds",
  "ResponseToGerber",
  "ResponseToGrandSlamForce",
  "ResponseToJordan",
  "ResponseToQuantitativeFourNotrump",
  "ReverseByOpener",
  "SandwichMichaelsCuebid",
  "SandwichOvercall",
  "SecondNegative",
  "ShapeResponseToJacoby2N",
  "SingleRaiseResponseToBalancingOvercall",
  "SlamResponseToJacoby2N",
  "SpadesRebidAfterHeartsTransfer",
  "StolenThreeClubStayman",
  "StolenThreeHeartStaymanResponse",
  "StolenThreeSpadeStaymanResponse",
  "StolenTwoClubStayman",
  "StolenTwoHeartStaymanResponse",
  "StolenTwoSpadeStaymanResponse",
  "StrongTwoClubs",
  "SuitGameIsRemote",
  "SuitRebidAfterCappellettiTwoClubs",
  "SuitResponseToMichaelsMinorRequest",
  "SuitResponseToStrongTwoClubs",
  "SuitSlamIsRemote",
  "SuperAcceptTransferToHearts",
  "SuperAcceptTransferToSpades",
  "SupportPartnerMajorSuit",
  "TakeoutDoubleAfterPreempt",
  "TakeoutDoubleAfterTakeoutDouble",
  "ThreeLevelStayman",
  "ThreeLevelSuitRebidByResponder",
  "ThreeNotrumpMajorResponse",
  "ThreeNotrumpOpening",
  "TwoLevelNegativeDouble",
  "TwoLevelStandardOvercall",
  "TwoLevelStayman",
  "TwoLevelTakeoutDouble",
  "TwoNotrumpFeatureRequest",
  "TwoNotrumpOvercallOfWeakTwo",
  "TwoSpadesJumpFourthSuitForcing",
  "TwoSpadesRelay",
  "UnforcedRebidOriginalSuitByOpener",
  "Unusual2N",
  "Unusual2NSimplePreferenceResponse",
  "WaitingResponseToStrongTwoClubs",
  "WeakNewSuitAfterOneNotrumpResponse",
];

// The little bit of an auction that categories reads. `core`'s CallHistory,
// Position and Call take these roles once phase 2 lands them.
class TestPosition implements CategoryPosition {
  readonly index: number;

  constructor(index: number) {
    this.index = index;
  }

  inPartnershipWith(position: CategoryPosition): boolean {
    return (position.index - this.index) % 2 === 0;
  }
}

class TestCall implements CategoryCall {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  isPass(): boolean {
    return this.name === "P";
  }

  isContract(): boolean {
    return this.name !== "P" && this.name !== "X" && this.name !== "XX";
  }
}

class TestHistory implements CategoryHistory<TestPosition, TestCall> {
  readonly calls: readonly TestCall[];
  readonly dealer: TestPosition;

  constructor(calls: readonly TestCall[], dealer: TestPosition) {
    this.calls = calls;
    this.dealer = dealer;
  }

  positionToCall(): TestPosition {
    return new TestPosition((this.dealer.index + this.calls.length) % 4);
  }

  opener(): TestPosition | null {
    for (const [caller, call] of this.enumerateCalls()) {
      if (call.isContract()) {
        return caller;
      }
    }
    return null;
  }

  enumerateCalls(): readonly (readonly [TestPosition, TestCall])[] {
    return this.calls.map((call, offset) => [
      new TestPosition((this.dealer.index + offset) % 4),
      call,
    ]);
  }

  callsBy(position: TestPosition): readonly TestCall[] {
    const offsetFromDealer = (position.index - this.dealer.index + 4) % 4;
    const calls: TestCall[] = [];
    for (let i = offsetFromDealer; i < this.calls.length; i += 4) {
      calls.push(this.calls[i]);
    }
    return calls;
  }
}

function history(calls: string, dealer = "N"): TestHistory {
  const names = calls.split(" ").filter((name) => name.length > 0);
  return new TestHistory(
    names.map((name) => new TestCall(name)),
    new TestPosition("NESW".indexOf(dealer)),
  );
}

// rule name, formatted name, from Python's `format_rule_name`.
const FORMATTED: readonly (readonly [string, string])[] = [
  ["OneLevelSuitOpening", "One Level Suit Opening"],
  ["Jacoby2N", "Jacoby 2NT"],
  ["RHOOpeningPreempt", "RHO Opening Preempt"],
  ["Unusual2N", "Unusual 2NT"],
  ["DirectOvercall1N", "Direct Overcall 1NT"],
  [
    "NewSuitAtTheTwoLevelAfterRHODouble",
    "New Suit At The Two Level After RHO Double",
  ],
  [
    "RedoubleResponseAfterRHOTakeoutDouble",
    "Redouble Response After RHO Takeout Double",
  ],
  [
    "JumpShiftResponseToOpenAfterRHODouble",
    "Jump Shift Response To Open After RHO Double",
  ],
  ["Cappelletti", "Cappelletti"],
  ["ThreeNotrumpOpening", "Three Notrump Opening"],
  ["CuebidReponseToNegativeDouble", "Cuebid Reponse To Negative Double"],
  ["LawOfTotalTricks", "Law Of Total Tricks"],
  ["NaturalSuited", "Natural Suited"],
  ["DefaultPass", "Default Pass"],
  ["StrongTwoClubs", "Strong Two Clubs"],
  ["TwoSpadesJumpFourthSuitForcing", "Two Spades Jump Fourth Suit Forcing"],
  [
    "MaximumNotrumpResponseToTwoNotrumpFeatureRequest",
    "Maximum Notrump Response To Two Notrump Feature Request",
  ],
  ["BlackwoodForAces", "Blackwood For Aces"],
  ["GrandSlamForce", "Grand Slam Force"],
  ["AcceptTransferToTwoClubs", "Accept Transfer To Two Clubs"],
  ["LHOSomething", "LHO Something"],
  ["NotrumpGameInvitation", "Notrump Game Invitation"],
];

// rule name (or null), the auction before the call, the dealer, and the
// category Python's `category_for` returns.
const CATEGORIES: readonly (readonly [
  ruleName: string | null,
  calls: string,
  dealer: string,
  want: readonly string[],
])[] = [
  [null, "", "N", ["Opening", "Passing", "Pass"]],
  [null, "1S P", "N", ["Responding to an opening", "Passing", "Pass"]],
  [null, "1S P 2S P 4S P", "N", ["Responder's rebid", "Passing", "Pass"]],
  ["DefaultPass", "1S", "N", ["Competing", "Passing", "Default Pass"]],
  [
    "NaturalSuited",
    "1S P 2S P",
    "N",
    ["Opener's rebid", "Natural bids", "Natural Suited"],
  ],
  [
    "NaturalNotrump",
    "1C 1S",
    "N",
    ["Responding to an opening", "Natural bids", "Natural Notrump"],
  ],
  [
    "LawOfTotalTricks",
    "1S 2H 2S",
    "N",
    ["After partner competes", "Competitive raises", "Law Of Total Tricks"],
  ],
  [
    "SuitSlamIsRemote",
    "1S P 3S P",
    "N",
    ["Opener's rebid", "Passing", "Suit Slam Is Remote"],
  ],
  [
    "JacobyTransfer",
    "1N P",
    "N",
    ["Responding to an opening", "To 1NT", "Jacoby Transfer"],
  ],
  [
    "OneLevelTakeoutDouble",
    "1S",
    "N",
    ["Competing", "Takeout doubles", "One Level Takeout Double"],
  ],
  [
    "BlackwoodForAces",
    "1S P 3S P",
    "N",
    ["Slam bidding", "Blackwood", "Blackwood For Aces"],
  ],
  [
    "OneLevelSuitOpening",
    "",
    "N",
    ["Opening", "One of a suit", "One Level Suit Opening"],
  ],
  ["Raise", "1S P", "N", ["Responding to an opening", "Raises", "Raise"]],
  [
    "NewSuitByOpener",
    "1C P 1H P",
    "N",
    ["Opener's rebid", "New suits and reverses", "New Suit By Opener"],
  ],
  [
    "PenaltyPassOfTakeoutDouble",
    "1S X P",
    "N",
    [
      "After partner competes",
      "Replying to a takeout double",
      "Penalty Pass Of Takeout Double",
    ],
  ],
  [
    "Unusual2N",
    "1S",
    "W",
    ["Competing", "Michaels and Unusual 2NT", "Unusual 2NT"],
  ],
  [
    "DefaultPass",
    "P P 1S P 2S P",
    "S",
    ["Opener's rebid", "Passing", "Default Pass"],
  ],
  [
    "NaturalSuited",
    "P 1S P 2S",
    "S",
    ["Competing", "Natural bids", "Natural Suited"],
  ],
];

// the auction, the dealer, and the role Python's `role_for` returns.
const ROLES: readonly (readonly [
  calls: string,
  dealer: string,
  want: string,
])[] = [
  ["", "N", OPENING],
  ["P", "N", OPENING],
  ["P P P", "N", OPENING],
  ["1S", "N", COMPETING],
  ["1S P", "N", RESPONDING],
  ["1S 2H", "N", RESPONDING],
  ["1S P 2S P", "N", OPENER_REBID],
  ["1S P 2S P 4S P", "N", RESPONDER_REBID],
  ["1S P P", "N", COMPETING],
  ["1S X P", "N", ADVANCING],
  ["1S X 2S P", "N", OPENER_REBID],
  ["1S X 2S P P", "N", COMPETING],
  ["1S X 2S P P 3H", "N", RESPONDER_REBID],
  ["1S X 2S P P 3H P", "N", ADVANCING],
  ["1S P 1N 2H", "N", OPENER_REBID],
  ["P P 1S P 2S P", "S", OPENER_REBID],
  ["P 1S P 2S", "S", COMPETING],
];

describe("categories", () => {
  it("has a category for every registered rule", () => {
    const known = knownRuleNames();
    const missing = REGISTERED_RULES.filter((name) => !known.has(name)).sort();
    expect(missing, `rules with no category: ${missing}`).toEqual([]);
  });

  it("names no rule that is not registered", () => {
    const registered = new Set(REGISTERED_RULES);
    const stale = [...knownRuleNames()]
      .filter((name) => !registered.has(name))
      .sort();
    expect(
      stale,
      `categories for rules that no longer exist: ${stale}`,
    ).toEqual([]);
  });

  it("uses a known first level for every category", () => {
    for (const ruleName of knownRuleNames()) {
      const path = categoryFor(ruleName, history(""));
      expect(path, ruleName).toHaveLength(3);
      expect(LEVEL_ONE, ruleName).toContain(path[0]);
      expect(
        path.every((level) => level.length > 0),
        ruleName,
      ).toBe(true);
    }
  });

  it("places table rules by the table", () => {
    expect(categoryFor("JacobyTransfer", history("1N P"))).toEqual([
      "Responding to an opening",
      "To 1NT",
      "Jacoby Transfer",
    ]);
    expect(categoryFor("OneLevelTakeoutDouble", history("1S"))).toEqual([
      "Competing",
      "Takeout doubles",
      "One Level Takeout Double",
    ]);
    expect(categoryFor("BlackwoodForAces", history("1S P 3S P"))[0]).toBe(
      "Slam bidding",
    );
  });

  it("treats an unknown rule as an error", () => {
    expect(() => categoryFor("NoSuchRule", history(""))).toThrow();
  });

  it("reads the role from the auction", () => {
    // Dealer North throughout unless the case says otherwise; the seat to
    // call is given by the calls so far.
    for (const [calls, dealer, want] of ROLES) {
      expect(roleFor(history(calls, dealer)), `${dealer}: ${calls}`).toBe(want);
    }
  });

  it("takes the role from the auction for a rule-less pass and for the contextual rules", () => {
    expect(categoryFor(null, history("1S P"))).toEqual([
      RESPONDING,
      PASSING,
      "Pass",
    ]);
    expect(categoryFor("DefaultPass", history("1S"))).toEqual([
      COMPETING,
      PASSING,
      "Default Pass",
    ]);
    expect(categoryFor("NaturalSuited", history("1S P 2S P"))).toEqual([
      OPENER_REBID,
      NATURAL,
      "Natural Suited",
    ]);
  });

  it("formats a rule name", () => {
    expect(formatRuleName("OneLevelSuitOpening")).toBe(
      "One Level Suit Opening",
    );
    expect(formatRuleName("Jacoby2N")).toBe("Jacoby 2NT");
    expect(formatRuleName("RHOOpeningPreempt")).toBe("RHO Opening Preempt");
    for (const [ruleName, want] of FORMATTED) {
      expect(formatRuleName(ruleName), ruleName).toBe(want);
    }
  });

  it("categorizes a rule in an auction the way Python does", () => {
    for (const [ruleName, calls, dealer, want] of CATEGORIES) {
      expect(
        categoryFor(ruleName, history(calls, dealer)),
        `${ruleName} after ${dealer}: ${calls}`,
      ).toEqual(want);
    }
  });
});
