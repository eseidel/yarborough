// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// `pnpm fixtures:check` / `pnpm fixtures:accept`: the `main` and `check` of
// python/tests/export_fixtures.py.  `scripts/export-fixtures.mjs` loads this
// module through Vite and supplies the `FixturesHost` below; everything here
// stays free of Node imports because `src/` is type-checked as browser code.
//
//     pnpm fixtures:check  [--deals N] [--seed S]
//     pnpm fixtures:accept [--deals N] [--seed S]
//     node scripts/export-fixtures.mjs --out DIR [--deals N] [--seed S] [--limit N]
//
// `check` regenerates every fixture in memory and diffs it against
// tests/engine-fixtures/, exit 1 with an excerpt of the differences.
// `accept` refuses a dirty git tree, writes the files and reports what
// changed, so the reviewed artifact is the diff of the commit that follows,
// as with `pnpm baseline:accept`.  `--out` writes the files elsewhere with no
// git check, the only mode that takes `--limit` (a quick, partial run).
//
// The deals: without `--seed`, the boards of the committed random-deals.jsonl
// and core-cases.json are dealt again (`--deals N` takes the first N of
// them), so a regeneration reproduces the files; `--seed S` draws a fresh
// set with the TypeScript RNG (`--deals N` of them, 300 by default), which
// changes random-deals.jsonl and the boards, leads and bid_suits of
// core-cases.json.

import { diffLines, splitLines } from "../harness/check_baseline";
import {
  DEFAULT_DEALS,
  type ExportOptions,
  type ExportResult,
  FILES,
  exportFixtures,
  freshSeedSet,
  type SeedSet,
  seedSetFromFixtures,
} from "./export";

/** Where the fixtures live, relative to the repository root. */
export const FIXTURES_DIR = "tests/engine-fixtures";

/** Everything the CLI needs from outside: the launcher provides it. */
export interface FixturesHost {
  /** File contents, or null when the file does not exist. */
  readFile: (path: string) => string | null;
  writeFile: (path: string, text: string) => void;
  /** `git status --porcelain` over the working tree. */
  gitStatus: () => string;
  log: (message: string) => void;
}

/** The regenerator itself; a test injects a small one. */
export type Exporter = (options: ExportOptions) => ExportResult;

export const USAGE =
  "usage: pnpm fixtures:check | pnpm fixtures:accept [--deals N] [--seed S]; --out DIR [--limit N] writes elsewhere";

/** How many changed lines a file's diff excerpt shows, and how wide a line may be. */
export const EXCERPT_LINES = 30;
export const EXCERPT_WIDTH = 240;

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

function integerOption(
  argv: readonly string[],
  name: string,
  minimum: number,
): number | null {
  const text = option(argv, name);
  if (text === null) {
    return null;
  }
  const value = Number(text);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer of at least ${minimum}`);
  }
  return value;
}

export interface ParsedArguments {
  accept: boolean;
  out: string | null;
  deals: number | null;
  seed: number | null;
  limit: number | null;
}

export function parseArguments(argv: readonly string[]): ParsedArguments {
  const known = new Set([
    "--accept",
    "--check",
    "--out",
    "--deals",
    "--seed",
    "--limit",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    if (!known.has(argv[index])) {
      throw new Error(`unknown argument ${argv[index]}`);
    }
    if (argv[index] !== "--accept" && argv[index] !== "--check") {
      index += 1;
    }
  }
  const parsed: ParsedArguments = {
    accept: argv.includes("--accept"),
    out: option(argv, "--out"),
    deals: integerOption(argv, "--deals", 0),
    seed: integerOption(argv, "--seed", 0),
    limit: integerOption(argv, "--limit", 0),
  };
  if (parsed.accept && parsed.out !== null) {
    throw new Error(
      "--accept writes to tests/engine-fixtures; --out is for another directory",
    );
  }
  if (parsed.limit !== null && parsed.out === null) {
    throw new Error("--limit produces partial fixtures: use it with --out");
  }
  return parsed;
}

/** The boards to deal, from the committed files or a fresh draw. */
export function seedSetFor(
  parsed: ParsedArguments,
  host: FixturesHost,
): SeedSet {
  if (parsed.seed !== null) {
    return freshSeedSet(parsed.deals ?? DEFAULT_DEALS, parsed.seed);
  }
  const randomDeals = host.readFile(`${FIXTURES_DIR}/random-deals.jsonl`);
  const coreCases = host.readFile(`${FIXTURES_DIR}/core-cases.json`);
  if (randomDeals === null || coreCases === null) {
    throw new Error(
      `${FIXTURES_DIR}/random-deals.jsonl and core-cases.json hold the boards to deal again; without them pass --seed S to draw a fresh set`,
    );
  }
  const committed = seedSetFromFixtures(randomDeals, coreCases);
  if (parsed.deals === null) {
    return committed;
  }
  if (parsed.deals > committed.deals.length) {
    throw new Error(
      `--deals ${parsed.deals} exceeds the ${committed.deals.length} committed deals; pass --seed S to draw more`,
    );
  }
  return { ...committed, deals: committed.deals.slice(0, parsed.deals) };
}

/**
 * The changed lines between two texts, `-`/`+` prefixed, for an excerpt.
 * The longest-common-subsequence diff is exact but quadratic in the changed
 * region, so a region too large for it falls back to a line-by-line pairing.
 */
export function changedLines(before: string, after: string): string[] {
  const a = splitLines(before);
  const b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start += 1;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  if ((endA - start) * (endB - start) <= 4_000_000) {
    return diffLines(a, b);
  }
  const lines: string[] = [];
  for (let index = start; index < Math.max(endA, endB); index += 1) {
    if (index < endA) {
      lines.push(`-${a[index]}`);
    }
    if (index < endB) {
      lines.push(`+${b[index]}`);
    }
  }
  return lines;
}

/** `check`'s report for one file, or null when the texts are equal. */
export function excerpt(
  name: string,
  before: string,
  after: string,
): string[] | null {
  if (before === after) {
    return null;
  }
  const changed = changedLines(before, after);
  const lines = [`--- ${FIXTURES_DIR}/${name}`, "+++ regenerated"];
  for (const line of changed.slice(0, EXCERPT_LINES)) {
    lines.push(
      line.length > EXCERPT_WIDTH
        ? `${line.slice(0, EXCERPT_WIDTH)} ... (${line.length} characters)`
        : line,
    );
  }
  if (changed.length > EXCERPT_LINES) {
    lines.push(
      `... ${changed.length - EXCERPT_LINES} more diff lines in ${name}`,
    );
  }
  return lines;
}

/** `check`: regenerate and diff against the committed files; the exit status. */
export function check(result: ExportResult, host: FixturesHost): number {
  let status = 0;
  for (const name of FILES) {
    const committed = host.readFile(`${FIXTURES_DIR}/${name}`);
    if (committed === null) {
      host.log(`MISSING: ${FIXTURES_DIR}/${name}`);
      status = 1;
      continue;
    }
    const report = excerpt(name, committed, result.files.get(name)!);
    if (report !== null) {
      status = 1;
      host.log(report.join("\n"));
    }
  }
  host.log(
    `fixtures ${status ? "differ: review the changes and run pnpm fixtures:accept" : "ok"}`,
  );
  return status;
}

/** What `accept` and `--out` print for one written file. */
function changeSummary(
  name: string,
  before: string | null,
  after: string,
): string {
  if (before === null) {
    return `${name}: new, ${splitLines(after).length} lines`;
  }
  if (before === after) {
    return `${name}: unchanged`;
  }
  const changed = changedLines(before, after);
  const removed = changed.filter((line) => line.startsWith("-")).length;
  return `${name}: -${removed} +${changed.length - removed} lines`;
}

/** Write every file into `directory`, reporting each one. */
export function writeFiles(
  result: ExportResult,
  directory: string,
  host: FixturesHost,
): void {
  for (const name of FILES) {
    const path = `${directory}/${name}`;
    const text = result.files.get(name)!;
    host.log(changeSummary(name, host.readFile(path), text));
    host.writeFile(path, text);
  }
}

/** `--accept`: refuse a dirty tree, then write the fixtures in place. */
export function accept(
  regenerate: () => ExportResult,
  host: FixturesHost,
): number {
  const dirty = host.gitStatus();
  if (dirty.trim()) {
    host.log(`refusing to accept with uncommitted changes:\n${dirty}`);
    return 2;
  }
  writeFiles(regenerate(), FIXTURES_DIR, host);
  host.log(`accepted: ${FIXTURES_DIR}`);
  return 0;
}

/** `main`: the exit status of `pnpm fixtures:check` / `pnpm fixtures:accept`. */
export function run(
  argv: readonly string[],
  host: FixturesHost,
  exporter: Exporter = exportFixtures,
): number {
  let parsed: ParsedArguments;
  let seedSet: SeedSet;
  try {
    parsed = parseArguments(argv);
    seedSet = seedSetFor(parsed, host);
  } catch (error) {
    host.log(
      `${error instanceof Error ? error.message : String(error)}\n${USAGE}`,
    );
    return 2;
  }
  const regenerate = () =>
    exporter({ seedSet, limit: parsed.limit, log: host.log });
  if (parsed.accept) {
    return accept(regenerate, host);
  }
  if (parsed.out !== null) {
    writeFiles(regenerate(), parsed.out, host);
    host.log(`written: ${parsed.out}`);
    return 0;
  }
  return check(regenerate(), host);
}
