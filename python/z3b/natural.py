# Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

from core import suit
from z3b import purposes
from z3b.constraints import *
from z3b.model import *
from z3b.preconditions import *
from z3b.rule_compiler import Rule, categories
from z3b.prefer import Highest, LowestLevel
from core.call import Call


def copy_dict(d, keys):
    return {key: d.get(key) for key in keys}


points_for_sound_suited_bid_at_level = [
    #  0   1   2   3   4   5   6   7
    None, 16, 19, 22, 25, 28, 33, 37,
]


# A notrump grand slam wants 37 HIGH-CARD points (the slam chapter, p156: "notrump slams require power -- generally
# 32+ HCP for a small slam and 37 HCP for a grand slam").  Partner's minimum here is total
# points, and whenever partner has shown a five-card suit it carries a length point that takes
# no trick in notrump, so the entry is 38: 37 high cards plus that point.  Opposite a balanced
# partner (a 1N opener's minimum has no length) it is a point strict, and those hands reach a
# grand through Gerber or a quantitative raise anyway.
points_for_sound_notrump_bid_at_level = [
    #  0   1   2   3   4   5   6   7
    None, 19, 22, 25, 28, 30, 33, 38,
]


class WeHaveShownMorePointsThanThem(Precondition):
    def fits(self, history, call):
        return history.us.min_points > history.them.min_points


class SufficientCombinedPoints(Constraint):
    """Partner's minimum (total points: with length or, after a raise, support points) plus this
    hand's high-card points reach the table's number -- the booklet's own arithmetic for the hand
    that has not revalued (a raise counts support points through MinimumCombinedSupportPoints)."""
    def tables(self):
        return points_for_sound_suited_bid_at_level, points_for_sound_notrump_bid_at_level

    def expr(self, history, call):
        strain = call.strain
        suited, notrump = self.tables()
        if strain == suit.NOTRUMP:
            min_points = notrump[call.level]
        else:
            assert strain in suit.SUITS, "%s not in %s" % (strain, suit.SUITS)
            min_points = suited[call.level]
        implied = max(0, min_points - history.partner.min_points)
        # Once both hands have agreed a suit the fit is known and shortness counts on both
        # sides: the bid is valued in support points for that suit, the way partner reads it.
        # A first raise stays on hcp plus length (the corpus: 3H, not 4H, on nine with a
        # doubleton after Stayman).
        if (strain in suit.SUITS and call.level <= 5
                and history.bid_suit_naturally(strain, positions.Partner)
                and history.bid_suit_naturally(strain, positions.Me)):
            return support_points_expr_for_suit(strain) >= implied
        return points >= implied


class SufficientCombinedLength(MinimumCombinedLength):
    def __init__(self):
        MinimumCombinedLength.__init__(self, 8)

    def expr(self, history, call):
        strain = call.strain
        if strain == suit.NOTRUMP:
            return NO_CONSTRAINTS
        return MinimumCombinedLength.expr(self, history, call)


class LengthSatisfiesLawOfTotalTricks(Constraint):
    def expr(self, history, call):
        # Written forward: level = partner_min + my_min - 6
        my_count = call.level + 6 - history.partner.min_length(call.strain)
        return expr_for_suit(call.strain) >= my_count


def _natural_suited_possible(call):
    if call.level >= 6:
        return ["Slam"]
    if call.level == 5 or (call.level == 4 and call.strain.char in "HS"):
        return ["Game", "SupportMajors"] if call.strain.char in "HS" else ["Game"]
    return ["RebidSuit", "Support", "AskLater", "Discovery"]


def natural_suited_purpose(history, call):
    """A natural suit bid is a slam or a game at those levels; below game it raises
    partner's suit, rebids our own, or discovers a new one."""
    if call.level >= 6:
        return "Slam"
    game = call.level == 5 or (call.level == 4 and call.strain.char in "HS")
    first = history.first_natural_bidder(call.strain)
    if first == positions.Me:
        return "Game" if game else "RebidSuit"  # our own suit, whether or not partner raised it
    if first == positions.Partner and call.strain.char in "HS" and call.level <= 4:
        return "SupportMajors"  # raising partner's major to game is still support: it beats exploring
    if game:
        return "Game"  # a minor game competes with 3N as a game
    if first == positions.Partner:
        return "SupportMinors"
    if any(history.bid_suit_naturally(s, positions.Me) and history.bid_suit_naturally(s, positions.Partner)
           for s in suit.SUITS):
        return "AskLater"  # a new suit once we have agreed one is a try, not a search for a fit
    return "Discovery"


def new_suit_purpose(history, call):
    """A new suit is discovery; a four-card minor shown at the two level or above waits
    behind a six-card rebid (a fifth card promotes it, see the rules' conditional purposes)."""
    if call.strain.char in "HS":
        return "MajorDiscovery"
    if call.level == 1:
        return "MinorDiscovery"
    return "MinorDiscoveryWithFour"


new_minor_with_five = [(MinLength(5), "MinorDiscovery", "MinorDiscoveryWithFour")]


def natural_notrump_purpose(history, call):
    if call.level >= 6:
        return "Slam"
    if call.level == 3:
        return "Game"
    return "CharacterizeStrength"


def law_of_total_tricks_purpose(history, call):
    """The law raises partner's suit to the level of the fit; anything else is competing."""
    if history.bid_suit_naturally(call.strain, positions.Partner):
        return "Support"
    return "Compete"


class Natural(Rule):
    category = categories.Natural


class SoundNaturalBid(Natural):
    shared_constraints = [
        SufficientCombinedLength(), SufficientCombinedPoints()]


# A natural suit bid: the slam the hand is worth (the higher first), else a game, else the
# lowest sufficient level, the higher suit within a level.
natural_suited_preference = [
    Highest(*Call.suited_names_between('6C', '7S')),
    LowestLevel('4H', '4S', '5C', '5D'),
    LowestLevel(*[name for name in Call.suited_names_between('2C', '5S') if name not in ('4H', '4S', '5C', '5D')]),
]


class NaturalSuited(SoundNaturalBid):
    """A natural suit bid: a raise of partner's suit, a rebid of our own, a new suit, a game
    or a slam.  The backstop of its purposes: any convention that applies says more."""
    purpose = natural_suited_purpose
    conditional_purposes = [(minor_raise_before_notrump, "SupportMinorWithFour", "SupportMinors"), (minor_raise_with_five, "SupportMinorWithFive", "SupportMinors")]  # see constraints.minor_raise_before_notrump
    fallback = 1
    preconditions = [
        InvertedPrecondition(LastBidHasAnnotation(
            positions.Partner, annotations.Preemptive)),
        WeHaveShownMorePointsThanThem(),
        PartnerHasAtLeastLengthInSuit(1),
    ]
    call_names = Call.suited_names_between('2C', '7S')
    prefer = natural_suited_preference


class LawOfTotalTricks(Rule):
    purpose = law_of_total_tricks_purpose
    conditional_purposes = [(MinLength(4), "SupportMinorWithFour", "SupportMinors")]
    preconditions = [
        # FIXME: This should only apply over weak bids (only when NaturalSuited does not)?
        PartnerHasAtLeastLengthInSuit(1),
        # A backup for competitive auctions, not a way past partner's signoff.
        InvertedPrecondition(LastBidHasAnnotation(positions.Partner, annotations.Signoff)),
    ]
    call_names = Call.suited_names_between('2C', '5D')
    shared_constraints = LengthSatisfiesLawOfTotalTricks()
    fallback = 2  # the backup raise: when neither a convention's raise nor a natural raise applies
    prefer = [Highest('4H', '4S', '5C', '5D'), Highest(*Call.suited_names_between('2C', '5D'))]  # a game, else the level of the fit
    category = categories.LawOfTotalTricks


class SufficientStoppers(Constraint):
    def _is_jump(self, last_contract, call):
        if not last_contract:
            return call.level > 1
        assert call.strain == suit.NOTRUMP
        if last_contract.strain == suit.NOTRUMP:
            return call.level > last_contract.level + 1
        return call.level > last_contract.level

    def expr(self, history, call):
        if self._is_jump(history.last_contract, call) and not history.partner.is_balanced:
            return StoppersInOpponentsSuits().expr(history, call)
        return NO_CONSTRAINTS


class NaturalNotrump(SoundNaturalBid):
    purpose = natural_notrump_purpose
    # A balanced hand's invitational 2N is its limit bid, before a raise of a minor or a suit
    # rebid; with shape those come first.
    conditional_purposes_per_call = {'2N': [(ConstraintAnd(balanced, NotEnoughForGame()), "BalancedLimit", "CharacterizeStrength")]}
    preconditions = WeHaveShownMorePointsThanThem()
    call_names = Call.notrump_names_between('1N', '7N')
    shared_constraints = SufficientStoppers()
    fallback = 1  # the backstop of its purposes: any convention's notrump call says more
    # The slam the hand is worth, else the lowest sufficient level (the Game preference
    # tells a stopped 3N from an unstopped one).
    prefer = [Highest('6N', '7N'), LowestLevel('1N', '2N', '3N', '4N', '5N')]


class DefaultPass(Rule):
    purpose = "Forced"
    preconditions = InvertedPrecondition(ForcedToBid())
    call_names = 'P'
    shared_constraints = NO_CONSTRAINTS
    category = categories.DefaultPass
    prefer = []
    fallback = 1  # the pass of last resort: any forced minimum call comes first



class NaturalPass(Rule):
    preconditions = [
        LastBidWas(positions.RHO, 'P'),
        # Natural passes do not apply when preempting.
        WeHaveShownMorePointsThanThem(),
        InvertedPrecondition(ForcedToBid()),
    ]
    call_names = 'P'
    category = categories.NaturalPass


class NaturalPassWithFit(NaturalPass):
    preconditions = [
        LastBidHasSuit(positions.Partner),
        InvertedPrecondition(LastBidHasAnnotation(
            positions.Partner, annotations.Artificial)),
        HaveFit(),
    ]
    shared_constraints = MinimumCombinedLength(7, use_partners_last_suit=True)


class SuitGameIsRemote(NaturalPassWithFit):
    purpose = "CharacterizeStrength"
    preconditions = LastBidWasBelowGame()
    # FIXME: Shouldn't this be support points?
    shared_constraints = MaximumCombinedPoints(24)
    prefer = []
    fallback = 2  # passing is what is left when no natural bid applies either


class SuitSlamIsRemote(NaturalPassWithFit):
    purpose = "Enough"
    preconditions = [
        LastBidWasGameOrAbove(),
        LastBidWasBelowSlam(),
        InvertedPrecondition(LastBidHasStrain(positions.Partner, suit.NOTRUMP))
    ]
    shared_constraints = MaximumCombinedPointsOppositeMinimum(32)
    prefer = []
    fallback = 2  # passing is what is left when no natural bid applies either


class NotrumpSlamIsRemote(NaturalPass):
    purpose = "Game"  # passing 3N is choosing a game: only a major game (the Game preference) is better
    preconditions = [
        LastBidHasStrain(positions.Partner, suit.NOTRUMP),
        LastBidWasGameOrAbove(),
        LastBidWasBelowSlam(),
        # Partner's 5N (pick a slam / grand slam invitation) is forcing: never pass it.
        InvertedPrecondition(LastBidWas(positions.Partner, '5N')),
    ]
    shared_constraints = MaximumCombinedPointsOppositeMinimum(32)
    prefer = []
    fallback = 2  # passing is what is left when no natural bid applies either
