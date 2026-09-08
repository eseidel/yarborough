# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Which negation makes a call uninterpretable?  For an auction and the next call, list the
higher-purpose unmade calls whose negation, added to the call's own meaning, leaves no
hand at all (each tested alone, then the smallest failing set is reported).

    python -m analysis.why_inconsistent "1N P 2C P 2S P" 3C
"""

import sys

import z3

from core.call import Call
from core.callhistory import CallHistory
from z3b.bidder import Bidder, Interpreter, RuleSelector
from z3b.model import positions, is_possible


def main(argv):
    history_string, call_name = argv[0], argv[1]
    call = Call.from_string(call_name)
    interpreter = Interpreter()
    with interpreter.create_history(CallHistory.from_string(history_string, dealer_char="N")) as history:
        selector = RuleSelector(Bidder().system, history)
        rule = selector.rule_for_call(call)
        print("rule:", rule)
        meanings = list(rule.meaning_of(history, call))
        solver = history._solver()
        for priority, meaning in meanings:
            print("\nmeaning at %s: %s" % (priority, "possible" if history.is_consistent(positions.Me, meaning) else "IMPOSSIBLE on its own"))
            culprits = []
            for unmade_call, unmade_rule in selector._call_to_rule.items():
                if unmade_rule.requires_planning:
                    continue
                for unmade_priority, unmade_meaning in unmade_rule.meaning_of(history, unmade_call):
                    if selector.system.priority_ordering.lt(priority, unmade_priority):
                        if not history.is_consistent(positions.Me, z3.And(meaning, z3.Not(unmade_meaning))):
                            culprits.append((unmade_call.name, unmade_rule.name, unmade_priority))
            if culprits:
                print("  a single negation that kills it:")
                for c in culprits:
                    print("    not %s (%s at %s)" % c)
                continue
            # No single negation is enough: shrink the set of higher negations to a minimal
            # unsatisfiable core by deletion.
            higher = []
            for unmade_call, unmade_rule in selector._call_to_rule.items():
                if unmade_rule.requires_planning:
                    continue
                for unmade_priority, unmade_meaning in unmade_rule.meaning_of(history, unmade_call):
                    if selector.system.priority_ordering.lt(priority, unmade_priority):
                        higher.append((unmade_call.name, unmade_rule.name, unmade_priority, unmade_meaning))

            def consistent(items):
                return history.is_consistent(positions.Me, z3.And([meaning] + [z3.Not(m) for _, _, _, m in items]))

            if consistent(higher):
                print("  consistent with every higher negation: the call is possible")
                continue
            core = list(higher)
            index = 0
            while index < len(core):
                trial = core[:index] + core[index + 1:]
                if consistent(trial):
                    index += 1
                else:
                    core = trial
            print("  minimal set of negations that kills it:")
            for c in core:
                print("    not %s (%s at %s)" % c[:3])


if __name__ == "__main__":
    main(sys.argv[1:])
