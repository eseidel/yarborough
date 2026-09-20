// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/analysis/random_deals.py, the second of the two
// developer tools phase 9 of docs/typescript-engine-plan.md keeps.
//
// The random-deal audit: bid seeded random deals to completion with SAYC in
// all four seats and count what the corpus cannot see.
//
//     pnpm random-deals [--deals N] [--seed S] [--save FILE] [--diff FILE]
//
// Reports collisions (the bidder's choice was not ordered; those involving a
// pass or a double separately, since the production choice resolves them
// systematically), hands with no call, exceptions, and calls dropped because
// two rules claimed them at one category.  --save writes every auction to
// FILE; --diff compares against a saved file and lists the deals whose
// auction changed.
//
// The report format and the counting are the Python's, and --save writes the
// same JSON (`json.dump(rows, indent=0)`), so a file saved by either tool
// diffs against the other.  The deals themselves are not the Python's:
// randomness is not behavior (see `core/random.ts`), so a seed selects a
// different set here.  What a test pins instead is a recorded set of deals,
// through `dealSource`.
//
// `scripts/random-deals.mjs` is the launcher; everything here stays free of
// Node imports because `src/` is type-checked as browser code.

import { Call } from "../core/call";
import { CallHistory } from "../core/callhistory";
import { Deal } from "../core/deal";
import { mulberry32 } from "../core/random";
import { Bidder, setBidderLog } from "../z3b/bidder";

/** The dropped-call warning `RuleSelector` prints, counted per decision. */
const DROPPED_CALL_WARNING = "Multiple rules have maximal category";

/** One row of the audit, and of the `--save` file. */
export interface AuditRow {
  calls: string;
  collisions: number;
  pass_or_double_collisions: number;
  nones: number;
  dropped: number;
  error?: string;
  deal: string;
}

/** What one deal's auction cost, before the deal itself is added. */
export type AuctionCounts = Omit<AuditRow, "deal" | "error">;

export interface AuditTotals {
  collisions: number;
  pass_or_double_collisions: number;
  nones: number;
  dropped: number;
  exceptions: number;
}

export interface AuditReport {
  deals: number;
  rows: AuditRow[];
  totals: AuditTotals;
}

/** A deal to bid and the board it is dealt as (dealer and vulnerability). */
export interface AuditDeal {
  deal: Deal;
  boardNumber: number;
}

/**
 * Where the deals come from, by index.  The default is seeded and random;
 * a test passes recorded deals instead, so the audit is reproducible without
 * depending on the random number generator.
 */
export type DealSource = (index: number) => AuditDeal;

/**
 * The Python's deals: `random.seed(seed * 1000003 + index)` then
 * `Deal.random()`, on board `index % 16 + 1`.  The generator differs, so the
 * deals do; the shape of the audit does not.
 */
export function seededDeals(seed: number): DealSource {
  return (index: number) => ({
    deal: Deal.random(mulberry32(seed * 1000003 + index)),
    boardNumber: (index % 16) + 1,
  });
}

/**
 * Bids one deal to completion in all four seats and counts what happened:
 * `bid_deal`.  A seat with no call passes, as the Python does.
 */
export function bidDeal(
  bidder: Bidder,
  deal: Deal,
  boardNumber: number,
): AuctionCounts {
  const history = CallHistory.emptyForBoardNumber(boardNumber);
  let collisions = 0;
  let passOrDoubleCollisions = 0;
  let nones = 0;
  let dropped = 0;
  while (!history.isComplete()) {
    const hand = deal.handFor(history.positionToCall());
    // outputcapture.OutputCapture: what the bidder prints while it decides.
    let stdout = "";
    const previous = setBidderLog((line) => {
      stdout += `${line}\n`;
    });
    let selection;
    try {
      selection = bidder.callSelectionFor(hand, history);
    } finally {
      setBidderLog(previous);
    }
    dropped += stdout.split(DROPPED_CALL_WARNING).length - 1;
    let call: Call;
    if (selection === null) {
      nones += 1;
      call = Call.fromString("P");
    } else {
      call = selection.call;
      if (selection.collision) {
        collisions += 1;
        if (selection.collision[0].some((one) => !one.isContract())) {
          passOrDoubleCollisions += 1;
        }
      }
    }
    history.calls.push(call);
  }
  return {
    calls: history.calls.map((one) => one.name).join(" "),
    collisions,
    pass_or_double_collisions: passOrDoubleCollisions,
    nones,
    dropped,
  };
}

/** Python's `traceback.format_exc().strip().split("\n")[-1]`. */
function lastLine(error: unknown): string {
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : `${error}`;
  return text.trim().split("\n").pop() ?? "";
}

export interface AuditRequest {
  /** How many deals to bid. */
  deals: number;
  /** Where they come from; `seededDeals(1)` by default, as the Python. */
  source?: DealSource;
}

/** The audit itself: `main`'s loop, without the printing. */
export function audit(request: AuditRequest): AuditReport {
  const source = request.source ?? seededDeals(1);
  const bidder = new Bidder();
  const rows: AuditRow[] = [];
  const totals: AuditTotals = {
    collisions: 0,
    pass_or_double_collisions: 0,
    nones: 0,
    dropped: 0,
    exceptions: 0,
  };
  for (let index = 0; index < request.deals; index++) {
    const { deal, boardNumber } = source(index);
    let row: AuditRow;
    try {
      row = { ...bidDeal(bidder, deal, boardNumber), deal: "" };
    } catch (error) {
      totals.exceptions += 1;
      row = {
        calls: "EXCEPTION",
        collisions: 0,
        pass_or_double_collisions: 0,
        nones: 0,
        dropped: 0,
        error: lastLine(error),
        deal: "",
      };
    }
    row.deal = deal.prettyOneLine();
    rows.push(row);
    totals.collisions += row.collisions;
    totals.pass_or_double_collisions += row.pass_or_double_collisions;
    totals.nones += row.nones;
    totals.dropped += row.dropped;
  }
  return { deals: request.deals, rows, totals };
}

/** The report `main` prints: the totals, then every row worth looking at. */
export function reportLines(report: AuditReport): string[] {
  const { totals } = report;
  const lines = [
    `deals: ${report.deals}  collisions: ${totals.collisions} ` +
      `(with a pass or double: ${totals.pass_or_double_collisions})  ` +
      `no call: ${totals.nones}  dropped calls: ${totals.dropped}  ` +
      `exceptions: ${totals.exceptions}`,
  ];
  for (const row of report.rows) {
    if (row.collisions || row.nones || row.dropped || row.error !== undefined) {
      lines.push(
        `  ${row.deal} | ${row.calls} | collisions ${row.collisions} ` +
          `nones ${row.nones} dropped ${row.dropped} ${row.error ?? ""}`,
      );
    }
  }
  return lines;
}

/** What `--diff` prints against a file `--save` wrote. */
export function diffLines(
  before: readonly AuditRow[],
  rows: readonly AuditRow[],
  path: string,
): string[] {
  const changed: [AuditRow, AuditRow][] = [];
  for (let index = 0; index < Math.min(before.length, rows.length); index++) {
    if (before[index].calls !== rows[index].calls) {
      changed.push([before[index], rows[index]]);
    }
  }
  const lines = [
    `auctions changed against ${path}: ${changed.length} of ${rows.length}`,
  ];
  for (const [was, now] of changed.slice(0, 40)) {
    lines.push(`  ${now.deal}\n    was ${was.calls}\n    now ${now.calls}`);
  }
  return lines;
}

/** Python's `json.dump(rows, file, indent=0)`, so both tools write one format. */
export function savedText(rows: readonly AuditRow[]): string {
  const object = (row: AuditRow): string =>
    `{\n${Object.entries(row)
      .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
      .join(",\n")}\n}`;
  return `[\n${rows.map(object).join(",\n")}\n]`;
}

/** Everything the command line needs from outside: the launcher provides it. */
export interface RandomDealsHost {
  /** File contents, or null when the file does not exist. */
  readFile: (path: string) => string | null;
  writeFile: (path: string, text: string) => void;
  log: (message: string) => void;
}

export const USAGE =
  "usage: pnpm random-deals [--deals N] [--seed S] [--save FILE] [--diff FILE]";

/** The value of `--name`, or null when it is absent. */
function option(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  if (index + 1 >= argv.length) {
    throw new Error(`${name} needs a value`);
  }
  return argv[index + 1];
}

/** `pnpm random-deals`: `main`, with the file system and the output injected. */
export function run(argv: readonly string[], host: RandomDealsHost): number {
  let deals: number;
  let seed: number;
  let save: string | null;
  let diff: string | null;
  try {
    deals = Number(option(argv, "--deals") ?? 500);
    seed = Number(option(argv, "--seed") ?? 1);
    save = option(argv, "--save");
    diff = option(argv, "--diff");
  } catch (error) {
    host.log(`${lastLine(error)}\n${USAGE}`);
    return 2;
  }
  if (!Number.isInteger(deals) || deals < 0 || !Number.isInteger(seed)) {
    host.log(USAGE);
    return 2;
  }
  const report = audit({ deals, source: seededDeals(seed) });
  for (const line of reportLines(report)) {
    host.log(line);
  }
  if (save) {
    host.writeFile(save, savedText(report.rows));
    host.log(`saved ${report.rows.length} auctions to ${save}`);
  }
  if (diff) {
    const text = host.readFile(diff);
    if (text === null) {
      host.log(`no such file: ${diff}`);
      return 2;
    }
    const before = JSON.parse(text) as AuditRow[];
    for (const line of diffLines(before, report.rows, diff)) {
      host.log(line);
    }
  }
  return 0;
}
