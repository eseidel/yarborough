# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""The natural point tables are the one source of the game and slam numbers: a convention
that invites to a level reads the same table as the natural bid of that level."""

import unittest

from core.callhistory import CallHistory
from core.hand import Hand
from z3b import natural, sayc
from z3b.bidder import Bidder
from z3b.rule_compiler import RuleCompiler
from z3b.rules import QuantitativeFourNotrumpJump, QuantitativeFourNotrumpJumpConstraint


class SlamAtThirtyFour(QuantitativeFourNotrumpJumpConstraint):
    def slam_points(self):
        return 34


def _system_with(replacement):
    """StandardAmericanYellowCard with one rule class swapped for `replacement` (same name)."""
    class System(object):
        rules = [RuleCompiler.compile(replacement) if rule.name == replacement.__name__ else rule
                 for rule in sayc.StandardAmericanYellowCard.rules]
        priority_ordering = sayc.StandardAmericanYellowCard.priority_ordering
    return System


def _bid(system, hand, history):
    bidder = Bidder()
    bidder.system = system
    selection = bidder.call_selection_for(Hand.from_cdhs_string(hand), CallHistory.from_string(history))
    return selection.call.name, selection.rule.name


class QuantitativeFourNotrumpTest(unittest.TestCase):
    EIGHTEEN = "A96.AT62.AQ5.KJ3"

    def test_the_invitation_reads_the_notrump_slam_table(self):
        self.assertEqual(natural.points_for_sound_notrump_bid_at_level[6], 33)
        self.assertEqual(QuantitativeFourNotrumpJumpConstraint().slam_points(), 33)
        # Eighteen opposite 15-17 reaches 33 opposite the minimum: the slam, not the invitation.
        self.assertEqual(_bid(sayc.StandardAmericanYellowCard, self.EIGHTEEN, "1N P"), ("6N", "NaturalNotrump"))

    def test_a_moved_slam_number_moves_the_invitation_with_it(self):
        # A system whose slam number is 34 (the quantitative 4N reads it through slam_points):
        # eighteen now reaches 34 only opposite the maximum, so it invites.
        body = dict(vars(QuantitativeFourNotrumpJump))
        for key in ("__dict__", "__weakref__"):
            body.pop(key, None)
        body["shared_constraints"] = SlamAtThirtyFour()
        moved = type(QuantitativeFourNotrumpJump.__name__, QuantitativeFourNotrumpJump.__bases__, body)
        self.assertEqual(_bid(_system_with(moved), self.EIGHTEEN, "1N P"), ("4N", "QuantitativeFourNotrumpJump"))


if __name__ == '__main__':
    unittest.main()
