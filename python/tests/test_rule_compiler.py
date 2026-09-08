# Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import unittest

from z3b import enum
from z3b.rule_compiler import RuleCompiler, _is_not_empty_or_none
from z3b.rules import OneLevelSuitOpening
from z3b.bidder import Interpreter
from core.callhistory import CallHistory
from core.call import Call
from z3b.model import NO_CONSTRAINTS


class EnumTest(unittest.TestCase):
    def test_ordering(self):
        e = enum.Enum('A', 'B')
        self.assertTrue(e.A < e.B)
        self.assertFalse(e.A < e.A)
        self.assertTrue(e.A <= e.A)
        self.assertFalse(e.A > e.A)
        self.assertTrue(e.B > e.A)
        self.assertFalse(e.A < enum.Enum('A', 'B').B)  # values of different enums are unordered


class RuleCompilerTest(unittest.TestCase):
    def test_is_not_empty_or_none(self):
        self.assertFalse(_is_not_empty_or_none(None))
        self.assertFalse(_is_not_empty_or_none([]))
        self.assertFalse(_is_not_empty_or_none({}))
        self.assertTrue(_is_not_empty_or_none([NO_CONSTRAINTS]))
        self.assertTrue(_is_not_empty_or_none(NO_CONSTRAINTS))  # a z3 expression, never compared with ==

    def test_prefer_variants_of_a_converted_rule(self):
        """Each call carries its prefer key, a conditional entry adds a variant, and the keys
        order the calls as the list reads."""
        rule = RuleCompiler.compile(OneLevelSuitOpening)
        with Interpreter().create_history(CallHistory.from_string("")) as history:
            keys = {}
            for name in ('1C', '1D', '1H', '1S'):
                priorities = [priority for priority, _ in rule.meaning_of(history, Call.from_string(name))]
                self.assertTrue(all(p.rule is rule for p in priorities))
                keys[name] = sorted(p.key for p in priorities)
        # 1S: the longest-major variant (entry 0), then the unconditional five-five entry (1).
        self.assertEqual(keys['1S'][0][0], 0)
        self.assertEqual(keys['1S'][-1][0], 1)
        # 1C: longest minor (3), three-three (4), and last of all unconditionally (6).
        self.assertEqual([key[0] for key in keys['1C']], [3, 4, 6])
        self.assertEqual(keys['1D'][-1][0], 5)
