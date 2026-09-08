# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Every possible call for a hand in an auction, with its rule and priority, and the maximal
ones the bidder chooses among.

    python -m analysis.explain "K73.A3.AJ7654.A9" "1H P 2H P" [--expected 3H]

With --expected, each meaning of that call's rule is tested against the hand conjunct by
conjunct, to show which part of it the hand fails.
"""

import sys

from core.callhistory import CallHistory
from core.hand import Hand
from z3b.bidder import Bidder, Interpreter, RuleSelector, _solver_pool
from z3b.model import is_possible
from core.call import Call


def main(argv):
    expected = None
    if "--expected" in argv:
        index = argv.index("--expected")
        expected = Call.from_string(argv[index + 1])
        argv = argv[:index] + argv[index + 2:]
    hand = Hand.from_cdhs_string(argv[0])
    history_string = argv[1] if len(argv) > 1 else ""
    interpreter = Interpreter()
    with interpreter.create_history(CallHistory.from_string(history_string, dealer_char="N")) as history:
        selector = RuleSelector(Bidder().system, history)
        possible = selector.possible_calls_for_hand(hand, None)
        maximal = possible.maximal_calls_and_priorities()
        print("possible calls:")
        for call, priority in sorted(possible._calls_and_priorities, key=lambda pair: (pair[1].rank, pair[0].name)):
            mark = "*" if [call, priority] in maximal else " "
            print("  %s %-3s %-40s %s" % (mark, call.name, selector.rule_for_call(call).name, priority))
        print("maximal: %s" % ", ".join("%s (%s)" % (c.name, p) for c, p in maximal))
        if expected is not None:
            rule = selector.rule_for_call(expected)
            print("\n%s for %s:" % (rule, expected.name) if rule else "\nno rule claims %s" % expected.name)
            if rule:
                solver = _solver_pool.borrow_solver_for_hand(hand)
                for priority, meaning in rule.meaning_of(history, expected):
                    print("  %s: %s" % (priority, "fits" if is_possible(solver, meaning) else "does not fit"))
                    children = meaning.children() if hasattr(meaning, "children") and meaning.children() else [meaning]
                    for child in children:
                        print("     %s %s" % ("ok " if is_possible(solver, child) else "NO ", str(child).replace("\n", " ")[:150]))
                _solver_pool.restore(solver)


if __name__ == "__main__":
    main(sys.argv[1:])
