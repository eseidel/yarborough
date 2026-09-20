// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/analysis/explain.py, one of the two developer tools
// phase 9 of docs/typescript-engine-plan.md keeps when python/ goes away.
//
// Every possible call for a hand in an auction, with its rule and priority,
// and the maximal ones the bidder chooses among:
//
//     pnpm explain "K73.A3.AJ7654.A9" "1H P 2H P" [--expected 3H]
//
// With --expected, each meaning of that call's rule is tested against the
// hand conjunct by conjunct, to show which part of it the hand fails.
//
// The lines, their order, the calls, rules, priorities and verdicts are the
// Python's.  The expressions themselves are printed by `printed.ts` (Z3's
// s-expressions) where the Python prints z3py's pretty form, so their text
// differs while their structure does not: the conjuncts are `children()` of
// the meaning either way.  Z3's WebAssembly build exports no
// `Z3_get_app_arg`, so those children are the arguments the term was built
// from, recorded by `z3.withChildTracking` (src/z3/z3.ts).
//
// `scripts/explain.mjs` is the launcher; everything here stays free of Node
// imports because `src/` is type-checked as browser code.

import { Call } from "../core/call";
import { CallHistory } from "../core/callhistory";
import { Hand } from "../core/hand";
import {
  _solverPool,
  Bidder,
  Interpreter,
  RuleSelector,
  setBidderLog,
} from "../z3b/bidder";
import { isPossible } from "../z3b/model";
import { printedForm } from "../z3b/printed";
import { type Expr, z3 } from "../z3b/z3";

/** One line of the "possible calls:" list. */
export interface PossibleCallReport {
  call: string;
  rule: string;
  priority: string;
  /** Whether the pair is in the maximal set (the `*` mark). */
  maximal: boolean;
}

/** One conjunct of a meaning, and whether the hand can satisfy it alone. */
export interface ConjunctReport {
  fits: boolean;
  printed: string;
}

/** One variant of the expected call's meaning. */
export interface MeaningReport {
  priority: string;
  fits: boolean;
  conjuncts: ConjunctReport[];
}

/** What `--expected` adds: the rule that claims the call and its meanings. */
export interface ExpectedReport {
  call: string;
  /** null when no rule claims the call. */
  rule: string | null;
  meanings: MeaningReport[];
}

export interface ExplainReport {
  possible: PossibleCallReport[];
  maximal: { call: string; priority: string }[];
  expected: ExpectedReport | null;
}

export interface ExplainRequest {
  /** A hand in C.D.H.S order, as `Hand.fromCdhsString` reads it. */
  hand: string;
  /** The calls so far, dealt by North; empty for an opening. */
  history?: string;
  /** The call to test against the hand, conjunct by conjunct. */
  expected?: string | null;
}

/** Python's `str(child)[:150]` with the newlines the pretty printer adds removed. */
function shortPrintedForm(expr: Expr): string {
  return printedForm(expr).replaceAll("\n", " ").slice(0, 150);
}

/**
 * The tool's answer for one hand and auction.  Mirrors `explain.main`: the
 * same rule selector (built with no expected call, so it prints no warning of
 * its own), the same solver borrowed for the hand, the same order.
 */
export function explain(request: ExplainRequest): ExplainReport {
  const hand = Hand.fromCdhsString(request.hand);
  const expected =
    request.expected === undefined || request.expected === null
      ? null
      : Call.fromString(request.expected);
  const callHistory = CallHistory.fromString(request.history ?? "", "N");
  const interpreter = new Interpreter();
  return interpreter.withHistory(callHistory, (history) => {
    const selector = new RuleSelector(new Bidder().system, history);
    const possible = selector.possibleCallsForHand(hand, null);
    const maximal = possible.maximalCallsAndPriorities();
    const sorted = [...possible._callsAndPriorities].sort((left, right) => {
      if (left[1].rank !== right[1].rank) {
        return left[1].rank - right[1].rank;
      }
      return left[0].name < right[0].name
        ? -1
        : left[0].name > right[0].name
          ? 1
          : 0;
    });
    const report: ExplainReport = {
      possible: sorted.map(([call, priority]) => ({
        call: call.name,
        rule: selector.ruleForCall(call)!.name,
        priority: priority.repr(),
        // Python's `[call, priority] in maximal`: a list compares item by item.
        maximal: maximal.some(
          (pair) => pair[0].equals(call) && pair[1].equals(priority),
        ),
      })),
      maximal: maximal.map(([call, priority]) => ({
        call: call.name,
        priority: priority.repr(),
      })),
      expected: null,
    };
    if (expected === null) {
      return report;
    }
    const rule = selector.ruleForCall(expected);
    const expectedReport: ExpectedReport = {
      call: expected.name,
      rule: rule ? rule.name : null,
      meanings: [],
    };
    report.expected = expectedReport;
    if (!rule) {
      return report;
    }
    const solver = _solverPool.borrowSolverForHand(hand);
    try {
      // The conjuncts are the meaning's `children()`, which only terms built
      // with tracking on can answer.
      const meanings = z3.withChildTracking(() => [
        ...rule.meaningOf(history, expected),
      ]);
      for (const [priority, meaning] of meanings) {
        const children = meaning.children().length
          ? meaning.children()
          : [meaning];
        expectedReport.meanings.push({
          priority: priority.repr(),
          fits: isPossible(solver, meaning),
          conjuncts: children.map((child) => ({
            fits: isPossible(solver, child),
            printed: shortPrintedForm(child),
          })),
        });
      }
    } finally {
      _solverPool.restore(solver);
    }
    return report;
  });
}

/** The tool's output, one string per line, as `explain.main` prints it. */
export function explanationLines(report: ExplainReport): string[] {
  const lines = ["possible calls:"];
  for (const entry of report.possible) {
    const mark = entry.maximal ? "*" : " ";
    lines.push(
      `  ${mark} ${entry.call.padEnd(3)} ${entry.rule.padEnd(40)} ${entry.priority}`,
    );
  }
  lines.push(
    `maximal: ${report.maximal
      .map((entry) => `${entry.call} (${entry.priority})`)
      .join(", ")}`,
  );
  const expected = report.expected;
  if (!expected) {
    return lines;
  }
  lines.push("");
  lines.push(
    expected.rule
      ? `${expected.rule} for ${expected.call}:`
      : `no rule claims ${expected.call}`,
  );
  for (const meaning of expected.meanings) {
    lines.push(
      `  ${meaning.priority}: ${meaning.fits ? "fits" : "does not fit"}`,
    );
    for (const conjunct of meaning.conjuncts) {
      lines.push(`     ${conjunct.fits ? "ok " : "NO "} ${conjunct.printed}`);
    }
  }
  return lines;
}

/** Everything the command line needs from outside: the launcher provides it. */
export interface ExplainHost {
  log: (message: string) => void;
}

export const USAGE =
  'usage: pnpm explain "K73.A3.AJ7654.A9" "1H P 2H P" [--expected 3H]';

/** `pnpm explain`: the argument handling of `explain.main`, and its output. */
export function run(argv: readonly string[], host: ExplainHost): number {
  let rest = [...argv];
  let expected: string | null = null;
  const index = rest.indexOf("--expected");
  if (index !== -1) {
    if (index + 1 >= rest.length) {
      host.log(USAGE);
      return 2;
    }
    expected = rest[index + 1];
    rest = [...rest.slice(0, index), ...rest.slice(index + 2)];
  }
  if (!rest.length) {
    host.log(USAGE);
    return 2;
  }
  // The kernel's own prints (a category tie, a call no rule can make) go to
  // stdout in the Python, interleaved with the tool's output.
  const previous = setBidderLog(host.log);
  try {
    const report = explain({
      hand: rest[0],
      history: rest.length > 1 ? rest[1] : "",
      expected,
    });
    for (const line of explanationLines(report)) {
      host.log(line);
    }
  } finally {
    setBidderLog(previous);
  }
  return 0;
}
