// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// `src/engine/analysis/random-deals.ts`: the report and the counting of
// python/analysis/random_deals.py.
//
// The deals a seed selects are not the Python's (randomness is not behavior,
// plan hazard 11), so what the audit is pinned on here is a small seeded run:
// the same seed bids the same way twice, with no exception.  What the bidder
// answers on a hand is gated by the SAYC corpus baseline
// (`pnpm baseline:check`).

import { describe, expect, it } from "vitest";
import {
  audit,
  type AuditReport,
  type AuditRow,
  diffLines,
  reportLines,
  run,
  savedText,
  seededDeals,
  USAGE,
} from "../random-deals";

describe("the seeded audit", () => {
  it("bids a small run twice the same way", { timeout: 300_000 }, () => {
    const first = audit({ deals: 3, source: seededDeals(20260920) });
    const second = audit({ deals: 3, source: seededDeals(20260920) });
    expect(first).toEqual(second);
    expect(first.rows).toHaveLength(3);
    for (const row of first.rows) {
      // Every auction is complete: four calls at least, three passes at the end.
      expect(row.calls.split(" ").length).toBeGreaterThanOrEqual(4);
      expect(row.calls.endsWith("P P P")).toBe(true);
      expect(row.deal).toMatch(
        /^N: .* E: .* S: .* W: .*\(hcp: \d+ lp: \d+ sp: \d+\)$/,
      );
      expect(row.error).toBeUndefined();
    }
    expect(first.totals.exceptions).toBe(0);
  });

  it("deals a different board for each index", { timeout: 300_000 }, () => {
    const source = seededDeals(7);
    const deals = [0, 1, 2].map((index) => source(index));
    expect(new Set(deals.map((one) => one.deal.identifier)).size).toBe(3);
    expect(deals.map((one) => one.boardNumber)).toEqual([1, 2, 3]);
  });
});

/** A report with no bidding in it, for the formatting and file tests. */
function reportOf(rows: AuditRow[]): AuditReport {
  return {
    deals: rows.length,
    rows,
    totals: {
      collisions: rows.reduce((sum, row) => sum + row.collisions, 0),
      pass_or_double_collisions: rows.reduce(
        (sum, row) => sum + row.pass_or_double_collisions,
        0,
      ),
      nones: rows.reduce((sum, row) => sum + row.nones, 0),
      dropped: rows.reduce((sum, row) => sum + row.dropped, 0),
      exceptions: rows.filter((row) => row.error !== undefined).length,
    },
  };
}

const QUIET: AuditRow = {
  calls: "P P P P",
  collisions: 0,
  pass_or_double_collisions: 0,
  nones: 0,
  dropped: 0,
  deal: "N: one E: two S: three W: four",
};
const NOISY: AuditRow = {
  calls: "1C P 1H P P P",
  collisions: 1,
  pass_or_double_collisions: 1,
  nones: 2,
  dropped: 3,
  deal: "N: five E: six S: seven W: eight",
};

describe("the printed report", () => {
  it("reads as the Python's format strings print it", () => {
    expect(reportLines(reportOf([QUIET, NOISY]))).toEqual([
      "deals: 2  collisions: 1 (with a pass or double: 1)  no call: 2  " +
        "dropped calls: 3  exceptions: 0",
      "  N: five E: six S: seven W: eight | 1C P 1H P P P | " +
        "collisions 1 nones 2 dropped 3 ",
    ]);
  });

  it("names the exception on a deal that threw", () => {
    const broken: AuditRow = {
      calls: "EXCEPTION",
      collisions: 0,
      pass_or_double_collisions: 0,
      nones: 0,
      dropped: 0,
      error: "Error: partner's last call is artificial",
      deal: "N: nine E: ten S: jack W: queen",
    };
    expect(reportLines(reportOf([broken]))[1]).toBe(
      "  N: nine E: ten S: jack W: queen | EXCEPTION | collisions 0 nones 0 " +
        "dropped 0 Error: partner's last call is artificial",
    );
  });
});

describe("--save and --diff", () => {
  it("writes the JSON layout python's json.dump(rows, indent=0) writes", () => {
    expect(savedText([QUIET])).toBe(
      [
        "[",
        "{",
        '"calls": "P P P P",',
        '"collisions": 0,',
        '"pass_or_double_collisions": 0,',
        '"nones": 0,',
        '"dropped": 0,',
        '"deal": "N: one E: two S: three W: four"',
        "}",
        "]",
      ].join("\n"),
    );
    expect(JSON.parse(savedText([QUIET, NOISY]))).toEqual([QUIET, NOISY]);
  });

  it("lists the deals whose auction changed, and nothing else", () => {
    const after = { ...NOISY, calls: "1C P 2C P P P" };
    expect(diffLines([QUIET, NOISY], [QUIET, after], "before.json")).toEqual([
      "auctions changed against before.json: 1 of 2",
      "  N: five E: six S: seven W: eight\n    was 1C P 1H P P P\n" +
        "    now 1C P 2C P P P",
    ]);
  });

  it("compares only as far as the shorter run", () => {
    expect(diffLines([QUIET], [QUIET, NOISY], "before.json")[0]).toBe(
      "auctions changed against before.json: 0 of 2",
    );
  });
});

describe("the command line", () => {
  it(
    "bids the deals it is asked for and saves them",
    { timeout: 300_000 },
    () => {
      const lines: string[] = [];
      const files = new Map<string, string>();
      const code = run(["--deals", "2", "--seed", "5", "--save", "out.json"], {
        readFile: (path) => files.get(path) ?? null,
        writeFile: (path, text) => void files.set(path, text),
        log: (line) => lines.push(line),
      });
      expect(code).toBe(0);
      expect(lines[0]).toMatch(
        /^deals: 2 {2}collisions: \d+ \(with a pass or double: \d+\) {2}no call: \d+ {2}dropped calls: \d+ {2}exceptions: 0$/,
      );
      expect(lines.at(-1)).toBe("saved 2 auctions to out.json");
      const saved = JSON.parse(files.get("out.json")!) as AuditRow[];
      expect(saved).toHaveLength(2);
      // The same seed run again changes nothing.
      const again: string[] = [];
      expect(
        run(["--deals", "2", "--seed", "5", "--diff", "out.json"], {
          readFile: (path) => files.get(path) ?? null,
          writeFile: () => {},
          log: (line) => again.push(line),
        }),
      ).toBe(0);
      expect(again.at(-1)).toBe("auctions changed against out.json: 0 of 2");
    },
  );

  it("bids nothing when asked for no deals", () => {
    const lines: string[] = [];
    expect(
      run(["--deals", "0"], {
        readFile: () => null,
        writeFile: () => {},
        log: (line) => lines.push(line),
      }),
    ).toBe(0);
    expect(lines).toEqual([
      "deals: 0  collisions: 0 (with a pass or double: 0)  no call: 0  " +
        "dropped calls: 0  exceptions: 0",
    ]);
  });

  it("refuses a count that is not a whole number, and a missing value", () => {
    for (const argv of [
      ["--deals", "two"],
      ["--deals", "1.5"],
      ["--deals", "-1"],
      ["--seed"],
    ]) {
      const lines: string[] = [];
      expect(
        run(argv, {
          readFile: () => null,
          writeFile: () => {},
          log: (line) => lines.push(line),
        }),
      ).toBe(2);
      expect(lines.at(-1)).toContain(USAGE);
    }
  });

  it("says so when the file to diff against is missing", () => {
    const lines: string[] = [];
    expect(
      run(["--deals", "0", "--diff", "nowhere.json"], {
        readFile: () => null,
        writeFile: () => {},
        log: (line) => lines.push(line),
      }),
    ).toBe(2);
    expect(lines.at(-1)).toBe("no such file: nowhere.json");
  });
});
