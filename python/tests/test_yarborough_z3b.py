import json
import unittest
from unittest.mock import patch

from core.board import Board
from z3b import rules

import yarborough_z3b as api


class _Rule:
    def __init__(self, dsl_rule):
        self.dsl_rule = dsl_rule


class _Selection:
    def __init__(self, dsl_rule):
        self.rule = _Rule(dsl_rule)


class YarboroughZ3bTest(unittest.TestCase):
    def test_accepts_all_frontend_vulnerability_names(self):
        for frontend_name, z3b_name in {
            "NS": "N-S",
            "EW": "E-W",
            "None": "None",
            "Both": "Both",
        }.items():
            with self.subTest(frontend_name=frontend_name):
                self.assertEqual(
                    api._normalize_vulnerability(frontend_name),
                    z3b_name,
                )
                self.assertTrue(
                    api.get_call_interpretations("", "N", frontend_name)
                )

    def test_rejects_invalid_frontend_values(self):
        with self.assertRaises(api.BiddingInputError):
            api.get_call_interpretations("", "Q", "None")
        with self.assertRaises(api.BiddingInputError):
            api.get_call_interpretations("", "N", "Everyone")
        with self.assertRaises(api.BiddingInputError):
            api.get_next_call("not-a-board")

    def test_format_rule_name(self):
        self.assertEqual(
            api._format_rule_name("OneLevelSuitOpening"),
            "One Level Suit Opening",
        )
        self.assertEqual(
            api._format_rule_name("StrongTwoClubs"),
            "Strong Two Clubs",
        )
        self.assertEqual(
            api._format_rule_name("Jacoby2N"),
            "Jacoby 2NT",
        )
        self.assertEqual(
            api._format_rule_name("Opening1N"),
            "Opening 1NT",
        )
        self.assertEqual(
            api._format_rule_name("RHOOpeningPreempt"),
            "RHO Opening Preempt",
        )
        self.assertIsNone(api._format_rule_name(None))

    def test_interpretations_include_legal_opening_calls(self):
        interpretations = api.get_call_interpretations("", "N", "None")

        names = {interpretation["call_name"] for interpretation in interpretations}
        self.assertIn("P", names)
        self.assertIn("1C", names)
        self.assertIn("1N", names)
        self.assertIn(
            {
                "call_name": "3N",
                "rule_name": None,
                "description": None,
                "knowledge_string": None,
            },
            interpretations,
        )

        open_1h = next(i for i in interpretations if i["call_name"] == "1H")
        self.assertEqual(open_1h["rule_name"], "One Level Suit Opening")
        self.assertEqual(open_1h["knowledge_string"], "12-21 hcp, 5+H")

        open_1nt = next(i for i in interpretations if i["call_name"] == "1N")
        self.assertEqual(open_1nt["rule_name"], "Notrump Opening")
        self.assertEqual(
            open_1nt["knowledge_string"],
            "15-17 hcp, 2-5C 2-5D 2-5H 2-5S NotrumpSystemsOn",
        )

    def test_suggestion_matches_next_call(self):
        identifier = Board.random().identifier

        suggestion = api.get_suggested_call(identifier)

        self.assertEqual(api.get_next_call(identifier), suggestion["call_name"])
        self.assertIsInstance(suggestion["description"], (str, type(None)))
        self.assertIn("knowledge_string", suggestion)

    def test_unresolved_selection_defaults_to_pass(self):
        result = api._selection_result(None)
        self.assertEqual(result["call_name"], "P")
        self.assertIsNone(result["rule_name"])
        self.assertIsNone(result["description"])
        self.assertIsNone(result["knowledge_string"])

    def test_focus_matching_uses_z3b_rule_classes(self):
        self.assertTrue(
            api._matches_focus(_Selection(rules.NotrumpOpening), "Notrump")
        )
        self.assertTrue(
            api._matches_focus(_Selection(rules.PreemptiveOpen), "Preempt")
        )
        self.assertTrue(
            api._matches_focus(_Selection(rules.StrongTwoClubs), "Strong2C")
        )
        self.assertFalse(
            api._matches_focus(_Selection(rules.NotrumpOpening), "Preempt")
        )

    def test_focus_generator_retries_until_the_rule_matches(self):
        board = Board.random()
        mismatched = _Selection(rules.NotrumpOpening)
        matched = _Selection(rules.PreemptiveOpen)

        with patch.object(api, "_selection_for_board", side_effect=[mismatched, matched]):
            self.assertEqual(
                api.generate_filtered_board(
                    "Preempt",
                    board_factory=lambda: board,
                    max_attempts=2,
                ),
                board.identifier,
            )

    def test_focus_generator_reports_exhaustion(self):
        board = Board.random()

        with patch.object(
            api,
            "_selection_for_board",
            return_value=_Selection(rules.NotrumpOpening),
        ):
            with self.assertRaises(api.FocusGenerationError):
                api.generate_filtered_board(
                    "Strong2C",
                    board_factory=lambda: board,
                    max_attempts=2,
                )

    def test_json_dispatches_public_methods(self):
        response = api.dispatch_json(
            json.dumps(
                {
                    "method": "get_call_interpretations",
                    "arguments": {
                        "calls": "",
                        "dealer": "N",
                        "vulnerability": "None",
                    },
                }
            )
        )

        self.assertIsInstance(json.loads(response), list)

    def test_json_dispatch_rejects_unknown_method(self):
        with self.assertRaises(api.BiddingInputError):
            api.dispatch_json(json.dumps({"method": "missing", "arguments": {}}))
