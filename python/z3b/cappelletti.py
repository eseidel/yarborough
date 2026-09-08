# Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

from z3b.constraints import *
from z3b.model import *
from z3b.preconditions import *
from z3b.rules import *


# Shared call schedule for defending against a 1N opening, direct or balancing seat
# (mixin pattern, like MichaelsCuebid): the responses key off annotations.Cappelletti either way.
class CappellettiEntries(object):
    constraints = {
        '2C': z3.Or(clubs >= 6, diamonds >= 6, hearts >= 6, spades >= 6),
        '2D': z3.And(hearts >= 5, spades >= 5),
        '2H': z3.And(hearts >= 5, z3.Or(clubs >= 5, diamonds >= 5)),
        '2S': z3.And(spades >= 5, z3.Or(clubs >= 5, diamonds >= 5)),
        '2N': z3.And(clubs >= 5, diamonds >= 5),
        # I think the logic here is that with such an uneven distribution of points
        # in the opponents, we don't really want to play a game anyway, so we just penalize them.
        'X': points >= 15,
    }
    annotations_per_call = {
        ('2C', '2D', '2N'): annotations.Artificial
    }
    annotations = annotations.Cappelletti
    # The book suggests "decent strength".
    # The book bids Cappelletti with 11 hcp, but seems to want 12 hcp when responding.
    # Wikipedia says Cappelletti is 9-14 hcp.
    # playing_points here is sorta compensating for us not using length_points?
    explanations_per_call = {
        'X': """Indicates a 1NT opening hand.  NT conventional responses are off.
Responder can pass with enough points to penalize opener, but more likely should escape to a suit fit.""",
        '2C': "Indicates one-suited hand (6+ cards in an un-named suit).",
    }
    prefer = ['X', Cheapest('2D', '2H', '2S', '2N'), '2C']  # the penalty double, a two-suiter, a long suit


# Cappelletti may promise < 15 hcp, since 3-level overcalls are also on and may be preferred.
class Cappelletti(CappellettiEntries, Rule):
    purpose = "Compete"
    preconditions = [
        LastBidHasAnnotation(positions.RHO, annotations.Opening),
        LastBidWas(positions.RHO, '1N'),
    ]
    shared_constraints = points >= 10, playing_points >= 12


class BalancingCappelletti(CappellettiEntries, Rule):
    """1N-P-P was previously a rule desert: every balancing rule requires a one-level SUIT
    opening, so classic balance hands passed out 1N.  Same schedule as Cappelletti, slightly
    lighter (the direct seat's pass has shown weakness, so the points are marked)."""
    purpose = "Compete"
    preconditions = [
        balancing_precondition,
        LastBidWas(positions.LHO, '1N'),
    ]
    # The double still shows a 1N-opening HAND, not just 15+ points: with an unbalanced 15+
    # we bid a suit or pass and defend (test_sayc "1N P P" expects P on KQ986.K.AK7.J942).
    constraints = dict(CappellettiEntries.constraints,
                       X=z3.And(points >= 15, balanced))
    shared_constraints = points >= 9, playing_points >= 11


class ResponseToCappelletti(Rule):
    preconditions = [
        LastBidHasAnnotation(positions.Partner, annotations.Cappelletti),
        LastBidWas(positions.RHO, 'P'),
    ]


class PassResponseToOneNotrumpPenaltyDouble(ResponseToCappelletti):
    purpose = "Penalize"
    preconditions = LastBidWas(positions.Partner, 'X')
    constraints = {
        'P': MinimumCombinedPoints(21), # We have a point majority and should penalize 1N.
    }


new_suit_responses_to_penalty_double = suit_preference(['2C', '2D', '2H', '2S'])

class NewSuitResponseToOneNotrumpPenaltyDouble(ResponseToCappelletti):
    purpose = "Discovery"
    preconditions = [
        LastBidWas(positions.Partner, 'X'),
        UnbidSuit(),
        NotJumpFromLastContract(),
    ]
    call_names = new_suit_responses_to_penalty_double.call_names
    prefer = new_suit_responses_to_penalty_double
    shared_constraints = [MinLength(4), LongestSuitExceptOpponentSuits()]


class ResponseToCappellettiTwoClubs(ResponseToCappelletti):
    purpose = "Answer"
    preconditions = LastBidWas(positions.Partner, '2C')
    constraints = {
        'P': (clubs >= 6, ThreeOfTheTopFiveOrBetter(suit.CLUBS)),
        '2D': NO_CONSTRAINTS,
        '2H': (hearts >= 5, ThreeOfTheTopFiveOrBetter()),
        '2S': (spades >= 5, ThreeOfTheTopFiveOrBetter()),
        '2N': (points >= 11, balanced),
        # Could 3C be strong long clubs?
        # And 3D be long diamonds?
    }
    annotations_per_call = {
        '2D': annotations.Artificial,
    }
    explanations_per_call = {
        '2D': "Waiting. Asks partners to name their 6-card suit.",
    }
    prefer = ['2S', '2H', 'P', '2N', '2D']  # a strong major, long clubs, a balanced 11+, else the waiting 2D


class RebidAfterCappelleti(Rule):
    preconditions = LastBidHasAnnotation(positions.Me, annotations.Cappelletti)


class SuitRebidAfterCappellettiTwoClubs(RebidAfterCappelleti):
    purpose = "Discovery"
    preconditions = [
        LastBidWas(positions.Me, '2C'),
        UnbidSuit(),
    ]
    # FIXME: What if they interfere?
    call_names = ('2H', '2S', '3C', '3D')
    shared_constraints = MinLength(6)


class ResponseToCappellettiTwoDiamonds(ResponseToCappelletti):
    purpose = "Answer"
    preconditions = LastBidWas(positions.Partner, '2D')
    constraints = {
        'P': (diamonds >= 6, ThreeOfTheTopFiveOrBetter(suit.DIAMONDS)),
        # Partner has already said he's 5-5 in the majors, so he has at most 3 in the minors.
        '2N': (clubs >= 5, diamonds >= 5),
        '3C': (clubs >= 6, ThreeOfTheTopFiveOrBetter(suit.CLUBS)),

        # Could these be natural too?  They imply invitational points?  But how many does partner have?
        # Currently we're assuming that 2D promises 5-5 in the majors.
        '3H': (MinimumCombinedLength(9), MinimumCombinedSupportPoints(22)),
        '3S': (MinimumCombinedLength(9), MinimumCombinedSupportPoints(22)),
    }
    annotations_per_call = {
        '2N': annotations.Artificial,
    }
    prefer = ['3H', '3S', '2N', '3C', 'P']  # the invitational raise, both minors, a long minor, else pass


class ResponseToMajorCappelletti(ResponseToCappelletti):
    preconditions = LastBidHasStrain(positions.Partner, suit.MAJORS)


class NewSuitResponseToMajorCappelletti(ResponseToMajorCappelletti):
    purpose = "Discovery"
    preconditions = UnbidSuit()
    call_names = ('2S', '3C', '3D', '3H')
    shared_constraints = [
        MinLength(6),
        ThreeOfTheTopFiveOrBetter(),
    ]


class RaiseResponseToMajorCappelletti(ResponseToMajorCappelletti):
    purpose = "SupportMajors"
    preconditions = [
        LastBidHasStrain(positions.Partner, suit.MAJORS),
        RaiseOfPartnersLastSuit(),
    ]
    shared_constraints = [
        MinimumCombinedLength(8),
        # Should this be support points?
        # Partner could have as few as 10 points!
        MinimumCombinedPoints(18)
    ]
    call_names = ['3H', '3S']
    prefer = []


class CappellettiMinorRequest(ResponseToMajorCappelletti):
    purpose = "Planned"
    call_names = '2N'
    requires_planning = True # FIXME: Can't we do this with constraints?
    annotations = annotations.CappellettiMinorRequest
    shared_constraints = NO_CONSTRAINTS


class ResponseToCappellettiMinorRequest(RebidAfterCappelleti):
    purpose = "Answer"
    preconditions = [
        NotJumpFromLastContract(),
        LastBidHasAnnotation(positions.Partner, annotations.CappellettiMinorRequest),
    ]
    call_names = ('3C', '3D')
    shared_constraints = MinLength(5)


class RaiseAfterCappellettiMinorRequest(Rule):
    purpose = "Answer"
    preconditions = [
        LastBidHasAnnotation(positions.Me, annotations.CappellettiMinorRequest),
        PartnerHasAtLeastLengthInSuit(5),
    ]
    call_names = ('3H', '3S')
    shared_constraints = [
        MinimumCombinedLength(8),
        MinimumCombinedSupportPoints(22), # Matches limit raise
    ]


