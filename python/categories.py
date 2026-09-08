# cspell:ignore Reponse
"""What kind of call the engine made: a three-level category for each rule.

The practice page checks each of the user's calls against the engine's call in
the same position. To say where a user is strong or weak, every such check
needs a name for the kind of call it was. This module gives one, in three
levels:

1. what you are doing: opening, responding to an opening, rebidding as opener
   or responder, competing over their opening, acting after partner competes,
   or slam bidding;
2. the family of call: raises, Stayman, takeout doubles, fourth-suit forcing;
3. the rule itself, under its formatted name.

The engine's rule classes do not form a usable tree on their own (many derive
straight from ``Rule``, and the intermediate classes mix conventions with
implementation detail), so the first two levels are a curated table keyed by
rule class name. ``test_categories`` fails when a rule the system registers
has no entry, so a new rule cannot slip through unlabelled.

A few rules are not tied to a seat: the natural fallbacks (``NaturalSuited``,
``DefaultPass``, the "slam is remote" passes) fire for whoever is to call.
Their first level comes from the auction instead, by the same role logic that
names a rule-less pass.
"""

import re

OPENING = "Opening"
RESPONDING = "Responding to an opening"
OPENER_REBID = "Opener's rebid"
RESPONDER_REBID = "Responder's rebid"
COMPETING = "Competing"
ADVANCING = "After partner competes"
SLAM = "Slam bidding"

LEVEL_ONE = (
    OPENING,
    RESPONDING,
    OPENER_REBID,
    RESPONDER_REBID,
    COMPETING,
    ADVANCING,
    SLAM,
)

PASSING = "Passing"
NATURAL = "Natural bids"

# (level 1, level 2) for each rule class name, grouped as they read on the
# Progress tab. Order within a group does not matter.
_TABLE = {}


def _group(level_one, level_two, *rule_names):
    for rule_name in rule_names:
        assert rule_name not in _TABLE, "%s listed twice" % rule_name
        _TABLE[rule_name] = (level_one, level_two)


_group(OPENING, "One of a suit", "OneLevelSuitOpening")
_group(OPENING, "1NT, 2NT and 3NT", "NotrumpOpening", "ThreeNotrumpOpening")
_group(OPENING, "Strong 2♣", "StrongTwoClubs")
_group(OPENING, "Preempts", "PreemptiveOpen")

_group(
    RESPONDING,
    "Raises",
    "MinimumRaise",
    "LimitRaise",
    "MajorJumpToGame",
    "Jacoby2N",
    "Jordan",
    "JumpRaiseResponseToAfterRHOTakeoutDouble",
)
_group(
    RESPONDING,
    "New suits",
    "OneLevelNewSuitResponse",
    "NewSuitAtTheTwoLevel",
    "NewSuitAtTheThreeLevelOverJumpOvercall",
    "NewSuitAtTheTwoLevelAfterRHODouble",
    "JumpShiftResponseToOpen",
    "JumpShiftResponseToOpenAfterRHODouble",
)
_group(
    RESPONDING,
    "Notrump responses",
    "OneNotrumpResponse",
    "ThreeNotrumpMajorResponse",
    "NotrumpResponseToMinorOpen",
)
_group(
    RESPONDING,
    "Negative doubles",
    "OneLevelNegativeDouble",
    "TwoLevelNegativeDouble",
)
_group(RESPONDING, "Over their double", "RedoubleResponseAfterRHOTakeoutDouble")
_group(
    RESPONDING,
    "Passing as responder",
    "PassResponseToSuitedOpen",
    "PassResponseOverOvercall",
)
_group(
    RESPONDING,
    "To 1NT",
    "TwoLevelStayman",
    "ThreeLevelStayman",
    "StolenTwoClubStayman",
    "StolenThreeClubStayman",
    "JacobyTransferToHearts",
    "JacobyTransferToSpades",
    "TwoSpadesRelay",
    "NotrumpGameInvitation",
    "NotrumpGameAccept",
    "LongMinorGameInvitation",
    "LongMajorSlamInvitation",
    "RedoubleTransferToMinor",
)
_group(
    RESPONDING,
    "To 2♣",
    "WaitingResponseToStrongTwoClubs",
    "SuitResponseToStrongTwoClubs",
    "NotrumpResponseToStrongTwoClubs",
)
_group(
    RESPONDING,
    "To a preempt",
    "PassResponseToPreempt",
    "NewSuitResponseToPreempt",
    "TwoNotrumpFeatureRequest",
)

_group(
    OPENER_REBID,
    "Rebidding your suit",
    "UnforcedRebidOriginalSuitByOpener",
    "ForcedRebidOriginalSuitByOpener",
    "InvitationalUnsupportedRebidByOpener",
    "GameForcingUnsupportedRebidByOpener",
)
_group(
    OPENER_REBID,
    "New suits and reverses",
    "NewOneLevelMajorByOpener",
    "NewSuitByOpener",
    "ReverseByOpener",
    "JumpShiftByOpener",
)
_group(
    OPENER_REBID,
    "Notrump rebids",
    "RebidOneNotrumpByOpener",
    "NotrumpInvitationByOpener",
    "NotrumpJumpRebid",
)
_group(
    OPENER_REBID,
    "Raising responder",
    "SupportPartnerMajorSuit",
    "HelpSuitGameTry",
    "PassResponseToLimitRaise",
    "GameAccept",
)
_group(
    OPENER_REBID,
    "After Jacoby 2NT",
    "SingletonResponseToJacoby2N",
    "SolidSuitResponseToJacoby2N",
    "SlamResponseToJacoby2N",
    "MinimumResponseToJacoby2N",
    "NotrumpResponseToJacoby2N",
    "ResponseToJordan",
)
_group(
    OPENER_REBID,
    "After a negative double",
    "CuebidReponseToNegativeDouble",
    "NewSuitResponseToNegativeDouble",
    "RaiseResponseToNegativeDouble",
    "NotrumpResponseToNegativeDouble",
    "JumpRaiseResponseToNegativeDouble",
    "JumpNotrumpResponseToNegativeDouble",
    "CueBidRebidAfterNegativeDouble",
)
_group(
    OPENER_REBID,
    "Replying to fourth-suit forcing",
    "NotrumpResponseToFourthSuitForcing",
    "NotrumpJumpResponseToFourthSuitForcing",
    "DelayedSupportResponseToFourthSuitForcing",
    "RebidResponseToFourthSuitForcing",
    "FourthSuitResponseToFourthSuitForcing",
)
_group(OPENER_REBID, "After a reverse", "RebidFirstSuitAfterLebensohl")
_group(OPENER_REBID, "Passing as opener", "PassPassedHandResponse")
_group(
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
)
_group(
    OPENER_REBID,
    "After 2♣",
    "NotrumpRebidOverTwoClubs",
    "OpenerSuitedRebidAfterStrongTwoClubs",
    "OpenerSuitedJumpRebidAfterStrongTwoClubs",
    "RebidSuitAfterSecondNegative",
)
_group(
    OPENER_REBID,
    "After a preempt",
    "MinimumRebidOfPreemptSuit",
    "RaiseOfPartnersPreemptResponse",
    "NewSuitAfterPreempt",
    "NotrumpAfterPreempt",
    "FeatureResponseToTwoNotrumpFeatureRequest",
    "MaximumNotrumpResponseToTwoNotrumpFeatureRequest",
)

_group(
    RESPONDER_REBID,
    "Support and sign-off",
    "ResponderSignoffInPartnersSuit",
    "WeakNewSuitAfterOneNotrumpResponse",
    "RebidResponderSuitByResponder",
    "ThreeLevelSuitRebidByResponder",
    "RaiseAfterJumpShiftResponse",
)
_group(
    RESPONDER_REBID,
    "Invitations",
    "ResponderNotrumpInvitation",
    "ResponderReverse",
    "JumpShiftResponderRebid",
)
_group(
    RESPONDER_REBID,
    "Fourth-suit forcing",
    "NonJumpFourthSuitForcing",
    "TwoSpadesJumpFourthSuitForcing",
    "RebidOwnSuitAfterFourthSuitForcing",
)
_group(
    RESPONDER_REBID,
    "After opener's reverse",
    "Lebensohl",
    "ForcedMajorRebid",
    "RaiseOfReverseSuit",
    "RaiseOfFirstSuitAfterReverse",
)
_group(RESPONDER_REBID, "After 2♣", "SecondNegative")
_group(
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
)
_group(
    RESPONDER_REBID,
    "After Stayman",
    "GarbagePassStaymanRebid",
    "MinorGameForceRebid",
    "OtherMajorRebidAfterStayman",
)

_group(
    COMPETING,
    "Overcalls",
    "OneLevelStandardOvercall",
    "TwoLevelStandardOvercall",
    "DirectOvercall1N",
    "PreemptiveOvercall",
    "SandwichOvercall",
    "TwoNotrumpOvercallOfWeakTwo",
)
_group(
    COMPETING,
    "Takeout doubles",
    "OneLevelTakeoutDouble",
    "TwoLevelTakeoutDouble",
    "TakeoutDoubleAfterPreempt",
    "ReopeningDouble",
)
_group(
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
)
_group(
    COMPETING,
    "Over their 1NT",
    "Cappelletti",
    "BalancingCappelletti",
    "RaiseAfterCappellettiMinorRequest",
    "SuitRebidAfterCappellettiTwoClubs",
    "ResponseToCappellettiMinorRequest",
)
_group(
    COMPETING,
    "Balancing",
    "BalancingNotrumpOvercall",
    "BalancingSuitedOvercall",
    "BalancingJumpSuitedOvercall",
    "BalancingSuitedOvercallOverRaise",
    "BalancingDoubleOverRaise",
    "BalancingDouble",
    "BalancingDoubleAfterNotrumpAuction",
)
_group(
    COMPETING,
    "Penalty and lead-directing doubles",
    "LeadDirectingDoubleOfArtificialSuitBid",
    "LeadDirectingDoubleOfAceAskingResponse",
    "PenaltyDoubleOfGameOpening",
)
_group(
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
)
_group(
    COMPETING,
    "The overcaller's rebid",
    "MinimumRebidAfterCuebidResponse",
    "ExtrasRebidAfterCuebidResponse",
)

_group(
    ADVANCING,
    "Replying to an overcall",
    "RaiseResponseToStandardOvercall",
    "CuebidResponseToStandardOvercall",
    "NewSuitResponseToStandardOvercall",
    "SingleRaiseResponseToBalancingOvercall",
    "JumpRaiseResponseToBalancingOvercall",
    "NotrumpResponseToBalancingOvercall",
)
_group(
    ADVANCING,
    "Replying to a takeout double",
    "PenaltyPassOfTakeoutDouble",
    "NotrumpResponseToTakeoutDouble",
    "JumpNotrumpResponseToTakeoutDouble",
    "ForcedSuitResponseToTakeoutDouble",
    "FreeSuitResponseToTakeoutDouble",
    "JumpSuitResponseToTakeoutDouble",
    "CuebidResponseToTakeoutDouble",
)
_group(
    ADVANCING,
    "Replying to Michaels or Unusual 2NT",
    "MichaelsSimplePreferenceResponse",
    "Unusual2NSimplePreferenceResponse",
    "MichaelsMinorRequest",
    "MichaelsMinorPreference",
)
_group(
    ADVANCING,
    "Replying to Cappelletti",
    "ResponseToCappellettiTwoClubs",
    "ResponseToCappellettiTwoDiamonds",
    "NewSuitResponseToMajorCappelletti",
    "RaiseResponseToMajorCappelletti",
    "CappellettiMinorRequest",
    "PassResponseToOneNotrumpPenaltyDouble",
    "NewSuitResponseToOneNotrumpPenaltyDouble",
)

_group(SLAM, "Blackwood", "BlackwoodForAces", "BlackwoodForKings", "ResponseToBlackwood")
_group(SLAM, "Gerber", "GerberForAces", "GerberForKings", "ResponseToGerber")
_group(
    SLAM,
    "Quantitative 4NT",
    "QuantitativeFourNotrumpJump",
    "ResponseToQuantitativeFourNotrump",
)
_group(SLAM, "Grand slam force", "GrandSlamForce", "ResponseToGrandSlamForce")

# Rules that fire for whichever seat is to call. Level 1 comes from the
# auction; this gives level 2.
_CONTEXTUAL = {
    "DefaultPass": PASSING,
    "PassAfterPreempt": PASSING,
    "PassAfterSignoff": PASSING,
    "SuitGameIsRemote": PASSING,
    "SuitSlamIsRemote": PASSING,
    "NotrumpSlamIsRemote": PASSING,
    "NaturalSuited": NATURAL,
    "NaturalNotrump": NATURAL,
    "LawOfTotalTricks": "Competitive raises",
}


def known_rule_names():
    """Every rule class name this module can categorize."""

    return set(_TABLE) | set(_CONTEXTUAL)


def _first_to_bid_for_side(history, position):
    """The first of `position`'s side to make a non-pass call, or None."""

    for caller, call in history.enumerate_calls():
        if not call.is_pass() and caller.in_partnership_with(position):
            return caller
    return None


def role_for(history):
    """The level-1 group for whoever is to call, from the auction alone.

    Used for rule-less passes and for the natural fallback rules, which fire
    for any seat. The first side to bid is "our side" or "theirs"; within a
    side, whoever bid first is the opener (or the overcaller), and their
    partner the responder (or the advancer).
    """

    position = history.position_to_call()
    opener = history.opener()
    if opener is None:
        return OPENING
    if opener.in_partnership_with(position):
        if opener == position:
            return OPENER_REBID
        return RESPONDER_REBID if _has_bid(history, position) else RESPONDING
    first = _first_to_bid_for_side(history, position)
    if first is None or first == position:
        return COMPETING
    return ADVANCING


def _has_bid(history, position):
    return any(not call.is_pass() for call in history.calls_by(position))


def format_rule_name(rule_name):
    """"JacobyTransferToHearts" as "Jacoby Transfer To Hearts"."""

    name = re.sub(r"([1-9A-Z])", r" \1", rule_name)
    name = name.replace("R H O", "RHO")
    name = name.replace("L H O", "LHO")
    name = re.sub(r"\sN$", "NT", name)
    return name.strip()


def category_for(rule_name, history):
    """The three-level category of the call `rule_name` makes at this point.

    `rule_name` is the rule class name, or None when the engine passed with no
    rule. `history` is the auction before the call.
    """

    if rule_name is None:
        return [role_for(history), PASSING, "Pass"]
    if rule_name in _CONTEXTUAL:
        return [role_for(history), _CONTEXTUAL[rule_name], format_rule_name(rule_name)]
    if rule_name in _TABLE:
        level_one, level_two = _TABLE[rule_name]
        return [level_one, level_two, format_rule_name(rule_name)]
    raise KeyError("no category for rule %s" % rule_name)
