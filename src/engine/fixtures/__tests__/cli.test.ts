// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// cli.ts, `pnpm fixtures:check` / `pnpm fixtures:accept`, with the host and
// the regenerator injected: the argument parsing, the seed set the committed
// files supply, the check's diff excerpt and exit status, the refusal to
// accept over a dirty tree, and what accept and --out write.

import { describe, expect, it } from "vitest";
import {
  accept,
  changedLines,
  EXCERPT_LINES,
  EXCERPT_WIDTH,
  excerpt,
  type Exporter,
  FIXTURES_DIR,
  type FixturesHost,
  parseArguments,
  run,
  seedSetFor,
  USAGE,
} from "../cli";
import {
  DEFAULT_DEALS,
  type ExportOptions,
  type ExportResult,
  FILES,
  type FixtureFile,
} from "../export";

class FakeHost implements FixturesHost {
  readonly files = new Map<string, string>();
  readonly logged: string[] = [];
  status = "";

  readFile = (path: string) => this.files.get(path) ?? null;
  writeFile = (path: string, text: string) => {
    this.files.set(path, text);
  };
  gitStatus = () => this.status;
  log = (message: string) => {
    this.logged.push(message);
  };

  get log_text(): string {
    return this.logged.join("\n");
  }
}

/** A tiny regenerator: one line per file naming the options it was given. */
function fakeExporter(text: (name: FixtureFile) => string): Exporter {
  return (options: ExportOptions): ExportResult => ({
    files: new Map(FILES.map((name) => [name, text(name)])),
    summary: {
      auctions: options.limit ?? 0,
      auction_errors: [],
      meanings: 0,
      meaning_errors: 0,
      interpretation_errors: [],
      decisions: 0,
      decision_errors: [],
      bidder_disagreements: [],
      deals: options.seedSet.deals.length,
      deal_errors: [],
      seconds: 0,
    },
  });
}

const RANDOM_DEALS = [
  '{"board":"8-ff4a81f63e458498029e7f194b","index":0}',
  '{"board":"6-090ec39568ad2d960c1ff5b8f6","index":1}',
  '{"board":"1-527472cbf5299c63283e8b9353","index":2}',
]
  .map((line) => `${line}\n`)
  .join("");
const CORE_CASES =
  '{\n  "boards": [\n    {\n      "identifier": "4-527472cbf5299c63283e8b9353"\n    }\n  ]\n}\n';

/** A host holding committed fixtures whose text is the file's name. */
function committedHost(): FakeHost {
  const host = new FakeHost();
  for (const name of FILES) {
    host.files.set(`${FIXTURES_DIR}/${name}`, `${name}\n`);
  }
  host.files.set(`${FIXTURES_DIR}/random-deals.jsonl`, RANDOM_DEALS);
  host.files.set(`${FIXTURES_DIR}/core-cases.json`, CORE_CASES);
  return host;
}

const asCommitted: Exporter = (options) => {
  const host = committedHost();
  return fakeExporter((name) => host.readFile(`${FIXTURES_DIR}/${name}`)!)(
    options,
  );
};

describe("parseArguments", () => {
  it("reads the options and their defaults", () => {
    expect(parseArguments([])).toEqual({
      accept: false,
      out: null,
      deals: null,
      seed: null,
      limit: null,
    });
    expect(
      parseArguments(["--accept", "--deals", "5", "--seed", "3"]),
    ).toMatchObject({ accept: true, deals: 5, seed: 3 });
    expect(parseArguments(["--out", "dir", "--limit", "2"])).toMatchObject({
      out: "dir",
      limit: 2,
    });
  });

  it("refuses what it does not understand", () => {
    expect(() => parseArguments(["--bogus"])).toThrow(
      "unknown argument --bogus",
    );
    expect(() => parseArguments(["--deals"])).toThrow("--deals needs a value");
    expect(() => parseArguments(["--deals", "x"])).toThrow(
      "--deals must be an integer of at least 0",
    );
    expect(() => parseArguments(["--seed", "-1"])).toThrow("--seed must be");
    expect(() => parseArguments(["--limit", "3"])).toThrow(
      "--limit produces partial fixtures: use it with --out",
    );
    expect(() => parseArguments(["--accept", "--out", "dir"])).toThrow(
      "--accept writes to tests/engine-fixtures",
    );
  });
});

describe("seedSetFor", () => {
  it("deals the committed boards again by default", () => {
    const seedSet = seedSetFor(parseArguments([]), committedHost());
    expect(seedSet.deals).toEqual([
      "8-ff4a81f63e458498029e7f194b",
      "6-090ec39568ad2d960c1ff5b8f6",
      "1-527472cbf5299c63283e8b9353",
    ]);
    expect(seedSet.coreBoards).toEqual(["4-527472cbf5299c63283e8b9353"]);
  });

  it("takes the first N committed deals with --deals, never more than there are", () => {
    expect(
      seedSetFor(parseArguments(["--deals", "2"]), committedHost()).deals,
    ).toHaveLength(2);
    expect(() =>
      seedSetFor(parseArguments(["--deals", "4"]), committedHost()),
    ).toThrow(
      "--deals 4 exceeds the 3 committed deals; pass --seed S to draw more",
    );
  });

  it("draws a fresh set with --seed, of --deals deals or the default", () => {
    const fresh = seedSetFor(parseArguments(["--seed", "1"]), new FakeHost());
    expect(fresh.deals).toHaveLength(DEFAULT_DEALS);
    expect(fresh.deals[0]).not.toBe("8-ff4a81f63e458498029e7f194b");
    expect(
      seedSetFor(
        parseArguments(["--seed", "1", "--deals", "2"]),
        new FakeHost(),
      ).deals,
    ).toHaveLength(2);
  });

  it("needs the committed files without --seed", () => {
    expect(() => seedSetFor(parseArguments([]), new FakeHost())).toThrow(
      /hold the boards to deal again; without them pass --seed S/,
    );
  });
});

describe("excerpt", () => {
  it("is null for equal texts and a -/+ listing otherwise", () => {
    expect(excerpt("a.jsonl", "x\ny\n", "x\ny\n")).toBeNull();
    expect(excerpt("a.jsonl", "x\ny\nz\n", "x\nY\nz\n")).toEqual([
      `--- ${FIXTURES_DIR}/a.jsonl`,
      "+++ regenerated",
      "-y",
      "+Y",
    ]);
  });

  it("truncates long lines and counts the lines it leaves out", () => {
    const long = "a".repeat(EXCERPT_WIDTH + 10);
    const lines = excerpt("a.jsonl", `${long}\n`, "b\n")!;
    expect(lines[2]).toBe(
      `-${"a".repeat(EXCERPT_WIDTH - 1)} ... (${long.length + 1} characters)`,
    );
    const before = Array.from(
      { length: EXCERPT_LINES + 5 },
      (_, i) => `${i}`,
    ).join("\n");
    const after = Array.from(
      { length: EXCERPT_LINES + 5 },
      (_, i) => `${i}!`,
    ).join("\n");
    const many = excerpt("b.json", before, after)!;
    expect(many).toHaveLength(2 + EXCERPT_LINES + 1);
    expect(many.at(-1)).toBe(
      `... ${2 * (EXCERPT_LINES + 5) - EXCERPT_LINES} more diff lines in b.json`,
    );
  });

  it("pairs lines up when the changed region is too large for an exact diff", () => {
    const before = Array.from({ length: 2100 }, (_, i) => `${i}`).join("\n");
    const after = Array.from({ length: 2100 }, (_, i) => `${i}!`).join("\n");
    const changed = changedLines(before, after);
    expect(changed).toHaveLength(4200);
    expect(changed.slice(0, 2)).toEqual(["-0", "+0!"]);
    expect(changedLines("a\nb\n", "a\nb\n")).toEqual([]);
  });
});

describe("run", () => {
  it("reports usage on a bad argument", () => {
    const host = new FakeHost();
    expect(run(["--nope"], host, asCommitted)).toBe(2);
    expect(host.log_text).toBe(`unknown argument --nope\n${USAGE}`);
  });

  it("checks clean when the regenerated files equal the committed ones", () => {
    const host = committedHost();
    expect(run([], host, asCommitted)).toBe(0);
    expect(host.logged.at(-1)).toBe("fixtures ok");
    expect(host.files.size).toBe(FILES.length);
  });

  it("checks with an excerpt per differing file and exit 1", () => {
    const host = committedHost();
    const exporter: Exporter = (options) => {
      const result = asCommitted(options);
      const files = new Map(result.files);
      files.set("vocabulary.json", "changed\n");
      files.set("decisions.jsonl", "decisions.jsonl\nextra\n");
      return { ...result, files };
    };
    expect(run([], host, exporter)).toBe(1);
    expect(host.logged).toEqual([
      `--- ${FIXTURES_DIR}/vocabulary.json\n+++ regenerated\n-vocabulary.json\n+changed`,
      `--- ${FIXTURES_DIR}/decisions.jsonl\n+++ regenerated\n+extra`,
      "fixtures differ: review the changes and run pnpm fixtures:accept",
    ]);
  });

  it("reports a missing committed file", () => {
    const host = committedHost();
    host.files.delete(`${FIXTURES_DIR}/meanings.jsonl`);
    expect(run([], host, asCommitted)).toBe(1);
    expect(host.logged[0]).toBe(`MISSING: ${FIXTURES_DIR}/meanings.jsonl`);
  });

  it("refuses to accept over a dirty tree, without regenerating", () => {
    const host = committedHost();
    host.status = " M src/engine/z3b/rules.ts\n";
    let called = false;
    const exporter: Exporter = (options) => {
      called = true;
      return asCommitted(options);
    };
    expect(run(["--accept"], host, exporter)).toBe(2);
    expect(called).toBe(false);
    expect(host.log_text).toBe(
      "refusing to accept with uncommitted changes:\n M src/engine/z3b/rules.ts\n",
    );
    expect(
      accept(
        () => asCommitted({ seedSet: { deals: [], coreBoards: [] } }),
        host,
      ),
    ).toBe(2);
  });

  it("accepts over a clean tree, writing the files and saying what changed", () => {
    const host = committedHost();
    const exporter: Exporter = (options) => {
      const result = asCommitted(options);
      const files = new Map(result.files);
      files.set("categories.json", "a\nb\nc\n");
      return { ...result, files };
    };
    host.files.delete(`${FIXTURES_DIR}/vocabulary.json`);
    expect(run(["--accept"], host, exporter)).toBe(0);
    expect(host.files.get(`${FIXTURES_DIR}/categories.json`)).toBe("a\nb\nc\n");
    expect(host.files.get(`${FIXTURES_DIR}/vocabulary.json`)).toBe(
      "vocabulary.json\n",
    );
    expect(host.logged).toContain("categories.json: -1 +3 lines");
    expect(host.logged).toContain("vocabulary.json: new, 1 lines");
    expect(host.logged).toContain("rules-manifest.json: unchanged");
    expect(host.logged.at(-1)).toBe(`accepted: ${FIXTURES_DIR}`);
  });

  it("writes elsewhere with --out, passing --limit and the seed set through", () => {
    const host = committedHost();
    host.status = " M dirty\n";
    let seen: ExportOptions | null = null;
    const exporter: Exporter = (options) => {
      seen = options;
      return asCommitted(options);
    };
    expect(
      run(
        ["--out", "scratch/fx", "--limit", "3", "--deals", "1"],
        host,
        exporter,
      ),
    ).toBe(0);
    expect(seen!.limit).toBe(3);
    expect(seen!.seedSet.deals).toEqual(["8-ff4a81f63e458498029e7f194b"]);
    expect(host.files.get("scratch/fx/decisions.jsonl")).toBe(
      "decisions.jsonl\n",
    );
    expect(host.logged.at(-1)).toBe("written: scratch/fx");
    // The committed files are untouched.
    expect(host.files.get(`${FIXTURES_DIR}/random-deals.jsonl`)).toBe(
      RANDOM_DEALS,
    );
  });
});
