# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""The random-deal audit: bid seeded random deals to completion with SAYC in all four seats
and count what the corpus cannot see.

    python -m analysis.random_deals [--deals N] [--seed S] [--save FILE] [--diff FILE]

Reports collisions (the bidder's choice was not ordered; those involving a pass or a double
separately, since the production choice resolves them systematically), hands with no call,
exceptions, and calls dropped because two rules claimed them at one category.  --save writes
every auction to FILE; --diff compares against a saved file and lists the deals whose auction
changed, the behavior-preserving gate of docs/purposes-dsl-proposal.md."""

import json
import os
import random
import sys
import traceback

PYTHON = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PYTHON)

from core.call import Call
from core.callhistory import CallHistory
from core.deal import Deal
from z3b.bidder import Bidder
from tests import outputcapture


def bid_deal(bidder, deal, board_number):
    history = CallHistory.empty_for_board_number(board_number)
    calls, collisions, pass_or_double_collisions, nones, dropped = [], 0, 0, 0, 0
    while not history.is_complete():
        hand = deal.hand_for(history.position_to_call())
        capture = outputcapture.OutputCapture()
        stdout, stderr = capture.capture_output()
        try:
            selection = bidder.call_selection_for(hand, history)
        finally:
            capture.restore_output()
        dropped += stdout.getvalue().count("Multiple rules have maximal category")
        if selection is None:
            nones += 1
            call = Call.from_string('P')
        else:
            call = selection.call
            if selection.collision:
                collisions += 1
                if any(not c.is_contract() for c in selection.collision[0]):
                    pass_or_double_collisions += 1
        history.calls.append(call)
    return {"calls": " ".join(c.name for c in history.calls), "collisions": collisions,
            "pass_or_double_collisions": pass_or_double_collisions, "nones": nones, "dropped": dropped}


def main(argv):
    deals = int(argv[argv.index("--deals") + 1]) if "--deals" in argv else 500
    seed = int(argv[argv.index("--seed") + 1]) if "--seed" in argv else 1
    save = argv[argv.index("--save") + 1] if "--save" in argv else None
    diff = argv[argv.index("--diff") + 1] if "--diff" in argv else None
    bidder = Bidder()
    rows = []
    totals = {"collisions": 0, "pass_or_double_collisions": 0, "nones": 0, "dropped": 0, "exceptions": 0}
    for i in range(deals):
        random.seed(seed * 1000003 + i)
        deal = Deal.random()
        try:
            row = bid_deal(bidder, deal, i % 16 + 1)
        except Exception:
            totals["exceptions"] += 1
            row = {"calls": "EXCEPTION", "collisions": 0, "pass_or_double_collisions": 0, "nones": 0, "dropped": 0,
                   "error": traceback.format_exc().strip().split("\n")[-1]}
        row["deal"] = deal.pretty_one_line() if hasattr(deal, "pretty_one_line") else str(deal)
        rows.append(row)
        for key in ("collisions", "pass_or_double_collisions", "nones", "dropped"):
            totals[key] += row[key]
    print("deals: %d  collisions: %d (with a pass or double: %d)  no call: %d  dropped calls: %d  exceptions: %d" % (
        deals, totals["collisions"], totals["pass_or_double_collisions"], totals["nones"], totals["dropped"], totals["exceptions"]))
    for row in rows:
        if row["collisions"] or row["nones"] or row["dropped"] or "error" in row:
            print("  %s | %s | collisions %d nones %d dropped %d %s" % (
                row["deal"], row["calls"], row["collisions"], row["nones"], row["dropped"], row.get("error", "")))
    if save:
        json.dump(rows, open(save, "w"), indent=0)
        print("saved %d auctions to %s" % (len(rows), save))
    if diff:
        before = json.load(open(diff))
        changed = [(b, a) for b, a in zip(before, rows) if b["calls"] != a["calls"]]
        print("auctions changed against %s: %d of %d" % (diff, len(changed), len(rows)))
        for b, a in changed[:40]:
            print("  %s\n    was %s\n    now %s" % (a["deal"], b["calls"], a["calls"]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
