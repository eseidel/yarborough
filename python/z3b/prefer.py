# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""A rule's own preference among its calls (Rule.prefer).

    prefer = [
        Longest('1H', '1S'),                          # a five-card major, the longer first
        '1S', '1H',                                   # five-five: spades
        Longest('1C', '1D'),                          # the longer minor
        ('1C', z3.And(clubs == 3, diamonds == 3)),    # three-three: clubs
        '1D', '1C',                                   # four-four: diamonds
    ]

Entries are read best first.  A plain call name, Highest(...) and Cheapest(...) place their
calls unconditionally; a call takes the first such entry that names it, and a call no entry
names comes after every entry, cheapest first.  Longest(...) and (names, condition) add a
variant of each named call that ranks at that entry when the hand meets the condition; the
variant is negated for partner like any better unmade call, so bidding 1S with Longest
in force denies that hearts are longer.  Within one entry, ties go to the cheaper call
(Highest: the dearer level, then the higher suit; HigherSuit: the higher suit, then the
cheaper level; LowestLevel: the lower level, then the higher suit).  The key of a variant is (entry index, tie index): a smaller key is
a better call."""

import z3
from core.call import Call
from z3b import model


class Entry(object):
    conditional = False

    def __init__(self, *names):
        self.names = tuple(names)

    def condition(self, history, call, others):
        return None

    def order_key(self, call):
        """Ties within the entry: the smaller key is the better call (cheapest first)."""
        return call


class Longest(Entry):
    """The named call whose suit is strictly longer than every other named suit."""
    conditional = True

    def condition(self, history, call, others):
        mine = model.expr_for_suit(call.strain)
        other_strains = sorted(set(other.strain for other in others if other.strain != call.strain))
        return z3.And([mine > model.expr_for_suit(strain) for strain in other_strains])


class Highest(Entry):
    """The named calls, the dearest first: the highest level the hand is worth."""

    def order_key(self, call):
        return (-call.level, -call.strain.index)


class HigherSuit(Entry):
    """The named calls, the higher suit first whatever the level (a jump shift or a reverse
    in spades before one in hearts); within a suit the cheaper call."""

    def order_key(self, call):
        return (-call.strain.index, call.level)


class LowestLevel(Entry):
    """The named calls, the lowest level first and the higher suit first within a level
    (a natural part score: 2S before 2H before 3C)."""

    def order_key(self, call):
        return (call.level, -call.strain.index)


class Cheapest(Entry):
    """The named calls, the cheapest first (the default for calls no entry names)."""


class Conditional(Entry):
    """A (names, condition[, order]) entry: the named calls rank here when the hand meets
    the condition; `order` is an Entry class (Cheapest, Highest, LowestLevel) for the ties."""
    conditional = True

    def __init__(self, names, condition, order=Cheapest):
        Entry.__init__(self, *names)
        self._condition = condition
        self._order = order()

    def condition(self, history, call, others):
        return self._condition

    def order_key(self, call):
        return self._order.order_key(call)


def _normalize(prefer):
    entries = []
    for entry in prefer:
        if isinstance(entry, Entry):
            entries.append(entry)
        elif isinstance(entry, str):
            entries.append(Cheapest(entry))
        elif isinstance(entry, tuple) and len(entry) in (2, 3) and not isinstance(entry[1], str):
            names = (entry[0],) if isinstance(entry[0], str) else tuple(entry[0])
            entries.append(Conditional(names, *entry[1:]))
        else:
            assert False, "prefer entry %r is not a call name, a tuple (names, condition) or an Entry" % (entry,)
    return entries


def variants(prefer, known_calls, history, call):
    """(key, condition) pairs for `call`: one unconditional variant and one per conditional
    entry naming the call.  `condition` is None or a z3 expression / Constraint to fold into
    the meaning."""
    entries = _normalize(prefer)
    unconditional = None
    result = []
    for index, entry in enumerate(entries):
        if call.name not in entry.names:
            continue
        named = sorted((Call.from_string(name) for name in entry.names), key=entry.order_key)
        tie = [other.name for other in named].index(call.name)
        if entry.conditional:
            others = [other for other in named if other.name != call.name]
            result.append(((index, tie), entry.condition(history, call, others)))
        elif unconditional is None:
            unconditional = ((index, tie), None)
    if unconditional is None:
        unnamed = sorted(known for known in known_calls
                         if not any(known.name in entry.names for entry in entries if not entry.conditional))
        unconditional = ((len(entries), [known.name for known in unnamed].index(call.name)), None)
    result.append(unconditional)
    return result


def names(prefer):
    """Every call name a prefer list mentions."""
    return set(name for entry in _normalize(prefer) for name in entry.names)
