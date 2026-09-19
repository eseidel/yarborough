# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""The fixture exporter (tests/export_fixtures.py) is deterministic and --check works.

A small export (three harness tests, two random deals) runs twice in child processes under
different PYTHONHASHSEED values; the second run is --check against the first, so the files
must match byte for byte.  Then a corrupted file must make --check fail."""

import json
import os
import subprocess
import sys
import tempfile
import unittest

from tests import export_fixtures

PYTHON = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _run(arguments, hash_seed):
    env = dict(os.environ, PYTHONHASHSEED=hash_seed)
    return subprocess.run([sys.executable, "-m", "tests.export_fixtures", "--limit", "3", "--deals", "2", "--jobs", "1"]
                          + arguments, cwd=PYTHON, env=env, capture_output=True, text=True, timeout=600)


class ExportFixturesTest(unittest.TestCase):
    def test_export_is_deterministic_and_check_diffs(self):
        with tempfile.TemporaryDirectory() as out:
            first = _run(["--out", out], "1")
            self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
            summary = json.loads(first.stdout)
            self.assertEqual(summary["decisions"], 3)
            self.assertEqual(summary["deals"], 2)
            self.assertEqual(summary["auction_errors"], [])
            self.assertEqual(summary["decision_errors"], [])
            self.assertEqual(sorted(os.listdir(out)), sorted(export_fixtures.FILES))

            self._check_shapes(out)

            second = _run(["--out", out, "--check"], "12345")
            self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
            self.assertIn("fixtures ok", second.stdout)

            with open(os.path.join(out, "decisions.jsonl"), "a", encoding="utf-8") as f:
                f.write('{"call":"7N"}\n')
            third = _run(["--out", out, "--check"], "1")
            self.assertEqual(third.returncode, 1, third.stdout + third.stderr)
            self.assertIn("decisions.jsonl", third.stdout)
            self.assertIn("fixtures differ", third.stdout)

    def _check_shapes(self, out):
        def load(name):
            with open(os.path.join(out, name), encoding="utf-8") as f:
                return json.load(f)

        def load_lines(name):
            with open(os.path.join(out, name), encoding="utf-8") as f:
                return [json.loads(line) for line in f]

        manifest = load("rules-manifest.json")
        self.assertGreater(len(manifest), 200)
        self.assertEqual([rule["name"] for rule in manifest], sorted(rule["name"] for rule in manifest))
        for key in ("name", "mro", "category", "purpose", "known_calls", "annotations", "annotations_for_call",
                    "fallback", "requires_planning", "forcing", "preconditions", "prefer", "shared_constraints",
                    "constraints", "conditional_purposes", "explanations_per_call"):
            self.assertIn(key, manifest[0])
        by_name = {rule["name"]: rule for rule in manifest}
        self.assertEqual(by_name["OneLevelSuitOpening"]["known_calls"], ["1C", "1D", "1H", "1S"])
        self.assertEqual(by_name["OneLevelSuitOpening"]["prefer"][0], {
            "type": "Longest", "names": ["1H", "1S"], "conditional": True})
        self.assertEqual(by_name["NaturalSuited"]["purpose"], "callable:natural_suited_purpose")
        self.assertIn("Artificial", by_name["StrongTwoClubs"]["annotations"])

        vocabulary = load("vocabulary.json")
        for key in ("purposes", "annotations", "rule_categories", "positions", "calls", "categories"):
            self.assertIn(key, vocabulary)
        self.assertEqual(vocabulary["purposes"]["ORDER"][0], "Planned")
        self.assertEqual(vocabulary["positions"], ["RHO", "Partner", "LHO", "Me"])
        self.assertEqual(len(vocabulary["calls"]), 38)

        categories = load("categories.json")
        self.assertEqual(set(categories["rules"]), set(by_name))
        self.assertEqual(categories["roles"][0]["pass_category"], ["Opening", "Passing", "Pass"])

        expressions = load("model-expressions.json")
        self.assertEqual(expressions["axioms"][0], "(= (+ spades hearts diamonds clubs) 13)")
        self.assertIn("balanced", expressions["named"])
        self.assertEqual(expressions["NO_CONSTRAINTS"], "true")

        snapshots = load_lines("auction-snapshots.jsonl")
        self.assertGreaterEqual(len(snapshots), 3)
        for key in ("dealer", "vulnerability", "calls", "legal_calls", "views", "call_to_rule", "dropped_calls",
                    "bid_suit_naturally", "first_natural_bidder", "forced_to_bid", "us", "them", "everyone"):
            self.assertIn(key, snapshots[0])
        self.assertEqual(set(snapshots[0]["views"]), {"Me", "Partner", "LHO", "RHO"})

        meanings = load_lines("meanings.jsonl")
        self.assertEqual(len(meanings), len(snapshots))
        record = meanings[0]["calls_and_rules"][0]
        for key in ("call", "rule", "variants", "negations", "constraints"):
            self.assertIn(key, record)
        self.assertEqual(len(record["constraints"]), 16)
        sample = load_lines("meanings-sample.jsonl")
        self.assertTrue(sample[0]["calls_and_rules"][0]["constraints"].startswith("(or"))

        decisions = load_lines("decisions.jsonl")
        self.assertEqual(len(decisions), 3)
        for key in ("group", "hand", "calls", "expected", "possible", "maximal", "collision", "call", "rule"):
            self.assertIn(key, decisions[0])

        interpretations = load_lines("interpretations.jsonl")
        self.assertEqual(len(interpretations), len(snapshots))
        self.assertIn("interpretations", interpretations[0])

        deals = load_lines("random-deals.jsonl")
        self.assertEqual(len(deals), 2)
        for key in ("board", "hands", "calls", "decisions", "lead"):
            self.assertIn(key, deals[0])

        cases = load("core-cases.json")
        for key in ("boards", "call_histories", "hands", "calls", "vulnerability", "positions", "leads", "bid_suits"):
            self.assertIn(key, cases)
        self.assertEqual(len(cases["boards"]), export_fixtures.CORE_BOARDS)
        self.assertTrue(all(board["round_trip"] for board in cases["boards"]))
        self.assertEqual(cases["vulnerability"]["1"]["name"], "None")
        self.assertEqual(cases["vulnerability"]["16"]["name"], "E-W")


if __name__ == "__main__":
    unittest.main()
