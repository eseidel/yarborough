# Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Run the SAYC expectation harness and compare it with the accepted baseline.

    python -m tests.check_baseline            # exit 0 iff nothing changed except fixed misses
    python -m tests.check_baseline --accept   # make the current output the new baseline

Two files under tests/baselines/ are the baseline: z3b_baseline.txt is the harness output
itself (one FAIL line per known miss, group pass counts, coverage lists, WARNING lines for
ties), z3b_rules_baseline.txt is one line per test: the call made, the rule that made it,
and the rules used to interpret the last three calls.  Any difference is a behavior
change of the bidder.  The only difference this module accepts is a FAIL line that went
away (a known miss got fixed), that hand's own rules line, and the pass counts that move
with it.  --accept refuses an uncommitted tree and prints the diff it is accepting, so the
reviewed artifact is always the baseline diff in the commit.

tests/test_z3b_baseline.py runs the same comparison under unittest.
"""

import difflib
import os
import re
import subprocess
import sys
import tempfile

TESTS = os.path.dirname(os.path.abspath(__file__))
PYTHON = os.path.dirname(TESTS)
BASELINES = os.path.join(TESTS, 'baselines')
BASELINE = os.path.join(BASELINES, 'z3b_baseline.txt')
RULES_BASELINE = os.path.join(BASELINES, 'z3b_rules_baseline.txt')
TIMEOUT_SECONDS = 900  # a normal run takes under a minute
PASS_LINE = re.compile(r'^Pass (\d+)( \([0-9.]+%\))? of (\d+) (total )?hands$')
FAIL_LINE = re.compile(r'^FAIL: (\S+) \(expected (\S+)\) for (\S+) .*history:\s*([^(]*?)\s*(\(subtest.*)?$')


class HarnessDidNotComplete(Exception):
    pass


def normalize(text):
    lines = []
    for line in text.splitlines():
        line = line.rstrip()
        if line.startswith('FAIL:'):
            line = line.rstrip('.')
        lines.append(line)
    return lines


def run_harness(work_dir):
    """Run the harness in a child process; return (output text, rules dump path).

    A child process pins PYTHONHASHSEED (set iteration order shows in a few WARNING lines)
    and keeps the multiprocessing pool out of the caller's process.
    """
    actual = os.path.join(work_dir, 'z3b_actual.txt')
    actual_err = os.path.join(work_dir, 'z3b_actual.err')
    rules_actual = os.path.join(work_dir, 'z3b_rules_actual.txt')
    env = dict(os.environ, PYTHONHASHSEED='0')
    with open(actual, 'w') as out, open(actual_err, 'w') as err:
        try:
            subprocess.call([sys.executable, '-m', 'tests.harness', '--dump', rules_actual],
                            cwd=PYTHON, stdout=out, stderr=err, env=env, timeout=TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            raise HarnessDidNotComplete('HARNESS TIMED OUT after %ds (a hung worker? see %s)'
                                        % (TIMEOUT_SECONDS, actual_err))
    with open(actual) as f:
        text = f.read()
    errors = [line for line in text.splitlines() if line.startswith('ERROR:')]
    if errors or not re.search(r'^Pass \d+ .* total hands$', text, re.M):
        with open(actual_err) as f:
            stderr_tail = f.read()[-1500:]
        raise HarnessDidNotComplete(text[-3000:] + '\n' + stderr_tail
                                    + '\nHARNESS DID NOT COMPLETE CLEANLY (%d hands raised)' % len(errors))
    return text, rules_actual


def read(path):
    if not os.path.exists(path):
        raise HarnessDidNotComplete('missing %s (run with --accept to create it)' % path)
    with open(path) as f:
        return f.read()


def compare_output(baseline, actual):
    fixed, problems = [], []
    for line in difflib.unified_diff(baseline, actual, n=0, lineterm=''):
        if line.startswith(('---', '+++', '@@')):
            continue
        if line.startswith('-') and line[1:].startswith('FAIL:'):
            fixed.append(line[1:])
        elif PASS_LINE.match(line[1:]):
            continue  # pass counts move with fixed misses; the hand counts are checked below
        else:
            problems.append(line)
    old_counts = [PASS_LINE.match(l).group(3) for l in baseline if PASS_LINE.match(l)]
    new_counts = [PASS_LINE.match(l).group(3) for l in actual if PASS_LINE.match(l)]
    if old_counts != new_counts:
        problems.append('hand counts changed: %s -> %s' % (old_counts, new_counts))
    return fixed, problems


def compare_rules(fixed, rules_baseline_text, rules_actual_text):
    rules_diff = [l for l in difflib.unified_diff(rules_baseline_text.splitlines(),
                                                  rules_actual_text.splitlines(),
                                                  n=0, lineterm='')
                  if not l.startswith(('---', '+++', '@@'))]
    # A fixed miss changes its own rules line (the call is now the expected one): accept
    # exactly that line pair, nothing else.
    expected_by_hand = {}
    for line in fixed:
        m = FAIL_LINE.match(line)
        if m:
            expected_by_hand[(m.group(3), m.group(4).strip())] = m.group(2)

    def is_fixed_line(l):
        identifier, call = l[1:].split('\t')[:2]
        hand, history = identifier.split('-', 1)[0], identifier.split(':')[-1].replace(',', ' ')
        want = expected_by_hand.get((hand, history))
        return want is not None and (l.startswith('-') or call == want)
    return [l for l in rules_diff if not is_fixed_line(l)]


def check(work_dir):
    """Return (fixed, problems, rules_diff, total_line).  Raises HarnessDidNotComplete."""
    text, rules_actual = run_harness(work_dir)
    actual = normalize(text)
    baseline = normalize(read(BASELINE))
    fixed, problems = compare_output(baseline, actual)
    rules_diff = compare_rules(fixed, read(RULES_BASELINE), read(rules_actual))
    total = [l for l in actual if PASS_LINE.match(l) and 'total' in l]
    return fixed, problems, rules_diff, (total[-1] if total else 'no total line')


def report(fixed, problems, rules_diff, total_line):
    lines = ['fixed: ' + line for line in fixed]
    lines += ['CHANGED: ' + line for line in problems]
    lines += ['RULES CHANGED: ' + line for line in rules_diff]
    lines.append(total_line)
    if problems or rules_diff:
        lines.append('BASELINE MISMATCH: %d output lines, %d rule lines' % (len(problems), len(rules_diff)))
    else:
        lines.append('baseline ok (%d fixed misses)' % len(fixed))
    return '\n'.join(lines)


def accept():
    dirty = subprocess.run(['git', 'status', '--porcelain', '--', PYTHON], cwd=PYTHON,
                           capture_output=True, text=True).stdout
    if dirty.strip():
        print('refusing to accept with uncommitted changes:\n' + dirty)
        return 2
    with tempfile.TemporaryDirectory() as work_dir:
        text, rules_actual = run_harness(work_dir)
        os.makedirs(BASELINES, exist_ok=True)
        for actual_text, baseline in ((text, BASELINE), (read(rules_actual), RULES_BASELINE)):
            if os.path.exists(baseline):
                for line in difflib.unified_diff(normalize(read(baseline)), normalize(actual_text),
                                                 fromfile=baseline, tofile='actual', n=0, lineterm=''):
                    print(line)
            with open(baseline, 'w') as f:
                f.write(actual_text)
    print('accepted: %s, %s' % (BASELINE, RULES_BASELINE))
    return 0


def main(argv):
    if '--accept' in argv:
        return accept()
    with tempfile.TemporaryDirectory() as work_dir:
        try:
            fixed, problems, rules_diff, total_line = check(work_dir)
        except HarnessDidNotComplete as error:
            print(error)
            return 2
    print(report(fixed, problems, rules_diff, total_line))
    return 1 if problems or rules_diff else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
