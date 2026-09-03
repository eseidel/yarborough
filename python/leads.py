# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Opening-lead chooser: standard leads, rule-based, deterministic.

A double-dummy table gives the defense the killing lead on every deal.  A fairer
"can you make what you bid" number plays the contract double-dummy AFTER an opening
lead chosen the way a standard pair leads (Pavlicek's "after the lead" world, where
double-dummy play tracks expert play within about 0.16 tricks).  Two variants:

  aware  -- knows which suits partner bid and which the declaring side bid;
  blind  -- ignores the auction entirely.

Neither variant sees any hidden card.  The rules are the textbook ones (fourth best
from the longest/strongest suit against notrump, top of a sequence, partner's suit, a
singleton against a suit contract, never underlead an ace against a suit), written to
be readable and testable rather than clever; tests/test_leads.py pins a hand-written
golden set.  Written for better-bids (evaluator v5, 2026-08-27) and moved here with
the rest of the bidding engine.

    choose(hand, strain, partner_suits=(), their_suits=(), blind=False) -> (card, reason)

hand: 13 cards as "S.H.D.C" pips (Hand.shdc_dot_string(), e.g. "KQJ3.A82.T97.J54");
strain: the contract's strain character in "SHDCN"; card: "SK" style (suit, rank).
"""
RANKS = "AKQJT98765432"
SUITS = "SHDC"
HONORS = "AKQJT"


def _parse(hand):
    parts = hand.split(".")
    assert len(parts) == 4, hand
    suits = {s: "".join(sorted(p, key=RANKS.index)) for s, p in zip(SUITS, parts)}
    assert sum(len(v) for v in suits.values()) == 13, hand
    return suits


def _touching(cards, n):
    """The top card of a sequence of n touching honors at the head of `cards` (e.g. KQJ -> K), or None."""
    if len(cards) < n or cards[0] not in HONORS:
        return None
    idx = [RANKS.index(c) for c in cards[:n]]
    if all(idx[i + 1] == idx[i] + 1 for i in range(n - 1)):
        return cards[0]
    return None


def _card_in_suit_vs_nt(cards):
    """Which card to lead from a chosen suit against notrump."""
    n = len(cards)
    if n == 1:
        return cards[0], "singleton"
    if n == 2:
        return cards[0], "top of doubleton"
    top = _touching(cards, 3)
    if top:
        return top, "top of sequence"
    # broken sequences and interior sequences: AKJ -> K? (AKx: lead K asking count/unblock: K); AQJ -> Q; KJT -> J; AJT -> J; QT9 -> T
    if n >= 3 and cards[0] in "AK" and cards[1] in "AK" and cards[0] != cards[1]:
        return "K", "K from AK"
    for combo, lead in (("AQJ", "Q"), ("KQT", "K"), ("QJ9", "Q"), ("KJT", "J"), ("AJT", "J"), ("KT9", "T"), ("AT9", "T"),
                        ("QT9", "T"), ("JT8", "J"), ("T98", "T")):
        if cards[:3] == combo:
            return lead, "top of interior/broken sequence"
    if n >= 4:
        return cards[3], "fourth best"
    # three cards: honor-high -> low; small -> top
    if cards[0] in HONORS:
        return cards[2], "low from three to an honor"
    return cards[0], "top of nothing"


def _card_in_suit_vs_suit(cards, is_trump=False):
    n = len(cards)
    if n == 1:
        return cards[0], "singleton"
    if n == 2:
        return cards[0], "top of doubleton"
    top = _touching(cards, 2)
    if top and cards[0] != "A":
        return top, "top of sequence"
    if cards[0] == "A" and cards[1] == "K":
        return "K", "K from AK"
    if is_trump:
        return cards[-1], "low trump"
    if cards[0] == "A":
        return "A", "ace (never underlead an ace vs a suit)"
    if n >= 4:
        return cards[3], "fourth best"
    if cards[0] in HONORS:
        return cards[2], "low from three to an honor"
    return cards[0], "top of nothing"


def _strength(cards):
    return sum({"A": 4, "K": 3, "Q": 2, "J": 1, "T": 0.5}.get(c, 0) for c in cards)


def choose(hand, strain, partner_suits=(), their_suits=(), blind=False):
    """Return (card, reason) for the opening lead.

    strain: the contract's strain in 'SHDCN'. partner_suits / their_suits: suits ('S','H',...)
    bid naturally by partner / by the declaring side (ignored when blind)."""
    assert strain in "SHDCN", strain
    suits = _parse(hand)
    if blind:
        partner_suits, their_suits = (), ()
    partner_suits = [s for s in partner_suits if s in SUITS]
    their_suits = [s for s in their_suits if s in SUITS]
    if strain == "N":
        # 0. our own suit when it is clearly better than partner's: 5+ cards headed by a sequence,
        #    or any 5+ suit when our holding in partner's suit is a singleton (round-14 bridge review)
        own_strong = [s for s in SUITS if len(suits[s]) >= 5 and (_touching(suits[s], 3) or _strength(suits[s]) >= 4)]
        # 1. partner's suit (round-14: not from a singleton when we hold a 5-card suit of our own)
        for s in partner_suits:
            if suits[s] and not own_strong and not (len(suits[s]) == 1 and any(len(suits[x]) >= 5 for x in SUITS)):
                c, why = _card_in_suit_vs_nt(suits[s])
                return s + c, f"partner's suit, {why}"
        # 2. longest unbid suit (4+), ties by strength; sequences of honors preferred over ragged length;
        #    a suit the declaring side bid is fine to lead through from a solid 3-card sequence
        candidates = [s for s in SUITS if suits[s] and (s not in their_suits or _touching(suits[s], 3))] or [s for s in SUITS if suits[s]]
        def key(s):
            cards = suits[s]
            seq = 1 if _touching(cards, 3) else 0
            return (len(cards) >= 4, seq, len(cards), _strength(cards))
        best = max(candidates, key=key)
        c, why = _card_in_suit_vs_nt(suits[best])
        return best + c, f"{'unbid ' if their_suits else ''}longest/strongest suit, {why}"
    # suit contract
    trump = strain
    side = [s for s in SUITS if s != trump and suits[s]]
    # 1. partner's suit -- unless we hold a solid 3-card sequence elsewhere, or a singleton in
    #    partner's suit with a touching sequence elsewhere (round-14 bridge review)
    seq_elsewhere = [s for s in side if _touching(suits[s], 2) and suits[s][0] != "A"]
    solid_elsewhere = [s for s in side if _touching(suits[s], 3) and suits[s][0] != "A"]
    for s in partner_suits:
        if s != trump and suits[s] and not solid_elsewhere and not (len(suits[s]) == 1 and seq_elsewhere):
            c, why = _card_in_suit_vs_suit(suits[s])
            return s + c, f"partner's suit, {why}"
    # 2. a singleton in a side suit (not an ace) when we hold few trumps: hoping to ruff
    for s in side:
        if len(suits[s]) == 1 and suits[s] != "A" and len(suits[trump]) <= 3:
            return s + suits[s], "singleton, hoping to ruff"
    # 3. top of a touching honor sequence (KQ, QJ, JT) in a side suit; AK -> K
    for s in sorted(side, key=lambda s: -len(suits[s])):
        cards = suits[s]
        if (_touching(cards, 2) and cards[0] != "A") or cards[:2] == "AK":
            c, why = _card_in_suit_vs_suit(cards)
            return s + c, why
    # 4. a side suit without an ace, preferring unbid suits, then length (4th best) or a doubleton
    unbid = [s for s in side if s not in their_suits] or side
    safe = [s for s in unbid if suits[s][0] != "A"]
    if safe:
        best = max(safe, key=lambda s: (len(suits[s]) >= 4, len(suits[s]) == 2, len(suits[s]), _strength(suits[s])))
        c, why = _card_in_suit_vs_suit(suits[best])
        return best + c, f"side suit without an ace, {why}"
    # 5. a trump from a safe holding rather than underleading an ace
    if len(suits[trump]) >= 2 and suits[trump][0] not in "AKQ":
        return trump + suits[trump][-1], "low trump (every side suit is headed by the ace)"
    # 6. last resort: the ace of the longest side suit
    best = max(unbid, key=lambda s: len(suits[s]))
    return best + "A", "ace of the longest side suit (nothing safer)"


def bid_suits(calls, dealer_index, leader_index, artificial=None):
    """(partner_suits, their_suits) from an auction: NATURAL suit calls by the leader's partner and
    by the declaring side.  `artificial` (per-call bools: the engine's Artificial annotation, which
    marks Stayman, transfers, asks, Cappelletti...) excludes conventional calls -- without it a
    Stayman 2C or a transfer reads as a suit "they" bid.
    calls: call names in order ('1N', 'P', '2C', ...); dealer_index/leader_index: 0=N,1=E,2=S,3=W."""
    partner, theirs = [], []
    for i, c in enumerate(calls):
        seat = (dealer_index + i) % 4
        if artificial is not None and i < len(artificial) and artificial[i]:
            continue
        if len(c) == 2 and c[0] in "1234567" and c[1] in SUITS:
            if seat == (leader_index + 2) % 4:
                partner.append(c[1])
            elif seat % 2 != leader_index % 2:
                theirs.append(c[1])
    return partner, theirs
