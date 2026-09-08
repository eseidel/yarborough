# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Purposes: why a player makes a call, and which reason wins when a hand has several.

Every rule declares a purpose (Rule.purpose, or per call, or conditionally on the hand).
The bidder compares two possible calls by purpose first; then, within a purpose that prefers
a strain (PREFERENCES: a major game before notrump before a minor game), by strain; then by
fallback level (Rule.fallback: the call when nothing more specific of that purpose fits loses
to every rule of the purpose that is not one); then, among one rule's own calls, by the
rule's preference (Rule.prefer, z3b.prefer: the longest suit, up the line, the highest level
the hand is worth).  Two rules of one purpose
are otherwise incomparable: their meanings, or preconditions, must not both admit one hand.
The interpretation of a call negates every possible call the hand did not make that the
bidder would have preferred, so the ranges partner reads and the choices the bidder makes
come from one ordering.

The order, best first.  Read it as a player would:

  Planned               a call the bidder only makes by plan (Blackwood, Gerber, a feature ask):
                        never chosen here, and read on its own meaning when partner makes it
  Answer                partner asked; answering is not optional
  EnterNotrumpSystem    a balanced hand in a notrump range opens or overcalls notrump
  GameForce             too strong for anything but the game force (the strong 2C, a jump shift)
  Penalize              their suit is ours to defend (a penalty pass, a reopening double)
  Enough                the auction has found its level: pass
  SupportMajors         raise partner's major: the eight-card major fit is the goal
  TwoSuiter             show two suits at once when the shape is there
  RebidLongMajor        a six-card major worth a jump or a three-level rebid, or the doubler's
                        five-card suit, is shown before a limit bid or an ask
  BalancedLimit         a balanced hand tells its strength in a limited notrump call
  LongSuitInvitation    a long suit worth an invitation is shown before asking or relaying
  PreemptWeak           less than an opening hand (no rule of twenty) with a long suit preempts
  Ask                   a question comes before a statement: Stayman with four-four or
                        five-four, a takeout double, fourth suit forcing
  MajorDiscovery        bid a major we may fit (any new suit at the one level: up the line)
  MinorDiscovery        bid a minor we may fit
  SupportMinorWithFive  five-card support for partner's minor is raised once no new suit is
                        worth showing, with any strength
  RebidLongMajorMinimum a minimum rebid of a six-card major, once no five-card suit is worth
                        showing
  MinorDiscoveryWithFour a four-card minor at the two level or above
  Slam                  a natural slam (a major, a minor, then notrump: the Slam preference),
                        and the forcing raises that look for one
  RebidLongMinor        a six-card minor is rebid, with a jump or without, once no new suit is
                        worth showing
  SupportMinorWithFour  four-card support for partner's minor, short of game values, comes
                        before an invitational notrump
  Game                  a natural game once nothing is left to explore (a major, then notrump
                        with stoppers, then a minor); a raise to game in partner's suit is support
  AskLater              an ask the shape does not call for yet (Stayman without a second
                        major, fourth suit forcing with the suit stopped), and a new suit once
                        a fit is agreed: before a limit bid, after a game
  CharacterizeStrength  limit the hand: a notrump call, a pass, a suit rebid with shortness
  SupportMinors         raise partner's minor
  RebidSuit             rebid our suit: a fifth card after a reverse, a sixth otherwise
  Preempt               obstruct with a long suit
  Compete               keep the auction alive in the balancing seat
  Miscellaneous         everything else: garbage Stayman, fourth suit forcing with support
  Forced                the minimum call a forcing auction obliges when nothing better fits

"Support", "Discovery", "RebidLong" and "RebidLongMinimum" are shorthands resolved by the suit
of the call.
"""

ORDER = [
    "Planned",
    "Answer",
    "EnterNotrumpSystem",
    "GameForce",
    "Penalize",
    "Enough",
    "SupportMajors",
    "TwoSuiter",
    "RebidLongMajor",
    "BalancedLimit",
    "LongSuitInvitation",
    "PreemptWeak",
    "Ask",
    "MajorDiscovery",
    "MinorDiscovery",
    "SupportMinorWithFive",
    "RebidLongMajorMinimum",
    "MinorDiscoveryWithFour",
    "Slam",
    "RebidLongMinor",
    "SupportMinorWithFour",
    "Game",
    "AskLater",
    "CharacterizeStrength",
    "SupportMinors",
    "RebidSuit",
    "Preempt",
    "Compete",
    "Miscellaneous",
    "Forced",
]
RANK = dict((name, index) for index, name in enumerate(ORDER))

BY_SUIT = {
    "Support": ("SupportMajors", "SupportMinors"),
    "Discovery": ("MajorDiscovery", "MinorDiscovery"),
    "RebidLong": ("RebidLongMajor", "RebidLongMinor"),
    "RebidLongMinimum": ("RebidLongMajorMinimum", "RebidLongMinor"),
}


def resolve(purpose, call):
    """A declared purpose for a call: the shorthands pick major or minor by the call's suit."""
    if purpose in BY_SUIT:
        major, minor = BY_SUIT[purpose]
        return major if call.strain is not None and call.strain.char in "HS" else minor
    assert purpose in RANK, "unknown purpose %r" % (purpose,)
    return purpose


# A purpose may prefer a strain: the only ordering between rules of one purpose.  Each entry
# is the strains it names, optionally with a condition (a name resolved by rule_compiler
# through CONDITIONS); a call meeting an earlier entry is better.  A notrump game with the
# opponents' suits stopped comes before a minor game; without the stop it is the last resort.
PREFERENCES = {
    "Game": [("HS", None), ("N", "stopped"), ("CD", None), ("N", None)],
    "Slam": [("HS", None), ("CD", None), ("N", None)],
}
# Named conditions the preferences may use; filled in by the module that owns the constraint.
CONDITIONS = {}


def strain_variants(purpose, call):
    """(rank, condition name) pairs for a call under its purpose's strain preference: one
    per entry that names the call's strain (a pass takes the strain of the contract it
    passes, the caller resolves that).  No preference: one unranked variant."""
    preference = PREFERENCES.get(purpose)
    if not preference or call.strain is None:
        return [(None, None)]
    variants = [(rank, condition) for rank, (strains, condition) in enumerate(preference)
                if call.strain.char in strains]
    assert variants, "%s has no place in the %s preference" % (call, purpose)
    return variants


class Priority(object):
    """A rule's priority for one variant of a call: its purpose, the purpose's strain
    preference (a rank, or None), the rule, the rule's own key (a `prefer` rank) and the
    rule's fallback level.  rule_compiler.PriorityOrdering compares them."""
    __slots__ = ("purpose", "rule", "key", "strain", "fallback")

    def __init__(self, purpose, rule=None, key=(0, 0), strain=None, fallback=0):
        assert purpose in RANK, "unknown purpose %r" % (purpose,)
        self.purpose = purpose
        self.rule = rule
        self.key = key
        self.strain = strain
        self.fallback = fallback

    @property
    def rank(self):
        return RANK[self.purpose]

    def _fields(self):
        return (self.purpose, self.rule, self.key, self.strain, self.fallback)

    def __eq__(self, other):
        return isinstance(other, Priority) and self._fields() == other._fields()

    def __ne__(self, other):
        return not self.__eq__(other)

    def __hash__(self):
        return hash(self._fields())

    def __repr__(self):
        parts = [self.purpose]
        if self.strain is not None:
            parts.append("strain%d" % self.strain)
        parts.append("%s%s" % (getattr(self.rule, "name", self.rule), list(self.key)))
        if self.fallback:
            parts.append("fallback%d" % self.fallback)
        return "/".join(parts)
