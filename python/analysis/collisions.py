# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Per-auction overlap check: which pairs of rules of one purpose can both fit a hand.

    python -m analysis.collisions [--all] [--top N] [--purpose NAME] [--rule NAME]

At every auction the corpus visits (every prefix of every expectation's history, at the
seat to call), for every purpose and strain rank, every pair of possible-call variants from
two different rules at the same fallback level, is put to
z3 with the hand axioms: satisfiable means some hand fits both, and the bidder's choice
between them is a collision waiting to happen.  Hand
independent: this finds every collision reachable from the corpus's auctions, for every
hand, and names the pair."""

import collections
import itertools
import os
import sys
import z3

PYTHON = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PYTHON)

from core.callhistory import CallHistory
from tests import test_sayc_data
from z3b import model
from z3b.bidder import Interpreter, RuleSelector, is_possible
import z3b.sayc as sayc


def corpus_histories():
    seen = set()
    for group, expectations in sorted(test_sayc_data.sayc_expectations.items()):
        for expectation in expectations:
            history_string = expectation[2] if len(expectation) > 2 else ""
            vulnerability = expectation[3] if len(expectation) > 3 else None
            calls = history_string.split()
            for n in range(len(calls) + 1):
                key = (" ".join(calls[:n]), vulnerability)
                if key in seen:
                    continue
                seen.add(key)
                yield CallHistory.from_string(key[0], vulnerability_string=vulnerability)


def variants_by_group(selector, history, ordering):
    """{(purpose, strain): [(rule, call, priority, meaning)]} for the possible calls.  A
    variant's meaning excludes the hands where a better variant of the same call fits: on
    those the bidder never chooses this variant, so it cannot collide."""
    groups = collections.defaultdict(list)
    for call in history.legal_calls:
        rule = selector.rule_for_call(call)
        if not rule or rule.requires_planning:
            continue
        variants = list(rule.meaning_of(history, call))
        for priority, meaning in variants:
            shadows = [z3.Not(other) for other_priority, other in variants if ordering.lt(priority, other_priority)]
            groups[(priority.purpose, priority.strain)].append((rule, call, priority, z3.And([meaning] + shadows)))
    return groups


def main(argv):
    top = int(argv[argv.index("--top") + 1]) if "--top" in argv else 60
    include_ordered = "--all" in argv
    only_purpose = argv[argv.index("--purpose") + 1] if "--purpose" in argv else None
    only_rule = argv[argv.index("--rule") + 1] if "--rule" in argv else None
    system = sayc.StandardAmericanYellowCard
    ordering = system.priority_ordering
    solver = z3.SolverFor('QF_LIA')
    solver.add(model.axioms)
    pairs = collections.Counter()
    examples = {}
    checked = 0
    histories = 0
    for call_history in corpus_histories():
        if call_history.is_complete():
            continue
        histories += 1
        with Interpreter().create_history(call_history) as history:
            selector = RuleSelector(system, history)
            for (purpose, strain), variants in variants_by_group(selector, history, ordering).items():
                if only_purpose and purpose != only_purpose:
                    continue
                for a, b in itertools.combinations(variants, 2):
                    rule_a, call_a, pa, ma = a
                    rule_b, call_b, pb, mb = b
                    if rule_a.name == rule_b.name or pa.fallback != pb.fallback:
                        continue  # a fallback is ordered against every other level
                    if only_rule and only_rule not in (rule_a.name, rule_b.name):
                        continue
                    ordered = ordering.lt(pa, pb) or ordering.lt(pb, pa)
                    if ordered and not include_ordered:
                        continue
                    checked += 1
                    if not is_possible(solver, z3.And(ma, mb)):
                        continue
                    key = tuple(sorted([(rule_a.name, call_a.name), (rule_b.name, call_b.name)])) + (purpose, "ordered" if ordered else "COLLISION")
                    pairs[key] += 1
                    examples.setdefault(key, call_history.calls_string())
    print("auctions: %d, pairs checked: %d, satisfiable pairs: %d (%d distinct)" % (
        histories, checked, sum(pairs.values()), len(pairs)))
    for key, count in pairs.most_common(top):
        (rule_a, call_a), (rule_b, call_b), purpose, status = key
        print("  %4d  %-9s %-22s %s %s  vs  %s %s   e.g. '%s'" % (
            count, status, purpose, rule_a, call_a, rule_b, call_b, examples[key]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
