// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// cspell:ignore Reponse

/**
 * What kind of call the engine made: a three-level category for each rule.
 *
 * The practice page checks each of the user's calls against the engine's call
 * in the same position. To say where a user is strong or weak, every such
 * check needs a name for the kind of call it was. This module gives one, in
 * three levels:
 *
 * 1. what you are doing: opening, responding to an opening, rebidding as
 *    opener or responder, competing over their opening, acting after partner
 *    competes, or slam bidding;
 * 2. the family of call: raises, Stayman, takeout doubles, fourth-suit
 *    forcing;
 * 3. the rule itself, under its formatted name.
 *
 * The engine's rule classes do not form a usable tree on their own (many
 * derive straight from `Rule`, and the intermediate classes mix conventions
 * with implementation detail), so the first two levels are a curated table
 * keyed by rule class name. `__tests__/categories.test.ts` fails when a rule
 * the system registers has no entry, so a new rule cannot slip through
 * unlabelled.
 *
 * A few rules are not tied to a seat: the natural fallbacks (`NaturalSuited`,
 * `DefaultPass`, the "slam is remote" passes) fire for whoever is to call.
 * Their first level comes from the auction instead, by the same role logic
 * that names a rule-less pass.
 *
 * A port of `python/categories.py`.
 */

/**
 * What this module needs of a call: whether it is a pass. `core`'s `Call`
 * satisfies it.
 */
export interface CategoryCall {
  isPass(): boolean;
}

/**
 * What this module needs of a seat: its index (0=N, 1=E, 2=S, 3=W, so that
 * two seats are the same when their indices are) and whether it is partnered
 * with another seat. `core`'s `Position` satisfies it.
 */
export interface CategoryPosition {
  readonly index: number;
  inPartnershipWith(position: CategoryPosition): boolean;
}

/**
 * What this module needs of an auction. `core`'s `CallHistory` satisfies it:
 * the structural type is only so that categories can be ported and tested
 * before the core types land (phase 2 of docs/typescript-engine-plan.md).
 * `opener()` admits `undefined` as well as `null` so that either spelling of
 * "nobody has bid" fits.
 */
export interface CategoryHistory<
  P extends CategoryPosition = CategoryPosition,
  C extends CategoryCall = CategoryCall,
> {
  positionToCall(): P;
  opener(): P | null | undefined;
  enumerateCalls(): Iterable<readonly [P, C]>;
  callsBy(position: P): readonly C[];
}

/** A category path: what you are doing, the family of call, the rule. */
export type CategoryPath = readonly [
  levelOne: string,
  levelTwo: string,
  rule: string,
];

export const OPENING = "Opening";
export const RESPONDING = "Responding to an opening";
export const OPENER_REBID = "Opener's rebid";
export const RESPONDER_REBID = "Responder's rebid";
export const COMPETING = "Competing";
export const ADVANCING = "After partner competes";
export const SLAM = "Slam bidding";

export const LEVEL_ONE: readonly string[] = [
  OPENING,
  RESPONDING,
  OPENER_REBID,
  RESPONDER_REBID,
  COMPETING,
  ADVANCING,
  SLAM,
];

export const PASSING = "Passing";
export const NATURAL = "Natural bids";

// (level 1, level 2) for each rule class name, grouped as they read on the
// Progress tab. Order within a group does not matter.
const TABLE = new Map<string, readonly [string, string]>();

function group(levelOne: string, levelTwo: string, ...ruleNames: string[]) {
  for (const ruleName of ruleNames) {
    if (TABLE.has(ruleName)) {
      throw new Error(`${ruleName} listed twice`);
    }
    TABLE.set(ruleName, [levelOne, levelTwo]);
  }
}

group(OPENING, "One of a suit", "OneLevelSuitOpening");
group(OPENING, "1NT, 2NT and 3NT", "NotrumpOpening", "ThreeNotrumpOpening");
group(OPENING, "Strong 2♣", "StrongTwoClubs");
group(OPENING, "Preempts", "PreemptiveOpen");
group(RESPONDING, "Raises", "Raise", "Jacoby2N", "RaiseOverTakeoutDouble");
group(
  RESPONDING,
  "New suits",
  "OneLevelNewSuitResponse",
  "NewSuitAtTheTwoLevel",
  "NewSuitAtTheThreeLevelOverJumpOvercall",
  "NewSuitAtTheTwoLevelAfterRHODouble",
  "JumpShiftResponseToOpen",
  "JumpShiftResponseToOpenAfterRHODouble",
);
group(
  RESPONDING,
  "Notrump responses",
  "OneNotrumpResponse",
  "ThreeNotrumpMajorResponse",
  "NotrumpResponseToMinorOpen",
);
group(
  RESPONDING,
  "Negative doubles",
  "OneLevelNegativeDouble",
  "TwoLevelNegativeDouble",
);
group(RESPONDING, "Over their double", "RedoubleResponseAfterRHOTakeoutDouble");
group(
  RESPONDING,
  "Passing as responder",
  "PassResponseToSuitedOpen",
  "PassResponseOverOvercall",
);
group(
  RESPONDING,
  "To 1NT",
  "TwoLevelStayman",
  "ThreeLevelStayman",
  "StolenTwoClubStayman",
  "StolenThreeClubStayman",
  "JacobyTransfer",
  "TwoSpadesRelay",
  "NotrumpGameInvitation",
  "NotrumpGameAccept",
  "LongMinorGameInvitation",
  "LongMajorSlamInvitation",
  "RedoubleTransferToMinor",
);
group(
  RESPONDING,
  "To 2♣",
  "WaitingResponseToStrongTwoClubs",
  "SuitResponseToStrongTwoClubs",
  "NotrumpResponseToStrongTwoClubs",
);
group(
  RESPONDING,
  "To a preempt",
  "PassResponseToPreempt",
  "NewSuitResponseToPreempt",
  "TwoNotrumpFeatureRequest",
);
group(
  OPENER_REBID,
  "Rebidding your suit",
  "UnforcedRebidOriginalSuitByOpener",
  "ForcedRebidOriginalSuitByOpener",
  "InvitationalUnsupportedRebidByOpener",
  "GameForcingUnsupportedRebidByOpener",
);
group(
  OPENER_REBID,
  "New suits and reverses",
  "NewOneLevelMajorByOpener",
  "NewSuitByOpener",
  "ReverseByOpener",
  "JumpShiftByOpener",
);
group(
  OPENER_REBID,
  "Notrump rebids",
  "RebidOneNotrumpByOpener",
  "NotrumpInvitationByOpener",
  "NotrumpJumpRebid",
);
group(
  OPENER_REBID,
  "Raising responder",
  "SupportPartnerMajorSuit",
  "HelpSuitGameTry",
  "PassResponseToLimitRaise",
  "GameAccept",
);
group(
  OPENER_REBID,
  "After Jacoby 2NT",
  "ShapeResponseToJacoby2N",
  "SlamResponseToJacoby2N",
  "MinimumResponseToJacoby2N",
  "NotrumpResponseToJacoby2N",
  "ResponseToJordan",
);
group(
  OPENER_REBID,
  "After a negative double",
  "CuebidReponseToNegativeDouble",
  "NewSuitResponseToNegativeDouble",
  "RaiseResponseToNegativeDouble",
  "NotrumpResponseToNegativeDouble",
  "JumpRaiseResponseToNegativeDouble",
  "JumpNotrumpResponseToNegativeDouble",
  "CueBidRebidAfterNegativeDouble",
);
group(
  OPENER_REBID,
  "Replying to fourth-suit forcing",
  "NotrumpResponseToFourthSuitForcing",
  "NotrumpJumpResponseToFourthSuitForcing",
  "DelayedSupportResponseToFourthSuitForcing",
  "RebidResponseToFourthSuitForcing",
  "FourthSuitResponseToFourthSuitForcing",
);
group(OPENER_REBID, "After a reverse", "RebidFirstSuitAfterLebensohl");
group(OPENER_REBID, "Passing as opener", "PassPassedHandResponse");
group(
  OPENER_REBID,
  "After 1NT",
  "NaturalStaymanResponse",
  "PassStaymanResponse",
  "DiamondStaymanResponse",
  "StolenTwoHeartStaymanResponse",
  "StolenThreeHeartStaymanResponse",
  "StolenTwoSpadeStaymanResponse",
  "StolenThreeSpadeStaymanResponse",
  "RedoubleAfterDoubledStayman",
  "AcceptTransferToHearts",
  "AcceptTransferToSpades",
  "AcceptTransferToClubs",
  "AcceptTransferToTwoClubs",
  "SuperAcceptTransferToHearts",
  "SuperAcceptTransferToSpades",
  "PassDoubledTransferToHearts",
  "PassDoubledTransferToSpades",
  "RedoubleDoubledTransfer",
  "ResponseAfterTransferToClubs",
  "ResponseAfterTransferToTwoClubs",
);
group(
  OPENER_REBID,
  "After 2♣",
  "NotrumpRebidOverTwoClubs",
  "OpenerSuitedRebidAfterStrongTwoClubs",
  "OpenerSuitedJumpRebidAfterStrongTwoClubs",
  "RebidSuitAfterSecondNegative",
);
group(
  OPENER_REBID,
  "After a preempt",
  "MinimumRebidOfPreemptSuit",
  "RaiseOfPartnersPreemptResponse",
  "NewSuitAfterPreempt",
  "NotrumpAfterPreempt",
  "FeatureResponseToTwoNotrumpFeatureRequest",
  "MaximumNotrumpResponseToTwoNotrumpFeatureRequest",
);
group(
  RESPONDER_REBID,
  "Support and sign-off",
  "ResponderSignoffInPartnersSuit",
  "WeakNewSuitAfterOneNotrumpResponse",
  "RebidResponderSuitByResponder",
  "ThreeLevelSuitRebidByResponder",
  "RaiseAfterJumpShiftResponse",
);
group(
  RESPONDER_REBID,
  "Invitations",
  "ResponderNotrumpInvitation",
  "ResponderReverse",
  "JumpShiftResponderRebid",
);
group(
  RESPONDER_REBID,
  "Fourth-suit forcing",
  "NonJumpFourthSuitForcing",
  "TwoSpadesJumpFourthSuitForcing",
  "RebidOwnSuitAfterFourthSuitForcing",
);
group(
  RESPONDER_REBID,
  "After opener's reverse",
  "Lebensohl",
  "ForcedMajorRebid",
  "RaiseOfReverseSuit",
  "RaiseOfFirstSuitAfterReverse",
);
group(RESPONDER_REBID, "After 2♣", "SecondNegative");
group(
  RESPONDER_REBID,
  "After a transfer",
  "NotrumpRebidAfterJacobyTransfer",
  "SpadesRebidAfterHeartsTransfer",
  "HeartsRebidAfterSpadesTransfer",
  "GameRaiseAfterTransferToHearts",
  "GameRaiseAfterTransferToSpades",
  "NewMinorRebidAfterJacobyTransfer",
  "CompleteOwnTransferToHeartsAfterDouble",
  "CompleteOwnTransferToSpadesAfterDouble",
);
group(
  RESPONDER_REBID,
  "After Stayman",
  "GarbagePassStaymanRebid",
  "MinorGameForceRebid",
  "OtherMajorRebidAfterStayman",
);
group(
  COMPETING,
  "Overcalls",
  "OneLevelStandardOvercall",
  "TwoLevelStandardOvercall",
  "DirectOvercall1N",
  "PreemptiveOvercall",
  "SandwichOvercall",
  "TwoNotrumpOvercallOfWeakTwo",
);
group(
  COMPETING,
  "Takeout doubles",
  "OneLevelTakeoutDouble",
  "TwoLevelTakeoutDouble",
  "TakeoutDoubleAfterPreempt",
  "ReopeningDouble",
);
group(
  COMPETING,
  "Michaels and Unusual 2NT",
  "DirectMichaelsCuebid",
  "BalancingMichaelsCuebid",
  "SandwichMichaelsCuebid",
  "Unusual2N",
  "CorrectMichaelsMinor",
  "SuitResponseToMichaelsMinorRequest",
  "JumpSuitResponseToMichaelsMinorRequest",
  "PassResponseToMichaelsMinorRequest",
);
group(
  COMPETING,
  "Over their 1NT",
  "Cappelletti",
  "BalancingCappelletti",
  "RaiseAfterCappellettiMinorRequest",
  "SuitRebidAfterCappellettiTwoClubs",
  "ResponseToCappellettiMinorRequest",
);
group(
  COMPETING,
  "Balancing",
  "BalancingNotrumpOvercall",
  "BalancingSuitedOvercall",
  "BalancingJumpSuitedOvercall",
  "BalancingSuitedOvercallOverRaise",
  "BalancingDoubleOverRaise",
  "BalancingDouble",
  "BalancingDoubleAfterNotrumpAuction",
);
group(
  COMPETING,
  "Penalty and lead-directing doubles",
  "LeadDirectingDoubleOfArtificialSuitBid",
  "LeadDirectingDoubleOfAceAskingResponse",
  "PenaltyDoubleOfGameOpening",
);
group(
  COMPETING,
  "The doubler's rebid",
  "RaiseAfterTakeoutDouble",
  "JumpRaiseAfterTakeoutDouble",
  "NewSuitAfterTakeoutDouble",
  "JumpNewSuitAfterTakeoutDouble",
  "NotrumpAfterTakeoutDouble",
  "NonJumpTwoNotrumpAfterTakeoutDouble",
  "JumpTwoNotrumpAfterTakeoutDouble",
  "CueBidAfterTakeoutDouble",
  "TakeoutDoubleAfterTakeoutDouble",
  "PassAfterTakeoutDouble",
);
group(
  COMPETING,
  "The overcaller's rebid",
  "MinimumRebidAfterCuebidResponse",
  "ExtrasRebidAfterCuebidResponse",
);
group(
  ADVANCING,
  "Replying to an overcall",
  "RaiseResponseToStandardOvercall",
  "CuebidResponseToStandardOvercall",
  "NewSuitResponseToStandardOvercall",
  "SingleRaiseResponseToBalancingOvercall",
  "JumpRaiseResponseToBalancingOvercall",
  "NotrumpResponseToBalancingOvercall",
);
group(
  ADVANCING,
  "Replying to a takeout double",
  "PenaltyPassOfTakeoutDouble",
  "NotrumpResponseToTakeoutDouble",
  "JumpNotrumpResponseToTakeoutDouble",
  "ForcedSuitResponseToTakeoutDouble",
  "FreeSuitResponseToTakeoutDouble",
  "JumpSuitResponseToTakeoutDouble",
  "CuebidResponseToTakeoutDouble",
);
group(
  ADVANCING,
  "Replying to Michaels or Unusual 2NT",
  "MichaelsSimplePreferenceResponse",
  "Unusual2NSimplePreferenceResponse",
  "MichaelsMinorRequest",
  "MichaelsMinorPreference",
);
group(
  ADVANCING,
  "Replying to Cappelletti",
  "ResponseToCappellettiTwoClubs",
  "ResponseToCappellettiTwoDiamonds",
  "NewSuitResponseToMajorCappelletti",
  "RaiseResponseToMajorCappelletti",
  "CappellettiMinorRequest",
  "PassResponseToOneNotrumpPenaltyDouble",
  "NewSuitResponseToOneNotrumpPenaltyDouble",
);
group(
  SLAM,
  "Blackwood",
  "BlackwoodForAces",
  "BlackwoodForKings",
  "ResponseToBlackwood",
);
group(SLAM, "Gerber", "GerberForAces", "GerberForKings", "ResponseToGerber");
group(
  SLAM,
  "Quantitative 4NT",
  "QuantitativeFourNotrumpJump",
  "ResponseToQuantitativeFourNotrump",
);
group(SLAM, "Grand slam force", "GrandSlamForce", "ResponseToGrandSlamForce");

// Rules that fire for whichever seat is to call. Level 1 comes from the
// auction; this gives level 2.
const CONTEXTUAL: Record<string, string> = {
  DefaultPass: PASSING,
  PassAfterPreempt: PASSING,
  PassAfterSignoff: PASSING,
  SuitGameIsRemote: PASSING,
  SuitSlamIsRemote: PASSING,
  NotrumpSlamIsRemote: PASSING,
  NaturalSuited: NATURAL,
  NaturalNotrump: NATURAL,
  LawOfTotalTricks: "Competitive raises",
};

/** Every rule class name this module can categorize. */
export function knownRuleNames(): Set<string> {
  return new Set([...TABLE.keys(), ...Object.keys(CONTEXTUAL)]);
}

/** The first of `position`'s side to make a non-pass call, or null. */
function firstToBidForSide<P extends CategoryPosition, C extends CategoryCall>(
  history: CategoryHistory<P, C>,
  position: P,
): P | null {
  for (const [caller, call] of history.enumerateCalls()) {
    if (!call.isPass() && caller.inPartnershipWith(position)) {
      return caller;
    }
  }
  return null;
}

function hasBid<P extends CategoryPosition, C extends CategoryCall>(
  history: CategoryHistory<P, C>,
  position: P,
): boolean {
  return history.callsBy(position).some((call) => !call.isPass());
}

/**
 * The level-1 group for whoever is to call, from the auction alone.
 *
 * Used for rule-less passes and for the natural fallback rules, which fire
 * for any seat. The first side to bid is "our side" or "theirs"; within a
 * side, whoever bid first is the opener (or the overcaller), and their
 * partner the responder (or the advancer).
 */
export function roleFor<P extends CategoryPosition, C extends CategoryCall>(
  history: CategoryHistory<P, C>,
): string {
  const position = history.positionToCall();
  const opener = history.opener();
  if (opener === null || opener === undefined) {
    return OPENING;
  }
  if (opener.inPartnershipWith(position)) {
    if (opener.index === position.index) {
      return OPENER_REBID;
    }
    return hasBid(history, position) ? RESPONDER_REBID : RESPONDING;
  }
  const first = firstToBidForSide(history, position);
  if (first === null || first.index === position.index) {
    return COMPETING;
  }
  return ADVANCING;
}

/** "OneLevelSuitOpening" as "One Level Suit Opening". */
export function formatRuleName(ruleName: string): string {
  let name = ruleName.replace(/([1-9A-Z])/g, " $1");
  name = name.replaceAll("R H O", "RHO");
  name = name.replaceAll("L H O", "LHO");
  name = name.replace(/\sN$/, "NT");
  return name.trim();
}

/**
 * The three-level category of the call `ruleName` makes at this point.
 *
 * `ruleName` is the rule class name, or null when the engine passed with no
 * rule. `history` is the auction before the call.
 */
export function categoryFor<P extends CategoryPosition, C extends CategoryCall>(
  ruleName: string | null,
  history: CategoryHistory<P, C>,
): CategoryPath {
  if (ruleName === null) {
    return [roleFor(history), PASSING, "Pass"];
  }
  const contextual = Object.hasOwn(CONTEXTUAL, ruleName)
    ? CONTEXTUAL[ruleName]
    : undefined;
  if (contextual !== undefined) {
    return [roleFor(history), contextual, formatRuleName(ruleName)];
  }
  const entry = TABLE.get(ruleName);
  if (entry !== undefined) {
    const [levelOne, levelTwo] = entry;
    return [levelOne, levelTwo, formatRuleName(ruleName)];
  }
  throw new Error(`no category for rule ${ruleName}`);
}
