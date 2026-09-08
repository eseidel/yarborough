# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import unittest

from core.call import Call
from core.callhistory import CallHistory
from z3b import purposes
from z3b.bidder import Bidder, Interpreter, RuleSelector
from z3b.purposes import Priority


class PurposeOrderTest(unittest.TestCase):
    def test_every_purpose_is_documented(self):
        for name in purposes.ORDER:
            self.assertIn("\n  %s " % name, purposes.__doc__, "%s is missing from the purposes docstring" % name)

    def test_shorthands_resolve_by_suit(self):
        self.assertEqual(purposes.resolve("Support", Call.from_string("2H")), "SupportMajors")
        self.assertEqual(purposes.resolve("Support", Call.from_string("2D")), "SupportMinors")
        self.assertEqual(purposes.resolve("Discovery", Call.from_string("1S")), "MajorDiscovery")
        self.assertEqual(purposes.resolve("RebidLong", Call.from_string("3C")), "RebidLongMinor")
        self.assertEqual(purposes.resolve("RebidLongMinimum", Call.from_string("2S")), "RebidLongMajorMinimum")
        self.assertEqual(purposes.resolve("Answer", Call.from_string("P")), "Answer")
        with self.assertRaises(AssertionError):
            purposes.resolve("NoSuchPurpose", Call.from_string("P"))

    def test_priority_compares_purpose_first(self):
        ordering = Bidder().system.priority_ordering
        answer = Priority("Answer")
        game = Priority("Game")
        self.assertTrue(ordering.lt(game, answer))
        self.assertFalse(ordering.lt(answer, game))
        self.assertFalse(ordering.lt(answer, Priority("Answer")))
        self.assertEqual(Priority("Ask", key=(1, 0)), Priority("Ask", key=(1, 0)))
        self.assertNotEqual(Priority("Ask", key=(1, 0)), Priority("AskLater", key=(1, 0)))
        self.assertEqual(repr(Priority("Ask", key=(1, 0))), "Ask/None[1, 0]")


class RulePurposeTest(unittest.TestCase):
    def setUp(self):
        self.system = Bidder().system

    def _priorities(self, history_string, call_name):
        with Interpreter().create_history(CallHistory.from_string(history_string, dealer_char="N")) as history:
            selector = RuleSelector(self.system, history)
            rule = selector.rule_for_call(Call.from_string(call_name))
            return rule.name, [priority for priority, _ in rule.meaning_of(history, Call.from_string(call_name))]

    def test_every_rule_declares_a_purpose(self):
        for rule in self.system.rules:
            self.assertTrue(rule.dsl_rule.purpose or rule.purposes_per_call, "%s declares no purpose" % rule.name)

    def test_conditional_purpose_is_keyed_on_its_condition(self):
        """Stayman is an Ask with a four-card major or a minor game force, and garbage Stayman
        (the base purpose) otherwise: the promoted variants carry the condition in their meaning."""
        from z3b.rules import TwoLevelStayman
        from z3b.bidder import Interpreter
        from core.callhistory import CallHistory
        from core.call import Call
        from z3b.rule_compiler import RuleCompiler
        rule = RuleCompiler.compile(TwoLevelStayman)
        with Interpreter().create_history(CallHistory.from_string("1N P")) as history:
            purposes_seen = set(priority.purpose for priority, _ in rule.meaning_of(history, Call.from_string('2C')))
        self.assertEqual(purposes_seen, set(["Ask", "Miscellaneous"]))

    def test_callable_purpose_reads_the_auction(self):
        # A natural raise of partner's major supports; the same call in our own suit rebids.
        name, priorities = self._priorities("1H P", "3H")
        self.assertIn("SupportMajors", [p.purpose for p in priorities])
        name, priorities = self._priorities("1H P 2H P", "3H")
        self.assertNotIn("SupportMajors", [p.purpose for p in priorities])
        self.assertIn("RebidSuit", [p.purpose for p in priorities])

    def test_planning_rules_are_never_chosen(self):
        for rule in self.system.rules:
            if rule.requires_planning:
                self.assertEqual(rule.dsl_rule.purpose, "Planned", rule.name)


if __name__ == "__main__":
    unittest.main()
