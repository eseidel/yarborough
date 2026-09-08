# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Classify harness misses by root cause.  Reads lines of the form

    EXPECTED -> GOT | HAND (hcp/lp/sp) | HISTORY

(analysis.harness_diff's full output, reformatted) and reports, per hand, whether the
expected call is possible at all (if not, which conjunct of which rule the hand fails, or
that no rule claims it) and, if it is, which call outranked it and at what purposes.

    python -m analysis.triage fails.txt
"""

import re
import sys

from core.call import Call
from core.callhistory import CallHistory
from core.hand import Hand
from z3b.bidder import Bidder, Interpreter, RuleSelector, _solver_pool
from z3b.model import is_possible


def triage(hand_string, history_string, expected_name, system):
    hand = Hand.from_cdhs_string(hand_string)
    expected = Call.from_string(expected_name)
    interpreter = Interpreter()
    with interpreter.create_history(CallHistory.from_string(history_string, dealer_char="N")) as history:
        selector = RuleSelector(system, history)
        rule = selector.rule_for_call(expected)
        if rule is None:
            return "NO-RULE", "no rule claims %s" % expected_name
        possible = selector.possible_calls_for_hand(hand, None)
        maximal = possible.maximal_calls_and_priorities()
        expected_priorities = [p for c, p in possible._calls_and_priorities if c == expected]
        if not expected_priorities:
            solver = _solver_pool.borrow_solver_for_hand(hand)
            failing = []
            for priority, meaning in rule.meaning_of(history, expected):
                children = meaning.children() if hasattr(meaning, "children") and meaning.children() else [meaning]
                bad = [str(c).replace("\n", " ")[:60] for c in children if not is_possible(solver, c)]
                if not bad:
                    bad = ["(fits the hand; killed by a higher negation)"]
                failing.append("%s: %s" % (priority, "; ".join(bad[:2])))
            _solver_pool.restore(solver)
            return "NOT-POSSIBLE", "%s: %s" % (rule.name, " | ".join(failing[:2]))
        winners = ["%s (%s)" % (c.name, p) for c, p in maximal]
        best = max(expected_priorities, key=lambda p: -p.rank)
        return "OUTRANKED", "%s at %s loses to %s" % (expected_name, best, ", ".join(winners[:3]))


def main(argv):
    system = Bidder().system
    counts = {}
    for line in open(argv[0]):
        m = re.match(r"(\S+) -> (\S+) \| (\S+) \([^)]*\) \| ([^(]*)", line.strip())
        if not m:
            continue
        expected, got, hand, history = m.groups()
        history = history.strip().rstrip("-").strip()
        try:
            kind, detail = triage(hand, history, expected, system)
        except Exception as e:
            kind, detail = "ERROR", repr(e)[:80]
        counts[kind] = counts.get(kind, 0) + 1
        print("%-13s %s -> %s | %s | %s :: %s" % (kind, expected, got, hand, history, detail))
        sys.stdout.flush()
    print("\ncounts:", counts)


if __name__ == "__main__":
    main(sys.argv[1:])
