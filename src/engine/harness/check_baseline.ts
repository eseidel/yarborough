// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/tests/check_baseline.py: the comparison itself, as pure
// functions over strings.  `cli.ts` is the `pnpm baseline:check` /
// `pnpm baseline:accept` entry point around them.
//
// Two files under `python/tests/baselines/` are the baseline:
// `z3b_baseline.txt` is the harness output itself (one FAIL line per known
// miss, group pass counts, coverage lists, WARNING lines for ties),
// `z3b_rules_baseline.txt` is one line per test: the call made, the rule that
// made it, and the rules used to interpret the last three calls.  Any
// difference is a behavior change of the bidder.  The only difference this
// module accepts is a FAIL line that went away (a known miss got fixed), that
// hand's own rules line, and the pass counts that move with it.

const PASS_LINE = /^Pass (\d+)( \([0-9.]+%\))? of (\d+) (total )?hands$/;
const FAIL_LINE =
  /^FAIL: (\S+) \(expected (\S+)\) for (\S+) .*history:\s*([^(]*?)\s*(\(subtest.*)?$/;

/** The harness did not produce a comparable run at all. */
export class HarnessDidNotComplete extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessDidNotComplete";
  }
}

/** Python's `str.splitlines()`. */
export function splitLines(text: string): string[] {
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

/** Trailing whitespace goes; a FAIL line's trailing dots go too. */
export function normalize(text: string): string[] {
  const lines: string[] = [];
  for (const raw of splitLines(text)) {
    let line = raw.replace(/\s+$/, "");
    if (line.startsWith("FAIL:")) {
      line = line.replace(/\.+$/, "");
    }
    lines.push(line);
  }
  return lines;
}

/**
 * `difflib.unified_diff(a, b, n=0, lineterm='')` without the `---`/`+++`/`@@`
 * lines, which every caller skips: the removed lines of each change block,
 * then its added lines.
 */
export function diffLines(
  a: readonly string[],
  b: readonly string[],
): string[] {
  // Trim the common prefix and suffix so the table below stays small.
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

  const rows = endA - start;
  const columns = endB - start;
  // lcs[i][j] = length of the longest common subsequence of a[start+i:endA]
  // and b[start+j:endB].
  const width = columns + 1;
  const lcs = new Int32Array((rows + 1) * width);
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = columns - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        a[start + i] === b[start + j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  const out: string[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    out.push(...removed, ...added);
    removed = [];
    added = [];
  };

  let i = 0;
  let j = 0;
  while (i < rows && j < columns) {
    if (a[start + i] === b[start + j]) {
      flush();
      i += 1;
      j += 1;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      removed.push(`-${a[start + i]}`);
      i += 1;
    } else {
      added.push(`+${b[start + j]}`);
      j += 1;
    }
  }
  for (; i < rows; i += 1) {
    removed.push(`-${a[start + i]}`);
  }
  for (; j < columns; j += 1) {
    added.push(`+${b[start + j]}`);
  }
  flush();
  return out;
}

export interface OutputComparison {
  /** FAIL lines that went away: known misses that got fixed. */
  fixed: string[];
  /** Everything else that changed. */
  problems: string[];
}

export function compareOutput(
  baseline: readonly string[],
  actual: readonly string[],
): OutputComparison {
  const fixed: string[] = [];
  const problems: string[] = [];
  for (const line of diffLines(baseline, actual)) {
    if (line.startsWith("-") && line.slice(1).startsWith("FAIL:")) {
      fixed.push(line.slice(1));
    } else if (PASS_LINE.test(line.slice(1))) {
      // Pass counts move with fixed misses; the hand counts are checked below.
      continue;
    } else {
      problems.push(line);
    }
  }
  const handCounts = (lines: readonly string[]) =>
    lines
      .map((line) => PASS_LINE.exec(line))
      .filter((match) => match !== null)
      .map((match) => match[3]);
  const oldCounts = handCounts(baseline);
  const newCounts = handCounts(actual);
  if (oldCounts.join(",") !== newCounts.join(",")) {
    problems.push(
      `hand counts changed: ${pythonListRepr(oldCounts)} -> ${pythonListRepr(newCounts)}`,
    );
  }
  return { fixed, problems };
}

function pythonListRepr(values: readonly string[]): string {
  return `[${values.map((value) => `'${value}'`).join(", ")}]`;
}

export function compareRules(
  fixed: readonly string[],
  rulesBaselineText: string,
  rulesActualText: string,
): string[] {
  const rulesDiff = diffLines(
    splitLines(rulesBaselineText),
    splitLines(rulesActualText),
  );
  // A fixed miss changes its own rules line (the call is now the expected
  // one): accept exactly that line pair, nothing else.
  const expectedByHand = new Map<string, string>();
  for (const line of fixed) {
    const match = FAIL_LINE.exec(line);
    if (match) {
      expectedByHand.set(`${match[3]}|${match[4].trim()}`, match[2]);
    }
  }

  const isFixedLine = (line: string): boolean => {
    const [identifier, call] = line.slice(1).split("\t");
    const hand = identifier.split("-")[0];
    const history = identifier.split(":").at(-1)!.replaceAll(",", " ");
    const want = expectedByHand.get(`${hand}|${history}`);
    return want !== undefined && (line.startsWith("-") || call === want);
  };
  return rulesDiff.filter((line) => !isFixedLine(line));
}

export interface BaselineComparison extends OutputComparison {
  rulesDiff: string[];
  totalLine: string;
}

/**
 * `check_baseline.check` minus the subprocess: the harness runs in this
 * process, so there is no `PYTHONHASHSEED` and no pool to keep out.
 */
export function compareRun(
  harnessText: string,
  rulesActualText: string,
  baselineText: string,
  rulesBaselineText: string,
): BaselineComparison {
  assertHarnessCompleted(harnessText);
  const actual = normalize(harnessText);
  const baseline = normalize(baselineText);
  const { fixed, problems } = compareOutput(baseline, actual);
  const rulesDiff = compareRules(fixed, rulesBaselineText, rulesActualText);
  const totals = actual.filter(
    (line) => PASS_LINE.test(line) && line.includes("total"),
  );
  return {
    fixed,
    problems,
    rulesDiff,
    totalLine: totals.length ? totals[totals.length - 1] : "no total line",
  };
}

/** The harness's own sanity check: no hand raised, and a total line exists. */
export function assertHarnessCompleted(harnessText: string): void {
  const errors = splitLines(harnessText).filter((line) =>
    line.startsWith("ERROR:"),
  );
  if (errors.length || !/^Pass \d+ .* total hands$/m.test(harnessText)) {
    throw new HarnessDidNotComplete(
      `${harnessText.slice(-3000)}\nHARNESS DID NOT COMPLETE CLEANLY (${errors.length} hands raised)`,
    );
  }
}

export function report(comparison: BaselineComparison): string {
  const { fixed, problems, rulesDiff, totalLine } = comparison;
  const lines = fixed.map((line) => `fixed: ${line}`);
  lines.push(...problems.map((line) => `CHANGED: ${line}`));
  lines.push(...rulesDiff.map((line) => `RULES CHANGED: ${line}`));
  lines.push(totalLine);
  if (problems.length || rulesDiff.length) {
    lines.push(
      `BASELINE MISMATCH: ${problems.length} output lines, ${rulesDiff.length} rule lines`,
    );
  } else {
    lines.push(`baseline ok (${fixed.length} fixed misses)`);
  }
  return lines.join("\n");
}

/** True when the run may be accepted without a new baseline. */
export function isClean(comparison: BaselineComparison): boolean {
  return !comparison.problems.length && !comparison.rulesDiff.length;
}

/**
 * The diff `--accept` prints before it overwrites a baseline.  It is the same
 * set of changed lines the Python prints, without difflib's `@@` hunk headers,
 * which nothing reads.
 */
export function acceptanceDiff(
  baselineText: string,
  actualText: string,
  fromFile: string,
): string[] {
  const diff = diffLines(normalize(baselineText), normalize(actualText));
  if (!diff.length) {
    return [];
  }
  return [`--- ${fromFile}`, "+++ actual", ...diff];
}
