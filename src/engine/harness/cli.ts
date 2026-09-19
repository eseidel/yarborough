// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// `pnpm baseline:check` / `pnpm baseline:accept`, the TypeScript side of
// python/tests/check_baseline.py's `main`.  `scripts/check-baseline.mjs` loads
// this module through Vite and supplies the `BaselineHost` below; everything
// here stays free of Node imports because `src/` is type-checked as browser
// code.
//
// The bidder comes from the z3b kernel (phase 6 of
// docs/typescript-engine-plan.md).  Until that lands this reports what is
// missing and exits 2 rather than pretending the baseline is fine; every piece
// around it — the corpus, the harness text, the comparison — is already
// exercised by `src/engine/harness/__tests__/`.

import type { HarnessBidder } from "./harness";
import { runHarness } from "./harness";
import {
  acceptanceDiff,
  compareRun,
  HarnessDidNotComplete,
  isClean,
  report,
} from "./check_baseline";

/** Where the accepted output lives.  Phase 9 moves it under `tests/`. */
export const BASELINE = "python/tests/baselines/z3b_baseline.txt";
export const RULES_BASELINE = "python/tests/baselines/z3b_rules_baseline.txt";

/**
 * The kernel's `HarnessBidder`.  Named as a specifier rather than imported so
 * this module keeps building before `src/engine/z3b/` exists.
 */
export const KERNEL_BIDDER_MODULE = "../z3b/harness-bidder";

/** Everything the CLI needs from outside: the launcher provides it. */
export interface BaselineHost {
  /** File contents, or null when the file does not exist. */
  readFile: (path: string) => string | null;
  writeFile: (path: string, text: string) => void;
  /** `git status --porcelain` over the working tree. */
  gitStatus: () => string;
  log: (message: string) => void;
  /** The bidder under test, or null while the kernel does not exist. */
  loadBidder: () => Promise<HarnessBidder | null>;
}

function readOrThrow(host: BaselineHost, path: string): string {
  const text = host.readFile(path);
  if (text === null) {
    throw new HarnessDidNotComplete(
      `missing ${path} (run with --accept to create it)`,
    );
  }
  return text;
}

export function check(bidder: HarnessBidder, host: BaselineHost): number {
  const run = runHarness(bidder);
  try {
    const comparison = compareRun(
      run.stdout,
      run.rulesDump,
      readOrThrow(host, BASELINE),
      readOrThrow(host, RULES_BASELINE),
    );
    host.log(report(comparison));
    return isClean(comparison) ? 0 : 1;
  } catch (error) {
    if (error instanceof HarnessDidNotComplete) {
      host.log(error.message);
      return 2;
    }
    throw error;
  }
}

export function accept(bidder: HarnessBidder, host: BaselineHost): number {
  const dirty = host.gitStatus();
  if (dirty.trim()) {
    host.log(`refusing to accept with uncommitted changes:\n${dirty}`);
    return 2;
  }
  const run = runHarness(bidder);
  const pairs: readonly (readonly [string, string])[] = [
    [run.stdout, BASELINE],
    [run.rulesDump, RULES_BASELINE],
  ];
  for (const [actualText, baseline] of pairs) {
    const baselineText = host.readFile(baseline);
    if (baselineText !== null) {
      for (const line of acceptanceDiff(baselineText, actualText, baseline)) {
        host.log(line);
      }
    }
    host.writeFile(baseline, actualText);
  }
  host.log(`accepted: ${BASELINE}, ${RULES_BASELINE}`);
  return 0;
}

export async function run(
  argv: readonly string[],
  host: BaselineHost,
): Promise<number> {
  const bidder = await host.loadBidder();
  if (!bidder) {
    host.log(
      "the TypeScript bidding kernel is not available yet: expected " +
        `\`createHarnessBidder\` from "${KERNEL_BIDDER_MODULE}" ` +
        "(phase 6 of docs/typescript-engine-plan.md).",
    );
    return 2;
  }
  return argv.includes("--accept") ? accept(bidder, host) : check(bidder, host);
}
