# Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

from z3b import purposes
from z3b.constraints import *
from z3b.model import *
from z3b.natural import *
from z3b.preconditions import *
from z3b.rule_compiler import Rule, RuleCompiler, categories
from z3b.prefer import Longest, Highest, HigherSuit, Cheapest


def partner_suit_support_purpose(history, call):
    """A raise that names a different call (a cuebid, Jordan): support for PARTNER's suit."""
    partners = history.partner.last_call
    if partners is not None and partners.is_contract() and partners.strain.char in "HS":
        return "SupportMajors"
    return "SupportMinors"

# The rules of SAYC, roughly in the order a bidding book presents them.  Each section is a
# base Rule class and its concrete rules.  Every rule declares its purpose (z3b.purposes:
# why the call is made, and which reason wins), and where it may bid several calls, its
# own preference among them (prefer, z3b.prefer).  Two rules of one purpose must not both
# fit a hand: their meanings, or preconditions, keep them apart; a rule that is the call of
# last resort for its purpose says so (fallback).
#
#   Openings ............................ Opening, OneLevelSuitOpening, NotrumpOpening, StrongTwoClubs
#   Responses to a suit opening ......... Response, RaiseResponse, Jacoby2N, NegativeDouble, ...
#   Responses to 2C ..................... ResponseToStrongTwoClubs
#   Opener's rebids ..................... OpenerRebid, ReverseByOpener, JumpShiftByOpener, ...
#   Responder's rebids .................. ResponderRebid, FourthSuitForcing, SecondNegative
#   Notrump responses ................... NotrumpResponse, Stayman, Jacoby transfers, AcceptTransfer
#   Overcalls and advances .............. DirectOvercall, BalancingOvercall, Michaels, Unusual2N
#   Takeout doubles ..................... TakeoutDouble, ResponseToTakeoutDouble, RebidAfterTakeoutDouble
#   Preempts ............................ PreemptiveOpen, PreemptiveOvercall, ResponseToPreempt
#   Slam conventions .................... Gerber, Blackwood, TwoNotrumpFeatureRequest, GrandSlamForce
#
# Natural bids, passes and the law of total tricks live in natural.py; Cappelletti in cappelletti.py.


def suit_preference(call_names):
    """The prefer list for a rule that may bid any of several suits: the longest suit first;
    with equal lengths a major before a minor, then the cheaper call."""
    calls = [Call.from_string(name) for name in call_names]
    majors = [call.name for call in calls if call.strain in suit.MAJORS]
    minors = [call.name for call in calls if call.strain not in suit.MAJORS]
    preference = SuitPreference([Longest(*call_names), Cheapest(*majors), Cheapest(*minors)])
    preference.call_names = list(call_names)
    return preference


class SuitPreference(list):
    """A prefer list that remembers its calls (Rule.call_names = preference.call_names)."""
    call_names = None


class Opening(Rule):
    annotations = annotations.Opening
    preconditions = NoOpening()


class OneLevelSuitOpening(Opening):
    purpose = "MajorDiscovery"
    shared_constraints = OpeningRuleConstraint()
    annotations_per_call = {
        '1C': annotations.BidClubs,
        '1D': annotations.BidDiamonds,
        '1H': annotations.BidHearts,
        '1S': annotations.BidSpades,
    }
    # FIXME: This shadows the "annotations" module for the rest of this class scope!
    annotations = annotations.OneLevelSuitOpening
    constraints = {
        '1C': clubs >= 3,
        '1D': diamonds >= 3,
        '1H': hearts >= 5,
        '1S': spades >= 5,
    }
    prefer = [
        Longest('1H', '1S'),                        # a five-card major, the longer first
        '1S', '1H',                                 # five-five: spades
        Longest('1C', '1D'),                        # the longer minor
        ('1C', z3.And(clubs == 3, diamonds == 3)),  # three-three: clubs
        '1D', '1C',                                 # four-four (or five-five): diamonds
    ]


class NotrumpOpening(Opening):
    purpose = "EnterNotrumpSystem"
    annotations = annotations.NotrumpSystemsOn
    constraints = {
        '1N': z3.And(points >= 15, points <= 17, balanced),
        '2N': z3.And(points >= 20, points <= 21, balanced)
    }


class ThreeNotrumpOpening(Opening):
    """25-27 balanced (booklet: the bands above the 2N opening are 25-27 open 3N, 28-29
    open 2C then 3N, 30-31 open 2C then 4N; the engine previously compressed all of them
    into 2C-then-3N).  Above StrongTwoClubs so the band actually opens 3N.  No notrump
    systems: responses are natural."""
    purpose = "EnterNotrumpSystem"
    call_names = '3N'
    shared_constraints = z3.And(points >= 25, points <= 27, balanced)


class StrongTwoClubs(Opening):
    purpose = "GameForce"
    # Artificial: says nothing about clubs (a double of it is lead-directing, not takeout).
    annotations = [annotations.StrongTwoClubOpening, annotations.Artificial]
    call_names = '2C'
    shared_constraints = points >= 22  # FIXME: Should support "or 9+ winners"


class Response(Rule):
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.Opening)


class ResponseToOneLevelSuitedOpen(Response):
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.OneLevelSuitOpening)


class NewSuitAtTheThreeLevelOverJumpOvercall(ResponseToOneLevelSuitedOpen):
    """1x - (weak jump overcall) - 3y: a new suit at the three level, forcing (the jump took away
    the two level; the negative double covers the four-card hands).  Before this rule partner's
    3y had no meaning and opener no call."""
    purpose = "Discovery"
    preconditions = [
        LastBidHasAnnotation(positions.RHO, annotations.Preemptive),
        UnbidSuit(),
        NotJumpFromLastContract(),
        Level(3),
    ]
    call_names = ['3C', '3D', '3H', '3S']
    shared_constraints = [MinLength(5), MinimumCombinedPoints(25)]
    forcing = True


class NoNegativeDoubleShape(Constraint):
    """A new major at the one level over their overcall: the hands with the negative double's
    shape (four-four over 1D, exactly four spades over 1H) double instead (p129).
    Uncontested, or where no negative double is available, no constraint."""
    def expr(self, history, call):
        rho = history.rho.last_call
        if rho is None or annotations.Artificial in history.rho.annotations_for_last_call:
            return NO_CONSTRAINTS
        shape = negative_double_shape(history)
        return NO_CONSTRAINTS if shape is None else z3.Not(shape)


class NoNewMajorAtTheTwoLevel(Constraint):
    """The negative double denies a five-card major worth bidding: at the two level our
    longest suit with the values for a two-level response (p129: 2H, not a double, on
    Q832.QT.AQT93.K4 over 1D 1S); over a jump overcall, at the three level with 25 combined
    (NewSuitAtTheThreeLevelOverJumpOvercall)."""
    def expr(self, history, call):
        excluded = []
        for major in suit.MAJORS:
            if any(history.is_bid_suit(major, position) for position in positions):
                continue
            if history.call_history.is_legal_call(Call.from_level_and_strain(2, major)):
                excluded.append(z3.And(longest_suit(expr_for_suit(major)), MinimumCombinedPoints(22).expr(history, call)))
            elif history.call_history.is_legal_call(Call.from_level_and_strain(3, major)):
                excluded.append(z3.And(expr_for_suit(major) >= 5, MinimumCombinedPoints(25).expr(history, call)))
        if not excluded:
            return NO_CONSTRAINTS
        return z3.Not(z3.Or(excluded))


class OneLevelNewSuitResponse(Rule):
    purpose = "MajorDiscovery"
    # If partner opened, regardless of the bidding, its always only 6 points to mention a new suit at the one level.
    preconditions = [Opened(positions.Partner), InvertedPrecondition(LastBidWas(positions.Partner, 'X'))]  # over partner's reopening double the double's answers apply
    shared_constraints = points >= 6
    constraints = {
        '1D': diamonds >= 4,
        '1H': [hearts >= 4, NoNegativeDoubleShape()],
        '1S': [spades >= 4, NoNegativeDoubleShape()],
    }
    prefer = [
        ('1H', z3.And(hearts >= 5, hearts > spades)),  # the longer five-card major
        ('1S', spades >= 5),                           # five spades (five-five: spades)
        ('1H', hearts >= 5),
        ('1D', z3.Or(hearts == 4, spades == 4)),        # up the line: diamonds before a four-card major
        '1H', '1S', '1D',
    ]


class StopperWhenTheyOvercalled(Constraint):
    """The FREE 1N over RHO's overcall promises a stopper in their suit (round-18 review,
    B12: the uncontested 1N promises none, and that doctrine was leaking into competition
    -- a stopperless 1N over 1D 1S).  Uncontested, no constraint."""
    def expr(self, history, call):
        last_call = history.rho.last_call
        if last_call and last_call.strain in suit.SUITS:
            return StoppersInOpponentsSuits().expr(history, call)
        return NO_CONSTRAINTS


# Up to 12: the 2N and 3N responses to a minor start at 13, and over a major the hands above
# 12 have a new suit, a limit raise, Jacoby 2N or 3N.  Shared with the pass over their
# overcall, which yields to this call.
one_notrump_response_hand = ConstraintAnd(points >= 6, points <= 12, StopperWhenTheyOvercalled())


class OneNotrumpResponse(ResponseToOneLevelSuitedOpen):
    purpose = "CharacterizeStrength"
    call_names = '1N'
    shared_constraints = one_notrump_response_hand


class RaiseResponse(ResponseToOneLevelSuitedOpen):
    preconditions = [
        RaiseOfPartnersLastSuit(),
        LastBidHasAnnotation(positions.Partner, annotations.Opening)
    ]


single_raise_strength = [
    MinimumCombinedSupportPoints(18),
    # Truly limited: at 10 support points the limit raise applies, and a hand under the limit
    # raise's 6-hcp floor raises here whatever its support points (the void-and-five hands).
    ConstraintOr(MaximumSupportPointsForPartnersLastSuit(9), points <= 5),
]


# A single raise of 1D promises four diamonds (p48 h9: 2D on KJ63); a raise of 1C, which may be
# a three-card suit, and the limit raises of either minor want five ("a 3D limit raise can be
# based on four diamonds, but it is best to have five or more", p48 h8); a raise of a major
# promises the eight-card fit.


class Raise(RaiseResponse):
    """Responder's raise of the opening suit: a single raise with 6-9 support points, a limit
    raise with 10-12 (truly limited: above 12 a new suit or Jacoby 2N), and with five trumps
    and fewer than ten high the jump to game in a major (p37-38, p38 h13).  Over their takeout
    double the raises change meaning: RaiseOverTakeoutDouble."""
    purpose = "Support"
    conditional_purposes = [(minor_raise_before_notrump, "SupportMinorWithFour"), (minor_raise_with_five, "SupportMinorWithFive")]  # see constraints.minor_raise_before_notrump
    preconditions = InvertedPrecondition(LastBidHasAnnotation(positions.RHO, annotations.TakeoutDouble))
    call_names = ['2C', '2D', '2H', '2S', '3C', '3D', '3H', '3S', '4H', '4S']
    annotations_per_call = {('3C', '3D', '3H', '3S'): annotations.LimitRaise}
    constraints = {
        '2C': [MinimumCombinedLength(8), single_raise_strength],
        '2D': [MinLength(4), single_raise_strength],
        ('2H', '2S'): [MinimumCombinedLength(8), single_raise_strength],
        ('3C', '3D', '3H', '3S'): [MinimumCombinedLength(8), points >= 6, MinimumCombinedSupportPoints(22), MaximumSupportPointsForPartnersLastSuit(12)],
        ('4H', '4S'): [MinimumCombinedLength(10), points < 10],
    }
    prefer = [Highest(*call_names)]  # the highest raise the hand is worth


class RaiseOverTakeoutDouble(ResponseToOneLevelSuitedOpen):
    """Responder's raises over their takeout double (p122-123): a single raise is 6-9 with
    three trumps (the eight-card fit and no more), the jump raise is preemptive with four
    trumps and fewer than ten, 2N (Jordan) is a limit raise or better, and with five trumps
    and fewer than ten high the jump to game keeps its meaning (p122 h25)."""
    purpose = "Support"
    purposes_per_call = {'2N': partner_suit_support_purpose}
    conditional_purposes_per_call = {
        ('2C', '2D', '3C', '3D'): [(minor_raise_before_notrump, "SupportMinorWithFour"), (minor_raise_with_five, "SupportMinorWithFive")],
        '2N': [(partner_minor_raise_before_notrump, "SupportMinorWithFour", "SupportMinors"), (partner_minor_raise_with_five, "SupportMinorWithFive", "SupportMinors")],
    }
    preconditions = [
        LastBidHasAnnotation(positions.RHO, annotations.TakeoutDouble),
        LastBidHasAnnotation(positions.Partner, annotations.Opening),
    ]
    preconditions_per_call = {('2C', '2D', '2H', '2S', '3C', '3D', '3H', '3S', '4H', '4S'): RaiseOfPartnersLastSuit()}
    call_names = ['2C', '2D', '2H', '2S', '2N', '3C', '3D', '3H', '3S', '4H', '4S']
    annotations_per_call = {'2N': annotations.Jordan}
    constraints = {
        '2C': [MinimumCombinedLength(8), MaximumCombinedLength(8), single_raise_strength],
        '2D': [MinLength(4), MaximumCombinedLength(8), single_raise_strength],
        ('2H', '2S'): [MinimumCombinedLength(8), MaximumCombinedLength(8), single_raise_strength],
        '2N': [MinimumCombinedLength(8, use_partners_last_suit=True), MinimumCombinedSupportPoints(22, use_partners_last_suit=True)],
        ('3C', '3D', '3H', '3S'): [MinimumCombinedLength(9), MaximumSupportPointsForPartnersLastSuit(9)],
        ('4H', '4S'): [MinimumCombinedLength(10), points < 10],
    }
    prefer = [Highest('4H', '4S'), '2N', Cheapest('3C', '3D', '3H', '3S'), Cheapest('2C', '2D', '2H', '2S')]


class ThreeNotrumpMajorResponse(ResponseToOneLevelSuitedOpen):
    purpose = "CharacterizeStrength"
    conditional_purposes = [(ConstraintAnd(semi_balanced, OpponentsSilent()), "BalancedLimit")]  # over an overcall the negative double comes first
    preconditions = LastBidHasStrain(positions.Partner, suit.MAJORS)
    call_names = '3N'
    # This is a very specific range per page 43.
    # With 27+ points, do we need to worry about stoppers in RHO's suit?
    shared_constraints = [balanced, points >= 15, points <= 17, MaxLengthInHigherUnbidMajors(3)]  # with a four-card major biddable at the one level, bid it


class NotrumpResponseToMinorOpen(ResponseToOneLevelSuitedOpen):
    purpose = "CharacterizeStrength"
    conditional_purposes = [(z3.And(z3.And(voids == 0, singletons == 0), hearts <= 3, spades <= 3), "BalancedLimit")]  # no singleton and no four-card major to show first
    preconditions = [
        LastBidHasStrain(positions.Partner, suit.MINORS),
        InvertedPrecondition(LastBidHasAnnotation(positions.RHO, annotations.TakeoutDouble)),
    ]
    constraints = {
        '2N': z3.And(points >= 13, points <= 15),
        # The book says 16-18 for this bid, but with 4.3.3.3 after 1C we have no choice
        # at high enough point levels we'll just start bidding slams directly.  Until then 3N is what we have.
        '3N': z3.And(points >= 16),
    }
    shared_constraints = balanced


# Game when the combined support points are there, else the cheapest rebid.


class ResponseToJordan(Rule):
    """Opener's reply to Jordan (a limit raise or better over their takeout double, p123):
    game in the agreed major with more than a minimum, otherwise the cheapest rebid of it.
    Gadget category: the natural rules would read the 2N as notrump."""
    purpose = "Answer"
    category = categories.Gadget
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.Jordan),
        RebidSameSuit(),
    ]
    constraints = {
        ('3C', '3D', '3H', '3S'): NO_CONSTRAINTS,
        ('4H', '4S'): MinimumCombinedSupportPoints(25),
        ('5C', '5D'): MinimumCombinedSupportPoints(28),
    }
    # The minimum rebid may be passed (partner raises to game with more than a limit raise).
    annotations_per_call = {
        ('3C', '3D', '3H', '3S'): annotations.Signoff,
    }
    forcing = False
    prefer = [Highest('3C', '3D', '3H', '3S', '4H', '4S', '5C', '5D')]  # game with more than a minimum


class PassAfterSignoff(Rule):
    """Partner declined our invitation with a minimum signoff: we already said everything,
    so pass.  Gadget: the natural passes demand combined-point guarantees a limited hand
    opposite a wide signoff cannot show -- the Jordan 2N bidder (11-12) had NO call at all
    over opener's 3H (autobid-for-none, 2026-08-31)."""
    purpose = "Forced"  # unconstrained: any reason to bid on comes first
    category = categories.Gadget
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.Signoff),
        LastBidWas(positions.RHO, 'P'),
        LastBidWasBelowGame(),
    ]
    call_names = 'P'
    shared_constraints = NO_CONSTRAINTS


class ResponseAfterRHOTakeoutDouble(ResponseToOneLevelSuitedOpen):
    preconditions = LastBidHasAnnotation(positions.RHO, annotations.TakeoutDouble)


class RedoubleResponseAfterRHOTakeoutDouble(ResponseAfterRHOTakeoutDouble):
    purpose = "BalancedLimit"
    call_names = 'XX'
    shared_constraints = MinimumCombinedPoints(22)


class NewSuitAtTheTwoLevelAfterRHODouble(ResponseAfterRHOTakeoutDouble):
    """Over their takeout double a new suit at the two level is natural and weak with a
    five-plus suit, 6-9 (round-18 review, A4; the reference's non-forcing 6-10 reading) --
    the uncontested 10+ forcing meaning is off.  The 10+ hands start with a redouble: the
    booklet calls the bid invitational but its own p122 h23 redoubles with 11 even holding
    five diamonds, so the weak reading is the consistent one."""
    purpose = "Discovery"
    preconditions = [UnbidSuit(), NotJumpFromLastContract()]
    call_names = ['2C', '2D', '2H', '2S']
    shared_constraints = [MinLength(5), points >= 6, points <= 9]
    forcing = False


class JumpShift(object):
    preconditions = [
        UnbidSuit(),
        JumpFromLastContract(exact_size=1)
    ]


class JumpShiftResponseToOpenAfterRHODouble(JumpShift, ResponseAfterRHOTakeoutDouble):
    purpose = "GameForce"
    call_names = Call.suited_names_between('2D', '3H')
    shared_constraints = [
        points >= 5,
        MinLength(6),
        TwoOfTheTopThree()
    ]


# A new suit at the two level: with a five-card suit that is at least as long as every other
# suit, bid it -- the higher of two five-card suits first (1S P: 2H on 5 hearts and 5 diamonds),
# the longer suit first with 6-5.  A four-card minor is bid up the line (2C before 2D) and only
# when no five-card suit qualifies.  Majors always need five.
def longest_suit(suit_expr):
    """The suit has five or more cards and no other suit is longer."""
    return z3.And(suit_expr >= 5, *[suit_expr >= other for other in (clubs, diamonds, hearts, spades) if other is not suit_expr])


class NewSuitAtTheTwoLevel(ResponseToOneLevelSuitedOpen):
    purpose = new_suit_purpose
    conditional_purposes = new_minor_with_five
    preconditions = [
        UnbidSuit(),
        NotJumpFromLastContract(),
        # Over their takeout double the call is invitational with a five-plus suit, not
        # the uncontested 10+ force: NewSuitAtTheTwoLevelAfterRHODouble.
        InvertedPrecondition(LastBidHasAnnotation(positions.RHO, annotations.TakeoutDouble)),
    ]
    call_names = ['2C', '2D', '2H', '2S']
    constraints = {
        '2C': clubs >= 4,
        '2D': diamonds >= 4,
        '2H': longest_suit(hearts),
        '2S': longest_suit(spades),
    }
    # A five-card suit at least as long as every other, the higher first (1S P: 2H on five
    # hearts and five diamonds); a four-card minor up the line, and only when no five-card
    # suit qualifies.  Majors always need five.
    prefer = [
        '2S', '2H',
        ('2D', longest_suit(diamonds)), ('2C', longest_suit(clubs)),
        '2C', '2D',
    ]
    shared_constraints = MinimumCombinedPoints(22)


class ResponseToMajorOpen(ResponseToOneLevelSuitedOpen):
    preconditions = [
        LastBidHasStrain(positions.Partner, suit.MAJORS),
        InvertedPrecondition(LastBidHasAnnotation(positions.Partner, annotations.Artificial))
    ]


class PassResponseToSuitedOpen(ResponseToOneLevelSuitedOpen):
    purpose = "CharacterizeStrength"
    preconditions = LastBidWas(positions.RHO, 'P')
    call_names = 'P'
    # SuitGameIsRemote would imply that we have < 4 hcp, but conventionally we may pass with 5 hcp.
    # To avoid creating a hole, we if we don't have either 6 hcp or 6 support points we may pass.
    shared_constraints = ConstraintOr(MaximumSupportPointsForPartnersLastSuit(5), points <= 5)


# Due to the Or above, we need to order PassResponseToSuitedOpen relative to raises and game jumps.


class OneNotrumpResponseAvailable(Constraint):
    """Responder can bid 1N over their overcall: it is legal, and the hand has the values and
    the stopper (OneNotrumpResponse)."""
    def expr(self, history, call):
        if not history.call_history.is_legal_call(Call.from_string('1N')):
            return z3.BoolVal(False)
        return one_notrump_response_hand.expr(history, call)


class PassResponseOverOvercall(ResponseToOneLevelSuitedOpen):
    """Responder's pass after RHO overcalls a suit at the one or two level.  With nothing to
    say (up to 9 hcp; every stronger hand has a call) it is just a pass.  With five or more of
    their suit with three of the top five honors and 10+ it is a trap pass (p130 h6, p137,
    p138): we cannot double for penalties, so we pass and wait for opener's reopening double,
    which we will pass.  One rule with both meanings so that the pass has a rule for every
    hand in the auction (a pass rule claims the call for the whole auction)."""
    purpose = "CharacterizeStrength"
    preconditions = [
        LastBidHasSuit(positions.RHO),
        InvertedPrecondition(LastBidHasAnnotation(positions.RHO, annotations.Artificial)),
        EitherPrecondition(LastBidHasLevel(positions.RHO, 1), LastBidHasLevel(positions.RHO, 2)),
    ]
    call_names = 'P'
    shared_constraints = ConstraintOr(
        ConstraintAnd(MinLengthInLastContractSuit(5), ThreeOfTheTopFiveInLastContractSuit(), points >= 10),
        ConstraintAnd(points <= 9, ConstraintNot(OneNotrumpResponseAvailable())),  # with 6-9 and a stopper, 1N
    )
    conditional_purposes = [
        (ConstraintAnd(MinLengthInLastContractSuit(5), ThreeOfTheTopFiveInLastContractSuit(), points >= 10), "Penalize"),
    ]
    prefer = []


class Jacoby2N(ResponseToMajorOpen):
    # With four trumps the forcing raise comes first; with three a new suit is shown first
    # (the game-forcing raise then ranks with a slam try, above a natural slam: the order below).
    purpose = "Slam"
    conditional_purposes = [(MinLengthInPartnersLastSuit(4), "SupportMajors")]  # with four trumps the fit is found: support
    preconditions = LastBidWas(positions.RHO, 'P')
    call_names = '2N'
    shared_constraints = [
        # The book says 14+, but this needs to be 13 hcp or there is a hole above limit raise.
        points >= 13,
        # FIXME: We should use a conditional priority to make Jacoby2N with only
        # 3-card trump support lower priority than mentioning a new suit.
        SupportForPartnerLastBid(3),
    ]
    annotations = annotations.Jacoby2N
    prefer = []


class SolidSideSuit(Constraint):
    """A five-card suit with three of the top five honours other than the suit we opened:
    the jump to four of it answers Jacoby 2N (p40)."""
    def expr(self, history, call):
        mine = history.me.last_call.strain
        return z3.Or([z3.And(expr_for_suit(s) >= 5, ThreeOfTheTopFiveOrBetter().expr(history, Call.from_level_and_strain(4, s)))
                      for s in suit.SUITS if s != mine])


class ResponseToJacoby2N(Rule):
    # Bids above 4NT are either natural or covered by other conventions.
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.Jacoby2N)
    category = categories.Gadget


class ShapeResponseToJacoby2N(ResponseToJacoby2N):
    """Opener's shape answers to Jacoby 2N (p40): a jump to four of a five-card side suit with
    three of the top five honours, else three of a suit with a singleton or void (the solid
    suit first: 4D, not 3C, on 8.KQJ72.AJ973.K9 after 1H P 2N P)."""
    purpose = "Answer"
    preconditions = InvertedPrecondition(RebidSameSuit())
    call_names = ['3C', '3D', '3H', '3S', '4C', '4D', '4H', '4S']
    constraints = {
        ('3C', '3D', '3H', '3S'): MaxLength(1),
        ('4C', '4D', '4H', '4S'): [MinLength(5), ThreeOfTheTopFiveOrBetter()],
    }
    annotations_per_call = {('3C', '3D', '3H', '3S'): annotations.Artificial}
    prefer = [Cheapest('4C', '4D', '4H', '4S'), Cheapest('3C', '3D', '3H', '3S')]


class SlamResponseToJacoby2N(ResponseToJacoby2N):
    """Three of the agreed major: 18+ with no singleton or void to show (p40)."""
    purpose = "Answer"
    preconditions = RebidSameSuit()
    call_names = ['3C', '3D', '3H', '3S']
    shared_constraints = [points >= 18, singletons == 0, voids == 0, ConstraintNot(SolidSideSuit())]
    prefer = []


class MinimumResponseToJacoby2N(ResponseToJacoby2N):
    """Game in the agreed major: nothing else to say."""
    purpose = "Answer"
    fallback = 1
    preconditions = RebidSameSuit()
    call_names = ['4C', '4D', '4H', '4S']
    shared_constraints = NO_CONSTRAINTS


class NotrumpResponseToJacoby2N(ResponseToJacoby2N):
    """3N: 16-17 with no singleton or void (p40; the booklet's 15-17)."""
    purpose = "Answer"
    call_names = '3N'
    shared_constraints = [points >= 16, points <= 17, singletons == 0, voids == 0, ConstraintNot(SolidSideSuit())]
    prefer = []


class JumpShiftResponseToOpen(JumpShift, ResponseToOneLevelSuitedOpen):
    purpose = "GameForce"
    preconditions = InvertedPrecondition(LastBidHasAnnotation(positions.RHO, annotations.TakeoutDouble))

    # Jumpshifts must be below game and are off in competition so
    # 1S P 3H is the highest available response jumpshift.
    call_names = Call.suited_names_between('2D', '3H')
    # FIXME: Shouldn't this be MinHighCardPoints?
    shared_constraints = [points >= 19, MinLength(5)]
    annotations = annotations.JumpShiftResponse


# The negative double's shape by the opening and the overcall (p129): both majors over a
# minor overcall, the other major (four exactly) over a major, the minors over their major.
NEGATIVE_DOUBLE_SHAPES = {
            '1C 1D': z3.And(hearts >= 4, spades >= 4),
            '1C 1H': spades == 4,
            # After a minor opening, "two places to play" means the unbid major with
            # EITHER minor as the second place (the unbid one or support for opener's),
            # and a five-card unbid major qualifies on its own (round-18 review, A3: the
            # old rows hard-required the unbid minor, freezing out the booklet's hands).
            '1C 1S': z3.Or(z3.And(hearts >= 4, z3.Or(diamonds >= 3, clubs >= 3)), hearts >= 5),
            '1C 2D': z3.And(hearts >= 4, spades >= 4),
            '1C 2H': z3.Or(z3.And(spades >= 4, z3.Or(diamonds >= 3, clubs >= 3)), spades >= 5),
            '1C 2S': z3.Or(z3.And(hearts >= 4, z3.Or(diamonds >= 3, clubs >= 3)), hearts >= 5),
            '1D 1H': spades == 4,
            '1D 1S': z3.Or(z3.And(hearts >= 4, z3.Or(clubs >= 3, diamonds >= 3)), hearts >= 5),
            '1D 2C': z3.And(hearts >= 4, spades >= 4),
            '1D 2H': z3.Or(z3.And(spades >= 4, z3.Or(clubs >= 3, diamonds >= 3)), spades >= 5),
            '1D 2S': z3.Or(z3.And(hearts >= 4, z3.Or(clubs >= 3, diamonds >= 3)), hearts >= 5),
            '1H 1S': z3.And(clubs >= 3, diamonds >= 3), # Probably promises 4+ in both minors?
            '1H 2C': z3.And(diamonds >= 3, spades >= 4),
            '1H 2D': z3.And(clubs >= 3, spades >= 4),
            '1H 2S': z3.And(clubs >= 3, diamonds >= 3),
            '1S 2C': z3.And(diamonds >= 3, hearts >= 4),
            '1S 2D': z3.And(clubs >= 3, hearts >= 4),
            '1S 2H': z3.And(clubs >= 3, diamonds >= 3),
        
}


def negative_double_shape(history):
    """The negative double's shape in this auction, or None when there is no such double
    (partner's last call is not a one-level suit opening, or RHO's is not a suit overcall)."""
    partner, rho = history.partner.last_call, history.rho.last_call
    if partner is None or rho is None:
        return None
    return NEGATIVE_DOUBLE_SHAPES.get('%s %s' % (partner.name, rho.name))


class ShapeForNegativeDouble(Constraint):
    def expr(self, history, call):
        shape = negative_double_shape(history)
        assert shape is not None, "no negative double in %s" % history.call_history.calls_string()
        return shape


class NegativeDouble(ResponseToOneLevelSuitedOpen):
    call_names = 'X'
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.OneLevelSuitOpening),
        LastBidHasSuit(positions.Partner),
        LastBidHasSuit(positions.RHO),
        # A hackish way to make sure Partner and RHO did not bid the same suit.
        InvertedPrecondition(LastBidHasAnnotation(positions.RHO, annotations.Artificial)),
    ]
    shared_constraints = [ShapeForNegativeDouble(), NoNewMajorAtTheTwoLevel()]
    annotations = annotations.NegativeDouble


class OneLevelNegativeDouble(NegativeDouble):
    purpose = "MajorDiscovery"
    preconditions = LastBidHasLevel(positions.RHO, 1)
    shared_constraints = points >= 6


class TwoLevelNegativeDouble(NegativeDouble):
    purpose = "MajorDiscovery"
    preconditions = LastBidHasLevel(positions.RHO, 2)
    shared_constraints = points >= 8


# The negative double (four cards in the unbid major) comes first; the three-level new suit is for
# hands without it (1C 2H: 4-4-5 doubles, a six-card club suit bids 3C).


# aka OpenerRebidAfterNegativeDouble.
class ResponseToNegativeDouble(Rule):
    category = categories.Gadget # FIXME: Is this right?
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.NegativeDouble)


class CuebidReponseToNegativeDouble(ResponseToNegativeDouble):
    purpose = "GameForce"
    preconditions = [
        CueBid(positions.LHO),
        NotJumpFromLastContract(),
    ]
    # Min: 1C 1D X P 2D, Max: 1C 2S X 3S
    # Unclear if a cuebid of 2D ever makes sense since
    # we'll know they're 4-4 in the majors and can choose between a minor game and NT?
    call_names = Call.suited_names_between('2D', '3S')
    shared_constraints = points >= 19
    # A cuebid of their suit shows nothing in it.
    annotations = annotations.Artificial


class NewSuitResponseToNegativeDouble(ResponseToNegativeDouble):
    purpose = new_suit_purpose
    conditional_purposes = new_minor_with_five
    preconditions = [
        NotJumpFromLastContract(),
        UnbidSuit(),
    ]
    # Min: 1C 1D X P 1H, Max: 1C 2S X P 3H
    call_names = Call.suited_names_between('1H', '3H')
    shared_constraints = MinLength(4)


class RaiseResponseToNegativeDouble(ResponseToNegativeDouble):
    purpose = "Support"
    conditional_purposes = [(minor_raise_before_notrump, "SupportMinorWithFour"), (minor_raise_with_five, "SupportMinorWithFive")]  # see constraints.minor_raise_before_notrump
    preconditions = [
        PartnerHasAtLeastLengthInSuit(4),
        NotJumpFromLastContract(),
    ]
    # Min: 1C 1D X P 1H, Max: 1C 2S X P 3H
    call_names = ['1H', '1S', '2C', '2D', '2H', '2S', '3C', '3D', '3H']
    prefer = []
    shared_constraints = [MinimumCombinedLength(8), points <= 15]  # the jump raise shows 16+


# FIXME: Should this be a forced-only response?  Should the unforced variant show points? stoppers?
class NotrumpResponseToNegativeDouble(ResponseToNegativeDouble):
    purpose = "CharacterizeStrength"
    preconditions = NotJumpFromLastContract()
    # A minimum: with 16+ the jump 2N (or 3N) says so; the natural 4N and 5N are slam tries.
    constraints = {'1N': points <= 15, '2N': points <= 19}
    shared_constraints = balanced


class JumpResponseToNegativeDouble(ResponseToNegativeDouble):
    preconditions = JumpFromLastContract(exact_size=1)
    shared_constraints = points >= 16


class JumpRaiseResponseToNegativeDouble(JumpResponseToNegativeDouble):
    purpose = "Support"
    conditional_purposes = [(minor_raise_before_notrump, "SupportMinorWithFour"), (minor_raise_with_five, "SupportMinorWithFive")]  # see constraints.minor_raise_before_notrump
    preconditions = PartnerHasAtLeastLengthInSuit(4),
    # Min: 1C 1D X P 2H, Max: 1C 2S X P 4H
    call_names = ['2H', '2S', '3C', '3D', '3H', '3S', '4C', '4D', '4H']
    shared_constraints = MinimumCombinedLength(8)
    prefer = []


class JumpNotrumpResponseToNegativeDouble(JumpResponseToNegativeDouble):
    purpose = "CharacterizeStrength"
    conditional_purposes = [(semi_balanced, "BalancedLimit")]  # a hand without a singleton tells its strength here
    call_names = '2N'
    # If this bid promised balanced, it would be exactly 18, as otherwise
    # we would have opened 1N if we were balanced.
    # But we still shouldn't have any voids.  With a void we should be jumping to some suit.
    # If this bid had no constraints, then minor jump raises are impossible.
    # No singleton either (a jump to 2N with a stiff spade was made on A.AQ94.KJT95.Q53); the
    # booklet's 2N hands are 5-4-2-2 shapes too, so z3b's `balanced` (one doubleton) is too strict.
    shared_constraints = MinLength(2, suit.SUITS)
    prefer = []


class CueBidRebidAfterNegativeDouble(Rule):
    purpose = "GameForce"
    preconditions = [
        LastBidHasAnnotation(positions.Me, annotations.NegativeDouble),
        # If we understood better what kind of hand this bid was trying to show, we might be able to cuebid after NT.
        LastBidHasSuit(positions.Partner),
        # I don't think there are any artificial responses to NegativeDoubles, or we should check !artificial here?
        # The Cuebid here is defined as RHO's opening bid, not whatever their most recent one may be.
        CueBid(positions.RHO, use_first_suit=True),
    ]
    # Min: 1D 1H X P 2C P 2H, Max: 1H 2S X P 3D P 3S
    # A cuebid of their suit shows nothing in it.
    annotations = annotations.Artificial
    call_names = Call.suited_names_between('2H', '3S')
    # Shows slam interest, but in which suit?
    shared_constraints = MinimumSupportPointsForPartnersLastSuit(15) # How big should this really be?


class ResponseToStrongTwoClubs(Response):
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.StrongTwoClubOpening)


class WaitingResponseToStrongTwoClubs(ResponseToStrongTwoClubs):
    """2D waiting: no positive response to make (p92 h8)."""
    purpose = "Answer"
    fallback = 1
    call_names = '2D'
    shared_constraints = NO_CONSTRAINTS
    annotations = annotations.Artificial


two_clubs_positive_suit = ConstraintAnd(MinLength(5), TwoOfTheTopThree())


class PositiveSuitSomewhere(Constraint):
    """Some suit has five cards with two of the top three honours: a positive suit response
    to 2C (p92 h5)."""
    def expr(self, history, call):
        return z3.Or([two_clubs_positive_suit.expr(history, Call.from_level_and_strain(3, s)) for s in suit.SUITS])


class SuitResponseToStrongTwoClubs(ResponseToStrongTwoClubs):
    purpose = "Answer"
    call_names = ['2H', '2S', '3C', '3D']
    shared_constraints = [two_clubs_positive_suit, points >= 8]
    prefer = [Longest(*call_names), Cheapest(*call_names)]


class NotrumpResponseToStrongTwoClubs(ResponseToStrongTwoClubs):
    """2N: 8+ with no suit worth a positive response (p92 h7)."""
    purpose = "Answer"
    call_names = '2N'
    shared_constraints = [points >= 8, ConstraintNot(PositiveSuitSomewhere())]
    prefer = []


class OpenerRebid(Rule):
    preconditions = LastBidHasAnnotation(positions.Me, annotations.Opening)


class RebidAfterOneLevelOpen(OpenerRebid):
    # FIXME: Most subclasses here only make sense over a minimum rebid from partner.
    preconditions = LastBidHasAnnotation(positions.Me, annotations.OneLevelSuitOpening),


class NotrumpJumpRebid(RebidAfterOneLevelOpen):
    purpose = "CharacterizeStrength"
    conditional_purposes = [(semi_balanced, "BalancedLimit")]  # a hand without a singleton tells its strength here
    # See KBB's NotrumpJumpRebid for discussion of cases for this bid.
    # Unclear how this is affected by competition?
    annotations = annotations.NotrumpSystemsOn
    # FIXME: Does this only apply over minors?  What about 1H P 1S P 2N?
    preconditions = JumpFromLastContract(exact_size=1)
    call_names = '2N'
    shared_constraints = [
        points >= 18,
        points <= 19,
        balanced,
    ]


class PassPassedHandResponse(RebidAfterOneLevelOpen):
    """Partner is a passed hand, so his new-suit response is not forcing: with a minimum
    opening (12 or less, a third- or fourth-seat light one), fewer than four cards in his
    suit and no good six-card suit of our own to rebid, opener passes (from play: P on
    K5.J86532.K6.AJ8 after P P P 1D P 1S; 2C, not P, on AQT854.7.AJ98.J3 after P P 1C P 1S).
    Gadget category: the pass owns the call only for these hands; other hands rebid as
    usual."""
    purpose = "Enough"  # game is out of reach opposite a passed hand: the auction has found its level
    category = categories.Gadget
    preconditions = [
        PassedHand(positions.Partner),
        LastBidHasSuit(positions.Partner),
        LastBidWas(positions.RHO, 'P'),
        # A NEW suit only: partner's raise of our suit also matched, and this Gadget then
        # owned the pass with a meaning no 13+ opener fits -- opener had NO call over
        # P P 1H P 2H (2026-08-31, autobid-for-none).
        InvertedPrecondition(LastContractSuitBidBy(positions.Me)),
    ]
    call_names = 'P'
    shared_constraints = [
        points <= 12,
        MaxLengthInLastContractSuit(3),
        # No six-card suit worth rebidding (three of the top five): J86532 is not one.
        z3.Not(z3.Or(
            z3.And(clubs >= 6, three_of_the_top_five_clubs_or_better),
            z3.And(diamonds >= 6, three_of_the_top_five_diamonds_or_better),
            z3.And(hearts >= 6, three_of_the_top_five_hearts_or_better),
            z3.And(spades >= 6, three_of_the_top_five_spades_or_better),
        )),
    ]


class RebidOneNotrumpByOpener(RebidAfterOneLevelOpen):
    purpose = "CharacterizeStrength"
    preconditions = InvertedPrecondition(LastBidWas(positions.Partner, 'P'))
    call_names = '1N'
    # No shape test: the booklet's 1N rebid is a balanced minimum (p52 h3), but from play the
    # author's lines rebid 1N with a singleton when every suit rebid would be a worse lie
    # (A9863.QJT7.8.KJ6 after P 1C P 1H P; AK742.A.T972.Q63 after 1C P 1S P).
    shared_constraints = NO_CONSTRAINTS


class NotrumpInvitationByOpener(RebidAfterOneLevelOpen):
    purpose = "CharacterizeStrength"
    conditional_purposes = [(semi_balanced, "BalancedLimit")]  # a hand without a singleton tells its strength here
    preconditions = [NotJumpFromLastContract(), HaveFit()]
    # If we're not balanced, than we'd have a HelpSuitGameTry to use instead.
    call_names = '2N'
    shared_constraints = [points >= 16, points <= 17, balanced]


class NewOneLevelMajorByOpener(RebidAfterOneLevelOpen):
    purpose = "MajorDiscovery"
    preconditions = UnbidSuit()
    # FIXME: Should this prefer Hearts over Spades: 1C P 1D P 1H with 4-4 in majors?
    # If partner is expected to prefer 4-card majors over minors then 1H seems impossible?
    shared_constraints = MinLength(4)
    call_names = ['1H', '1S']
    prefer = []  # up the line


reverse_strength = z3.And(points >= 16, points <= 18)  # nineteen jumps


class ReverseAvailable(Constraint):
    """A reverse is on: a four-card suit above the one we opened, biddable at the two level
    without a jump, with 16-18 (ReverseByOpener).  Such a hand reverses rather than bidding a
    lower new suit."""
    def expr(self, history, call):
        mine = history.me.last_call.strain
        suits = []
        for s in suit.SUITS:
            two = Call.from_level_and_strain(2, s)
            if s.index <= mine.index or not history.call_history.is_legal_call(two) or not history.is_unbid_suit(s):
                continue
            if history.call_history.last_contract() and two < history.call_history.last_contract():
                continue
            suits.append(expr_for_suit(s) >= 4)
        if not suits:
            return z3.BoolVal(False)
        return z3.And(z3.Or(suits), reverse_strength)


class SecondSuitFromOpener(RebidAfterOneLevelOpen):
    preconditions = [
        NotJumpFromLastContract(),
        UnbidSuit(),
        InvertedPrecondition(HaveFit()),
    ]


class NewSuitByOpener(SecondSuitFromOpener):
    purpose = new_suit_purpose
    conditional_purposes = new_minor_with_five
    preconditions = SuitLowerThanMyLastSuit()
    # If you're 4.4.0.5 and the bidding goes 1S P 1H P, do you prefer 2C or 2D?
    constraints = {
        '2C': NO_CONSTRAINTS,
        '2D': NO_CONSTRAINTS,
        '2H': NO_CONSTRAINTS,
        # 2S would necessarily be a reverse, or a jump shift, and is not covered by this rule.

        '3C': MinimumCombinedPoints(25),
        '3D': MinimumCombinedPoints(25),
        '3H': MinimumCombinedPoints(25),
        # 3S would necessarily be a reverse, or a jump shift, and is not covered by this rule.
    }
    # Up to 18 (nineteen jumps) and no reverse to make (a higher four-card suit with 16+).
    shared_constraints = [MinLength(4), points <= 18, ConstraintNot(ReverseAvailable())]
    prefer = [Cheapest('2H', '3H'), Cheapest('2C', '2D', '3C', '3D')]  # a major first, the minors up the line


reverse_preconditions = [
    InvertedPrecondition(SuitLowerThanMyLastSuit()),
    LastBidHasSuit(positions.Me),
    UnbidSuit(),
    NotJumpFromLastContract(),
]


class MinimumResponseToLimitRaise(OpenerRebid):
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.LimitRaise)


class PassResponseToLimitRaise(MinimumResponseToLimitRaise):
    purpose = "CharacterizeStrength"
    call_names = 'P'
    shared_constraints = (balanced, points <= 14)


class GameAccept(MinimumResponseToLimitRaise):
    purpose = "Game"
    preconditions = RaiseOfPartnersLastSuit()
    call_names = ('4H', '4S')
    shared_constraints = ConstraintOr(points >= 15, z3.Not(balanced))  # the pass below shows a balanced minimum


class ReverseByOpener(SecondSuitFromOpener):
    purpose = "Discovery"
    preconditions = reverse_preconditions
    annotations = annotations.OpenerReverse
    shared_constraints = [MinLength(4), reverse_strength]
    call_names = ['2D', '2H', '2S']
    prefer = [Longest('2D', '2H', '2S'), Cheapest('2D', '2H', '2S')]  # the longer suit, else up the line


class ForcedMinimumResponseToOpenerReverse(Rule):
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.OpenerReverse),
        ForcedToBid(),
    ]


# Also known as Ingberman 2NT
class Lebensohl(ForcedMinimumResponseToOpenerReverse):
    purpose = "Forced"  # the relay is what is left when a five-card major cannot be rebid
    call_names = '2N'
    # Ingberman's 2N: a weak hand asking opener to rebid his first suit, not notrump (implies Artificial).
    annotations = annotations.Lebensohl
    # The weak response: up to 7 hcp (p62 h7 has 6; "less than about 8 HCP and game does not
    # look promising", p62).  Priorities imply we have no major to rebid.
    shared_constraints = points <= 7


class RebidFirstSuitAfterLebensohl(Rule):
    """Opener's reply to the 2N over his reverse (p64): rebid the first suit, which partner will
    pass or correct to the second.  Opener with 19+ "is not bound to comply" (the 5440 monster
    bids 4H); that continuation is not modelled.  Gadget category: the 2N is artificial and the
    natural rules have no reading of it."""
    purpose = "Answer"
    category = categories.Gadget
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.Lebensohl),
        RebidFirstSuit(),
    ]
    call_names = ['3C', '3D', '3H']
    shared_constraints = NO_CONSTRAINTS
    forcing = False


class ForcedMajorRebid(ForcedMinimumResponseToOpenerReverse):
    purpose = "RebidSuit"  # a fifth card is rebid before raising a minor or relaying
    conditional_purposes = [(MinLength(6), "RebidLongMajor")]  # six cards: rebid before the fourth suit
    # We have a minimum hand, so we never menetioned a 2-level suit before this one.
    call_names = ('2H', '2S')
    # Five cards and no more than a minimum: with 10-11 and six the three-level rebid says so.
    shared_constraints = [MinLength(5), points <= 9]
    prefer = []


class ResponseToOpenerReverse(Rule):
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.OpenerReverse)


class GameForcingRaiseAfterOpenerReverse(ResponseToOpenerReverse):
    """Responder's raise of one of opener's suits over the reverse with 8+ hcp: "all other
    rebids by responder show about 8 or more HCP and, as partner has shown a 17-count or
    better, are game forcing.  Such bids are natural" (p65).  Four cards for the reverse suit
    (opener's second suit may be four), three for the first suit (a simple preference with a
    weak hand goes through the 2N, so this one shows values)."""
    call_names = ['3C', '3D', '3H', '3S']
    preconditions = DidBidSuit(positions.Partner)
    shared_constraints = points >= 8
    forcing = True
    prefer = []


class RaiseOfReverseSuit(GameForcingRaiseAfterOpenerReverse):
    purpose = "Support"
    preconditions = RaiseOfPartnersLastSuit()
    shared_constraints = MinLength(4)


class RaiseOfFirstSuitAfterReverse(GameForcingRaiseAfterOpenerReverse):
    purpose = "Support"
    preconditions = InvertedPrecondition(RaiseOfPartnersLastSuit())
    shared_constraints = [MinLength(3), MaxLengthInPartnersLastSuit(3)]  # with four in the reverse suit, raise that


# Over a reverse the weak hand's Ingberman 2N comes before a natural part score (p62 h7: 2N,
# not a 3C preference on a 6-count); with 8+ the raise of a major is the game force to make,
# and with a minor fit 3N comes first when it is available (p65: 4D over 1D-1S; 2H says "no
# desire to play 3NT").


class SupportPartnerSuit(RebidAfterOneLevelOpen):
    preconditions = [
        InvertedPrecondition(RebidSameSuit()),
        RaiseOfPartnersLastSuit(),
    ]


class SupportPartnerMajorSuit(SupportPartnerSuit):
    purpose = "SupportMajors"
    call_names = ['2H', '2S', '3H', '3S', '4H', '4S']
    constraints = {
        ('3H', '3S'): MinimumCombinedSupportPoints(22),
        ('4H', '4S'): MinimumCombinedSupportPoints(25),
    }
    shared_constraints = MinimumCombinedLength(8)
    prefer = [Highest(*call_names)]  # the highest level the hand is worth


class RebidOriginalSuitByOpener(RebidAfterOneLevelOpen):
    preconditions = [
        LastBidHasAnnotation(positions.Me, annotations.OneLevelSuitOpening),
        RebidSameSuit(),
    ]


class MinimumRebidOriginalSuitByOpener(RebidOriginalSuitByOpener):
    preconditions = NotJumpFromLastContract()


class UnforcedRebidOriginalSuitByOpener(MinimumRebidOriginalSuitByOpener):
    purpose = "RebidSuit"
    conditional_purposes = [(MinLength(6), "RebidLongMinimum")]  # a sixth card is worth showing
    preconditions = InvertedPrecondition(ForcedToBid())
    # The three level, e.g. after a reverse (1C P 1S P 2D P 2S P: 3C, p63), ranks below a new
    # suit (its own priority; the two-level calls keep this rule as theirs).
    call_names = ['2C', '2D', '2H', '2S', '3C', '3D', '3H', '3S']
    shared_constraints = MinLength(6)
    # At the two level a minimum (sixteen jumps, nineteen bids the game); at the three level,
    # over partner's raise, an invitation.
    constraints = {
        ('2C', '2D', '2H', '2S'): points <= 15,
        ('3C', '3D', '3H', '3S'): points <= 18,
    }
    prefer = []


# Opener's two-level rebid of a five-card suit with a singleton or void: the booklet's 2N
# rebid is balanced (p53 h13: 2S on KQJ87.3.74.AQT98, not 2N), so with shortness the suit
# rebid outranks the non-jump 2N it would otherwise lose to.


class OneNotrumpNotAvailable(Constraint):
    """1N is no longer a legal call (partner responded at 1N or above): the limited suit
    rebid takes its place."""
    def expr(self, history, call):
        return z3.BoolVal(not history.call_history.is_legal_call(Call.from_string('1N')))


class ForcedRebidOriginalSuitByOpener(MinimumRebidOriginalSuitByOpener):
    purpose = "Forced"
    conditional_purposes = [
        (ConstraintAnd(MinLength(6), points <= 15), "RebidLongMinimum"),  # a minimum with a sixth card rebids it
        # A five-card suit rebid with shortness limits the hand like a notrump rebid would,
        # when 1N is no longer available (OneNotrumpNotAvailable); a natural 2N comes later.
        (ConstraintAnd(singletons + voids >= 1, OneNotrumpNotAvailable()), "CharacterizeStrength"),
    ]
    preconditions = ForcedToBid()
    # At the three level (partner's forcing new suit was itself at the three level, e.g. over a
    # weak jump overcall) the rebid promises six; before that opener had no call at all there.
    constraints = {
        ('2C', '2D', '2H', '2S'): MinLength(5),
        ('3C', '3D', '3H', '3S'): MinLength(6),
    }
    prefer = []


class UnsupportedRebid(RebidOriginalSuitByOpener):
    preconditions = MaxShownLength(positions.Partner, 0)


# With a solid six-card minor, 19+ and stoppers, 3N is the game to bid, not 4m (p54 h21).


class InvitationalUnsupportedRebidByOpener(UnsupportedRebid):
    purpose = "RebidSuit"
    conditional_purposes = [(MinLength(6), "RebidLong")]  # a sixth card is worth showing first
    preconditions = JumpFromLastContract()
    shared_constraints = MinLength(6), points >= 16, points <= 18  # 19+ bids the game
    call_names = ['3C', '3D', '3H', '3S']
    prefer = []


# Mentioned as "double jump rebid his own suit", p56.
# Only thing close to an example is h19, p56 which has sufficient HCP for a game (even if not fit).
class GameForcingUnsupportedRebidByOpener(UnsupportedRebid):
    purpose = "Game"  # the jump to game in our six-card major (the Game preference puts it above 3N)
    preconditions = JumpFromLastContract()
    # I doubt we want to jump to game w/o support from our partner.  He's shown 6 points...
    # Maybe this is for extremely unbalanced hands, like 7+?
    # p54 h19: 4H with 19+ and a six-card major, even opposite a 1N response.
    shared_constraints = MinLength(6), points >= 19
    call_names = ['4C', '4D', '4H', '4S']
    prefer = []


class HelpSuitGameTry(RebidAfterOneLevelOpen):
    purpose = "SupportMajors"
    preconditions = [
        InvertedPrecondition(LastBidHasAnnotation(positions.Partner, annotations.LimitRaise)),  # opposite a limit raise: accept or pass
        NotJumpFromLastContract(),
        HaveFit(),
        UnbidSuit(),
    ]
    # Minimum: 1C,2C,2D, Max: 1C,3C,3S
    call_names = Call.suited_names_between('2D', '3S')
    # Descriptive not placement bid hence points instead of MinimumCombinedPoints.
    shared_constraints = [MinLength(4), Stopper(), points >= 16, HelpSuitGameTryStrength()]
    prefer = []


# After a negative double the cuebid (19+, every strain still open) outranks a jump shift (19+).


class JumpShiftByOpener(JumpShift, RebidAfterOneLevelOpen):
    purpose = "GameForce"
    # The lowest possible jumpshift is 1C P 1D P 2H.
    # The highest possible jumpshift is 1S P 2S P 4H
    # FIXME: The book mentions that opener jumpshifts don't always promise 4, especially for 1C P MAJOR P 3D
    call_names = ['2H', '2S', '3C', '3D', '3H', '3S', '4C', '4D', '4H']
    preconditions = InvertedPrecondition(LastBidHasAnnotation(positions.Partner, annotations.NegativeDouble))  # after partner's negative double the cuebid is the game force
    shared_constraints = (points >= 19, MinLength(4), z3.Not(balanced))  # balanced 18-19 jumps in notrump instead
    prefer = [Longest(*call_names), Cheapest(*call_names)]  # the longer suit, else up the line


class OpenerRebidAfterStrongTwoClubs(OpenerRebid):
    preconditions = LastBidWas(positions.Me, '2C')
    # This could also alternatively use annotations.StrongTwoClubOpening


class NotrumpRebidOverTwoClubs(OpenerRebidAfterStrongTwoClubs):
    purpose = "EnterNotrumpSystem"
    annotations = annotations.NotrumpSystemsOn
    # These bids are only systematic after a 2D response from partner.
    preconditions = LastBidWas(positions.Partner, '2D')
    # 25-27 opens 3N directly, so the rebid bands are 22-24 / 28-29 / 30-31 (booklet).
    constraints = {
        '2N': z3.And(points >= 22, points <= 24),
        '3N': z3.And(points >= 28, points <= 29),
        '4N': points >= 30,
    }
    shared_constraints = balanced
    prefer = []


opener_suited_rebids_after_two_clubs = suit_preference(Call.suited_names_between('2H', '4C'))

class SolidSevenCardSuitSomewhere(Constraint):
    """Some suit has seven cards with two of the top three honours: the 2C opener jumps in it."""
    def expr(self, history, call):
        return z3.Or([z3.And(expr_for_suit(s) >= 7, TwoOfTheTopThree().expr(history, Call.from_level_and_strain(3, s))) for s in suit.SUITS])


class OpenerSuitedRebidAfterStrongTwoClubs(OpenerRebidAfterStrongTwoClubs):
    purpose = "MajorDiscovery"
    preconditions = [UnbidSuit(), NotJumpFromLastContract()]
    # This maxes out at 4C -> 2C P 3D P 4C
    # If the opponents are competing we're just gonna double them anyway.
    # FIXME: This should either have NoMajorFit(), or have priorities separated
    # so that we prefer to support our partner's major before bidding our own new minor.
    # A seven-card suit with two of the top three honours jumps instead (in that suit).
    shared_constraints = [MinLength(5), ConstraintNot(SolidSevenCardSuitSomewhere())]
    call_names = opener_suited_rebids_after_two_clubs.call_names
    prefer = opener_suited_rebids_after_two_clubs


class OpenerSuitedJumpRebidAfterStrongTwoClubs(OpenerRebidAfterStrongTwoClubs):
    purpose = "MajorDiscovery"
    preconditions = [UnbidSuit(), JumpFromLastContract(exact_size=1)]
    # This maxes out at 4C -> 2C P 3D P 5C, but I'm not sure we need to cover that case?
    # If we have self-supporting suit why jump all the way to 5C?  Why not Blackwood in preparation for slam?
    call_names = Call.suited_names_between('3H', '5C')
    shared_constraints = [MinLength(7), TwoOfTheTopThree()]
    prefer = []


class ResponderRebid(Rule):
    preconditions = [
        Opened(positions.Partner),
        HasBid(positions.Me),
    ]


class OneLevelOpeningResponderRebid(ResponderRebid):
    preconditions = OneLevelSuitedOpeningBook()


class ResponderSuitRebid(OneLevelOpeningResponderRebid):
    preconditions = RebidSameSuit()


class RebidResponderSuitByResponder(ResponderSuitRebid):
    purpose = "RebidSuit"
    conditional_purposes = [(MinLength(6), "RebidLongMinimum")]  # a weak rebid of a sixth card
    preconditions = [
        InvertedPrecondition(RaiseOfPartnersLastSuit()),
        InvertedPrecondition(LastBidHasAnnotation(positions.Partner, annotations.OpenerReverse))
    ]
    call_names = ['2D', '2H', '2S']
    shared_constraints = [MinLength(6), points >= 6, points <= 9]  # a weak rebid; 10-11 jumps, more bids game


class RebidOwnSuitAfterFourthSuitForcing(ResponderRebid):
    """After our fourth-suit-forcing call and opener's reply, the rebid of our first suit at
    the three level shows six cards and is forcing (p76 h2)."""
    purpose = "Answer"
    preconditions = [
        LastBidHasAnnotation(positions.Me, annotations.FourthSuitForcing),
        DidBidSuit(positions.Me),
        InvertedPrecondition(RebidSameSuit()),
        # Not when opener's reply just supported the suit: then the natural raise/game applies.
        InvertedPrecondition(RaiseOfPartnersLastSuit()),
    ]
    call_names = ['3C', '3D', '3H', '3S']
    shared_constraints = MinLength(6)
    forcing = True


class RaiseAfterJumpShiftResponse(ResponderRebid):
    """After our jump shift (game forcing, slam invitational) the raise of opener's major
    shows the fit the jump shift was leading to (p41 h23: 3C "followed by a spade raise";
    h24: 3D, "again followed by support for spades").  Opener's rebid of his suit is raised
    to game; the slam try comes later (over 4S opener bids on with extras).  Owns the raise
    in this auction so that the natural slam bids do not jump to 6N over the fit."""
    purpose = "Support"
    conditional_purposes = [(minor_raise_before_notrump, "SupportMinorWithFour"), (minor_raise_with_five, "SupportMinorWithFive")]  # see constraints.minor_raise_before_notrump
    preconditions = [
        LastBidHasAnnotation(positions.Me, annotations.JumpShiftResponse),
        RaiseOfPartnersLastSuit(),
    ]
    call_names = ['4H', '4S']
    shared_constraints = MinLength(3)


class ThreeLevelSuitRebidByResponder(ResponderSuitRebid):
    purpose = "RebidSuit"
    conditional_purposes = [(MinLength(6), "RebidLong")]  # a sixth card is worth showing first
    preconditions = [
        InvertedPrecondition(RaiseOfPartnersLastSuit()),
        MaxShownLength(positions.Partner, 0),
        MaxShownLength(positions.Me, 5),
    ]
    call_names = ['3C', '3D', '3H', '3S']
    constraints = {('3H', '3S'): points <= 12}  # a major rebid invites (10-12); with more the game is bid
    # FIXME: Page 74 says "second round jump bid of partner's major is normally a game force".
    # Seems we should promise a bit more than just 10hcp here, or partner will be left guessing?
    # FIXME: We should want 3o5 or better?  Partner may just leave us here...
    shared_constraints = [
        MinLength(6),
        points >= 10,
    ]


class WeakNewSuitAfterOneNotrumpResponse(OneLevelOpeningResponderRebid):
    """1x P 1N P 2y P: responder's new suit at the two level is a weak six-card suit to play
    (p71 h12), not forcing.  Before this rule responder could only pass or sign off in
    opener's suit."""
    purpose = "Discovery"
    preconditions = [
        LastBidWas(positions.Me, '1N'),
        LastBidHasSuit(positions.Partner),
        # Not over opener's reverse: there a five-card major is ForcedMajorRebid (forcing to bid,
        # the two rules would otherwise tie for the call).
        InvertedPrecondition(LastBidHasAnnotation(positions.Partner, annotations.OpenerReverse)),
        UnbidSuit(),
        Level(2),
    ]
    call_names = ['2D', '2H', '2S']
    shared_constraints = [MinLength(6), points <= 9]
    forcing = False


class ResponderSignoffInPartnersSuit(OneLevelOpeningResponderRebid):
    """Responder's preference for one of opener's suits with up to 11.  Without a stopper in an
    unbid suit it limits the hand before a notrump part score does (p73 h18: 2S on
    KJ643.9863.A9.K9, 11 with diamonds unstopped, rather than 2N; from play: 2C on
    KQT4.AT96.632.T8 rather than 1N).  With the unbid suits stopped a notrump part score says
    it better (1N, not 2D, on K953.972.T986.A9 with clubs stopped), and the preference is the
    forced minimum when no notrump call is possible (the base purpose, above the default
    pass)."""
    purpose = "Forced"
    conditional_purposes = [(ConstraintNot(StoppersInUnbidSuits()), "CharacterizeStrength")]
    preconditions = [
        InvertedPrecondition(RaiseOfPartnersLastSuit()),
        # z3 is often smart enough to know that partner has 3 in a suit
        # when re-bidding 1N, but that doesn't mean our (unforced) bid
        # of that new suit would be a sign-off!
        # FIXME: Perhaps this should required ForcedToBid()?
        DidBidSuit(positions.Partner),
    ]
    call_names = ['2C', '2D', '2H', '2S']
    shared_constraints = [MinimumCombinedLength(7), points <= 11]
    prefer = []


# class ResponderSignoffInMinorGame(ResponderRebid):
#     preconditions = [
#         PartnerHasAtLeastLengthInSuit(3),
#         InvertedPrecondition(RebidSameSuit())
#     ]
#     constraints = {
#         '5C': MinimumCombinedPoints(25),
#         '5D': MinimumCombinedPoints(25),
#     }
#     shared_constraints = [MinimumCombinedLength(8), NoMajorFit()]


class ResponderNotrumpInvitation(OneLevelOpeningResponderRebid):
    """Responder's 2N rebid invites 3N: a good 10 to 12 with the stoppers a notrump bid needs
    (p70 h7: KJ64.652.KT.A754, 11; p71 h11: QJ4.T42.K9.A8765, 10).  This rule owns the 2N in
    responder's rebid auctions (one rule per call), so a 9-count takes a preference and a
    13-count bids game; over opener's reverse the 2N is the Ingberman relay instead."""
    purpose = "CharacterizeStrength"
    conditional_purposes = [(semi_balanced, "BalancedLimit")]  # a hand without a singleton tells its strength here
    preconditions = [
        NotJumpFromLastContract(),
        InvertedPrecondition(LastBidHasAnnotation(positions.Partner, annotations.OpenerReverse)),
    ]
    call_names = '2N'
    shared_constraints = [points >= 10, points <= 12, StoppersInUnbidSuits()]


class ResponderReverse(OneLevelOpeningResponderRebid):
    purpose = "Discovery"
    preconditions = reverse_preconditions
    # Min: 1C,1D,2C,2H, Max: 1S,2D,2S,3H
    call_names = Call.suited_names_between('2H', '3H')
    shared_constraints = [MinLength(4), points >= 12]


class JumpShiftResponderRebid(JumpShift, OneLevelOpeningResponderRebid):
    purpose = "GameForce"
    # Smallest: 1D,1H,1S,3C
    # Largest: 1S,2H,3C,4D (anything above 4D is game)
    call_names = Call.suited_names_between('3C', '4D')
    # 16+: with 14-15 responder reverses or bids 3N instead (p71 h13, p72 h15); the jump shift
    # is the slam-suggesting rebid.
    shared_constraints = [MinLength(4), points >= 16]
    preconditions = InvertedPrecondition(LastBidHasAnnotation(positions.Me, annotations.NegativeDouble))  # after our negative double the cuebid is the game force
    prefer = []


class FourthSuitForcingPrecondition(Precondition):
    def fits(self, history, call):
        if annotations.FourthSuitForcing in history.annotations:
            return False
        return len(history.us.bid_suits) == 3 and len(history.them.bid_suits) == 0


class SufficientPointsForFourthSuitForcing(Constraint):
    def expr(self, history, call):
        return points >= max(0, points_for_sound_notrump_bid_at_level[call.level] - history.partner.min_points)


# No need for ordering because at most one is available at any time.

class FourthSuitForcing(Rule):
    category = categories.Gadget
    preconditions = [
        LastBidHasSuit(positions.Partner),
        FourthSuitForcingPrecondition(),
        UnbidSuit(),
    ]
    annotations = annotations.FourthSuitForcing
    # A general one-round force ("in keeping with SAYC guidelines, employ it as a one-round
    # force", p74); it says nothing about the fourth suit (p75 h2: "the fourth suit says
    # nothing about hearts").  A hand that can bid the notrump game itself does (ordering).
    shared_constraints = SufficientPointsForFourthSuitForcing()


# Fourth suit forcing with four-card support for opener's second suit and only invitational
# values: raise the suit instead (p73 h20).  Its own enum, not a member of fourth_suit_forcing,
# so that it can sit below the natural part scores while fourth_suit_forcing stays above them.


# Fourth suit forcing with the fourth suit stopped: with 12+ (24 combined) the ask is still
# right (p71 h10 with KJ642 in the fourth suit; p76 h4: "3NT could be in trouble off the top",
# find the 5-3 fit first), but a hand that can bid the notrump game bids it instead, and a
# 10-11 count with a stopper invites in notrump rather than asks (ordering below); its own
# enum for the same reason as above.


class NonJumpFourthSuitForcing(FourthSuitForcing):
    # Without a stopper in the fourth suit the ask comes first; with one, a game in notrump is
    # bid when it fits and the ask comes before a limit bid; with support for partner's suit
    # the raise and the limit bids are better.
    purpose = "Miscellaneous"
    # Without a stopper in the fourth suit the bid asks for one; with a stopper and game values
    # it waits behind a natural game; with four-card support for opener's second suit and a
    # weak hand it is neither (Miscellaneous).
    conditional_purposes = [
        (ConstraintAnd(ConstraintNot(ConstraintAnd(SupportForPartnerLastBid(4), points <= 12)), ConstraintNot(Stopper())), "Ask"),
        (ConstraintAnd(ConstraintNot(ConstraintAnd(SupportForPartnerLastBid(4), points <= 12)), MinimumCombinedPoints(24)), "AskLater"),
    ]
    preconditions = NotJumpFromPartnerLastBid()
    # Smallest: 1D,1H,1S,2C
    # Largest: 1H,2D,3C,3S
    # The unconditional priority is the lowest one (a rule keeps every priority it can reach, so
    # the demoted cases must be the default); without four-card support for opener's second
    # suit, or with game-going values, the call has its stopped or unstopped fourth-suit rank.
    call_names = ['2C', '2D', '2H', '2S', '3C', '3D', '3H', '3S']
    prefer = []


# We'd rather explore for NT than rebid a 5-card major, but with
# six or more, we prefer the major.


class TwoSpadesJumpFourthSuitForcing(FourthSuitForcing):
    purpose = "Ask"
    preconditions = JumpFromPartnerLastBid(exact_size=1)
    call_names = '2S'
    prefer = []


class MaxLengthInPartnersFirstSuit(Constraint):
    """At most max_length cards in the first suit partner bid."""
    def __init__(self, max_length):
        self.max_length = max_length

    def expr(self, history, call):
        suits = [view.last_call.strain for view in history.partner.walk
                 if view.last_call is not None and view.last_call.strain in suit.SUITS]
        if not suits:
            return NO_CONSTRAINTS
        return expr_for_suit(suits[-1]) <= self.max_length


class ResponseToFourthSuitForcing(Rule):
    category = categories.Gadget
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.FourthSuitForcing)


class StopperInFouthSuit(Constraint):
    def expr(self, history, call):
        strain = history.partner.last_call.strain
        return stopper_expr_for_suit(strain)


class NotrumpResponseToFourthSuitForcing(ResponseToFourthSuitForcing):
    purpose = "Answer"
    preconditions = NotJumpFromLastContract()
    call_names = ['2N', '3N']
    shared_constraints = StopperInFouthSuit()
    prefer = []
    constraints = {'2N': points <= 14}  # a minimum; with more the jump to 3N


class NotrumpJumpResponseToFourthSuitForcing(ResponseToFourthSuitForcing):
    purpose = "Answer"
    preconditions = JumpFromLastContract()
    call_names = '3N'
    shared_constraints = [StopperInFouthSuit(), points >= 15]
    prefer = []


class DelayedSupportResponseToFourthSuitForcing(ResponseToFourthSuitForcing):
    purpose = "Answer"
    preconditions = [
        NotJumpFromLastContract(),
        DidBidSuit(positions.Partner),
        # This is our first mention of this suit for it to be "delayed support".
        InvertedPrecondition(DidBidSuit(positions.Me)),
    ]
    call_names = Call.suited_names_between('2D', '4H')
    # Three-card support without a stopper in the fourth suit (with one, notrump).
    shared_constraints = [MinimumCombinedLength(7), ConstraintNot(StopperInFouthSuit())]
    prefer = []


class RebidResponseToFourthSuitForcing(ResponseToFourthSuitForcing):
    purpose = "Answer"
    preconditions = [
        NotJumpFromLastContract(),
        DidBidSuit(positions.Me),
    ]
    # FIXME: The higher call should show additional length in that suit.
    call_names = Call.suited_names_between('2D', '4H')
    shared_constraints = NO_CONSTRAINTS
    fallback = 1  # the rebid says nothing more: no stopper, no delayed support


class FourthSuitResponseToFourthSuitForcing(ResponseToFourthSuitForcing):
    """Raising the fourth suit: four cards there without a stopper (with one, notrump)."""
    purpose = "Answer"
    preconditions = [
        NotJumpFromLastContract(),
        UnbidSuit(),
    ]
    call_names = Call.suited_names_between('3C', '4S')
    # Four cards there, no stopper (with one, notrump), and no three-card support for
    # partner's first suit (with it, the delayed support).
    shared_constraints = [MinLength(4), SufficientCombinedPoints(), ConstraintNot(StopperInFouthSuit()), MaxLengthInPartnersFirstSuit(2)]
    prefer = []


# FIXME: We should add an OpenerRebid of 3N over 2C P 2N P to show a minimum 22-24 HCP
# instead of jumping to 5N which just wastes bidding space.
# This is not covered in the book or the SAYC pdf.


class RebidAfterSecondNegative(Rule):
    """After 2C - 2D - 2x - 3C (the second negative: 0-2 hcp, no fit) opener is not forced, but
    the 3C is artificial so a pass is not available either (p94)."""
    preconditions = [
        StrongTwoClubOpeningBook(),
        Opened(positions.Me),
        LastBidHasSuit(positions.Me),  # after a 2N rebid partner's 3C is Stayman, not the second negative
        LastBidWas(positions.Partner, '3C'),
        LastBidWas(positions.RHO, 'P'),
    ]
    forcing = False


class RebidSuitAfterSecondNegative(RebidAfterSecondNegative):
    purpose = "Answer"
    preconditions = RebidSameSuit()
    call_names = ['3D', '3H', '3S']
    shared_constraints = MinLength(6)


class SecondNegative(ResponderRebid):
    purpose = "Answer"
    preconditions = [
        StrongTwoClubOpeningBook(),
        LastBidWas(positions.Me, '2D'),
        LastBidWas(positions.RHO, 'P'),
        LastBidHasSuit(positions.Partner),
    ]
    call_names = '3C'
    # Denies a fit, shows a max of 3 hcp
    shared_constraints = points < 3
    annotations = annotations.Artificial


class NotrumpResponse(Rule):
    category = categories.NotrumpSystem
    preconditions = [
        # 1N overcalls have systems on too, partner does not have to have opened
        LastBidHasAnnotation(positions.Partner, annotations.NotrumpSystemsOn),
    ]


class NotrumpGameInvitation(NotrumpResponse):
    purpose = "CharacterizeStrength"
    # This is an explicit descriptive rule, not a ToPlay rule.
    # ToPlay is 7-9, but 7 points isn't in game range.
    # Opposite 15-17: 9+, or 8 with a 5-card suit; a flat 8 passes (p6, h2).  Opposite a
    # balancing 1N (12-14) the combined 23 needs 9+ anyway.
    constraints = { '2N': ConstraintOr(MinimumCombinedPoints(24), ConstraintAnd(MinimumCombinedPoints(23), z3.Or(a_five_card_suit, points >= 9))) }
    prefer = []


class NotrumpGameAccept(NotrumpResponse):
    purpose = "Game"
    # This is an explicit descriptive rule, not a ToPlay rule.
    # FIXME: p13, h30 suggests we should make this jump with 7 in a minor topped by the AK.
    constraints = { '3N': MinimumCombinedPoints(25) }
    prefer = []


two_club_stayman_constraint = ConstraintAnd(
    MinimumCombinedPoints(23),
    z3.Or(hearts >= 4, spades >= 4)
)


four_five_stayman_constraint = ConstraintAnd(
    MinimumCombinedPoints(23),
    z3.Or(
        z3.And(hearts == 4, spades == 5),
        z3.And(hearts == 5, spades == 4),
    ),
)

minor_game_force_stayman_constraints = z3.And(
    points >= 13,
    z3.Or(clubs >= 5, diamonds >= 5)
)

# 2C is a very special snowflake and can lead into many sequences, thus it gets its own class.
class TwoLevelStayman(NotrumpResponse):
    purpose = "Miscellaneous"  # garbage Stayman is what is left for a weak hand; the asks are promoted below
    conditional_purposes = [
        (ConstraintAnd(z3.And(z3.Or(hearts == 4, spades == 4), hearts <= 5, spades <= 5), two_club_stayman_constraint), "Ask"),  # four-four: ask; a six-card major transfers
        (four_five_stayman_constraint, "Ask"),  # five-four: ask
        (minor_game_force_stayman_constraints, "Ask"),
    ]
    annotations = annotations.Stayman
    call_names = '2C'

    shared_constraints = ConstraintOr(
        minor_game_force_stayman_constraints,
        two_club_stayman_constraint,
        # Garbage stayman is a trade-off.  The fewer points you have the less likely
        # your partner will make 1N.  2D with only 6 is better than 1N with only 18 points.
        z3.And(spades >= 3, hearts >= 3,
            z3.Or(diamonds >= 5,
                z3.And(diamonds >= 4, points <= 3)
            ),
        ),
    )
    prefer = []


class BasicStayman(NotrumpResponse):
    annotations = annotations.Stayman
    shared_constraints = [z3.Or(hearts >= 4, spades >= 4)]
    prefer = []


class ThreeLevelStayman(BasicStayman):
    purpose = "AskLater"
    conditional_purposes = [(z3.Or(hearts == 4, spades == 4), "Ask")]  # four-four or five-four: ask; one long major: transfer
    preconditions = NotJumpFromPartnerLastBid()
    call_names = '3C'
    shared_constraints = MinimumCombinedPoints(25)


class StolenTwoClubStayman(BasicStayman):
    purpose = "AskLater"
    conditional_purposes = [(z3.Or(hearts == 4, spades == 4), "Ask")]  # four-four or five-four: ask; one long major: transfer
    preconditions = LastBidWas(positions.RHO, '2C')
    call_names = 'X'
    shared_constraints = MinimumCombinedPoints(23)


class StolenThreeClubStayman(BasicStayman):
    purpose = "AskLater"
    conditional_purposes = [(z3.Or(hearts == 4, spades == 4), "Ask")]  # four-four or five-four: ask; one long major: transfer
    preconditions = LastBidWas(positions.RHO, '3C')
    call_names = 'X'
    shared_constraints = MinimumCombinedPoints(25)


class NotrumpTransferResponse(NotrumpResponse):
    annotations = annotations.Transfer


class JacobyTransfer(NotrumpTransferResponse):
    """A transfer to a five-card major: the longer major; with five-five, hearts first with a
    weak hand and spades first with game values (p11 h20)."""
    purpose = "MajorDiscovery"
    preconditions = NotJumpFromPartnerLastBid()
    call_names = ['2D', '3D', '4D', '2H', '3H', '4H']
    constraints = {
        ('2D', '3D', '4D'): hearts >= 5,
        ('2H', '3H', '4H'): spades >= 5,
    }
    prefer = [
        (('2D', '3D', '4D'), hearts > spades),
        (('2H', '3H', '4H'), spades > hearts),
        (('2H', '3H', '4H'), z3.And(hearts == spades, points >= 10)),
        Cheapest('2D', '3D', '4D'), Cheapest('2H', '3H', '4H'),
    ]


class TwoSpadesRelay(NotrumpTransferResponse):
    purpose = "Ask"
    preconditions = InvertedPrecondition(LastBidWas(positions.RHO, 'X'))  # over their double the redouble transfers
    constraints = {
        '2S': z3.And(z3.Or(diamonds >= 6, clubs >= 6), hearts <= 3, spades <= 3, points <= 7),  # weak; with a four-card major, Stayman
    }
    prefer = []


class QuantitativeFourNotrumpJumpConstraint(Constraint):
    """Invites opener to bid 6N if at a maximum, otherwise pass: the notrump slam number is
    reached opposite partner's maximum but not opposite the minimum (a hand that reaches it
    opposite the minimum bids the slam itself)."""
    def slam_points(self):
        return points_for_sound_notrump_bid_at_level[6]

    def expr(self, history, call):
        slam = self.slam_points()
        return z3.And(points + history.partner.max_points >= slam, points + history.partner.min_points < slam)


class QuantitativeFourNotrumpJump(NotrumpResponse):
    purpose = "Slam"  # a slam invitation outranks the game accept it would otherwise negate
    call_names = '4N'
    preconditions = JumpFromLastContract()
    shared_constraints = QuantitativeFourNotrumpJumpConstraint()
    annotations = annotations.QuantitativeFourNotrumpJump
    prefer = []


class ResponseToQuantitativeFourNotrump(Rule):
    purpose = "Answer"
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.QuantitativeFourNotrumpJump)
    constraints = {
        # This is only needed to make the P vs. 5N decision, 6N == 17 is provided by NaturalNotrump.
        'P': points == 15,
        '5N': points == 16,
    }


doubled_transfer_redouble_hand = ConstraintAnd(MinLengthInLastContractSuit(5), ThreeOfTheTopFiveInLastContractSuit())


class RedoubleHandOverDoubledTransfer(Constraint):
    """RHO doubled partner's transfer and we hold five good cards in the doubled suit: the
    redouble (p18 h43).  Undoubled, no such hand."""
    def expr(self, history, call):
        rho = history.rho.last_call
        if rho is None or not rho.is_double():
            return z3.BoolVal(False)
        return doubled_transfer_redouble_hand.expr(history, call)


class AcceptTransfer(Rule):
    category = categories.Relay
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.Transfer),
        # Relative to the last contract, so that 1N P 2D (2S) 3H is the plain completion.
        NotJumpFromLastContract(),
    ]
    shared_constraints = SupportForTransferOverInterference()
    fallback = 1  # completing the transfer is what is left when no better answer fits
    # FIXME: Should these generically be artifical?  Is a double of a transfer accept lead-directing?


class AcceptTransferToHearts(AcceptTransfer):
    purpose = "Answer"
    preconditions = LastBidHasStrain(positions.Partner, suit.DIAMONDS)
    call_names = ['2H', '3H']


class AcceptTransferToSpades(AcceptTransfer):
    purpose = "Answer"
    preconditions = LastBidHasStrain(positions.Partner, suit.HEARTS)
    call_names = ['2S', '3S']


class AcceptTransferToClubs(AcceptTransfer):
    purpose = "Answer"
    preconditions = LastBidHasStrain(positions.Partner, suit.SPADES)
    call_names = '3C'
    # We aren't actually showing clubs, so maybe a double is lead-directing and thus this is artificial?
    annotations = annotations.Artificial


class SuperAcceptTransfer(Rule):
    category = categories.Relay
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.Transfer),
        JumpFromPartnerLastBid(exact_size=1),
        # Over a suit overcall the three-level completion is the plain accept (three cards,
        # see AcceptTransfer), not a super-accept; two Relay rules claiming one call would drop it.
        InvertedPrecondition(LastBidHasSuit(positions.RHO)),
    ]
    # FIXME: This should use support points, but MinimumSupportPointsForPartnersLastSuit will be confused by the transfer.
    shared_constraints = [points >= 17, ConstraintNot(RedoubleHandOverDoubledTransfer())]
    prefer = []


class SuperAcceptTransferToHearts(SuperAcceptTransfer):
    purpose = "Answer"
    preconditions = LastBidHasStrain(positions.Partner, suit.DIAMONDS)
    call_names = '3H'
    shared_constraints = hearts >=4


class SuperAcceptTransferToSpades(SuperAcceptTransfer):
    purpose = "Answer"
    preconditions = LastBidHasStrain(positions.Partner, suit.HEARTS)
    call_names = '3S'
    shared_constraints = spades >=4


class OpenerOverDoubledTransfer(Rule):
    """RHO doubled partner's transfer to a major (1N P 2H X): with three or more of partner's
    major opener completes the transfer as usual (AcceptTransfer), with a doubleton he passes
    (p17 h46) and with five good cards in the doubled suit he redoubles (p18 h43)."""
    category = categories.Relay
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.Transfer),
        LastBidHasStrain(positions.Partner, (suit.DIAMONDS, suit.HEARTS)),
        LastBidWas(positions.RHO, 'X'),
    ]


class PassDoubledTransferToHearts(OpenerOverDoubledTransfer):
    purpose = "Answer"
    preconditions = LastBidHasStrain(positions.Partner, suit.DIAMONDS)
    call_names = 'P'
    shared_constraints = [hearts <= 2, ConstraintNot(RedoubleHandOverDoubledTransfer())]
    prefer = []


class PassDoubledTransferToSpades(OpenerOverDoubledTransfer):
    purpose = "Answer"
    preconditions = LastBidHasStrain(positions.Partner, suit.HEARTS)
    call_names = 'P'
    shared_constraints = [spades <= 2, ConstraintNot(RedoubleHandOverDoubledTransfer())]
    prefer = []


class RedoubleDoubledTransfer(OpenerOverDoubledTransfer):
    purpose = "Answer"
    preconditions = LastBidHasStrain(positions.Partner, (suit.DIAMONDS, suit.HEARTS))
    call_names = 'XX'
    shared_constraints = doubled_transfer_redouble_hand
    prefer = []


class CompleteOwnTransferAfterDouble(Rule):
    """Our transfer was doubled and opener did not complete it (he passed with a doubleton or
    redoubled with the doubled suit): with a weak hand we bid our major ourselves; stronger
    hands rebid as after a completed transfer."""
    category = categories.Relay
    preconditions = [
        LastBidHasAnnotation(positions.Me, annotations.Transfer),
        LastBidWas(positions.LHO, 'X'),
        EitherPrecondition(LastBidWas(positions.Partner, 'P'), LastBidWas(positions.Partner, 'XX')),
        LastBidWas(positions.RHO, 'P'),
    ]
    shared_constraints = points <= 7
    prefer = []


class CompleteOwnTransferToHeartsAfterDouble(CompleteOwnTransferAfterDouble):
    purpose = "Answer"
    preconditions = LastBidHasStrain(positions.Me, suit.DIAMONDS)
    call_names = '2H'


class CompleteOwnTransferToSpadesAfterDouble(CompleteOwnTransferAfterDouble):
    purpose = "Answer"
    preconditions = LastBidHasStrain(positions.Me, suit.HEARTS)
    call_names = '2S'


class ResponseAfterTransferToClubs(Rule):
    purpose = "Answer"
    category = categories.Relay # Is this right?
    preconditions = [
        LastBidWas(positions.Partner, '3C'),
        LastBidHasAnnotation(positions.Me, annotations.Transfer),
    ]
    constraints = {
        'P': clubs >= 6,
        '3D': diamonds >= 6,
    }
    prefer = []


class RebidAfterJacobyTransfer(Rule):
    preconditions = LastBidHasAnnotation(positions.Me, annotations.Transfer)
    # Our initial transfer could have been with 0 points, rebidding shows points.
    shared_constraints = points >= 8


class NotrumpRebidAfterJacobyTransfer(RebidAfterJacobyTransfer):
    """After a completed transfer, 2N invites with 8-9 (p6); without this rule the natural 2N
    read 7-9 and opener's game acceptance needed a point too many."""
    purpose = "CharacterizeStrength"
    call_names = '2N'
    shared_constraints = points <= 9


# FIXME: We need this over higher-level transfers as well to replace the NaturalSuited responses.
class SpadesRebidAfterHeartsTransfer(RebidAfterJacobyTransfer):
    purpose = "MajorDiscovery"
    preconditions = LastBidWas(positions.Me, '2D')
    # FIXME: We should not need to manually cap 2S.  We can infer that we have < 10 or we would have transfered to hearts first.
    # FIXME: If we had a 6-5 we would raise directly to game instead of bothering to mention the other major?
    constraints = { '2S': z3.And(spades >= 5, points >= 8, points <= 9) }


class HeartsRebidAfterSpadesTransfer(RebidAfterJacobyTransfer):
    purpose = "MajorDiscovery"
    preconditions = LastBidWas(positions.Me, '2H')
    constraints = {
        # A 3H rebid shows slam interest.  Currently assuming that's 13+?
        # Maybe the 3H bid requires_planning?
        '3H': points >= 13,
        # A jump to 4H and partner choses 4H or 4S, no slam interest. p11
        '4H': points >= 10,
    }
    shared_constraints = hearts >= 5
    prefer = []


class GameRaiseAfterJacobyTransfer(RebidAfterJacobyTransfer):
    """After the transfer is completed, the raise to game shows a six-card major and 8+ (p6 h1:
    4S on K74.9.J98.KJT742; p11 h21: 4H on 97.A2.KJ9832.J76 -- "bid 2D then raise to 4H";
    Texas transfers are "not strictly part of SAYC").  With 7 the raise to three invites."""
    shared_constraints = MinLength(6)


class GameRaiseAfterTransferToHearts(GameRaiseAfterJacobyTransfer):
    purpose = "Support"
    preconditions = LastBidWas(positions.Partner, '2H')
    call_names = '4H'


class GameRaiseAfterTransferToSpades(GameRaiseAfterJacobyTransfer):
    purpose = "Support"
    preconditions = LastBidWas(positions.Partner, '2S')
    call_names = '4S'


game_raises_after_transfer = set([GameRaiseAfterTransferToHearts, GameRaiseAfterTransferToSpades])


class NewMinorRebidAfterJacobyTransfer(RebidAfterJacobyTransfer):
    purpose = "MinorDiscovery"
    call_names = '3C', '3D'
    # Minors are not worth mentioning after a jacoby transfer unless we have 5 of them and game-going values.
    # FIXME: It seems like this should imply some number of honors in the bid suit, but there may be times
    # when we have 5+ spot cards in a minor and this looks better than bidding 3N.
    shared_constraints = [MinLength(5), MinimumCombinedPoints(25)]


class StaymanResponse(Rule):
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.Stayman)
    category = categories.NotrumpSystem


class NoStolenMajor(Constraint):
    """RHO overcalled Stayman in a major: four cards there are shown by the double, not by
    bidding the other major."""
    def expr(self, history, call):
        rho = history.rho.last_call
        if rho is None or rho.strain not in suit.MAJORS:
            return NO_CONSTRAINTS
        return expr_for_suit(rho.strain) <= 3


class NaturalStaymanResponse(StaymanResponse):
    purpose = "Answer"
    preconditions = NotJumpFromPartnerLastBid()
    constraints = {
        ('2H', '3H'): hearts >= 4,
        ('2S', '3S'): spades >= 4,
    }
    shared_constraints = NoStolenMajor()  # over their overcall of a major, four of it is the double
    prefer = []  # four-four: hearts (up the line)


stayman_redouble_hand = clubs >= 5


class RedoubleHandOverDoubledStayman(Constraint):
    """RHO doubled Stayman and we hold five clubs: the redouble (p17 h38)."""
    def expr(self, history, call):
        rho = history.rho.last_call
        if rho is None or not rho.is_double():
            return z3.BoolVal(False)
        return stayman_redouble_hand


class PassStaymanResponse(StaymanResponse):
    purpose = "Answer"
    call_names = 'P'
    # Over their double or overcall (p17 h37-39), or over partner's Stayman double of their 2C.
    preconditions = EitherPrecondition(InvertedPrecondition(LastBidWas(positions.RHO, 'P')), LastBidWas(positions.Partner, 'X'))
    shared_constraints = [hearts <= 3, spades <= 3, ConstraintNot(RedoubleHandOverDoubledStayman())]  # no major to show, no redouble
    prefer = []


class DiamondStaymanResponse(StaymanResponse):
    purpose = "Answer"
    preconditions = [
        NotJumpFromPartnerLastBid(),
        # If RHO called a new suit or doubled, pass takes on this meaning.
        LastBidWas(positions.RHO, 'P'),
    ]
    call_names = ['2D', '3D']
    shared_constraints = NO_CONSTRAINTS
    annotations = annotations.Artificial
    fallback = 1  # no major to show


# FIXME: There must be a simpler way to write history-variant rules like this.
# FIXME: This whole rule feels like a special-case penalty double?
class StolenHeartStaymanResponse(StaymanResponse):
    constraints = { 'X': hearts >= 4 }
    # The double stands in for the Stayman response RHO's bid took away.
    annotations = annotations.Artificial
    prefer = []


class StolenTwoHeartStaymanResponse(StolenHeartStaymanResponse):
    purpose = "Answer"
    preconditions = LastBidWas(positions.RHO, '2H')


class StolenThreeHeartStaymanResponse(StolenHeartStaymanResponse):
    purpose = "Answer"
    preconditions = LastBidWas(positions.RHO, '3H')


class StolenSpadeStaymanResponse(StaymanResponse):
    constraints = { 'X': spades >= 4 }
    # The double stands in for the Stayman response RHO's bid took away.
    annotations = annotations.Artificial
    prefer = []


class StolenTwoSpadeStaymanResponse(StolenSpadeStaymanResponse):
    purpose = "Answer"
    preconditions = LastBidWas(positions.RHO, '2S')


class StolenThreeSpadeStaymanResponse(StolenSpadeStaymanResponse):
    purpose = "Answer"
    preconditions = LastBidWas(positions.RHO, '3S')


class RedoubleAfterDoubledStayman(StaymanResponse):
    purpose = "Answer"
    preconditions = LastBidWas(positions.RHO, 'X')
    constraints = { 'XX': z3.And(stayman_redouble_hand, hearts <= 3, spades <= 3) }  # with a major to show, show it
    prefer = []


class ResponseToOneNotrump(NotrumpResponse):
    preconditions = LastBidWas(positions.Partner, '1N')


class LongMinorGameInvitation(ResponseToOneNotrump):
    purpose = "LongSuitInvitation"
    call_names = ['3C', '3D']
    shared_constraints = [MinLength(6), TwoOfTheTopThree(), points >= 5, points <= 12]  # with more, Stayman then the minor forces to game
    # FIXME: Should use the longer suit preference pattern.
    prefer = []


class LongMajorSlamInvitation(ResponseToOneNotrump):
    purpose = "LongSuitInvitation"
    call_names = ['3H', '3S']
    shared_constraints = [MinLength(6), TwoOfTheTopThree(), points >= 14]
    # FIXME: Should use the longer suit preference pattern.
    prefer = []


class StaymanRebid(Rule):
    preconditions = LastBidHasAnnotation(positions.Me, annotations.Stayman)
    category = categories.NotrumpSystem


class GarbagePassStaymanRebid(StaymanRebid):
    purpose = "Answer"
    # GarbageStayman only exists at the 2-level
    preconditions = LastBidWas(positions.Me, '2C')
    call_names = 'P'
    shared_constraints = points <= 7


class MinorGameForceRebid(StaymanRebid):
    purpose = "Discovery"  # a game-forcing minor keeps the slam exploration alive before 3N
    call_names = ['3C', '3D']
    shared_constraints = [MinLength(5), minor_game_force_stayman_constraints]
    prefer = []


class OtherMajorRebidAfterStayman(StaymanRebid):
    purpose = "MajorDiscovery"
    preconditions = [
        InvertedPrecondition(RaiseOfPartnersLastSuit()),
    ]
    # Rebidding the other major shows 5-4, with invitational or game-force values.
    constraints = {
        '2H': [points >= 8, hearts == 5, spades == 4],
        '2S': [points >= 8, spades == 5, hearts == 4],

        # # Use MinimumCombinedPoints instead of MinHighCardPoints as 3-level bids
        # # are game forcing over both 2C and 3C Stayman responses.
        '3H': [MinimumCombinedPoints(25), hearts == 5, spades == 4],
        '3S': [MinimumCombinedPoints(25), spades == 5, hearts == 4],
    }
    prefer = [Highest('2H', '2S', '3H', '3S')]  # the game force before the invitation


class RedoubleTransferToMinor(NotrumpResponse):
    purpose = "Ask"
    preconditions = [
        LastBidWas(positions.Partner, '1N'),
        LastBidWas(positions.RHO, 'X'),
    ]
    call_names = 'XX'
    annotations = annotations.Transfer
    category = categories.Relay
    shared_constraints = z3.And(
        z3.Or(diamonds >= 6, clubs >= 6),
        points <= 4, # NT is likely to be uncomfortable.
    )
    prefer = []


# FIXME: Should share code with AcceptTransfer, except NotJumpFromPartner's LastBid is confused by 'XX'
class AcceptTransferToTwoClubs(Rule):
    purpose = "Answer"
    category = categories.Relay
    call_names = '2C'
    preconditions = [
        LastBidWas(positions.Partner, 'XX'),
        LastBidWas(positions.RHO, 'P'),
        LastBidHasAnnotation(positions.Partner, annotations.Transfer),
    ]
    annotations = annotations.Artificial
    shared_constraints = NO_CONSTRAINTS
    prefer = []


class ResponseAfterTransferToTwoClubs(Rule):
    purpose = "Answer"
    category = categories.Relay
    preconditions = [
        LastBidWas(positions.Partner, '2C'),
        LastBidHasAnnotation(positions.Me, annotations.Transfer),
    ]
    constraints = {
        'P': clubs >= 6,
        '2D': diamonds >= 6,
    }


class DirectOvercall(Rule):
    preconditions = EitherPrecondition(
            LastBidHasAnnotation(positions.RHO, annotations.Opening),
            AndPrecondition(
                LastBidHasAnnotation(positions.LHO, annotations.Opening),
                LastBidWas(positions.Partner, 'P'),
                InvertedPrecondition(LastBidWas(positions.RHO, 'P'))
            )
        )


balancing_precondition = AndPrecondition(
    LastBidHasAnnotation(positions.LHO, annotations.Opening),
    LastBidWas(positions.Partner, 'P'),
    LastBidWas(positions.RHO, 'P'),
)

class BalancingOvercall(Rule):
    preconditions = balancing_precondition


class StandardDirectOvercall(DirectOvercall):
    preconditions = [
        LastBidHasSuit(positions.RHO),
        NotJumpFromLastContract(),
        UnbidSuit(),
    ]
    shared_constraints = [
        MinLength(5),
        ThreeOfTheTopFiveOrBetter(),
        # With 4 cards in RHO's suit, we're likely to be doubled -- unless we are too strong
        # to pass and too long in their suit to double (18+: overcall anyway).
        ConstraintOr(MaxLengthInLastContractSuit(3), points >= 18),
    ]
    annotations = annotations.StandardOvercall
    forcing = False # We're limited by the fact that we didn't double.  Partner is allowed to pass.


class OneLevelStandardOvercall(StandardDirectOvercall):
    purpose = "MajorDiscovery"
    shared_constraints = points >= 8
    call_names = ['1D', '1H', '1S']
    # A five-card major before a minor, the longer major first, spades with five-five.
    prefer = [('1H', hearts > spades), '1S', '1H', '1D']

# This is replaced by Cappelletti for now.  We could do that with a category instead.
# class DirectNotrumpDouble(DirectOvercall):
#     preconditions = LastBidWas(positions.RHO, '1N')
#     call_names = 'X'
#     shared_constraints = z3.And(points >= 15, points <= 17, balanced)


class TwoLevelStandardOvercall(StandardDirectOvercall):
    purpose = "Discovery"
    # 10+, or 9 with "a substantial suit or excellent distribution -- two five-card suits, for
    # example" (p99): a six-card suit (the shared three-of-the-top-five applies) or 5-5.
    shared_constraints = ConstraintOr(
        points >= 10,
        ConstraintAnd(points >= 9, MinLength(6)),
        ConstraintAnd(points >= 9, MinLength(5), z3.Not(at_most_one_five_card_suit)),
    )
    call_names = ['2C', '2D', '2H', '2S']
    # A major before a minor, the longer suit first, the higher of two equal suits.
    prefer = [('2H', hearts > spades), '2S', '2H', ('2C', clubs > diamonds), '2D', '2C']


class ResponseToStandardOvercall(Rule):
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.StandardOvercall)


# This is nearly identical to TheLaw, it just notes that you have 6 points.
# All it does is cause one test to fail.  It may not be worth having.
class RaiseResponseToStandardOvercall(ResponseToStandardOvercall):
    purpose = "Support"
    conditional_purposes = [(minor_raise_before_notrump, "SupportMinorWithFour"), (minor_raise_with_five, "SupportMinorWithFive")]  # see constraints.minor_raise_before_notrump
    preconditions = [
        RaiseOfPartnersLastSuit(),
        NotJumpFromLastContract()
    ]
    call_names = Call.suited_names_between('2D', '3S')
    shared_constraints = [
        SupportForPartnerLastBid(3),
        MaxLengthInPartnersLastSuit(3),  # with four the jump raise is preemptive (p101 h9), the cuebid a limit raise
        points >= 6,
        MaximumSupportPointsForPartnersLastSuit(10),  # the cuebid shows 11+
    ]


class CuebidResponseToStandardOvercall(ResponseToStandardOvercall):
    purpose = partner_suit_support_purpose
    conditional_purposes = [(partner_minor_raise_before_notrump, "SupportMinorWithFour", "SupportMinors"), (partner_minor_raise_with_five, "SupportMinorWithFive", "SupportMinors")]  # see constraints.minor_raise_before_notrump
    preconditions = [
        CueBid(positions.LHO),
        NotJumpFromLastContract()
    ]
    call_names = Call.suited_names_between('2C', '3H')
    shared_constraints = [
        SupportForPartnerLastBid(3),
        MinimumSupportPointsForPartnersLastSuit(11),
    ]
    # A cuebid of their suit shows nothing in it; it agrees partner's suit, so its eleven
    # are read as support points there and the natural games can add them up.
    annotations = [annotations.Artificial, annotations.CuebidAdvance, annotations.SupportsPartnersSuit]


# The natural game (SufficientCombinedPoints over the eleven the cuebid promised) when the
# combined support points are there, else the extras jump, else the cheapest rebid.


class RebidAfterCuebidResponseToOvercall(Rule):
    """Overcaller's reply to the cuebid advance (a limit raise or better of our suit,
    p137, structured like ResponseToJordan): the natural game in our suit when the
    combined support points reach it, a jump with extras short of that, otherwise the
    cheapest rebid of it, which advancer passes holding only the limit raise and raises
    with more (NaturalSuited, valued in support points).  Before 2026-09-01 no rule
    covered ANY call here and the overcaller was stuck (autobid-for-none: the cuebid is
    forcing, so even the pass is unavailable)."""
    category = categories.Gadget
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.CuebidAdvance),
        RebidSameSuit(),
    ]


class MinimumRebidAfterCuebidResponse(RebidAfterCuebidResponseToOvercall):
    purpose = "Answer"
    preconditions = NotJumpFromLastContract()
    call_names = ('2D', '2H', '2S', '3C', '3D', '3H', '3S', '4C', '4D')
    shared_constraints = MaximumSupportPointsForSuitOfCall(14)  # fifteen jumps
    annotations_per_call = dict.fromkeys(('2D', '2H', '2S', '3C', '3D', '3H', '3S', '4C', '4D'),
                                         annotations.Signoff)
    forcing = False
    prefer = []


class ExtrasRebidAfterCuebidResponse(RebidAfterCuebidResponseToOvercall):
    """The single-jump rebid of our suit: extra values, still short of bidding game
    ourselves."""
    purpose = "Answer"
    preconditions = JumpFromLastContract(exact_size=1)
    call_names = ('3C', '3D', '3H', '3S', '4C', '4D')
    # Fifteen support points: opposite the cuebid's eleven that is short of the table's
    # game (25 for a major, 28 for a minor); advancer's natural raise adds up from a maximum.
    shared_constraints = MinimumSupportPointsForSuitOfCall(15)
    # In a major, 16 opposite the cuebid's 10 is the game; in a minor it is still an invitation.
    constraints = {
        ('3H', '3S'): MaximumSupportPointsForSuitOfCall(15),
        ('3C', '3D', '4C', '4D'): MaximumSupportPointsForSuitOfCall(16),
    }
    annotations_per_call = dict.fromkeys(('3C', '3D', '3H', '3S', '4C', '4D'),
                                         annotations.Signoff)
    forcing = False
    prefer = []


class NewSuitResponseToStandardOvercall(ResponseToStandardOvercall):
    purpose = "Discovery"
    preconditions = [
        TheyOpened(),
        LastBidHasAnnotation(positions.Partner, annotations.StandardOvercall),
        NotJumpFromLastContract(),
        UnbidSuit()
    ]
    call_names = Call.suited_names_between('1H', '3S')
    # Advancer's new suit is not forcing: 8+ with a good five-card suit (p101 h9-h11 cuebid
    # with 11+; the new suit is the constructive alternative).  Before this it was read as
    # forcing and needed the points for partner's rebid.
    shared_constraints = [
        MinLength(5),
        TwoOfTheTopThree(),
        points >= 8,
    ]
    forcing = False


class LeadDirectingDouble(Rule):
    """Doubles of the opponents' artificial bids are lead-directing (p124)."""
    call_names = 'X'
    preconditions = [
        LastBidHasAnnotation(positions.RHO, annotations.Artificial),
        LastBidHasSuit(positions.RHO),
    ]
    # Implies Artificial; the forcing oracle knows partner may pass it.
    annotations = annotations.LeadDirectingDouble


class LeadDirectingDoubleOfArtificialSuitBid(LeadDirectingDouble):
    """"Doubles of artificial bids are lead-directing" (p124): a double of Stayman, a transfer,
    a strong 2C, a waiting 2D, a splinter, a cuebid of our suit and the like asks for the lead
    of the suit named, five or more with three of the top five honors (p124 h30, h31).  Only
    when the suit named is not one our side has shown: a double of their cuebid of our suit
    (Michaels over our opening) is about values, not the lead.  Not above game (the contract
    is settled; doubles there are penalty).  The response to an ace-ask has its own holding
    requirement in the rule below, which outranks this one."""
    purpose = "Penalize"
    preconditions = [
        LastBidWasBelowGame(),
        InvertedPrecondition(LastContractSuitBidBy(positions.Me)),
        InvertedPrecondition(LastContractSuitBidBy(positions.Partner)),
    ]
    shared_constraints = [MinLengthInLastContractSuit(5), ThreeOfTheTopFiveInLastContractSuit()]


class LeadDirectingDoubleOfAceAskingResponse(LeadDirectingDouble):
    """A double of the response to Blackwood or Gerber asks for that suit: a void (for the
    ruff) or the ace and king (p124 h32).  Gadget category: the more specific meaning wins
    over the general five-card holding (two rules of one category for one call drop it)."""
    purpose = "Penalize"
    category = categories.Gadget
    preconditions = EitherPrecondition(
        LastBidHasAnnotation(positions.LHO, annotations.Blackwood),
        LastBidHasAnnotation(positions.LHO, annotations.Gerber),
    )
    shared_constraints = VoidOrAceKingInLastContractSuit()


lead_directing_doubles = set([LeadDirectingDoubleOfArtificialSuitBid, LeadDirectingDoubleOfAceAskingResponse])


class DirectOvercall1N(DirectOvercall):
    purpose = "EnterNotrumpSystem"
    call_names = '1N'
    shared_constraints = [points >= 15, points <= 18, balanced, StopperInRHOSuit()]
    annotations = annotations.NotrumpSystemsOn


class BalancingOvercallOverSuitedOpen(BalancingOvercall):
    preconditions = LastBidHasAnnotation(positions.LHO, annotations.OneLevelSuitOpening)


# Balancing after their raised partscore dies: 1D P 2D P P or 1H P 2H P P (p140-142).
# Either opponent may have opened: 1D P 2C P 2D P P is opener's own rebid dying at the two
# level, the same balancing spot as a raise (from play, 2026-08-29).
two_level_balancing_precondition = AndPrecondition(
    TheyOpened(),
    TheyRaisedToTwoAndStopped(),
    InvertedPrecondition(HasBid(positions.Me)),
    InvertedPrecondition(HasBid(positions.Partner)),
)

two_level_balancing_suits = suit_preference(['2H', '2S', '3C', '3D'])

class BalancingSuitedOvercallOverRaise(Rule):
    purpose = "Compete"
    preconditions = [
        two_level_balancing_precondition,
        NotJumpFromLastContract(),
        UnbidSuit(),
    ]
    call_names = two_level_balancing_suits.call_names
    prefer = two_level_balancing_suits
    shared_constraints = [
        points >= 7,
        MinLength(5),
        MaxLengthInLastContractSuit(3),
    ]
    forcing = False


class BalancingDoubleOverRaise(Rule):
    purpose = "Ask"
    preconditions = two_level_balancing_precondition
    call_names = 'X'
    annotations = annotations.TakeoutDouble
    shared_constraints = [
        points >= 9,
        SupportForSuitsOtherThanLastContract(),
        MaxLengthInLastContractSuit(2),
    ]


class BalancingNotrumpOvercall(BalancingOvercallOverSuitedOpen):
    purpose = "EnterNotrumpSystem"
    constraints = {
        '1N': z3.And(points >= 12, points <= 14),
        '2N': z3.And(points >= 19, points <= 21),
    }
    shared_constraints = [balanced, StoppersInOpponentsSuits()] # Only RHO has a suit.
    annotations = annotations.NotrumpSystemsOn
    prefer = []


balancing_suited_overcalls = suit_preference(['1D', '1H', '1S', '2C', '2D', '2H', '2S'])

class BalancingSuitedOvercall(BalancingOvercallOverSuitedOpen):
    purpose = "Compete"
    preconditions = [
        NotJumpFromLastContract(),
        UnbidSuit(),
    ]
    constraints = {
        (      '1D', '1H', '1S'): points >= 5,
        ('2C', '2D', '2H', '2S'): points >= 7,
    }
    call_names = balancing_suited_overcalls.call_names
    prefer = balancing_suited_overcalls
    shared_constraints = [
        MinLength(5),
        ThreeOfTheTopFiveOrBetter(),
        # Even when balancing, we should not have strength in their suit.
        MaxLengthInLastContractSuit(3),
    ]
    annotations = annotations.BalancingOvercall
    forcing = False # We're limited by the fact that we didn't double.  Partner is allowed to pass.


class ResponseToBalancingOvercall(Rule):
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.BalancingOvercall)


class RaiseResponseToBalancingOvercall(ResponseToBalancingOvercall):
    """Advancing a balancing suited overcall (p144): partner balanced on a hand up to a king
    lighter than a direct overcall, so the single raise is 7-11 and the jump raise 12-14 with
    four trumps (h16-h18).  Without these the advance was left to the Law of Total Tricks."""
    preconditions = RaiseOfPartnersLastSuit()
    shared_constraints = SupportForPartnerLastBid(3)


class SingleRaiseResponseToBalancingOvercall(RaiseResponseToBalancingOvercall):
    purpose = "Support"
    conditional_purposes = [(minor_raise_before_notrump, "SupportMinorWithFour"), (minor_raise_with_five, "SupportMinorWithFive")]  # see constraints.minor_raise_before_notrump
    preconditions = NotJumpFromLastContract()
    call_names = Call.suited_names_between('2D', '3S')
    shared_constraints = z3.And(points >= 7, points <= 11)
    prefer = []


class JumpRaiseResponseToBalancingOvercall(RaiseResponseToBalancingOvercall):
    purpose = "Support"
    preconditions = JumpFromLastContract(exact_size=1)
    call_names = Call.suited_names_between('3D', '4S')
    shared_constraints = [z3.And(points >= 12, points <= 14), SupportForPartnerLastBid(4)]
    prefer = []


class NotrumpResponseToBalancingOvercall(ResponseToBalancingOvercall):
    """Notrump over partner's balancing suited overcall (p144): 1N 9-12, 2N 12-14, 3N 15+,
    with a stopper in their suit and tolerance for partner's."""
    purpose = "CharacterizeStrength"
    constraints = {
        '1N': z3.And(points >= 9, points <= 11),  # twelve invites with 2N
        '2N': z3.And(points >= 12, points <= 14),
        '3N': points >= 15,
    }
    shared_constraints = [StoppersInOpponentsSuits(), SupportForPartnerLastBid(2)]
    prefer = [Highest('1N', '2N', '3N')]  # the highest the hand is worth


balancing_jump_suited_overcalls = suit_preference(Call.suited_names_between('2D', '3H'))

# A preempt is for less than an opening hand.  An opening preempt is for a hand that would not
# open at the one level (the opening rule for the seat); a weak jump overcall is for at most
# eleven high card points, however long the suit.
preempt_weak_opening = ConstraintNot(OpeningRuleConstraint())
preempt_weak_overcall = high_card_points <= 11


class BalancingJumpSuitedOvercall(BalancingOvercallOverSuitedOpen):
    purpose = "Preempt"
    conditional_purposes = [(preempt_weak_overcall, "PreemptWeak")]
    preconditions = [
        JumpFromLastContract(exact_size=1),
        UnbidSuit(),
    ]
    call_names = balancing_jump_suited_overcalls.call_names
    prefer = balancing_jump_suited_overcalls
    shared_constraints = [
        points >= 12,
        MinLength(6),
        ThreeOfTheTopFiveOrBetter(),
        # Even when balancing, we should not have strength in their suit.
        MaxLengthInLastContractSuit(3),
    ]
    forcing = False # We're limited by the fact that we didn't double.  Partner is allowed to pass.


class MichaelsCuebid(object):
    preconditions = [
        NotJumpFromLastContract(),
        InvertedPrecondition(UnbidSuit()),
        # Michaels is only on if the opponents have only bid one suit.
        UnbidSuitCountRange(3, 3),
    ]
    # FIXME: 3S may force partner to bid 4H with possibly 0 points!
    # The weak range needs suit quality -- two of the top five in both suits (standard
    # practice, agreed 2026-08-29; p104 h1 passes with T8753/JT432, h5 overcalls 1S with
    # Q9863 spades; h2 cuebids with QT984, h4 with QT9865); the strong range is judged by
    # strength alone.
    constraints = {
        ('2C', '2D', '3C', '3D'): z3.And(
            hearts >= 5, spades >= 5,
            z3.Or(points >= 15, z3.And(two_of_the_top_five_hearts, two_of_the_top_five_spades))),
        ('2H', '3H'): z3.And(
            spades >= 5, z3.Or(clubs >= 5, diamonds >= 5),
            z3.Or(points >= 15, z3.And(two_of_the_top_five_spades,
                                       z3.Or(z3.And(clubs >= 5, two_of_the_top_five_clubs),
                                             z3.And(diamonds >= 5, two_of_the_top_five_diamonds))))),
        ('2S', '3S'): z3.And(
            hearts >= 5, z3.Or(clubs >= 5, diamonds >= 5),
            z3.Or(points >= 15, z3.And(two_of_the_top_five_hearts,
                                       z3.Or(z3.And(clubs >= 5, two_of_the_top_five_clubs),
                                             z3.And(diamonds >= 5, two_of_the_top_five_diamonds))))),
    }
    annotations = annotations.MichaelsCuebid
    # Mini-maxi (p103, the booklet's recommendation): weak or very strong; the middle range
    # 13-14 overcalls and shows the second suit later (p105 h7 bids 1S on a 13-count 5-5).
    shared_constraints = z3.Or(z3.And(6 <= points, points <= 12), 15 <= points)


class DirectMichaelsCuebid(MichaelsCuebid, DirectOvercall):
    purpose = "TwoSuiter"
    preconditions = CueBid(positions.RHO)


class BalancingMichaelsCuebid(MichaelsCuebid, BalancingOvercall):
    purpose = "TwoSuiter"
    preconditions = CueBid(positions.LHO)


# The sandwich seat: LHO opened a suit, partner passed, RHO responded 1N.  A rule desert
# before 2026-08-29; the cuebid of opener's suit is still Michaels (p105 h9: 2D over 1D P 1N
# with the majors) and a suit overcall is natural and sound (from play: 2D on KJ9.AK832.T987.5,
# 2H on AJ8.T9.AQJT9.KQT).
sandwich_precondition = AndPrecondition(
    LastBidHasAnnotation(positions.LHO, annotations.Opening),
    LastBidHasSuit(positions.LHO),
    LastBidWas(positions.Partner, 'P'),
    LastBidWas(positions.RHO, '1N'),
)


class SandwichMichaelsCuebid(MichaelsCuebid, Rule):
    purpose = "TwoSuiter"
    preconditions = [sandwich_precondition, CueBid(positions.LHO)]


class SandwichOvercall(Rule):
    """A natural overcall in the sandwich seat: 11+ with a good five-card suit (both
    opponents have shown values, so it is sounder than a direct overcall)."""
    purpose = "Compete"
    preconditions = [sandwich_precondition, NotJumpFromLastContract(), UnbidSuit()]
    call_names = ['2C', '2D', '2H', '2S']
    shared_constraints = [MinLength(5), ThreeOfTheTopFiveOrBetter(), points >= 11]
    # A major before a minor, the longer suit first, the higher of two equal suits.
    prefer = [('2H', hearts > spades), '2S', '2H', ('2C', clubs > diamonds), '2D', '2C']
    annotations = annotations.StandardOvercall
    forcing = False


class MichaelsMinorRequest(Rule):
    purpose = "Planned"
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.MichaelsCuebid),
        # The minor is only ambigious if the cuebid was a major.
        LastBidHasStrain(positions.Partner, suit.MAJORS),
        NotJumpFromLastContract(),
    ]
    requires_planning = True
    call_names = ['2N', '4C', '4N']
    annotations = annotations.MichaelsMinorRequest
    shared_constraints = NO_CONSTRAINTS


class ResponseToMichaelsMinorRequest(Rule):
    # FIXME: Should this be on if RHO bid?
    # If RHO bid the other minor is it already obvious which we have?
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.MichaelsMinorRequest)


class SuitResponseToMichaelsMinorRequest(ResponseToMichaelsMinorRequest):
    purpose = "Forced"
    preconditions = NotJumpFromLastContract()
    call_names = (
        '3C', '3D',
              '4D',
        '5C', '5D',
    )
    shared_constraints = MinLength(5)


class JumpSuitResponseToMichaelsMinorRequest(ResponseToMichaelsMinorRequest):
    """The jump reply to the minor request shows the maximum Michaels hand (15+, the strong
    range of mini-maxi; standard practice, agreed 2026-08-29): 4C on K9874.3.AQ.AKQ72 after
    P 1H 2H P 2N.  A minimum names the minor at the three level."""
    purpose = "Answer"
    preconditions = JumpFromLastContract(exact_size=1)
    call_names = ['4C', '4D']
    shared_constraints = [MinLength(5), points >= 15]


class NoFitForMichaelsMajor(Constraint):
    """Advancer's 3C over a major-suit Michaels cuebid: at most two cards in the major partner
    showed (hearts over their spades, spades over their hearts) and a weak hand."""
    def expr(self, history, call):
        shown = suit.HEARTS if history.partner.last_call.strain == suit.SPADES else suit.SPADES
        return z3.And(expr_for_suit(shown) <= 2, points <= 9)


michaels_minor_preference_hand = NoFitForMichaelsMajor()


class MichaelsMinorPreference(Rule):
    """Advancer's 3C over a major-suit Michaels cuebid (hearts or spades plus an unknown minor):
    no fit for the major, weak, willing to play in partner's minor -- pass-or-correct."""
    purpose = "Answer"
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.MichaelsCuebid),
        LastBidHasStrain(positions.Partner, suit.MAJORS),
        LastBidWas(positions.RHO, 'P'),
    ]
    call_names = '3C'
    shared_constraints = michaels_minor_preference_hand
    annotations = annotations.Artificial


class CorrectMichaelsMinor(Rule):
    """Partner's 3C was pass-or-correct: pass with clubs, correct to 3D with diamonds (p104 h6)."""
    purpose = "Answer"
    preconditions = [
        LastBidHasAnnotation(positions.Me, annotations.MichaelsCuebid),
        LastBidWas(positions.Partner, '3C'),
        LastBidWas(positions.RHO, 'P'),
    ]
    call_names = '3D'
    shared_constraints = diamonds >= 5


class PassResponseToMichaelsMinorRequest(ResponseToMichaelsMinorRequest):
    purpose = "Answer"
    # The book doesn't cover this, but if 4C was the minor request, lets interpret a pass
    # as meaning "I have clubs" and am weak (game is already remote).
    preconditions = LastBidWas(positions.Partner, '4C')
    call_names = 'P'
    shared_constraints = clubs >= 5


# FIXME: Missing Jump responses to Michael's minor request.
# They're used for showing that we're a big michaels.


class ForcedResponseToMichaelsCuebid(Rule):
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.MichaelsCuebid),
        LastBidWas(positions.RHO, 'P'),
    ]

# Shared by both michaels and Unusual 2N
class SimplePreference(object):
    preconditions = [
        DidBidSuit(positions.Partner),
        NotJumpFromLastContract(),
    ]
    shared_constraints = [
        MinLength(2),
        LongestOfPartnersSuits(),
    ]


michaels_preferences = suit_preference(Call.suited_names_between('2H', '4H'))

class MichaelsSimplePreferenceResponse(SimplePreference, ForcedResponseToMichaelsCuebid):
    purpose = "Answer"  # partner asked for a preference
    # Min: 1C 2C P 2H, Max: 2S 3S 4H
    call_names = michaels_preferences.call_names
    prefer = michaels_preferences
    shared_constraints = ConstraintNot(michaels_minor_preference_hand)  # that hand bids 3C


class Unusual2N(Rule):
    purpose = "TwoSuiter"
    preconditions = [
        # Unusual2N only exists immediately after RHO opens.
        LastBidHasAnnotation(positions.RHO, annotations.Opening),
        EitherPrecondition(
            LastBidHasAnnotation(positions.RHO, annotations.OneLevelSuitOpening),
            # FIXME: We should probably only do this when vulnerability is favorable or with more points?
            LastBidHasAnnotation(positions.RHO, annotations.StrongTwoClubOpening),
        ),
    ]
    call_names = '2N'
    # FIXME: We should consider doing mini-max unusual 2N now that we can!
    shared_constraints = [
        Unusual2NShape(),
        points >= 6,
    ]
    annotations = annotations.Unusual2N
    explanation = "5-5 or better in the two lowest unbid suits."


class ForcedResponseToUnusual2N(Rule):
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.Unusual2N),
        LastBidWas(positions.RHO, 'P'),
    ]


unusual_2n_preferences = suit_preference(['3C', '3D', '3H'])

class Unusual2NSimplePreferenceResponse(SimplePreference, ForcedResponseToUnusual2N):
    purpose = "Answer"  # partner asked for a preference
    # Min: 1D 2N P 3C, Max: 1D 2N P 3H
    call_names = unusual_2n_preferences.call_names
    prefer = unusual_2n_preferences


two_suited_direct_overcalls = set([
    DirectMichaelsCuebid,
    # The sandwich-seat cuebid ranks with the direct one (above a single-suit overcall, a
    # takeout double and a weak jump; before this it tied with passing).
    SandwichMichaelsCuebid,
    Unusual2N,
])

# The pass-out seat over a dying two-level suit contract in the opponents' 1N auction
# (the last contract is always LHO's bid there).  Named so standard takeout doubles can
# exclude it, the way they exclude balancing_precondition.
notrump_auction_passout_precondition = AndPrecondition(
    TheyOpened(),
    OpeningBidWas('1N'),
    LastBidHasSuit(positions.LHO),
    LastBidHasLevel(positions.LHO, 2),
    LastBidWas(positions.Partner, 'P'),
    LastBidWas(positions.RHO, 'P'),
    InvertedPrecondition(HasBid(positions.Me)),
)


class TakeoutDouble(Rule):
    call_names = 'X'
    preconditions = [
        LastBidHasSuit(),
        InvertedPrecondition(HasBid(positions.Partner)),
        InvertedPrecondition(LastBidWas(positions.Me, 'X')),
        # A double of RHO's artificial bid (Stayman, a transfer) is lead-directing, not takeout.
        InvertedPrecondition(LastBidHasAnnotation(positions.RHO, annotations.Artificial)),
        # LastBidWasNaturalSuit(),
        # LastBidWasBelowGame(),
        UnbidSuitCountRange(2, 3),
    ]
    annotations = annotations.TakeoutDouble
    # Shape and strength are specific to the seat: see the subclasses.
    explanation = "Either support for all unbid suits or a hand too strong to overcall."


# Too strong to overcall (double first, then bid): 18+, unless we hold four of their suit
# and a 5-card suit of our own, which we overcall instead.
too_strong_to_overcall = ConstraintAnd(
    points >= 18,
    ConstraintOr(MaxLengthInLastContractSuit(3), MaxLengthInUnbidSuits(4)),
)


takeout_double_after_preempt_precondition = AndPrecondition(
    EitherPrecondition(
        LastBidHasAnnotation(positions.RHO, annotations.Preemptive),
        # FIXME: This shouldn't apply when LHO preempts and RHO shows points!
        LastBidHasAnnotation(positions.LHO, annotations.Preemptive),
    ),
    InvertedPrecondition(HasBid(positions.Me)),
)


class OvercallTakeoutDouble(TakeoutDouble):
    # FIXME: Do we need to exclude takeout double rebids by responder?
    preconditions = InvertedPrecondition(Opened(positions.Me))


# A five-card major we would overcall: five or more with three of the top five honors.
overcallable_five_card_major = z3.Or(
    z3.And(hearts >= 5, three_of_the_top_five_hearts_or_better),
    z3.And(spades >= 5, three_of_the_top_five_spades_or_better),
)


class OneLevelTakeoutDouble(OvercallTakeoutDouble):
    purpose = "Ask"
    preconditions = [
        Level(1),
        InvertedPrecondition(takeout_double_after_preempt_precondition),
        InvertedPrecondition(balancing_precondition),
    ]
    # Shape with 11+, or 10 with at most a singleton in one of their suits (p115 h6: 10 with a
    # heart void; p118 h9: 10 with a singleton club and 5-5 in the unbid suits after 1C P 1D),
    # or too strong to overcall.  A five-card major good enough to overcall (three of the top
    # five) is overcalled, not doubled (p118 h10); a ragged five-card major with 4-4 in the
    # other suits still doubles (p115 h6: J9874), and so does a five-card minor.
    shared_constraints = ConstraintOr(
        ConstraintAnd(
            SupportForUnbidSuits(),
            z3.Not(overcallable_five_card_major),
            ConstraintOr(points >= 11, ConstraintAnd(points >= 10, ShortnessInASuitTheyBid())),
        ),
        too_strong_to_overcall,
    )


class TwoLevelTakeoutDouble(OvercallTakeoutDouble):
    purpose = "Ask"
    preconditions = [
        Level(2),
        InvertedPrecondition(takeout_double_after_preempt_precondition),
        InvertedPrecondition(balancing_precondition),
        InvertedPrecondition(notrump_auction_passout_precondition),
        InvertedPrecondition(two_level_balancing_precondition),
    ]
    # 12+ (was 15: a gap-filling constant stricter than the booklet's "opening values with shape";
    # measured 2026-08-27 on 150k deals: 12 gains the doubling side +0.05 MP%, 17 loses -0.02)
    shared_constraints = ConstraintOr(ConstraintAnd(SupportForUnbidSuits(), points >= 12), too_strong_to_overcall)


standard_takeout_doubles = set([
    OneLevelTakeoutDouble,
    TwoLevelTakeoutDouble,
])


class TakeoutDoubleAfterPreempt(OvercallTakeoutDouble):
    purpose = "Ask"
    # Takeout only below game: doubles of opening bids at game or higher are penalty
    # (booklet; the reference stops takeout at 4D), and a 0-count advancer was being
    # FORCED to bid 5C over 4S X P (round-18 review, A2).
    preconditions = [
        takeout_double_after_preempt_precondition,
        LastBidWasBelowGame(),
    ]
    shared_constraints = ConstraintOr(ConstraintAnd(LightSupportForUnbidSuits(), points >= 12), points >= 17)


class PenaltyDoubleOfGameOpening(Rule):
    """Doubles are takeout over opening partscore bids and penalty over opening bids at
    game or higher (booklet), 3N included.  Deliberately NOT a TakeoutDouble: advancer
    passes with nothing instead of being forced to advance."""
    purpose = "Penalize"
    preconditions = [
        LastBidHasAnnotation(positions.RHO, annotations.Opening),
        LastBidWasGameOrAbove(),
        InvertedPrecondition(HasBid(positions.Partner)),
    ]
    call_names = 'X'
    shared_constraints = points >= 15


class TwoNotrumpOvercallOfWeakTwo(Rule):
    """"The bid of 2NT over a weak two-bid shows the equivalent of a strong notrump opener"
    (p107): 15-20 balanced with a stopper in their suit and no five-card suit (the harness's
    KT98.KQ2.AK4.KQT, a 20-count, bids 2N over 2S; p108: AT6.KJ864.A4.A42, 16 with five
    diamonds, doubles).  Owns the 2N over a weak two, where the unusual 2N is off."""
    purpose = "EnterNotrumpSystem"
    preconditions = [
        LastBidHasAnnotation(positions.RHO, annotations.Preemptive),
        LastBidHasLevel(positions.RHO, 2),
        InvertedPrecondition(HasBid(positions.Partner)),
    ]
    call_names = '2N'
    shared_constraints = [
        points >= 15, points <= 20, balanced, StopperInRHOSuit(),
        z3.And(clubs <= 4, diamonds <= 4, hearts <= 4, spades <= 4),
    ]
    annotations = annotations.NotrumpSystemsOn


class BalancingDouble(OvercallTakeoutDouble):
    purpose = "Ask"
    preconditions = [
        Level(1),
        balancing_precondition,
        InvertedPrecondition(takeout_double_after_preempt_precondition),
    ]
    # Light shape with 8+ (with a 5-card major we overcall it instead; a minor defers to the
    # double), or 16+: too strong to balance with a suit (p142).
    shared_constraints = ConstraintOr(
        ConstraintAnd(LightSupportForUnbidSuits(), points >= 8, MaxLengthInUnbidMajors(4)),
        z3.And(points >= 16, at_most_one_five_card_suit),  # 5-5 balances with the suit
    )


class ReopeningDouble(TakeoutDouble):
    purpose = "Penalize"  # reopening protects partner's penalty pass before anything else
    # These only apply when partner hasn't mentioned a suit, right?
    preconditions = [
        Opened(positions.Me),
        # Above 2S X, seems we need more than opening points?
        MaxLevel(2),
    ]
    # Having 17+ points is not a sufficient reason to takeout later in the auction.
    # Short in their suit (a doubleton will do: partner may pass for penalties); 3-3 in the
    # unbid suits is enough here (p136-137), unlike the direct-seat double.
    shared_constraints = ReopeningSupport()


class BalancingDoubleAfterNotrumpAuction(Rule):
    """The opponents opened 1N and their auction is dying at a two-level suit partscore
    (1N-P-2H-P-P, or 1N-P-2D-P-2H-P-P after a transfer): the pass-out seat doubles for
    takeout.  Previously no rule ever contested these auctions (and when the 2-level
    response is natural, TwoLevelTakeoutDouble claiming the same X at the same category
    made the call selector drop the call entirely)."""
    purpose = "Ask"
    call_names = 'X'
    preconditions = [
        notrump_auction_passout_precondition,
        InvertedPrecondition(HasBid(positions.Partner)),
    ]
    annotations = annotations.TakeoutDouble
    shared_constraints = [
        points >= 11,
        SupportForSuitsOtherThanLastContract(),
        MaxLengthInLastContractSuit(2),
    ]


# Response indicates longest suit (excepting opponent's) with 3+ cards support.
# Cheapest level indicates < 10 points.
# NT indicates a stopper in opponent's suit.  1N: 6-10, 2N: 11-12, 3N: 13-16
# Jump bid indicates 10-12 points (normal invitational values)
# cue-bid in opponent's suit is a 13+ michaels-like bid.
class ResponseToTakeoutDouble(Rule):
    # RHO passed (we are forced to bid) or bid a suit (a free bid, p120: no longer forced,
    # so the suit bids need values; the notrump bids, the cuebid and the penalty pass still
    # need RHO's pass).
    preconditions = [
        EitherPrecondition(LastBidWas(positions.RHO, 'P'), LastBidHasSuit(positions.RHO)),
        LastBidHasAnnotation(positions.Partner, annotations.TakeoutDouble),
    ]


class PenaltyPassOfTakeoutDouble(ResponseToTakeoutDouble):
    """Partner's takeout (or reopening / balancing) double is passed for penalties with five
    or more of their suit and some values (p145, h20)."""
    purpose = "Penalize"
    preconditions = LastBidWas(positions.RHO, 'P')
    call_names = 'P'
    # Six of their suit with 8+, or five with 9+ (a weak five-bagger and 8 advances instead).
    shared_constraints = ConstraintOr(
        ConstraintAnd(MinLengthInLastContractSuit(6), points >= 8),
        ConstraintAnd(MinLengthInLastContractSuit(5), points >= 9),
    )


class NotrumpResponseToTakeoutDouble(ResponseToTakeoutDouble):
    purpose = "CharacterizeStrength"
    preconditions = [LastBidWas(positions.RHO, 'P'), NotJumpFromLastContract()]
    constraints = {
        '1N': points >= 6,
        '2N': points >= 11,
        '3N': points >= 13,
    }
    shared_constraints = [balanced, StoppersInOpponentsSuits()]
    prefer = [Highest('1N', '2N', '3N')]  # the highest the hand is worth: 6-10, 11-12, 13+


# FIXME: This could probably be handled by suited to play if we could get the priorities right!
class JumpNotrumpResponseToTakeoutDouble(ResponseToTakeoutDouble):
    purpose = "CharacterizeStrength"
    conditional_purposes = [(semi_balanced, "BalancedLimit")]  # a hand without a singleton tells its strength here
    preconditions = [LastBidWas(positions.RHO, 'P'), JumpFromLastContract()]
    constraints = {
        '2N': points >= 11,
        '3N': points >= 13,
    }
    shared_constraints = [balanced, StoppersInOpponentsSuits()]
    prefer = [Highest('2N', '3N')]


class SuitResponseToTakeoutDouble(ResponseToTakeoutDouble):
    preconditions = [SuitUnbidByOpponents(), NotJumpFromLastContract()]
    # FIXME: Why is the min-length constraint necessary?
    shared_constraints = [MinLength(3), LongestSuitExceptOpponentSuits()]
    # Need conditional priorities to disambiguate cases like being 1.4.4.4 with 0 points after 1C X P
    # Similarly after 1H X P, with 4 spades and 4 clubs, but with xxxx spades and AKQx clubs, do we bid clubs or spades?
    # The tables run to the cheapest call over the highest doubled contract (a 4S preempt):
    # over P 3D X P the spade advance is 3S, over 4S X P the club advance is 5C.  Before
    # 2026-08-31 the spade row stopped at 2S and clubs at 3C, so advancer of a doubled
    # three-level preempt had no call at all in those suits.
    call_names = ['2C', '3C', '4C', '5C', '1D', '2D', '3D', '4D', '5D', '1H', '2H', '3H', '4H', '5H', '1S', '2S', '3S', '4S']
    call_names = ['1D', '1H', '1S', '2C', '2D', '2H', '2S', '3C', '3D', '3H', '3S', '4C', '4D', '4H', '4S', '5C', '5D', '5H']
    # A four-card suit before a three-card one, the higher suit first.
    prefer = [(call_names, MinLength(4), HigherSuit), HigherSuit(*call_names)]


class ForcedSuitResponseToTakeoutDouble(SuitResponseToTakeoutDouble):
    """RHO passed: we must bid, with nothing if need be."""
    purpose = "Forced"
    preconditions = LastBidWas(positions.RHO, 'P')


class FreeSuitResponseToTakeoutDouble(SuitResponseToTakeoutDouble):
    """RHO bid over partner's double (1D X 1H): a non-jump suit is a free bid showing some
    values (p120 h21: 1S on 9 hcp), a little more at the three level; with nothing we pass."""
    purpose = "Discovery"
    preconditions = LastBidHasSuit(positions.RHO)
    constraints = {
        ('1D', '1H', '1S', '2C', '2D', '2H', '2S'): z3.And(points >= 6, points <= 9),  # ten jumps
        ('3C', '3D', '3H', '3S'): z3.And(points >= 8, points <= 9),
        ('4C', '4D', '4H', '4S'): points >= 10,
        ('5C', '5D', '5H'): points >= 12,
    }




class JumpSuitResponseToTakeoutDouble(ResponseToTakeoutDouble):
    purpose = "Discovery"
    preconditions = [SuitUnbidByOpponents(), JumpFromLastContract(exact_size=1)]
    # You can have 10 points, but no stopper in opponents suit and only a 3 card suit to bid.
    # 1C X P, xxxx.Axx.Kxx.Kxx
    shared_constraints = [MinLength(3), LongestSuitExceptOpponentSuits(), points >= 10]
    # Jumps are invitational and stop at the THREE level: over a doubled two-level contract
    # the old 4-level entries put 10-counts (sometimes with 3-card suits) in game.  Strong
    # advances over a doubled preempt go through the cuebid instead.
    call_names = ['3C', '2D', '3D', '2H', '3H', '2S', '3S']
    call_names = ['2D', '2H', '2S', '3C', '3D', '3H', '3S']
    prefer = [(call_names, MinLength(4), HigherSuit), HigherSuit(*call_names)]


class CuebidResponseToTakeoutDouble(ResponseToTakeoutDouble):
    purpose = "Ask"
    preconditions = [
        LastBidWas(positions.RHO, 'P'),
        CueBid(positions.LHO),
        NotJumpFromLastContract(),
    ]
    # Through 4S so the cuebid exists over a doubled three-level preempt (4D over P 3D X P).
    call_names = Call.suited_names_between('2C', '4S')
    # A cuebid of their suit shows nothing in it.
    annotations = annotations.Artificial
    # FIXME: 4+ in the available majors?
    shared_constraints = [
        points >= 13,
        SupportForPartnersSuits(),
    ]
    prefer = []


# NOTE: I don't think we're going to end up needing most of these.
class RebidAfterTakeoutDouble(Rule):
    # FIXME: These only apply after a minimum (non-jump?) response from partner.
    preconditions = LastBidHasAnnotation(positions.Me, annotations.TakeoutDouble)
    shared_constraints = points >= 17


class PassAfterTakeoutDouble(Rule):
    purpose = "CharacterizeStrength"
    preconditions = [
        LastBidHasAnnotation(positions.Me, annotations.TakeoutDouble),
        LastBidWas(positions.LHO, 'P'), # If LHO bid up, we don't necessarily have < 17hcp.
        LastBidWas(positions.RHO, 'P'),
    ]
    call_names = 'P'
    shared_constraints = points < 17


class RaiseAfterTakeoutDouble(RebidAfterTakeoutDouble):
    purpose = "Support"
    conditional_purposes = [(MinLength(4), "SupportMinorWithFour")]  # four-card support for a minor before notrump (the double already showed the majors)
    preconditions = [
        LastBidWas(positions.RHO, 'P'),
        RaiseOfPartnersLastSuit(),
        NotJumpFromLastContract()
    ]
    # Min: 1C X 1D P 2D, Max: 2S X P 3H P 4H
    # FIXME: Game doesn't seem like a raise here?
    call_names = ['2D', '2H', '2S', '3C', '3D', '3H', '3S', '4C', '4D', '4H']
    shared_constraints = [MinLength(4), points <= 18]  # the jump raise shows 19+
    prefer = []


class JumpRaiseAfterTakeoutDouble(RebidAfterTakeoutDouble):
    purpose = "Support"
    conditional_purposes = [(MinLength(4), "SupportMinorWithFour")]  # four-card support for a minor before notrump (the double already showed the majors)
    preconditions = [
        RaiseOfPartnersLastSuit(),
        JumpFromPartnerLastBid(exact_size=1)
    ]
    # Min: 1C X 1D P 3D, Max: 2S X P 3D P 5D
    # FIXME: Game doesn't seem like a raise here?
    call_names = ['2D', '2H', '2S', '3C', '3D', '3H', '3S', '4C', '4D', '4H', '4S', '5C', '5D']
    shared_constraints = [MinLength(4), points >= 19]
    prefer = []
    # With more the doubler cuebids before raising a minor to game; a major game is the goal.
    constraints = {
        ('3C', '4C', '5C', '2D', '3D', '4D', '5D'): points <= 20,
    }


class NewSuitAfterTakeoutDouble(RebidAfterTakeoutDouble):
    purpose = "RebidLong"  # the double denied a five-card suit: showing one comes before a limit bid
    preconditions = [
        UnbidSuit(),
        NotJumpFromLastContract(),
        # FIXME: Remove !RaiseOfPartnersLastSuit once SuitResponseToTakeoutDouble implies 4+ (even though it
        # only needs 3+ to make the bid).  Promising only 3 is currently confusing UnbidSuit.
        InvertedPrecondition(RaiseOfPartnersLastSuit()),
    ]
    # Min: 1C X XX P P 1D, Max: 3C X P 3H P 3S
    call_names = ['1D', '1H', '1S', '2C', '2D', '2H', '2S', '3C', '3D', '3H', '3S']
    shared_constraints = [MinLength(5), points <= 20]  # the jump shows 21+
    prefer = [Longest(*call_names), Cheapest('1S', '2S', '3S'), Cheapest('1H', '2H', '3H'), Cheapest('1D', '2D', '3D'), Cheapest('2C', '3C')]


class JumpNewSuitAfterTakeoutDouble(RebidAfterTakeoutDouble):
    purpose = "RebidLong"  # six cards and 21+: the jump says it
    preconditions = [
        UnbidSuit(),
        JumpFromLastContract(exact_size=1),
        # FIXME: Remove !RaiseOfPartnersLastSuit once SuitResponseToTakeoutDouble implies 4+ (even though it
        # only needs 3+ to make the bid).  Promising only 3 is currently confusing UnbidSuit.
        InvertedPrecondition(RaiseOfPartnersLastSuit()),
    ]
    # Min: 1C X XX P 2D, Max: 2S X P 3C 5D
    # FIXME: Jumping straight to game seems less useful than a cuebid would?
    call_names = ['2D', '2H', '2S', '3C', '3D', '3H', '3S', '4C', '4D', '4H', '4S', '5C', '5D']
    shared_constraints = [MinLength(6), TwoOfTheTopThree(), points >= 21]
    prefer = [Longest(*call_names), Cheapest('2S', '3S', '4S'), Cheapest('2H', '3H', '4H'), Cheapest('2D', '3D', '4D', '5D'), Cheapest('3C', '4C', '5C')]


class NotrumpAfterTakeoutDouble(RebidAfterTakeoutDouble):
    purpose = "CharacterizeStrength"
    constraints = {
        '1N': z3.And(points >= 18, points <= 20),
        # 2N depends on whether it is a jump.
        '3N': points >= 23,  # FIXME: Techincally means 9+ tricks.
    }
    # 1N cannot require stoppers, or we have a hole (18 hcp, no 5-card suit, no support for
    # partner has to have something to bid): with their suits stopped the notrump call
    # describes the hand (BalancedLimit); without, a raise or a cuebid comes first.
    conditional_purposes_per_call = {
        '1N': [(StoppersInOpponentsSuits(), "BalancedLimit")],
        '3N': [(StoppersInOpponentsSuits(), "BalancedLimit")],
    }
    prefer = []


class NonJumpTwoNotrumpAfterTakeoutDouble(RebidAfterTakeoutDouble):
    purpose = "CharacterizeStrength"
    preconditions = NotJumpFromLastContract()
    call_names = '2N'
    shared_constraints = [points >= 19, points <= 22, StoppersInOpponentsSuits()]  # 23+ bids the game
    prefer = []


class JumpTwoNotrumpAfterTakeoutDouble(RebidAfterTakeoutDouble):
    purpose = "CharacterizeStrength"
    conditional_purposes = [(semi_balanced, "BalancedLimit")]  # a hand without a singleton tells its strength here
    preconditions = JumpFromLastContract()
    call_names = '2N'
    shared_constraints = [points >= 21, points <= 22, StoppersInOpponentsSuits()]  # 23+ bids the game
    prefer = []


class CueBidAfterTakeoutDouble(RebidAfterTakeoutDouble):
    purpose = "Ask"  # too strong for a limited call: a major game, or a six-card suit, still comes first
    preconditions = [
        NotJumpFromLastContract(),
        # The Cuebid here is defined as RHO's opening bid, not whatever their most recent one may be.
        CueBid(positions.RHO, use_first_suit=True),
    ]
    # Min: 1C X 1D P 2C, unclear what Max should be?
    # 1S X 2H 3D P 3S?  Should we go higher?
    call_names = Call.suited_names_between('2C', '3S')
    # A cuebid of their suit shows nothing in it.
    annotations = annotations.Artificial
    # The book says "with slam interest".  Unclear what that means for constraints.
    shared_constraints = points >= 21
    prefer = []


class TakeoutDoubleAfterTakeoutDouble(RebidAfterTakeoutDouble):
    purpose = "AskLater"
    call_names = 'X'
    preconditions = [
        LastBidWas(positions.Partner, 'P'),
        MaxLevel(2),
        LastBidHasSuit(),
    ]
    # Doubling a second time shows both 17+ and shortness in the last bid contract.
    # We're asking partner to pick a suit, any suit but don't let them have it.
    shared_constraints = [points >= 17, MaxLengthInLastContractSuit(1)]
    prefer = []


class PreemptiveOpen(Opening):
    purpose = "Preempt"
    conditional_purposes = [(preempt_weak_opening, "PreemptWeak")]
    annotations = annotations.Preemptive
    preconditions = FourthSeatOpensPreemptsAtGameOnly()
    constraints = {
        ('2D', '2H', '2S', '3C'): ConstraintAnd(MinLength(6), MinLength(1, suit.SUITS), MaxLengthInUnbidMajors(3)),
        ('3D', '3H', '3S'): MinLength(7),
        ('4C', '4D', '4H', '4S'): MinLength(8),
    }
    shared_constraints = [
        ThreeOfTheTopFiveOrBetter(),
        points >= 5,
    ]
    prefer = [Highest('2D', '2H', '2S', '3C', '3D', '3H', '3S', '4C', '4D', '4H', '4S')]  # the level is the length


class PreemptiveOvercall(DirectOvercall):
    purpose = "Preempt"
    conditional_purposes = [(preempt_weak_overcall, "PreemptWeak")]
    annotations = annotations.Preemptive
    preconditions = [JumpFromLastContract(), UnbidSuit()]
    constraints = {
        ('2C', '2D', '2H', '2S'): MinLength(6),
        ('3C', '3D', '3H', '3S'): MinLength(7),
        ('4C', '4D', '4H', '4S'): MinLength(8),
    }
    prefer = [Highest(*Call.suited_names_between('2C', '4S'))]  # the level is the length
    shared_constraints = [ThreeOfTheTopFiveOrBetter(), points >= 5]


class ResponseToPreempt(Rule):
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.Preemptive)


# We don't need anything to pass a preempt.  Even with a void in partner's
# suit we can't correct w/o forcing to game.
# This is basically just a version of SuitGameIsRemote w/o the fit requirement.
class PassResponseToPreempt(ResponseToPreempt):
    purpose = "Forced"  # unconstrained: anything with a reason to bid comes first
    call_names = 'P'
    # FIXME: Partner can always have up to 16 hcp when preempting.
    # This should be Max over his minimum?
    shared_constraints = NO_CONSTRAINTS


new_suit_responses_to_preempt = suit_preference(Call.suited_names_between('2D', '4D'))

class NewSuitResponseToPreempt(ResponseToPreempt):
    purpose = "AskLater"  # forcing, but a game in hand (3N with stoppers) comes first
    preconditions = [
        UnbidSuit(),
        NotJumpFromLastContract()
    ]
    call_names = new_suit_responses_to_preempt.call_names
    prefer = new_suit_responses_to_preempt
    shared_constraints = [
        MinLength(5),
        # Should this deny support for partner's preempt suit?
        # Does this really need 17+ points for a 2-level contract and 20+ for a 3-level?
        # It seems this bid should be more "we have the majority of the points"
        # than that a particular level is safe.  Responding to a 2-level 15+ should be sufficient?
        MinCombinedPointsForPartnerMinimumSuitedRebid(),
    ]


class PassAfterPreempt(Rule):
    purpose = "Forced"
    preconditions = [
        LastBidHasAnnotation(positions.Me, annotations.Preemptive),
        InvertedPrecondition(ForcedToBid()),
    ]
    call_names = 'P'
    shared_constraints = NO_CONSTRAINTS


class UnbidSuitOfLength(Constraint):
    """Some unbid suit has at least min_length cards."""
    def __init__(self, min_length):
        self.min_length = min_length

    def expr(self, history, call):
        unbid = history.unbid_suits
        if not unbid:
            return z3.BoolVal(False)
        return z3.Or([expr_for_suit(s) >= self.min_length for s in unbid])


class ForcedRebidAfterPreempt(Rule):
    preconditions = [
        LastBidHasAnnotation(positions.Me, annotations.Preemptive),
        ForcedToBid(),  # aka, partner mentioned a new suit.
        LastBidWasBelowGame(), # RHO must have passed for us to be forced.
    ]


class ForcedRebidAfterNewSuitResponseToPreempt(ForcedRebidAfterPreempt):
    preconditions = [
        LastBidHasSuit(positions.Partner),
        InvertedPrecondition(LastBidHasAnnotation(positions.Partner, annotations.Artificial)),
    ]


# This applies both after a new suit, or after 2N feature request.
class MinimumRebidOfPreemptSuit(ForcedRebidAfterPreempt):
    purpose = "Forced"
    preconditions = [
        RebidSameSuit(),
        NotJumpFromLastContract(),
        # FIXME: This is a hack around the LawOfTotalTricks appearing *forcing*
        InvertedPrecondition(RaiseOfPartnersLastSuit()),
    ]
    # Min: 1S 2D P 2H P 3D
    call_names = Call.suited_names_between('3D', '4D')
    shared_constraints = NO_CONSTRAINTS


class RaiseOfPartnersPreemptResponse(ForcedRebidAfterNewSuitResponseToPreempt):
    purpose = "Answer"
    preconditions = [
        RaiseOfPartnersLastSuit(),
        NotJumpFromLastContract(),
    ]
    # Min: 1S 2D P 2H P 3D, Unclear what the max is.
    call_names = Call.suited_names_between('3D', '4D')
    # FIXME: This can also be made with doubleton honors according to p85
    shared_constraints = MinimumCombinedLength(8)
    prefer = []


class NewSuitAfterPreempt(ForcedRebidAfterNewSuitResponseToPreempt):
    purpose = "Answer"
    preconditions = [
        NotJumpFromLastContract(),
        UnbidSuit(),
    ]
    # Min: 1S 2D P 2H P 2S, Unclear what the max is.
    call_names = Call.suited_names_between('2S', '4D')
    # Without support for partner's suit (with it, the raise).
    shared_constraints = [points >= 9, MinLength(4), ConstraintNot(MinimumCombinedLength(8, use_partners_last_suit=True))]
    prefer = []


class NotrumpAfterPreempt(ForcedRebidAfterNewSuitResponseToPreempt):
    purpose = "Answer"
    preconditions = NotJumpFromLastContract()
    # Min: 2D P 2H P 2N, Unclear if 3N is viable?
    call_names = ('2N', '3N')
    # Without support for partner's suit and without a four-card suit to show (p85 h4).
    shared_constraints = [points >= 9, ConstraintNot(MinimumCombinedLength(8, use_partners_last_suit=True)), ConstraintNot(UnbidSuitOfLength(4))]
    prefer = []


# With a minimum we would rather raise his suit than rebid our own.
# With a maximum we would still rather raise, failing that a new suit, and otherwise NT.


class Gerber(Rule):
    category = categories.Gadget
    requires_planning = True
    shared_constraints = NO_CONSTRAINTS
    annotations = annotations.Gerber
    prefer = []


class GerberForAces(Gerber):
    purpose = "Planned"
    call_names = '4C'
    preconditions = [
        LastBidHasStrain(positions.Partner, suit.NOTRUMP),
        InvertedPrecondition(LastBidHasAnnotation(positions.Partner, annotations.Artificial))
    ]


class GerberForKings(Gerber):
    purpose = "Planned"
    call_names = '5C'
    preconditions = LastBidHasAnnotation(positions.Me, annotations.Gerber)


class ResponseToGerber(Rule):
    purpose = "Answer"
    category = categories.Relay
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.Gerber),
        NotJumpFromPartnerLastBid(),
    ]
    constraints = {
        '4D': z3.Or(number_of_aces == 0, number_of_aces == 4),
        '4H': number_of_aces == 1,
        '4S': number_of_aces == 2,
        '4N': number_of_aces == 3,
        '5D': z3.Or(number_of_kings == 0, number_of_kings == 4),
        '5H': number_of_kings == 1,
        '5S': number_of_kings == 2,
        '5N': number_of_kings == 3,
    }
    annotations = annotations.Artificial
    prefer = []


class Blackwood(Rule):
    category = categories.Gadget
    requires_planning = True
    shared_constraints = NO_CONSTRAINTS
    annotations = annotations.Blackwood
    prefer = []


class BlackwoodForAces(Blackwood):
    purpose = "Planned"
    call_names = '4N'
    preconditions = [
        LastBidHasSuit(positions.Partner),
        # A suit named by an artificial call is not a suit: after 2C P 2D the waiting 2D
        # made 4N ace-asking (and, being requires_planning, it was never actually bid --
        # the call was simply dead, blocking the 30-31 notrump rebid).
        InvertedPrecondition(LastBidHasAnnotation(positions.Partner, annotations.Artificial)),
        EitherPrecondition(JumpFromLastContract(), HaveFit())
    ]


class BlackwoodForKings(Blackwood):
    purpose = "Planned"
    call_names = '5N'
    preconditions = LastBidHasAnnotation(positions.Me, annotations.Blackwood)


class ResponseToBlackwood(Rule):
    purpose = "Answer"
    category = categories.Relay
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.Blackwood),
        NotJumpFromPartnerLastBid(),
    ]
    constraints = {
        '5C': z3.Or(number_of_aces == 0, number_of_aces == 4),
        '5D': number_of_aces == 1,
        '5H': number_of_aces == 2,
        '5S': number_of_aces == 3,
        '6C': z3.Or(number_of_kings == 0, number_of_kings == 4),
        '6D': number_of_kings == 1,
        '6H': number_of_kings == 2,
        '6S': number_of_kings == 3,
    }
    annotations = annotations.Artificial
    prefer = []


class TwoNotrumpFeatureRequest(ResponseToPreempt):
    purpose = "Planned"
    category = categories.Gadget
    annotations = annotations.FeatureRequest
    requires_planning = True
    # The booklet's feature asks are on 15-16 opposite a weak two (21 combined, p88), but
    # lowering this to 21 makes the (never bid, requires_planning) ask claim 2N by category
    # over a weak jump overcall and leaves the natural 2N with no call -- see the
    # requires_planning item in docs/saycbridge-misses-plan.md.
    constraints = { '2N': MinimumCombinedPoints(22) }


class ResponseToTwoNotrumpFeatureRequest(Rule):
    category = categories.Gadget
    preconditions = LastBidHasAnnotation(positions.Partner, annotations.FeatureRequest)


class OutsideThirdRoundStopper(Constraint):
    """A third-round stopper in a suit other than the one we preempted in: the feature."""
    def expr(self, history, call):
        mine = history.me.last_call.strain
        return z3.Or([ThirdRoundStopper().expr(history, Call.from_level_and_strain(3, s)) for s in suit.SUITS if s != mine])


class FeatureResponseToTwoNotrumpFeatureRequest(ResponseToTwoNotrumpFeatureRequest):
    purpose = "Answer"
    category = categories.Gadget
    preconditions = InvertedPrecondition(RebidSameSuit())
    annotations = annotations.Artificial
    call_names = ['3C', '3D', '3H', '3S']
    # Note: We could have a protected outside honor with as few as 6 points,
    # (QJTxxx in our main suit + Qxx in our outside honor suit)
    # p86 seems to suggest we need 9+ hcp.
    shared_constraints = [points >= 9, ThirdRoundStopper()]
    prefer = []


class MaximumNotrumpResponseToTwoNotrumpFeatureRequest(ResponseToTwoNotrumpFeatureRequest):
    """A maximum with no feature to show rebids 3N (both authorities; round-18 review,
    A1): the feature bid outranks it, so 3N means no outside third-round stopper, and the
    minimum suit rebid sits below both."""
    purpose = "Answer"
    category = categories.Gadget
    call_names = '3N'
    shared_constraints = [points >= 9, ConstraintNot(OutsideThirdRoundStopper())]
    prefer = []


class GrandSlamForce(Rule):
    purpose = "Planned"
    preconditions = [
        LastBidHasSuit(positions.Partner),
        # Since ACBL requires 8hcp to open naturally, I suspect partner has to have opened for GSF to be on.
        LastBidHasAnnotation(positions.Partner, annotations.Opening),
        JumpFromLastContract(), # This is slightly redundant. :)
    ]
    call_names = '5N'
    requires_planning = True
    shared_constraints = NO_CONSTRAINTS
    annotations = annotations.GrandSlamForce


class ResponseToGrandSlamForce(Rule):
    purpose = "Answer"
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.GrandSlamForce),
        RebidSameSuit(),
    ]
    constraints = {
        ('6C', '6D', '6H', '6S'): NO_CONSTRAINTS,
        ('7C', '7D', '7H', '7S'): TwoOfTheTopThree(),
    }
    prefer = [Highest(*Call.suited_names_between('6C', '7S'))]  # the grand slam when the trumps allow it
