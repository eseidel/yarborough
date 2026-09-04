import unittest

import categories
from core.callhistory import CallHistory
from z3b.sayc import _concrete_rule_classes


def _history(calls, dealer="N"):
    return CallHistory.from_string(calls, dealer, "None")


class CategoriesTest(unittest.TestCase):
    def test_every_registered_rule_has_a_category(self):
        registered = {cls.__name__ for cls in _concrete_rule_classes()}
        missing = sorted(registered - categories.known_rule_names())
        self.assertEqual(missing, [], "rules with no category: %s" % missing)

    def test_no_category_names_an_unregistered_rule(self):
        registered = {cls.__name__ for cls in _concrete_rule_classes()}
        stale = sorted(categories.known_rule_names() - registered)
        self.assertEqual(stale, [], "categories for rules that no longer exist: %s" % stale)

    def test_every_category_uses_a_known_first_level(self):
        for rule_name in categories.known_rule_names():
            path = categories.category_for(rule_name, _history(""))
            self.assertEqual(len(path), 3, rule_name)
            self.assertIn(path[0], categories.LEVEL_ONE, rule_name)
            self.assertTrue(all(path), rule_name)

    def test_table_rules_are_placed_by_the_table(self):
        self.assertEqual(
            categories.category_for("JacobyTransferToHearts", _history("1N P")),
            ["Responding to an opening", "To 1NT", "Jacoby Transfer To Hearts"],
        )
        self.assertEqual(
            categories.category_for("OneLevelTakeoutDouble", _history("1S")),
            ["Competing", "Takeout doubles", "One Level Takeout Double"],
        )
        self.assertEqual(
            categories.category_for("BlackwoodForAces", _history("1S P 3S P"))[0],
            "Slam bidding",
        )

    def test_unknown_rule_is_an_error(self):
        with self.assertRaises(KeyError):
            categories.category_for("NoSuchRule", _history(""))

    def test_role_from_the_auction(self):
        # Dealer North throughout; the seat to call is given by the calls so far.
        cases = [
            ("", categories.OPENING),  # North opens
            ("P", categories.OPENING),  # East, nobody has bid
            ("P P P", categories.OPENING),  # West in fourth seat
            ("1S", categories.COMPETING),  # East over North's opening
            ("1S P", categories.RESPONDING),  # South, partner opened
            ("1S 2H", categories.RESPONDING),  # South, partner opened, RHO overcalled
            ("1S P 2S P", categories.OPENER_REBID),  # North rebids
            ("1S P 2S P 4S P", categories.RESPONDER_REBID),  # South again
            ("1S P P", categories.COMPETING),  # West balances
            ("1S X P", categories.ADVANCING),  # West after East's double
            ("1S X 2S P", categories.OPENER_REBID),  # North after the double and raise
            ("1S X 2S P P", categories.COMPETING),  # East, the doubler, rebids
            ("1S X 2S P P 3H", categories.RESPONDER_REBID),  # South after East bids again
            ("1S X 2S P P 3H P", categories.ADVANCING),  # West after East's double and 3H
            ("1S P 1N 2H", categories.OPENER_REBID),  # North after East's overcall
        ]
        for calls, expected in cases:
            with self.subTest(calls=calls):
                self.assertEqual(categories.role_for(_history(calls)), expected)
        # A responder who has only passed so far is still responding.
        self.assertEqual(
            categories.role_for(_history("P P 1S P 2S P", dealer="S")),
            categories.OPENER_REBID,
        )
        self.assertEqual(
            categories.role_for(_history("P 1S P 2S", dealer="S")),
            categories.COMPETING,
        )

    def test_rule_less_pass_and_contextual_rules_take_their_role_from_the_auction(self):
        self.assertEqual(
            categories.category_for(None, _history("1S P")),
            [categories.RESPONDING, categories.PASSING, "Pass"],
        )
        self.assertEqual(
            categories.category_for("DefaultPass", _history("1S")),
            [categories.COMPETING, categories.PASSING, "Default Pass"],
        )
        self.assertEqual(
            categories.category_for("NaturalSuited", _history("1S P 2S P")),
            [categories.OPENER_REBID, categories.NATURAL, "Natural Suited"],
        )

    def test_format_rule_name(self):
        self.assertEqual(categories.format_rule_name("OneLevelSuitOpening"), "One Level Suit Opening")
        self.assertEqual(categories.format_rule_name("Jacoby2N"), "Jacoby 2NT")
        self.assertEqual(categories.format_rule_name("RHOOpeningPreempt"), "RHO Opening Preempt")


if __name__ == "__main__":
    unittest.main()
