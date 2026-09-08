# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""The language that replaced the rule_order graph: a rule's own preference among its
calls (z3b.prefer), the fallback levels, the purpose strain preferences, per-call
preconditions, and the bidder's choice on a collision."""

import unittest
import z3

from core.call import Call
from core.callhistory import CallHistory
from z3b import prefer, purposes
from z3b.bidder import Interpreter, PossibleCalls, RuleSelector, _production_order
from z3b.model import hearts, spades
from z3b.prefer import Cheapest, HigherSuit, Highest, Longest, LowestLevel
from z3b.rule_compiler import PriorityOrdering, RuleCompiler
from z3b.rules import Raise, RaiseOverTakeoutDouble
from z3b.purposes import Priority
import z3b.sayc as sayc


def _keys(entries, names):
    """call name -> sorted keys of its variants, with no history (unconditional entries only)."""
    calls = [Call.from_string(n) for n in names]
    return {n: sorted(k for k, _ in prefer.variants(entries, calls, None, Call.from_string(n))) for n in names}


class EntryTest(unittest.TestCase):
    def test_a_plain_name_ranks_at_its_entry_and_unnamed_calls_come_last_cheapest_first(self):
        keys = _keys(['2S', '2H'], ['2C', '2D', '2H', '2S'])
        self.assertEqual(keys['2S'], [(0, 0)])
        self.assertEqual(keys['2H'], [(1, 0)])
        self.assertEqual(keys['2C'], [(2, 0)])
        self.assertEqual(keys['2D'], [(2, 1)])

    def test_highest_is_the_dearer_level_then_the_higher_suit(self):
        keys = _keys([Highest('2H', '2S', '3H')], ['2H', '2S', '3H'])
        self.assertEqual(keys['3H'], [(0, 0)])
        self.assertEqual(keys['2S'], [(0, 1)])
        self.assertEqual(keys['2H'], [(0, 2)])

    def test_higher_suit_ignores_the_level(self):
        keys = _keys([HigherSuit('2S', '3C', '3H')], ['2S', '3C', '3H'])
        self.assertEqual(keys['2S'], [(0, 0)])
        self.assertEqual(keys['3H'], [(0, 1)])
        self.assertEqual(keys['3C'], [(0, 2)])

    def test_lowest_level_then_the_higher_suit(self):
        keys = _keys([LowestLevel('2C', '2S', '3C')], ['2C', '2S', '3C'])
        self.assertEqual(keys['2S'], [(0, 0)])
        self.assertEqual(keys['2C'], [(0, 1)])
        self.assertEqual(keys['3C'], [(0, 2)])

    def test_cheapest_is_the_default(self):
        self.assertEqual(_keys([], ['1H', '1S']), {'1H': [(0, 0)], '1S': [(0, 1)]})
        self.assertEqual(_keys([Cheapest('1S', '1H')], ['1H', '1S']), {'1H': [(0, 0)], '1S': [(0, 1)]})

    def test_longest_adds_a_variant_whose_condition_compares_the_suits(self):
        calls = [Call.from_string(n) for n in ('1H', '1S')]
        variants = prefer.variants([Longest('1H', '1S')], calls, None, Call.from_string('1H'))
        self.assertEqual([k for k, _ in variants], [(0, 0), (1, 0)])
        condition = variants[0][1]
        self.assertTrue(z3.is_true(z3.simplify(z3.Implies(condition, hearts > spades))))
        self.assertIsNone(variants[1][1])

    def test_a_conditional_entry_may_name_its_tie_order(self):
        calls = [Call.from_string(n) for n in ('2D', '2H', '2S')]
        first = [k for k, c in prefer.variants([(('2D', '2H', '2S'), spades >= 4, Highest)], calls, None, Call.from_string('2S'))][0]
        self.assertEqual(first, (0, 0))

    def test_names_lists_every_call_mentioned(self):
        self.assertEqual(prefer.names(['2S', Longest('1H', '1S'), (('2D',), hearts > spades)]), {'2S', '1H', '1S', '2D'})

    def test_the_compiler_rejects_a_preference_for_a_call_the_rule_cannot_make(self):
        class Wrong(Raise):
            prefer = ['5H']
        with self.assertRaises(AssertionError):
            RuleCompiler.compile(Wrong)


class OrderingTest(unittest.TestCase):
    def setUp(self):
        self.lt = PriorityOrdering().lt
        self.rule = RuleCompiler.compile(Raise)
        self.other = RuleCompiler.compile(RaiseOverTakeoutDouble)

    def test_purpose_first(self):
        self.assertTrue(self.lt(Priority("Game"), Priority("Answer")))
        self.assertFalse(self.lt(Priority("Answer"), Priority("Game")))

    def test_strain_preference_before_fallback(self):
        major = Priority("Game", rule=self.rule, strain=0, fallback=1)
        notrump = Priority("Game", rule=self.other, strain=1)
        self.assertTrue(self.lt(notrump, major))
        self.assertFalse(self.lt(major, notrump))

    def test_a_deeper_fallback_loses(self):
        specific = Priority("SupportMajors", rule=self.rule)
        backstop = Priority("SupportMajors", rule=self.other, fallback=1)
        deeper = Priority("SupportMajors", rule=self.other, fallback=2)
        self.assertTrue(self.lt(backstop, specific))
        self.assertTrue(self.lt(deeper, backstop))
        self.assertFalse(self.lt(specific, backstop))

    def test_the_key_orders_one_rules_calls_and_two_rules_collide(self):
        better = Priority("SupportMajors", rule=self.rule, key=(0, 0))
        worse = Priority("SupportMajors", rule=self.rule, key=(1, 0))
        self.assertTrue(self.lt(worse, better))
        elsewhere = Priority("SupportMajors", rule=self.other, key=(0, 0))
        self.assertFalse(self.lt(worse, elsewhere))
        self.assertFalse(self.lt(elsewhere, worse))

    def test_a_collision_keeps_both_calls_and_production_prefers_a_bid(self):
        possible = PossibleCalls(PriorityOrdering())
        possible.add_call_with_priority(Call.from_string('P'), Priority("SupportMajors", rule=self.rule))
        possible.add_call_with_priority(Call.from_string('2H'), Priority("SupportMajors", rule=self.other))
        maximal = possible.maximal_calls_and_priorities()
        self.assertEqual(sorted(c.name for c, _ in maximal), ['2H', 'P'])
        self.assertEqual(min((c for c, _ in maximal), key=_production_order).name, '2H')
        self.assertEqual(sorted([Call.from_string(n) for n in ('P', 'X', '3C', '2S')], key=_production_order)[0].name, '2S')


class StrainPreferenceTest(unittest.TestCase):
    def test_game_prefers_a_major_then_stopped_notrump_then_a_minor(self):
        self.assertEqual(purposes.strain_variants("Game", Call.from_string('4H')), [(0, None)])
        self.assertEqual(purposes.strain_variants("Game", Call.from_string('3N')), [(1, "stopped"), (3, None)])
        self.assertEqual(purposes.strain_variants("Game", Call.from_string('5C')), [(2, None)])
        self.assertEqual(purposes.strain_variants("Slam", Call.from_string('6N')), [(2, None)])
        self.assertEqual(purposes.strain_variants("Support", Call.from_string('4H')), [(None, None)])

    def test_a_pass_of_partners_three_notrump_ranks_as_the_notrump_game(self):
        with Interpreter().create_history(CallHistory.from_string("1N P 2D P 2H P 3N P")) as history:
            selector = RuleSelector(sayc.StandardAmericanYellowCard, history)
            strains = set(p.strain for p, _ in selector.rule_for_call(Call.from_string('P')).meaning_of(history, Call.from_string('P')) if p.purpose == "Game")
        self.assertEqual(strains, set([1, 3]))


class PreconditionsPerCallTest(unittest.TestCase):
    def test_jordan_is_the_only_call_without_a_raise_precondition(self):
        rule = RuleCompiler.compile(RaiseOverTakeoutDouble)
        with Interpreter().create_history(CallHistory.from_string("1H X")) as history:
            calls = set(call.name for _, call in rule.calls_over(history))
        self.assertIn('2N', calls)
        self.assertIn('2H', calls)
        self.assertNotIn('2S', calls)  # a raise of partner's last suit only
        self.assertNotIn('2D', calls)


if __name__ == '__main__':
    unittest.main()
