# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import unittest

import leads
from core.board import Board
from core.callhistory import CallHistory
from core.deal import Deal
from core.hand import Hand
import yarborough_z3b as api


# hand (S.H.D.C), strain, partner's suits, their suits, blind, expected card, why
GOLDEN = [
    ("KQJ3.A82.T97.J54", "N", (), (), False, "SK", "top of sequence, 4-card suit"),
    ("K9742.A82.T97.J5", "N", (), (), False, "S4", "fourth best from the longest suit"),
    ("K9742.A82.T97.J5", "N", ("H",), (), False, "H2", "partner's suit beats our own; low from three to an honor"),
    ("Q53.J9.KJT4.T862", "N", (), (), False, "DJ", "interior sequence KJT -> J"),
    ("Q53.J9.K84.T8632", "N", (), ("C",), False, "D4", "avoid their suit; low from three to an honor"),
    ("Q53.J9.K84.T8632", "N", (), ("C",), True, "C3", "blind: longest suit regardless of the auction, fourth best"),
    ("8.KJ75.Q9642.J73", "S", (), (), False, "D4", "spades are trumps so S8 is not a side singleton; side suit without an ace, 4th best"),
    ("K5.8.Q9642.J7532", "S", (), (), False, "H8", "singleton side suit with 2 trumps"),
    ("A9.KQ7.J8642.T73", "S", (), (), False, "HK", "top of KQ sequence rather than underleading the ace"),
    ("A9.A74.J8642.T73", "S", (), (), False, "D4", "side suit without an ace, fourth best"),
    ("A9.AK4.A8642.AT7", "S", (), (), False, "HK", "K from AK"),
    ("973.A74.A86.AT73", "S", (), (), False, "S3", "every side suit headed by an ace: low trump"),
    ("A9.A74.A86.AT732", "S", (), (), False, "CA", "nothing safer: ace of the longest side suit (trumps too good to lead)"),
    ("Q53.J9.K84.T8632", "H", ("D",), (), False, "D4", "partner's suit vs a suit contract, low from three to an honor"),
    ("T9.KJ75.Q96.J732", "N", (), (), False, "H5", "fourth best from the longest suit (KJ75 over J732 on strength)"),
    ("KJT73.Q52.987.64", "N", ("C",), (), False, "SJ", "own strong 5-card suit (KJT: interior sequence -> J) beats partner's minor"),
    ("Q9742.Q52.987.64", "N", ("C",), (), False, "C6", "a ragged 5-card suit does not beat partner's suit"),
    ("KQJT5.Q52.987.64", "N", ("C",), (), False, "SK", "own solid 5-card suit beats partner's suit"),
    ("QJT73.Q52.987.64", "N", (), ("S",), False, "SQ", "lead through their suit from a solid sequence"),
    ("Q52.KT94.987.J64", "N", (), (), False, "HT", "KT9x: T"),
    ("KQJT5.6.987.J643", "H", ("D",), (), False, "SK", "vs a suit: a solid 3-card sequence beats partner's suit"),
    ("KQ75.6.987.J6432", "H", ("D",), (), False, "D9", "vs a suit: KQ alone does not beat partner's suit"),
    ("KQ75.J643.9.J643", "H", ("D",), (), False, "SK", "vs a suit: singleton in partner's suit with a KQ sequence elsewhere -> the sequence"),
]


class LeadsTest(unittest.TestCase):
    def test_golden_leads(self):
        for hand, strain, partner, theirs, blind, want, why in GOLDEN:
            with self.subTest(hand=hand, strain=strain, why=why):
                card, reason = leads.choose(hand, strain, partner, theirs, blind)
                self.assertEqual(card, want, "%s vs %s: got %s (%s), want %s -- %s"
                                 % (hand, strain, card, reason, want, why))

    def test_every_hand_has_a_lead(self):
        # A lead for every strain from a few shapes, always a card in the hand.
        for hand in ("AKQJ.AKQJ.AKQ.AK", "2.3.4.AKQJT98765", "AKQJT98765.2.3.4", "9876.9876.987.98"):
            for strain in "SHDCN":
                card, _reason = leads.choose(hand, strain)
                suits = dict(zip("SHDC", hand.split(".")))
                self.assertIn(card[1], suits[card[0]], (hand, strain, card))

    def test_bid_suits(self):
        # N 1H, E P, S 2H, W P, N 4H: N declares, E leads; hearts were bid by the declaring side.
        partner, theirs = leads.bid_suits(["1H", "P", "2H", "P", "4H", "P", "P", "P"], 0, 1)
        self.assertEqual((partner, theirs), ([], ["H", "H", "H"]))
        # N 1D, E 1S, S 3N: S declares, W leads; partner (E) bid spades.
        partner, theirs = leads.bid_suits(["1D", "1S", "3N", "P", "P", "P"], 0, 3)
        self.assertEqual((partner, theirs), (["S"], ["D"]))
        # Artificial calls are not suits: 1N P 2C(Stayman) P 2D(no major) P 3N; W leads.
        calls = ["1N", "P", "2C", "P", "2D", "P", "3N", "P", "P", "P"]
        flags = [False, False, True, False, True, False, False, False, False, False]
        self.assertEqual(leads.bid_suits(calls, 0, 3, flags), ([], []))
        self.assertEqual(leads.bid_suits(calls, 0, 3)[1], ["C", "D"])


def _board(cdhs_hands, auction, number=1):
    deal = Deal([Hand.from_cdhs_string(hand) for hand in cdhs_hands])
    return Board(number, deal, CallHistory.from_string(auction))


class OpeningLeadAdapterTest(unittest.TestCase):
    # Hands are C.D.H.S here (the engine's order), N E S W.
    HANDS = [
        "K5.AQ3.KJ4.AQ983",   # North: 17 hcp balanced
        "T8.KT9.Q9762.J75",   # East
        "AJ64.J87.A53.KT2",   # South: 13 hcp balanced
        "Q9732.6542.T8.64",   # West: the rest
    ]

    def test_lead_against_a_notrump_contract(self):
        board = _board(self.HANDS, "1N P 3N P P P")
        lead = api._opening_lead_for_board(board)
        self.assertEqual(lead["leader"], "E")
        self.assertEqual(lead["card"], "H6")  # fourth best from Q9762: the 6
        self.assertEqual((lead["partner_suits"], lead["their_suits"]), ([], []))
        self.assertIn("fourth best", lead["reason"])

    def test_stayman_is_not_a_suit_they_bid(self):
        board = _board(self.HANDS, "1N P 2C P 2D P 3N P P P")
        lead = api._opening_lead_for_board(board)
        self.assertEqual(lead["their_suits"], [], lead)
        self.assertEqual(lead["card"], "H6")

    def test_partners_natural_suit(self):
        # East overcalls 1S over North's 1C; South declares 3N; West leads partner's suit.
        hands = [
            "AK83.K52.A4.J752",   # North
            "T4.T6.J953.AKQ98",   # East: a spade overcall
            "QJ72.AQ98.KQT.63",   # South
            "965.J743.8762.T4",   # West: the rest
        ]
        board = _board(hands, "1C 1S 3N P P P")
        lead = api._opening_lead_for_board(board)
        self.assertEqual(lead["leader"], "W")
        self.assertEqual(lead["partner_suits"], ["S"], lead)
        self.assertEqual(lead["card"], "ST")

    def test_incomplete_or_passed_out_auctions_are_rejected(self):
        with self.assertRaises(api.BiddingInputError):
            api._opening_lead_for_board(_board(self.HANDS, "1N P"))
        with self.assertRaises(api.BiddingInputError):
            api._opening_lead_for_board(_board(self.HANDS, "P P P P"))

    def test_dispatch(self):
        board = Board.random()
        while board.call_history.is_complete():
            board = Board.random()
        # A random board has an empty auction: the adapter must say so, not crash.
        with self.assertRaises(api.BiddingInputError):
            api.dispatch("get_opening_lead", {"identifier": board.identifier})
