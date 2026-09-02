# Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import tempfile
import unittest

from tests import check_baseline


class Z3bBaselineTest(unittest.TestCase):
    """Every hand in test_sayc_data.py bids exactly as the accepted baseline says.

    A behavior change of the bidder (a different call, or the same call from a different
    rule) fails here.  Review the printed diff; if it is intended, commit it and run
    `python -m tests.check_baseline --accept`.  A known miss that got fixed is accepted
    without a new baseline.
    """

    def test_harness_matches_baseline(self):
        with tempfile.TemporaryDirectory() as work_dir:
            try:
                fixed, problems, rules_diff, total_line = check_baseline.check(work_dir)
            except check_baseline.HarnessDidNotComplete as error:
                self.fail(str(error))
        report = check_baseline.report(fixed, problems, rules_diff, total_line)
        self.assertFalse(problems or rules_diff, '\n' + report)
