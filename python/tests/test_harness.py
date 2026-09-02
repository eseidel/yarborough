# Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import os
import subprocess
import sys
import unittest


class HarnessTest(unittest.TestCase):
    def test_exception_in_bidder_fails_the_run(self):
        # A rule that raises must fail the run loudly, in the default multi-process mode too
        # (it used to raise inside the pool's result callback, which hung the run forever).
        python = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
        program = """
import unittest
from tests import harness, test_sayc_data

class Broken(object):
    def call_selection_for(self, hand, call_history, expected_call=None):
        raise RuntimeError('probe')

harness.bidder_class = Broken
test_sayc_data.sayc_expectations = {'probe': [['KQ4.AQ8.K9873.K2', '1N']]}
suite = unittest.TestLoader().loadTestsFromTestCase(harness.TestHarness)
result = unittest.TextTestRunner(verbosity=0).run(suite)
raise SystemExit(0 if result.wasSuccessful() else 1)
"""
        run = subprocess.run([sys.executable, '-c', program], cwd=python, capture_output=True,
                             text=True, timeout=120)
        self.assertEqual(run.returncode, 1, run.stdout + run.stderr)
        self.assertIn("ERROR: exception bidding", run.stdout)
        self.assertIn("RuntimeError: probe", run.stdout)
        self.assertIn("1 hands raised an exception", run.stdout + run.stderr)
