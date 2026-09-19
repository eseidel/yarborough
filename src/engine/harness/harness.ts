// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/tests/harness.py.
//
// Bids every hand in `sayc_data.ts` and produces exactly the text the Python
// harness prints to stdout, plus the per-hand rules dump.  The bidder is
// injected (`HarnessBidder`) so the harness can be tested, and so it is ready
// for the TypeScript kernel before the kernel exists.  The multiprocessing of
// the Python is left out: the pool only ever reports whole shards in order,
// and `ResultsAggregator` prints a group when that group is complete, so a
// sequential loop produces the same bytes.

import type { Call } from "../core/call";
import { CallHistory } from "../core/callhistory";
import { Call as CallClass } from "../core/call";
import { Hand } from "../core/hand";
import type { SaycExpectation } from "./sayc_data";
import { saycExpectations } from "./sayc_data";

/** Python's `str(x)` for the values the harness stringifies. */
function pythonStr(value: string | null | undefined): string {
  return value === null || value === undefined ? "None" : value;
}

/** Python's `repr(str)`, enough for call, rule and priority names. */
function pythonRepr(value: string): string {
  return value.includes("'") && !value.includes('"')
    ? `"${value}"`
    : `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

/** Python's `repr(list_of_str)`. */
function pythonListRepr(values: readonly string[]): string {
  return `[${values.map(pythonRepr).join(", ")}]`;
}

/** Python's `"%.1f" % value`. */
function formatPercent(value: number): string {
  return value.toFixed(1);
}

/**
 * The calls the bidder was not ordered about: `CallSelection.collision`, kept
 * structured here and rendered the way `harness.py` renders it.
 */
export interface HarnessCollision {
  calls: readonly string[];
  rules: readonly string[];
  priorities: readonly string[];
}

/**
 * What the harness needs back from one bidding decision, mirroring the parts
 * of z3b's `CallSelection` that `harness.py` reads.
 */
export interface HarnessSelection {
  /** The call the bidder chose, or null when no rule covered the hand. */
  call: Call | null;
  /** `str(call_selection.rule)`. */
  ruleName: string | null;
  /** Set when several maximal calls were not ordered by the priority ordering. */
  collision?: HarnessCollision | null;
  /**
   * The rules that interpreted LHO's, partner's and RHO's last calls, in call
   * order, i.e. `[rule_for_last_call(LHO), ..(Partner), ..(RHO)]`.  Null when
   * the bidder cannot answer (the Python returns early for a selection with no
   * `rule_selector`); a missing call inside the auction is a null element.
   */
  lastThreeRuleNames?: readonly (string | null)[] | null;
  /** Anything the bidder printed while deciding; replayed verbatim. */
  stdout?: string;
  stderr?: string;
}

/** One compiled rule, for the coverage summary (`bidder.system.rules`). */
export interface HarnessRuleInfo {
  name: string;
  requiresPlanning: boolean;
}

/** The bidder under test.  The z3b kernel is wrapped to satisfy this. */
export interface HarnessBidder {
  /**
   * `Bidder.call_selection_for(hand, call_history)`.  Returning null is the
   * Python's falsy `call_selection`: no call, and no rule names recorded.
   * Throwing is a broken rule: the harness records it and fails the run.
   */
  findCallFor(hand: Hand, callHistory: CallHistory): HarnessSelection | null;
  /**
   * `bidder.system.rules`, for the coverage summary.  Returning null (or
   * throwing) prints "Ignoring coverage summary, failed to find rules.".
   */
  rules(): readonly HarnessRuleInfo[] | null;
}

/**
 * The line to paste into `sayc_data.ts` for a hand and an auction.
 * Ported from `expectation_line`.
 */
export function expectationLine(
  hand: Hand,
  callHistory: CallHistory,
  expectedCall?: Call | null,
): string {
  const vulnerability = callHistory.vulnerability.name;
  const optionalVulnerabilityString =
    vulnerability === "None" ? "" : `, '${vulnerability}'`;
  const expectedCallString = expectedCall ? expectedCall.name : "?";
  return `['${hand.cdhsDotString()}', '${expectedCallString}', '${callHistory.callsString()}'${optionalVulnerabilityString}],`;
}

export class CompiledTest {
  readonly group: TestGroup;
  readonly hand: Hand;
  readonly callHistory: CallHistory;
  readonly expectedCall: Call;
  readonly parentTest: CompiledTest | null;

  constructor(
    group: TestGroup,
    hand: Hand,
    callHistory: CallHistory,
    expectedCall: Call,
    parentTest: CompiledTest | null = null,
  ) {
    this.group = group;
    this.hand = hand;
    this.callHistory = callHistory;
    this.expectedCall = expectedCall;
    this.parentTest = parentTest;
  }

  static fromExpectationTupleInGroup(
    expectation: SaycExpectation,
    testGroup: TestGroup,
  ): CompiledTest {
    const handString = expectation[0];
    if (!handString.includes(".")) {
      throw new Error(
        `_split_expectation expects C.D.H.S formatted hands, missing '.': ${handString}`,
      );
    }
    const expectedCall = CallClass.fromString(expectation[1]);
    const historyString = expectation.length > 2 ? expectation[2]! : "";
    const vulnerabilityString = expectation.length > 3 ? expectation[3]! : null;
    const hand = Hand.fromCdhsString(handString);
    const callHistory = CallHistory.fromString(
      historyString,
      null,
      vulnerabilityString,
    );
    return new CompiledTest(testGroup, hand, callHistory, expectedCall);
  }

  // FIXME: Our "have we run this" check would be more powerful if we used a
  // combinatorics based identifier for the hands.
  get identifier(): string {
    return `${this.hand.cdhsDotString()}-${this.callHistory.identifier}`;
  }

  get subtestString(): string {
    if (this.parentTest) {
      return ` (subtest of ${this.parentTest.callHistory.callsString()})`;
    }
    return "";
  }

  get testString(): string {
    return `${this.hand.prettyOneLine()}, history: ${this.callHistory.callsString()}${this.subtestString}`;
  }

  get subtests(): CompiledTest[] {
    const subtests: CompiledTest[] = [];
    let partialHistory = this.callHistory;
    while (partialHistory.calls.length >= 4) {
      const expectedCall =
        partialHistory.calls[partialHistory.calls.length - 4];
      partialHistory = partialHistory.copyWithPartialHistory(
        partialHistory.calls.length - 4,
      );
      subtests.push(
        new CompiledTest(
          this.group,
          this.hand,
          partialHistory,
          expectedCall,
          this,
        ),
      );
    }
    return subtests;
  }
}

/** A `sys.stdout`-like sink: `write` is raw, `print` adds the newline. */
export class OutputStream {
  private readonly chunks: string[] = [];

  write(text: string): void {
    this.chunks.push(text);
  }

  print(line = ""): void {
    this.chunks.push(`${line}\n`);
  }

  getValue(): string {
    return this.chunks.join("");
  }
}

/** The logging channels `harness.py` uses, with Python's formatter. */
export class HarnessLogger {
  private readonly stream: OutputStream;
  readonly isVerbose: boolean;

  constructor(stream: OutputStream, isVerbose = false) {
    this.stream = stream;
    this.isVerbose = isVerbose;
  }

  private emit(level: string, message: string): void {
    this.stream.print(`${level.padEnd(8)}: ${message}`);
  }

  error(message: string): void {
    this.emit("ERROR", message);
  }

  info(message: string): void {
    // The root logger's default level is WARNING; -v lowers it to NOTSET.
    if (this.isVerbose) {
      this.emit("INFO", message);
    }
  }

  debug(message: string): void {
    if (this.isVerbose) {
      this.emit("DEBUG", message);
    }
  }
}

export class TestGroup {
  readonly tests: CompiledTest[] = [];
  private readonly seenExpectations = new Map<string, Call>();

  readonly name: string;
  private readonly log: HarnessLogger | undefined;
  private readonly stdout: OutputStream | undefined;

  constructor(name: string, log?: HarnessLogger, stdout?: OutputStream) {
    this.name = name;
    this.log = log;
    this.stdout = stdout;
  }

  addTest(test: CompiledTest): void {
    // Sanity check to make sure we're not running a test twice.
    const testIdentifier = test.identifier;
    const previousCall = this.seenExpectations.get(testIdentifier);
    if (previousCall) {
      if (!previousCall.equals(test.expectedCall)) {
        this.log?.error(
          `Conflicting expectations for ${testIdentifier}, ${previousCall} != ${test.expectedCall}`,
        );
      } else if (!test.parentTest) {
        this.log?.debug(
          `${testIdentifier} is an explicit duplicate of an earlier test.`,
        );
      } else {
        this.log?.debug(`Ignoring duplicate subtest ${testIdentifier}`);
      }
      return;
    }
    this.seenExpectations.set(testIdentifier, test.expectedCall);
    this.tests.push(test);
  }

  addExpectationLine(expectation: SaycExpectation): void {
    let test: CompiledTest;
    try {
      test = CompiledTest.fromExpectationTupleInGroup(expectation, this);
    } catch (error) {
      // The Python prints the offending line and re-raises; compiling the
      // corpus is not something a run recovers from.
      this.stdout?.print(
        `Exception compiling: ${pythonListRepr(expectation)} in group ${this.name}`,
      );
      throw error;
    }
    this.addTest(test);
    for (const subtest of test.subtests) {
      this.addTest(subtest);
    }
  }

  addExpectationLines(expectationLines: readonly SaycExpectation[]): void {
    for (const expectation of expectationLines) {
      this.addExpectationLine(expectation);
    }
  }
}

export class TestResult {
  test: CompiledTest | null = null;
  call: Call | null = null;
  ruleName: string | null = null;
  /** "calls [...] rules [...] priorities [...]" when the choice was not ordered. */
  collision: string | null = null;
  // We only bother to store the last 3, as the subtest system will have
  // handled all calls before that.
  lastThreeRuleNames: (string | null)[] | null = null;
  excStr: string | null = null;
  stdout: string | null = null;
  stderr: string | null = null;

  fillLastThreeRuleNames(selection: HarnessSelection): void {
    // FIXME: This is kinda an ugly z3b-dependant hack.
    const names = selection.lastThreeRuleNames;
    if (names === null || names === undefined) {
      return;
    }
    // These are in call-order, so we'd access partner's via names[-2].
    // Python maps them through `str`, so a missing rule becomes the literal
    // string "None" rather than a null; the WARNING below inherits that.
    this.lastThreeRuleNames = names.map(pythonStr);
  }
}

export class ResultsAggregator {
  private readonly resultsCountByGroup = new Map<string, number>();
  private readonly resultsByIdentifier = new Map<string, TestResult>();
  private readonly groupHasPrinted: boolean[];
  private totalFailures = 0;
  readonly errors: { test: CompiledTest; excStr: string }[] = [];
  /** (test, "calls [...] rules [...]") where the choice was not ordered. */
  readonly collisions: { test: CompiledTest; text: string }[] = [];
  /** Calls two rules claimed at one category (neither owns the call). */
  dropped = 0;

  readonly groups: readonly TestGroup[];
  private readonly stdout: OutputStream;
  private readonly stderr: OutputStream;
  private readonly log: HarnessLogger;

  constructor(
    groups: readonly TestGroup[],
    stdout: OutputStream,
    stderr: OutputStream,
    log: HarnessLogger,
  ) {
    this.groups = groups;
    this.stdout = stdout;
    this.stderr = stderr;
    this.log = log;
    for (const group of groups) {
      this.resultsCountByGroup.set(group.name, 0);
    }
    this.groupHasPrinted = groups.map(() => false);
  }

  private isComplete(group: TestGroup): boolean {
    return this.resultsCountByGroup.get(group.name) === group.tests.length;
  }

  private printCompletedGroups(): void {
    for (let index = 0; index < this.groupHasPrinted.length; index += 1) {
      if (this.groupHasPrinted[index]) {
        continue;
      }
      const group = this.groups[index];
      if (!this.isComplete(group)) {
        return;
      }
      this.printGroupSummary(group);
      this.groupHasPrinted[index] = true;
    }
  }

  private printGroupSummary(group: TestGroup): void {
    let failCount = 0;
    this.stdout.print(`${group.name}:`);
    for (const test of group.tests) {
      const result = this.resultsByIdentifier.get(test.identifier)!;
      this.printCapturedLogs(result);

      if (result.excStr) {
        // Never raise here: the Python runs this on the multiprocessing pool's
        // result thread and an exception there hangs the run.  Record it; the
        // run fails after every result is in.
        failCount += 1;
        this.errors.push({ test, excStr: result.excStr });
        this.stdout.print(
          `ERROR: exception bidding ${test.testString} (see end of run)`,
        );
        continue;
      }

      if (result.collision) {
        this.collisions.push({ test, text: result.collision });
        this.stdout.print(
          `COLLISION: ${result.collision} for ${test.testString}`,
        );
      }
      if (
        result.stdout &&
        result.stdout.includes("Multiple rules have maximal category")
      ) {
        this.dropped += countOccurrences(
          result.stdout,
          "Multiple rules have maximal category",
        );
      }

      if (result.call && result.call.equals(test.expectedCall)) {
        this.log.info(`PASS: ${test.expectedCall} for ${test.testString}`);
      } else {
        failCount += 1;
        this.stdout.print(
          `FAIL: ${pythonStr(result.call && result.call.name)} (expected ${test.expectedCall}) for ${test.testString}`,
        );
      }
    }

    // FIXME: We don't need to update totalFailures here.
    this.totalFailures += failCount;
    this.stdout.print(
      `Pass ${group.tests.length - failCount} of ${group.tests.length} hands`,
    );
    this.stdout.print("");
  }

  private printCapturedLogs(result: TestResult): void {
    // `sys.stderr.write` / `sys.stdout.write`: the captured text already
    // carries its own newlines, so it is written raw.
    if (result.stderr) {
      this.stderr.write(result.stderr);
    }
    if (result.stdout) {
      this.stdout.write(result.stdout);
    }
  }

  addResultsCallback(results: readonly TestResult[]): void {
    for (const result of results) {
      const test = result.test!;
      this.resultsByIdentifier.set(test.identifier, result);
      this.resultsCountByGroup.set(
        test.group.name,
        (this.resultsCountByGroup.get(test.group.name) ?? 0) + 1,
      );
    }
    this.printCompletedGroups();
  }

  /** These were explicitly tested and matched some hand. */
  get calledRuleNames(): Set<string> {
    const names = new Set<string>();
    for (const result of this.resultsByIdentifier.values()) {
      if (result.ruleName) {
        names.add(result.ruleName);
      }
    }
    return names;
  }

  /** These were tested via interpretation of a call_history. */
  get interpretedRuleNames(): Set<string> {
    const names = new Set<string>();
    for (const result of this.resultsByIdentifier.values()) {
      if (!result.lastThreeRuleNames) {
        continue;
      }
      for (const name of result.lastThreeRuleNames) {
        // Python filters falsy names; the literal "None" is truthy and stays.
        if (name) {
          names.add(pythonStr(name));
        }
      }
    }
    return names;
  }

  /**
   * One line per test, sorted by identifier: the call we made, the rule that
   * made it and the rules we used to interpret the last three calls.
   * `check_baseline.ts` diffs this against `baselines/z3b_rules_baseline.txt`
   * so a changed rule (even with the same call) is visible.
   */
  rulesDump(): string {
    const identifiers = [...this.resultsByIdentifier.keys()].sort();
    let text = "";
    for (const identifier of identifiers) {
      const result = this.resultsByIdentifier.get(identifier)!;
      const lastThree = (result.lastThreeRuleNames ?? [])
        .map(pythonStr)
        .join(",");
      text += `${identifier}\t${pythonStr(result.call && result.call.name)}\t${pythonStr(result.ruleName)}\t${lastThree || "-"}\n`;
    }
    return text;
  }

  printSummary(): void {
    const totalTests = this.resultsByIdentifier.size;
    const totalPass = totalTests - this.totalFailures;
    const percent = totalTests ? (100.0 * totalPass) / totalTests : 0;
    this.stdout.print(
      `Pass ${totalPass} (${formatPercent(percent)}%) of ${totalTests} total hands`,
    );
    let nones = 0;
    for (const result of this.resultsByIdentifier.values()) {
      if (result.call === null && !result.excStr) {
        nones += 1;
      }
    }
    const withPassOrDouble = this.collisions.filter(({ text }) => {
      const head = text.split("rules")[0];
      return head.includes("'P'") || head.includes("'X");
    }).length;
    this.stdout.print(
      `Collisions ${this.collisions.length} (the bidder's choice was not ordered; ${withPassOrDouble} with a pass or double), no call ${nones}, dropped calls ${this.dropped}`,
    );
  }
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

/** `_run_test`: one hand, one decision, never throwing. */
export function runTest(bidder: HarnessBidder, test: CompiledTest): TestResult {
  const result = new TestResult();
  result.test = test;
  try {
    const selection = bidder.findCallFor(test.hand, test.callHistory);
    if (selection) {
      result.stdout = selection.stdout ?? null;
      result.stderr = selection.stderr ?? null;
      result.call = selection.call;
      result.ruleName = selection.ruleName;
      if (selection.collision) {
        const { calls, rules, priorities } = selection.collision;
        result.collision = `calls ${pythonListRepr(calls)} rules ${pythonListRepr(rules)} priorities ${pythonListRepr(priorities)}`;
      }
      result.fillLastThreeRuleNames(selection);

      const names = result.lastThreeRuleNames;
      if (names && names[names.length - 2] === null) {
        // Unreachable, exactly as in the Python: `fillLastThreeRuleNames`
        // already replaced a missing rule with the string "None", so no run
        // has ever recorded a WARNING line.  Kept so the port stays literal.
        result.stdout =
          (result.stdout ?? "") +
          `WARNING: Failed to interpret partner's last bid: ${test.callHistory.copyWithPartialHistory(test.callHistory.calls.length - 2)}\n`;
      }
    }
  } catch (error) {
    result.excStr = formatException(error);
  }
  return result;
}

function formatException(error: unknown): string {
  if (error instanceof Error && error.stack) {
    return `${error.stack}\n`;
  }
  return `${String(error)}\n`;
}

export interface HarnessOptions {
  /** `sayc_expectations`; swapped out by the harness's own tests. */
  expectations?: Record<string, readonly SaycExpectation[]>;
  /** `-v`: PASS lines and duplicate-test debug lines. */
  verbose?: boolean;
  /** `TestHarness.test_shard_size`. */
  shardSize?: number;
}

export interface HarnessRun {
  /** Exactly what `python -m tests.harness` prints to stdout. */
  stdout: string;
  /** Exactly what it prints to stderr. */
  stderr: string;
  /** Exactly what `--dump FILE` writes. */
  rulesDump: string;
  /** Hands that raised; a non-empty list fails the run. */
  errors: { test: CompiledTest; excStr: string }[];
  /** 0 when no hand raised, 1 otherwise (the Python's exit status). */
  exitCode: number;
}

/**
 * `TestHarness.test_main` plus `main`: collect the groups, bid every hand,
 * print the summaries, the totals and the coverage lists.
 */
export function runHarness(
  bidder: HarnessBidder,
  options: HarnessOptions = {},
): HarnessRun {
  const expectations = options.expectations ?? saycExpectations;
  const shardSize = options.shardSize ?? 10;
  const stdout = new OutputStream();
  const stderr = new OutputStream();
  const log = new HarnessLogger(stdout, options.verbose ?? false);

  // collect_test_groups: `sorted` happens to "just work" here since tuples are
  // compared in item order, and there are no duplicate keys.
  const groups: TestGroup[] = [];
  for (const groupName of Object.keys(expectations).sort()) {
    const group = new TestGroup(groupName, log, stdout);
    group.addExpectationLines(expectations[groupName]);
    groups.push(group);
  }

  const results = new ResultsAggregator(groups, stdout, stderr, log);
  const allTests = groups.flatMap((group) => group.tests);
  for (let index = 0; index < allTests.length; index += shardSize) {
    const shard = allTests.slice(index, index + shardSize);
    results.addResultsCallback(shard.map((test) => runTest(bidder, test)));
  }

  results.printSummary();
  stdout.print();
  printCoverageSummary(bidder, results, stdout);

  const rulesDump = results.rulesDump();
  if (results.errors.length) {
    for (const { test, excStr } of results.errors) {
      stdout.print(`ERROR: exception bidding ${test.testString}:\n${excStr}`);
    }
    // `TestHarness.test_main` fails the unittest case here, so this message
    // lands on stderr with the rest of unittest's report, not in the output
    // `check_baseline` compares.
    stderr.print(
      `${results.errors.length} hands raised an exception (a broken rule, not a wrong bid)`,
    );
  }

  return {
    stdout: stdout.getValue(),
    stderr: stderr.getValue(),
    rulesDump,
    errors: results.errors,
    exitCode: results.errors.length ? 1 : 0,
  };
}

/** `TestHarness._print_coverage_summary`. */
function printCoverageSummary(
  bidder: HarnessBidder,
  results: ResultsAggregator,
  stdout: OutputStream,
): void {
  // FIXME: This need not depend on z3 specifically.
  let allRules: readonly HarnessRuleInfo[] | null;
  try {
    allRules = bidder.rules();
  } catch {
    allRules = null;
  }
  if (!allRules) {
    stdout.print("Ignoring coverage summary, failed to find rules.");
    return;
  }

  const allRuleNames = new Set(allRules.map((rule) => rule.name));

  // Don't expect to see rules which are marked "requires_planning".
  const nonPlannedRuleNames = new Set(
    allRules.filter((rule) => !rule.requiresPlanning).map((rule) => rule.name),
  );
  const calledRuleNames = results.calledRuleNames;
  const plannedRuleCount = allRuleNames.size - nonPlannedRuleNames.size;
  stdout.print(
    `Tested call generation of ${calledRuleNames.size} rules of ${nonPlannedRuleNames.size} total (excluding ${plannedRuleCount} requires_planning rules).`,
  );
  const uncalledRuleNames = difference(nonPlannedRuleNames, calledRuleNames);
  if (uncalledRuleNames.size) {
    stdout.print("Never selected call from:");
    stdout.print([...uncalledRuleNames].sort().join("\n"));
  }

  const interpretedRuleNames = results.interpretedRuleNames;
  stdout.print(
    `\nTested interpretation of ${interpretedRuleNames.size} rules of ${allRuleNames.size} total.`,
  );
  const uninterpretedRuleNames = difference(allRuleNames, interpretedRuleNames);
  // FIXME: We should print these, but we have too many right now!

  const neverTestedRuleNames = intersection(
    uncalledRuleNames,
    uninterpretedRuleNames,
  );
  if (uninterpretedRuleNames.size) {
    stdout.print(
      `\n${neverTestedRuleNames.size} rules were never used for either bidding or interpretation:`,
    );
    stdout.print([...neverTestedRuleNames].sort().join("\n"));
  }
}

function difference(a: Set<string>, b: Set<string>): Set<string> {
  return new Set([...a].filter((value) => !b.has(value)));
}

function intersection(a: Set<string>, b: Set<string>): Set<string> {
  return new Set([...a].filter((value) => b.has(value)));
}
