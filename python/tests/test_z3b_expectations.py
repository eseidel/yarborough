import unittest

from core.call import Call
from core.callhistory import CallHistory
from core.hand import Hand
from z3b.bidder import Bidder

from tests.test_sayc_data import sayc_expectations


class Z3bExpectationTest(unittest.TestCase):
    # The source corpus is a historical SAYC conformance corpus, not a claim
    # that every entry is already implemented by z3b. Keep one known-good
    # regression from every supported category; a new category must be added
    # here deliberately rather than silently becoming untested.
    CASES = {
        "test_3c_stayman": 0,
        "test_balancing": 1,
        "test_balancing_cappelletti": 0,
        "test_doubles": 0,
        "test_escape_route_stayman": 0,
        "test_fourth_suit_forcing": 0,
        "test_game_forcing_rebid_by_opener": 0,
        "test_game_forcing_resonse_to_one_of_a_major": 0,
        "test_game_forcing_response_to_one_of_a_minor": 0,
        "test_interference_over_one_nt": 0,
        "test_invitational_rebid_by_opener": 1,
        "test_invitational_response_to_one_of_a_major": 0,
        "test_invitational_response_to_one_of_a_minor": 0,
        "test_invitational_stayman": 0,
        "test_invitational_two_nt_over_one_nt": 0,
        "test_jacoby_transfers": 0,
        "test_jacoby_two_nt_response_to_one_of_a_major": 0,
        "test_michaels_and_unusual_notrump": 1,
        "test_minimum_rebid_by_opener": 0,
        "test_minimum_response_to_one_of_a_major": 0,
        "test_minimum_response_to_one_of_a_minor": 0,
        "test_minimum_stayman": 0,
        "test_misc_hands_from_play": 0,
        "test_negative_double": 0,
        "test_open_one_nt": 0,
        "test_open_two_nt": 0,
        "test_opener_rebid_after_a_limit_raise": 0,
        "test_overcalling_one_notrump": 0,
        "test_overcalls": 0,
        "test_passout_double_after_notrump_auction": 0,
        "test_preemption": 0,
        "test_preemptive_overcalls": 0,
        "test_reopening_double": 0,
        "test_responses_to_michaels": 0,
        "test_reverses": 0,
        "test_rule_of_twenty_open": 0,
        "test_sayc_gaps": 0,
        "test_slam_biding": 0,
        "test_slam_invitations_over_one_nt": 0,
        "test_slam_zone_response_to_one_of_a_minor": 0,
        "test_slam_zone_responses_to_one_of_a_major": 0,
        "test_strong_two_club": 0,
        "test_subsequent_bidding_by_responder": 0,
        "test_third_and_fourth_seat_opens": 1,
        "test_three_nt_open": 0,
        "test_three_level_calls_over_one_nt": 0,
    }
    UNSUPPORTED_GROUPS = {"test_weak_game_jump_over_one_nt"}

    def test_corpus_groups_are_explicitly_classified(self):
        self.assertEqual(
            set(sayc_expectations),
            set(self.CASES) | self.UNSUPPORTED_GROUPS,
        )

    def test_vendored_z3b_regressions(self):
        for group, index in sorted(self.CASES.items()):
            expectation = sayc_expectations[group][index]
            hand = Hand.from_cdhs_string(expectation[0])
            expected = Call.from_string(expectation[1])
            history = expectation[2] if len(expectation) > 2 else ""
            vulnerability = expectation[3] if len(expectation) > 3 else None
            call_history = CallHistory.from_string(
                history,
                vulnerability_string=vulnerability,
            )

            with self.subTest(
                group=group,
                hand=expectation[0],
                history=history,
                vulnerability=vulnerability,
            ):
                selection = Bidder().call_selection_for(hand, call_history)
                actual = selection.call if selection else None
                self.assertEqual(actual, expected)
