import json
import unittest
from pathlib import Path

import yarborough_z3b as api


GOLDEN_CASES_PATH = Path(__file__).parents[2] / "tests" / "z3b_golden_cases.json"


class Z3bGoldenCasesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with GOLDEN_CASES_PATH.open(encoding="utf-8") as cases_file:
            cls.cases = json.load(cases_file)

    def test_z3b_golden_cases(self):
        for case in self.cases:
            with self.subTest(identifier=case["identifier"]):
                self.assertEqual(
                    api.get_next_call(case["identifier"]),
                    case["call_name"],
                )
                self.assertEqual(
                    api.get_suggested_call(case["identifier"]),
                    {
                        "call_name": case["call_name"],
                        "rule_name": case["rule_name"],
                        "description": case["description"],
                        "knowledge_string": case["knowledge_string"],
                    },
                )
