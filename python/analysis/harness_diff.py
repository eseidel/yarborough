# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Run the corpus harness and rank what changed against the accepted baseline: the
(old rule -> new rule) pairs behind changed calls, the unordered pairs, and the
(expected -> got) pairs behind FAIL lines, so a purpose or ordering fix can go after the
biggest family first.

    python -m analysis.harness_diff [--top N]
"""

import collections
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PYTHON = os.path.dirname(HERE)
BASELINE_RULES = os.path.join(PYTHON, "tests", "baselines", "z3b_rules_baseline.txt")
BASELINE_OUT = os.path.join(PYTHON, "tests", "baselines", "z3b_baseline.txt")


def main(argv):
    top = int(argv[argv.index("--top") + 1]) if "--top" in argv else 25
    work = tempfile.mkdtemp()
    rules_path = os.path.join(work, "rules.txt")
    out_path = os.path.join(work, "out.txt")
    env = dict(os.environ, PYTHONHASHSEED="0")
    with open(out_path, "w") as out:
        subprocess.call([sys.executable, "-m", "tests.harness", "--dump", rules_path], cwd=PYTHON, stdout=out, stderr=subprocess.STDOUT, env=env)
    out = open(out_path).read()
    total = re.search(r"^Pass (\d+) .* of (\d+) total hands$", out, re.M)
    print("harness:", total.group(0) if total else "NO TOTAL LINE (crash?)")
    if not total:
        print(out[-2500:])
        return 2
    base_total = re.search(r"^Pass (\d+) .* of (\d+) total hands$", open(BASELINE_OUT).read(), re.M)
    print("baseline:", base_total.group(0))
    base = {}
    for line in open(BASELINE_RULES):
        parts = line.rstrip("\n").split("\t")
        base[parts[0]] = parts
    new = {}
    for line in open(rules_path):
        parts = line.rstrip("\n").split("\t")
        new[parts[0]] = parts
    changed = [(k, base[k], new[k]) for k in base if k in new and (base[k][1], base[k][2]) != (new[k][1], new[k][2])]
    print("changed calls: %d; now None: %d" % (len(changed), sum(1 for _, b, n in changed if n[1] == "None")))
    pairs = collections.Counter((b[2], n[2]) for _, b, n in changed)
    examples = {}
    for k, b, n in changed:
        examples.setdefault((b[2], n[2]), (k, b[1], n[1]))
    print("\n(old rule -> new rule) behind changed calls:")
    for (a, b), c in pairs.most_common(top):
        k, old_call, new_call = examples[(a, b)]
        print("  %4d  %-38s -> %-38s e.g. %s: %s -> %s" % (c, a, b, k.replace("-N:NO:", " | "), old_call, new_call))
    fails = collections.Counter()
    fail_examples = {}
    for m in re.finditer(r"^FAIL: (\S+) \(expected (\S+)\) for (\S+) .*history: ([^(\n]*)", out, re.M):
        got, expected, hand, history = m.groups()
        key = (expected, got)
        fails[key] += 1
        fail_examples.setdefault(key, (hand, history.strip().rstrip("-").strip()))
    def fail_keys(text):
        return set((m.group(3), m.group(4).strip().rstrip("-").strip(), m.group(2)) for m in re.finditer(
            r"^FAIL: (\S+) \(expected (\S+)\) for (\S+) .*history: ([^(\n]*)", text, re.M))
    base_text = open(BASELINE_OUT).read()
    base_keys = fail_keys(base_text)
    new_keys = fail_keys(out)
    print("\nFAIL lines: %d (baseline %d): new %d, fixed %d" % (
        len(new_keys), len(base_keys), len(new_keys - base_keys), len(base_keys - new_keys)))
    errors = re.findall(r"^ERROR: exception bidding (\S+) .*history: ([^(:\n]*)", out, re.M)
    if errors:
        print("ERROR lines (exceptions while bidding): %d, e.g. %s after '%s'" % (len(errors), errors[0][0], errors[0][1].strip()))
    new_fails = collections.Counter()
    new_examples = {}
    for m in re.finditer(r"^FAIL: (\S+) \(expected (\S+)\) for (\S+) .*history: ([^(\n]*)", out, re.M):
        got, expected, hand, history = m.groups()
        if (hand, history.strip().rstrip("-").strip(), expected) in base_keys:
            continue
        new_fails[(expected, got)] += 1
        new_examples.setdefault((expected, got), (hand, history.strip().rstrip("-").strip()))
    print("NEW failures (expected -> got):")
    for (e, g), c in new_fails.most_common(top):
        print("  %4d  %s -> %-5s e.g. %s after %r" % (c, e, g, new_examples[(e, g)][0], new_examples[(e, g)][1]))
    fixed = sorted(base_keys - new_keys)
    if fixed:
        print("fixed: " + "; ".join("%s after %r" % (h, hist) for h, hist, _ in fixed[:12]) + (" ..." if len(fixed) > 12 else ""))
    collisions = collections.Counter()
    for m in re.finditer(r"^COLLISION: calls (\[[^\]]*\]) rules (\[[^\]]*\]) priorities (\[[^\]]*\]) for (\S+) .*history: ([^(\n]*)", out, re.M):
        collisions[(m.group(1), m.group(2))] += 1
    summary = re.search(r"^Collisions (\d+) \(.*; (\d+) with a pass or double\), no call (\d+), dropped calls (\d+)$", out, re.M)
    print("\ncollisions: %s (with a pass or double: %s), no call: %s, dropped calls: %s" % (summary.groups() if summary else ("?", "?", "?", "?")))
    for (calls, rules), c in collisions.most_common(top):
        print("  %4d  %s %s" % (c, calls, rules))
    print("\nfull output:", out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
