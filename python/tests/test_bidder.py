# Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import types
import unittest

from core.call import Call
from core.callhistory import CallHistory
from core.hand import Hand
from core.position import NORTH, EAST
from z3b.bidder import History, HistoryCache, Interpreter, PossibleCalls, RuleSelector
from z3b.purposes import Priority
from z3b.rule_compiler import PriorityOrdering, RuleCompiler
from z3b.rules import OneLevelSuitOpening
import z3b.sayc as sayc


class HistoryCacheTest(unittest.TestCase):
    def test_root_history_keeps_dealer_and_vulnerability(self):
        cache = HistoryCache()
        call_history = CallHistory.from_string("1N P", dealer_char='E', vulnerability_string='N-S')
        history, remaining = cache.lookup(call_history)
        self.assertEqual(remaining, call_history.calls)
        self.assertEqual(history.call_history.calls, [])
        self.assertEqual(history.call_history.dealer, EAST)
        self.assertEqual(history.call_history.vulnerability.name, 'N-S')

    def test_same_calls_different_dealer_are_different_entries(self):
        cache = HistoryCache()
        interpreter = Interpreter()
        north = CallHistory.from_string("1N P", dealer_char='N')
        east = CallHistory.from_string("1N P", dealer_char='E')
        for call_history in (north, east):
            with interpreter.create_history(call_history) as history:
                cache.add(history)
        cached_north, remaining_north = cache.lookup(north)
        cached_east, remaining_east = cache.lookup(east)
        self.assertEqual(remaining_north, [])
        self.assertEqual(remaining_east, [])
        self.assertIsNot(cached_north, cached_east)
        self.assertEqual(cached_north.call_history.dealer, NORTH)
        self.assertEqual(cached_east.call_history.dealer, EAST)

    def test_cached_root_is_not_a_match(self):
        cache = HistoryCache()
        call_history = CallHistory.from_string("1N P")
        cache.add(History(call_history=call_history.copy_with_partial_history(0)))
        history, remaining = cache.lookup(call_history)
        self.assertEqual(remaining, call_history.calls)
        self.assertEqual(history.call_history.calls, [])

    def test_longest_prefix_wins(self):
        cache = HistoryCache()
        interpreter = Interpreter()
        with interpreter.create_history(CallHistory.from_string("1N P 2C P")) as history:
            cache.add(history)
        history, remaining = cache.lookup(CallHistory.from_string("1N P 2C P 2H P"))
        self.assertEqual([call.name for call in remaining], ['2H', 'P'])
        self.assertEqual(history.call_history.calls_string(), "1N P 2C P")


class CanonicalOrderTest(unittest.TestCase):
    """The bidder visits sets in Call order (and rules by name), never in hash order: a port
    that cannot reproduce Python's set iteration must still make the same choices."""

    def test_possible_calls_are_visited_in_call_order(self):
        hand = Hand.from_cdhs_string("KJ32.A54.Q876.92")
        with Interpreter().create_history(CallHistory.from_string("1C P")) as history:
            selector = RuleSelector(sayc.StandardAmericanYellowCard, history)
            possible = selector.possible_calls_for_hand(hand, None)
        calls = [call for call, _ in possible._calls_and_priorities]
        self.assertGreater(len(set(calls)), 1)
        self.assertEqual(calls, sorted(calls))

    def test_a_rule_yields_its_calls_in_call_order(self):
        rule = RuleCompiler.compile(OneLevelSuitOpening)
        with Interpreter().create_history(CallHistory.from_string("")) as history:
            calls = [call.name for _, call in rule.calls_over(history)]
        self.assertEqual(calls, ['1C', '1D', '1H', '1S'])

    def test_the_rule_for_each_call_is_kept_in_call_order(self):
        with Interpreter().create_history(CallHistory.from_string("1C P")) as history:
            selector = RuleSelector(sayc.StandardAmericanYellowCard, history)
            calls = list(selector._call_to_rule)
        self.assertGreater(len(calls), 1)
        self.assertEqual(calls, sorted(calls))

    def test_rules_are_sorted_by_name(self):
        names = [rule.name for rule in sayc.StandardAmericanYellowCard.rules]
        self.assertEqual(names, sorted(names))

    def test_suits_of_a_view_are_lists_in_suit_order(self):
        # North to call: North opened 1S, partner South bid 2H.
        with Interpreter().create_history(CallHistory.from_string("1S P 2H P")) as history:
            self.assertEqual([s.char for s in history.me.bid_suits], ['S'])
            self.assertEqual([s.char for s in history.partner.bid_suits], ['H'])
            self.assertEqual([s.char for s in history.partner.unbid_suits], ['C', 'D', 'S'])
            self.assertEqual([s.char for s in history.us.bid_suits], ['H', 'S'])
            self.assertEqual([s.char for s in history.them.unbid_suits], ['C', 'D', 'H', 'S'])

    def test_the_maximal_set_does_not_depend_on_insertion_order(self):
        """PriorityOrdering.lt is not transitive: a strain of None compares with neither
        strain, and equal fallbacks of two rules do not order.  Here A < B < C but A and C
        are incomparable, so visiting C first keeps A and visiting A first would lose it."""
        def rule(name):
            return types.SimpleNamespace(name=name)
        a = (Call.from_string('1H'), Priority("Game", rule=rule('a'), strain=2, fallback=0))
        b = (Call.from_string('1D'), Priority("Game", rule=rule('b'), strain=1, fallback=1))
        c = (Call.from_string('1C'), Priority("Game", rule=rule('c'), strain=None, fallback=0))
        lt = PriorityOrdering().lt
        self.assertTrue(lt(a[1], b[1]) and lt(b[1], c[1]))
        self.assertFalse(lt(a[1], c[1]) or lt(c[1], a[1]))
        results = []
        for insertion in ((c, b, a), (a, b, c), (b, a, c)):
            possible = PossibleCalls(PriorityOrdering())
            for call, priority in insertion:
                possible.add_call_with_priority(call, priority)
            results.append([(call.name, priority) for call, priority in possible.maximal_calls_and_priorities()])
        self.assertEqual(results[0], [('1C', c[1]), ('1H', a[1])])  # Call order: C first, then A survives
        self.assertEqual(results[1], results[0])
        self.assertEqual(results[2], results[0])
