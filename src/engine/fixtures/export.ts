// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The port of python/tests/export_fixtures.py: every file under
// tests/engine-fixtures/, rebuilt from the TypeScript engine.  The files are
// the oracle every fixture gate compares the engine with, so a regeneration
// must reproduce the committed files byte for byte until a bidding change is
// intended, and then the diff is the reviewed artifact (`pnpm fixtures:check`
// / `pnpm fixtures:accept`, cli.ts).  Everything is generated: never edit the
// files by hand.
//
//     rules-manifest.json      every compiled rule, sorted by name
//     vocabulary.json          purposes, annotations, categories, positions, strains, calls
//     categories.json          the category table and role_for over sample auctions
//     model-expressions.json   printed forms (sexpr) of the hand model
//     auction-snapshots.jsonl  the state of History over every auction the corpus visits
//     meanings.jsonl           per snapshot, per call: priorities and meaning hashes
//     meanings-sample.jsonl    the same for the first 40 auctions, with the full text
//     decisions.jsonl          per corpus expectation: possible calls, maximal set, choice
//     interpretations.jsonl    per snapshot: adapter.getCallInterpretations
//     random-deals.jsonl       random deals bid to completion, with the opening lead
//     core-cases.json          cases for the core types and the lead chooser
//
// The output is deterministic: keys are sorted, calls are in Call order, rules
// by name, suits by index, enum values by index.  The one thing the Python
// exporter drew that this one cannot redraw is its random deals: the Python
// RNG seeded the 300 deals of random-deals.jsonl and the 30 boards of
// core-cases.json, and the TypeScript RNG is a different generator (plan
// hazard 11).  So the deals come in as a `SeedSet` of board identifiers, by
// default the ones the committed files hold (`seedSetFromFixtures`), which
// keeps the files reproducible; `freshSeedSet(deals, seed)` draws a new set
// with the TypeScript RNG for whoever wants different deals, and that changes
// random-deals.jsonl and the boards, leads and bid_suits of core-cases.json.
//
// Printed forms are `printed.ts`'s (Z3's sexpr with no `let` aliases,
// whitespace collapsed); hashes are the first 16 hex characters of their
// sha256 (hash.ts); the JSON layout is Python's `json.dumps` (json.ts).

import * as api from "../adapter";
import * as categories from "../categories";
import { Board } from "../core/board";
import { Call, Pass } from "../core/call";
import { CallExplorer } from "../core/callexplorer";
import { CallHistory, Vulnerability } from "../core/callhistory";
import { Deal } from "../core/deal";
import { Hand } from "../core/hand";
import { Position, POSITIONS } from "../core/position";
import { mulberry32 } from "../core/random";
import { MAJORS, MINORS, Strain, STRAINS, SUITS } from "../core/suit";
import { type CompiledTest, TestGroup } from "../harness/harness";
import { saycExpectations } from "../harness/sayc_data";
import * as leads from "../leads";
import { Bidder, Interpreter, setBidderLog } from "../z3b/bidder";
import * as model from "../z3b/model";
import * as natural from "../z3b/natural";
import { annotations, impliesArtificial } from "../z3b/preconditions";
import { printedForm } from "../z3b/printed";
import * as purposes from "../z3b/purposes";
import { Rule, categories as ruleCategories } from "../z3b/rule_compiler";
import type { BiddingSystem } from "../z3b/sayc";
import { Expr } from "../z3b/z3";
import { describeValue, enumKeys, manifestEntry, snakeCase } from "./describe";
import { type JsonValue, jsonFileText, jsonlFileText } from "./json";
import { decisionOf, lastLine, meaningsOf, snapshotOf } from "./records";
import type {
  AuctionHead,
  AuctionSnapshot,
  BidSuitsCase,
  CategoriesFixture,
  CoreBoardCase,
  CoreCases,
  DealDecision,
  DecisionRecord,
  InterpretationRecord,
  LeadCase,
  ManifestRule,
  MeaningsSnapshot,
  ModelExpressionsFixture,
  RandomDealRecord,
  VocabularyFixture,
} from "./types";

export const DEFAULT_DEALS = 300;
export const DEFAULT_SEED = 20260919;
export const SAMPLE_AUCTIONS = 40;
export const CORE_BOARDS = 30;
export const LEAD_CASES = 40;

/** The files, in the order the Python exporter wrote and checked them. */
export const FILES = [
  "rules-manifest.json",
  "vocabulary.json",
  "categories.json",
  "model-expressions.json",
  "auction-snapshots.jsonl",
  "meanings.jsonl",
  "meanings-sample.jsonl",
  "decisions.jsonl",
  "interpretations.jsonl",
  "random-deals.jsonl",
  "core-cases.json",
] as const;

export type FixtureFile = (typeof FILES)[number];

export const ALL_CALL_NAMES: readonly string[] = [
  "P",
  "X",
  "XX",
  ...Call.LEVELS.flatMap((level) =>
    STRAINS.map((strain) => `${level}${strain.char}`),
  ),
];

// --- the deals ---------------------------------------------------------------------------

/** The boards the random deals and the core cases are dealt from. */
export interface SeedSet {
  /** Board identifiers (`number-deal`), one per record of random-deals.jsonl. */
  deals: readonly string[];
  /** Board identifiers for `boards` in core-cases.json. */
  coreBoards: readonly string[];
}

/** The seed set the committed files hold: regenerating with it reproduces them. */
export function seedSetFromFixtures(
  randomDealsText: string,
  coreCasesText: string,
): SeedSet {
  const deals = randomDealsText
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => (JSON.parse(line) as { board: string }).board);
  const coreCases = JSON.parse(coreCasesText) as {
    boards: { identifier: string }[];
  };
  return {
    deals,
    coreBoards: coreCases.boards.map((board) => board.identifier),
  };
}

/**
 * A fresh draw with the TypeScript RNG, seeded the way the Python seeded
 * its own (`seed * 1000003 + index` per deal, `seed + index` per core board).
 * The deals are not the Python's: using this changes the files.
 */
export function freshSeedSet(deals: number, seed: number): SeedSet {
  return {
    deals: Array.from(
      { length: deals },
      (_, index) => Board.random(mulberry32(seed * 1000003 + index)).identifier,
    ),
    coreBoards: Array.from(
      { length: CORE_BOARDS },
      (_, index) => Board.random(mulberry32(seed + index)).identifier,
    ),
  };
}

// --- rules-manifest.json -----------------------------------------------------------------

/** `rules_manifest`: every compiled rule, sorted by name. */
export function rulesManifest(system: BiddingSystem): ManifestRule[] {
  return [...system.rules]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(manifestEntry);
}

// --- vocabulary.json ---------------------------------------------------------------------

export function vocabulary(): VocabularyFixture {
  return {
    purposes: {
      ORDER: [...purposes.ORDER],
      RANK: Object.fromEntries(purposes.RANK),
      BY_SUIT: Object.fromEntries(
        Object.entries(purposes.BY_SUIT).map(([key, value]) => [
          key,
          [...value],
        ]),
      ),
      PREFERENCES: Object.fromEntries(
        Object.entries(purposes.PREFERENCES).map(([key, value]) => [
          key,
          value.map(
            ([strains, condition]) =>
              [strains, condition] as [string, string | null],
          ),
        ]),
      ),
      CONDITIONS: Object.fromEntries(
        [...purposes.CONDITIONS].map(([key, value]) => [
          key,
          describeValue(value),
        ]),
      ),
    },
    annotations: [...annotations].map((value) => value.key),
    implies_artificial: enumKeys(impliesArtificial),
    rule_categories: [...ruleCategories].map((value) => value.key),
    positions: [...model.positions].map((value) => value.key),
    strains: STRAINS.map((strain) => strain.char),
    strain_names: [...Strain.ALL_NAMES],
    suits: SUITS.map((s) => s.char),
    majors: MAJORS.map((s) => s.char),
    minors: MINORS.map((s) => s.char),
    calls: [...ALL_CALL_NAMES],
    levels: [...Call.LEVELS],
    categories: {
      LEVEL_ONE: [...categories.LEVEL_ONE],
      PASSING: categories.PASSING,
      NATURAL: categories.NATURAL,
      CONTEXTUAL: { ...categories._CONTEXTUAL },
    },
    points_tables: {
      suited: [...natural.pointsForSoundSuitedBidAtLevel],
      notrump: [...natural.pointsForSoundNotrumpBidAtLevel],
      min_hcp_for_open: model.minHcpForOpen,
    },
    rule_allowed_keys: [...Rule.ALLOWED_KEYS].map(snakeCase).sort(),
  };
}

// --- categories.json ---------------------------------------------------------------------

const ROLE_AUCTIONS: readonly (readonly [string, string])[] = [
  ["", "N"],
  ["P", "N"],
  ["1S", "N"],
  ["1S P", "N"],
  ["P 1H", "E"],
  ["1H 1S", "N"],
  ["1S P 2S", "N"],
  ["P P 1N X", "S"],
  ["1C P 1H P", "N"],
  ["1H 2C P P", "W"],
  ["1N P 2C P 2D P", "N"],
  ["P P P 1S P 2S P", "E"],
  ["1S X P P", "N"],
  ["1S X XX 2H", "W"],
  ["P P", "S"],
  ["1D 1H X 2H P P", "N"],
];

/** `categories_fixture`: the table, the known names and `role_for` over sample auctions. */
export function categoriesFixture(
  ruleNames: readonly string[],
): CategoriesFixture {
  const rules: CategoriesFixture["rules"] = {};
  for (const name of [...ruleNames].sort()) {
    const fixed = categories._TABLE.get(name);
    rules[name] =
      fixed !== undefined
        ? {
            formatted: categories.formatRuleName(name),
            level_one: fixed[0],
            level_two: fixed[1],
            contextual: false,
          }
        : {
            formatted: categories.formatRuleName(name),
            level_one: null,
            level_two: categories._CONTEXTUAL[name],
            contextual: true,
          };
  }
  const roles = ROLE_AUCTIONS.map(([calls, dealer]) => {
    const history = CallHistory.fromString(calls, dealer, "None");
    return {
      calls,
      dealer,
      role: categories.roleFor(history),
      pass_category: [...categories.categoryFor(null, history)],
      natural_category: [...categories.categoryFor("NaturalSuited", history)],
    };
  });
  return {
    rules,
    known_rule_names: [...categories.knownRuleNames()].sort(),
    roles,
  };
}

// --- model-expressions.json --------------------------------------------------------------

const SAMPLE_HANDS = [
  "KQ4.AQ8.K9873.K2",
  "AKT92.T98.AQ9.AT",
  "832.A.QJ652.JT73",
];

/** `NO_CONSTRAINTS` keeps its name; `voidInSpades` is `void_in_spades`. */
function pythonName(name: string): string {
  return name === name.toUpperCase() ? name : snakeCase(name);
}

/** `model_expressions`: every module-level z3 expression of model.py, and the helpers. */
export function modelExpressions(): ModelExpressionsFixture {
  const named: Record<string, string> = {};
  for (const [name, value] of Object.entries(model)) {
    if (value instanceof Expr) {
      named[pythonName(name)] = printedForm(value);
    }
  }
  const bySuit = (helper: (suit: Strain) => Expr) =>
    Object.fromEntries(SUITS.map((s) => [s.char, printedForm(helper(s))]));
  return {
    axioms: model.axioms.map(printedForm),
    named,
    hands: Object.fromEntries(
      SAMPLE_HANDS.map((hand) => [
        hand,
        printedForm(model.exprForHand(Hand.fromCdhsString(hand))),
      ]),
    ),
    by_suit: {
      expr_for_suit: bySuit(model.exprForSuit),
      stopper_expr_for_suit: bySuit(model.stopperExprForSuit),
      support_points_expr_for_suit: bySuit(model.supportPointsExprForSuit),
    },
    NO_CONSTRAINTS: printedForm(model.NO_CONSTRAINTS),
  };
}

// --- the corpus --------------------------------------------------------------------------

/** `harness_tests`: the harness's CompiledTests (subtests included) in the harness's order. */
export function harnessTests(limit: number | null = null): CompiledTest[] {
  const groups: TestGroup[] = [];
  for (const groupName of Object.keys(saycExpectations).sort()) {
    const group = new TestGroup(groupName);
    group.addExpectationLines(saycExpectations[groupName]);
    groups.push(group);
  }
  const tests = groups.flatMap((group) => group.tests);
  return limit === null ? tests : tests.slice(0, limit);
}

function auctionKeyOf(callHistory: CallHistory): AuctionHead {
  return {
    dealer: callHistory.dealer.char,
    vulnerability: callHistory.vulnerability.name,
    calls: callHistory.callsString(),
  };
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * `corpus_auctions`: every (dealer, vulnerability, calls) the harness bids
 * over, and each extended by the expected call, sorted by dealer,
 * vulnerability, number of calls and the calls string.
 */
export function corpusAuctions(tests: readonly CompiledTest[]): AuctionHead[] {
  const keys = new Map<string, AuctionHead>();
  const add = (head: AuctionHead) => {
    keys.set(`${head.dealer}|${head.vulnerability}|${head.calls}`, head);
  };
  for (const test of tests) {
    add(auctionKeyOf(test.callHistory));
    const extended = test.callHistory.copyWithPartialHistory(
      test.callHistory.calls.length,
    );
    extended.calls.push(test.expectedCall);
    add(auctionKeyOf(extended));
  }
  const length = (calls: string) =>
    calls === "" ? 0 : calls.split(" ").length;
  return [...keys.values()].sort(
    (a, b) =>
      compareStrings(a.dealer, b.dealer) ||
      compareStrings(a.vulnerability, b.vulnerability) ||
      length(a.calls) - length(b.calls) ||
      compareStrings(a.calls, b.calls),
  );
}

// --- auction-snapshots.jsonl, meanings.jsonl, interpretations.jsonl ----------------------

export interface AuctionRecords {
  snapshot: AuctionSnapshot | (AuctionHead & { error: string });
  meanings: MeaningsSnapshot;
  sample: MeaningsSnapshot | null;
  interpretation: InterpretationRecord;
}

/**
 * `snapshot_auction`: the snapshot, the meanings, the sample (when asked)
 * and the interpretations of one auction.
 */
export function snapshotAuction(
  system: BiddingSystem,
  head: AuctionHead,
  withSample: boolean,
): AuctionRecords {
  const { dealer, vulnerability, calls } = head;
  const meanings: MeaningsSnapshot = { ...head };
  const sample: MeaningsSnapshot | null = withSample ? { ...head } : null;
  const interpretation: InterpretationRecord = { ...head };
  const callHistory = CallHistory.fromString(calls, dealer, vulnerability);
  let snapshot: AuctionRecords["snapshot"];
  try {
    snapshot = new Interpreter().withHistory(callHistory, (history) => {
      const { snapshot, selector } = snapshotOf(system, callHistory, history);
      if (selector === null) {
        // A complete auction: no call to make.
        meanings.calls_and_rules = [];
        if (sample) {
          sample.calls_and_rules = [];
        }
      } else {
        const { records, samples } = meaningsOf(
          system.priorityOrdering,
          history,
          selector._callToRule,
        );
        meanings.calls_and_rules = records;
        if (sample) {
          sample.calls_and_rules = samples;
        }
      }
      return snapshot;
    });
  } catch (error) {
    const text = lastLine(error);
    snapshot = { ...head, error: text };
    meanings.error = text;
    if (sample) {
      sample.error = text;
    }
  }
  try {
    interpretation.interpretations = api.getCallInterpretations(
      calls,
      dealer,
      vulnerability,
    );
  } catch (error) {
    interpretation.error = lastLine(error);
  }
  return { snapshot, meanings, sample, interpretation };
}

// --- decisions.jsonl ---------------------------------------------------------------------

/** `decide`: the bidder's decision over one corpus expectation, step by step. */
export function decide(
  system: BiddingSystem,
  test: CompiledTest,
): DecisionRecord {
  const head = {
    group: test.group.name,
    hand: test.hand.cdhsDotString(),
    calls: test.callHistory.callsString(),
    dealer: test.callHistory.dealer.char,
    vulnerability: test.callHistory.vulnerability.name,
    expected: test.expectedCall.name,
    subtest_of: test.parentTest
      ? test.parentTest.callHistory.callsString()
      : null,
  };
  let outcome: ReturnType<typeof decisionOf>;
  try {
    outcome = decisionOf(system, test.hand, test.callHistory);
  } catch (error) {
    return { ...head, error: lastLine(error) } as DecisionRecord;
  }
  const record: DecisionRecord = { ...head, ...outcome.replay };
  if (
    outcome.bidder.call !== record.call ||
    outcome.bidder.rule !== record.rule
  ) {
    record.bidder_call = outcome.bidder.call;
    record.bidder_rule = outcome.bidder.rule;
  }
  return record;
}

// --- random-deals.jsonl ------------------------------------------------------------------

const DROPPED_CALL_WARNING = "Multiple rules have maximal category";

/**
 * `bid_random_deal`: the board bid to completion in all four seats, with the
 * call and the rule at every decision, then the opening lead.
 */
export function bidRandomDeal(
  index: number,
  boardIdentifier: string,
): RandomDealRecord {
  const board = Board.fromIdentifier(boardIdentifier);
  const history = board.callHistory;
  const record: RandomDealRecord = {
    index,
    board: board.identifier,
    number: board.number,
    dealer: history.dealer.char,
    vulnerability: history.vulnerability.name,
    hands: Object.fromEntries(
      POSITIONS.map((position) => [
        position.char,
        board.deal.handFor(position).cdhsDotString(),
      ]),
    ),
    decisions: [],
  };
  const bidder = new Bidder();
  try {
    while (!history.isComplete()) {
      const position = history.positionToCall();
      // `_silenced`: what the bidder prints while it decides, for the count
      // of dropped calls.
      let captured = "";
      const previous = setBidderLog((line) => {
        captured += `${line}\n`;
      });
      let selection;
      try {
        selection = bidder.callSelectionFor(
          board.deal.handFor(position),
          history,
        );
      } finally {
        setBidderLog(previous);
      }
      let call: Call;
      let decision: DealDecision;
      if (selection === null) {
        call = new Pass();
        decision = {
          position: position.char,
          call: "P",
          rule: null,
          collision: false,
          no_call: true,
        };
      } else {
        call = selection.call;
        decision = {
          position: position.char,
          call: call.name,
          rule: selection.rule?.name ?? null,
          collision: Boolean(selection.collision),
        };
      }
      const dropped = captured.split(DROPPED_CALL_WARNING).length - 1;
      if (dropped) {
        decision.dropped = dropped;
      }
      record.decisions.push(decision);
      history.calls.push(call);
    }
  } catch (error) {
    record.error = lastLine(error);
    return record;
  }
  record.calls = history.callsString();
  record.contract = history.contract();
  record.declarer = history.declarer()?.char ?? null;
  record.lead = null;
  if (!history.isPassout()) {
    try {
      record.lead = api._openingLeadForBoard(board);
    } catch (error) {
      record.lead = { error: lastLine(error) };
    }
  }
  return record;
}

/** The annotations of every call of a bid-out deal, for the `bid_suits` cases. */
function annotateDeal(record: RandomDealRecord): void {
  if (record.calls === undefined || !record.lead) {
    return;
  }
  try {
    record.annotations_by_call = new Interpreter().withHistory(
      CallHistory.fromString(record.calls, record.dealer, record.vulnerability),
      (history) => history.annotationsByCall().map(enumKeys),
    );
  } catch (error) {
    record.annotations_error = lastLine(error);
  }
}

// --- core-cases.json ---------------------------------------------------------------------

const CORE_AUCTIONS: readonly (readonly [string, string, string])[] = [
  ["", "N", "None"],
  ["P", "N", "None"],
  ["P P P", "E", "N-S"],
  ["P P P P", "S", "E-W"],
  ["1S", "N", "Both"],
  ["1S P", "N", "None"],
  ["1S X", "W", "N-S"],
  ["1S X XX", "N", "None"],
  ["1S X XX P", "N", "None"],
  ["1N P 2C P 2D P 3N P P P", "E", "E-W"],
  ["1H 1S 2H 2S P P", "S", "Both"],
  ["1C P 1H P 1S P 2D P", "W", "None"],
  ["1S P 2S P P P", "N", "N-S"],
  ["7N", "N", "None"],
  ["7N X", "N", "None"],
  ["7N X XX", "N", "None"],
  ["1S P P X P P P", "N", "None"],
  ["2C P 2D P 2N P 3C P 3H P", "E", "Both"],
  ["P 1N P 2C X", "S", "E-W"],
  ["1D 1H 1S 2C", "W", "N-S"],
];

const CORE_HANDS = [
  "KQ4.AQ8.K9873.K2",
  "AKT92.T98.AQ9.AT",
  "832.A.QJ652.JT73",
  "AKQJT98765432...",
  "...AKQJT98765432",
  "T9.AJ72.K65.Q732",
  "K74.9.J98.KJT742",
  "AKQ2.KQ4.AQJ.A32",
  "A.KQJ.T9876.5432",
  "QJ.KQ.T.A9876543",
  ".AKQJT9.AKQJT9.A",
  "J432.J432.J43.32",
  "AK.QJ.T98.765432",
  "KJ75.6.987.J6432",
  "Q53.J9.K84.T8632",
];

const bySuitChar = <T>(value: (suit: Strain) => T): Record<string, T> =>
  Object.fromEntries(SUITS.map((s) => [s.char, value(s)]));

function suitChars(suits: readonly Strain[]): string[] {
  return [...suits].sort((a, b) => a.index - b.index).map((s) => s.char);
}

function handCase(hand: Hand): Record<string, JsonValue> {
  return {
    cdhs: hand.cdhsDotString(),
    shdc: hand.shdcDotString(),
    hcp: hand.highCardPoints(),
    hcp_in_suit: bySuitChar((s) => hand.hcpInSuit(s)),
    length_points: hand.lengthPoints(),
    support_points: bySuitChar((s) => hand.supportPoints(s)),
    generic_support_points: hand.genericSupportPoints(),
    is_balanced: hand.isBalanced(),
    is_flat: hand.isFlat(),
    suit_lengths: hand.suitLengths(),
    longest_suits: suitChars(hand.longestSuits()),
    is_longest_suit: bySuitChar((s) => hand.isLongestSuit(s)),
    high_card_in_suit: bySuitChar((s) =>
      hand.lengthOfSuit(s) ? hand.highCardInSuit(s) : null,
    ),
    ace_count: hand.aceCount(),
    king_count: hand.kingCount(),
    control_count: hand.controlCount(),
    stoppers: bySuitChar((s) => ({
      first: hand.hasFirstRoundStopper(s),
      second: hand.hasSecondRoundStopper(s),
      third: hand.hasThirdRoundStopper(s),
      fourth: hand.hasFourthRoundStopper(s),
    })),
    pretty_one_line: hand.prettyOneLine(),
  };
}

function callHistoryCase(
  calls: string,
  dealer: string,
  vulnerability: string,
): Record<string, JsonValue> {
  const history = CallHistory.fromString(calls, dealer, vulnerability);
  const complete = history.isComplete();
  const positionChar = (position: Position | null) => position?.char ?? null;
  const callName = (call: Call | null) => call?.name ?? null;
  const record: Record<string, JsonValue> = {
    calls,
    dealer,
    vulnerability,
    identifier: history.identifier,
    identifier_round_trip:
      CallHistory.fromIdentifier(history.identifier).identifier ===
      history.identifier,
    is_complete: complete,
    is_passout: history.isPassout(),
    last_call: callName(history.lastCall),
    last_non_pass: callName(history.lastNonPass()),
    last_contract: callName(history.lastContract()),
    last_to_call: positionChar(history.lastToCall),
    last_to_not_pass: positionChar(history.lastToNotPass()),
    position_to_call: history.positionToCall().char,
    opener: positionChar(history.opener()),
    declarer: positionChar(history.declarer()),
    dummy: positionChar(history.dummy()),
    contract: history.contract(),
    competitive: history.competativeAuction(),
    calls_by: Object.fromEntries(
      POSITIONS.map((position) => [
        position.char,
        history.callsBy(position).map((call) => call.name),
      ]),
    ),
    possible_calls_over: new CallExplorer()
      .possibleCallsOver(history)
      .map((call) => call.name),
    ascending_partial_histories: history
      .ascendingPartialHistories(4)
      .map((partial) => partial.callsString()),
  };
  if (!complete) {
    record.legal_calls = ALL_CALL_NAMES.filter((name) =>
      history.isLegalCall(Call.fromString(name)),
    );
    record.can_double = Boolean(history.lastNonPass() && history.canDouble());
    record.can_redouble = Boolean(
      history.lastNonPass() && history.canRedouble(),
    );
  }
  return record;
}

function boardCase(identifier: string): CoreBoardCase {
  const board = Board.fromIdentifier(identifier);
  const deal = board.deal;
  return {
    identifier: board.identifier,
    number: board.number,
    dealer: board.callHistory.dealer.char,
    vulnerability: board.callHistory.vulnerability.name,
    hands: Object.fromEntries(
      POSITIONS.map((position) => [
        position.char,
        deal.handFor(position).cdhsDotString(),
      ]),
    ),
    deal_identifier: deal.identifier,
    old_identifier: deal.oldIdentifier,
    round_trip:
      Board.fromIdentifier(board.identifier).identifier === board.identifier,
    old_identifier_round_trip:
      Deal.fromIdentifier(deal.oldIdentifier).identifier === deal.identifier,
    pretty_one_line: deal.prettyOneLine(),
  };
}

/**
 * `core_cases`: the core types over the seed boards, fixed auctions and
 * hands, and `leads.choose` / `leads.bid_suits` over the opening leads of
 * the random deals.
 */
export function coreCases(
  coreBoards: readonly string[],
  dealRecords: readonly RandomDealRecord[],
): CoreCases {
  const boards = coreBoards.map(boardCase);
  const withHistory = Board.fromIdentifier(`${boards[0].identifier}:1N,P,2C`);
  const leadCases: LeadCase[] = [];
  const bidSuitCases: BidSuitsCase[] = [];
  for (const record of dealRecords) {
    const lead = record.lead;
    if (!lead || "error" in lead || leadCases.length >= LEAD_CASES) {
      continue;
    }
    const history = CallHistory.fromString(
      record.calls!,
      record.dealer,
      record.vulnerability,
    );
    const leader = Position.fromChar(lead.leader);
    const hand = Hand.fromCdhsString(record.hands[lead.leader]).shdcDotString();
    const strain = history.lastContract()!.name[1];
    const aware = leads.choose(
      hand,
      strain,
      lead.partner_suits,
      lead.their_suits,
    );
    const blind = leads.choose(
      hand,
      strain,
      lead.partner_suits,
      lead.their_suits,
      true,
    );
    leadCases.push({
      hand,
      strain,
      partner_suits: lead.partner_suits,
      their_suits: lead.their_suits,
      card: aware[0],
      reason: aware[1],
      blind_card: blind[0],
      blind_reason: blind[1],
    });
    // `[...] or None`: an empty list of annotations reads as no annotations.
    const annotated = (record.annotations_by_call ?? []).map((keys) =>
      keys.includes(annotations.Artificial.key),
    );
    const artificial = annotated.length ? annotated : null;
    const calls = history.callsString().split(" ");
    const [partnerSuits, theirSuits] = leads.bidSuits(
      calls,
      history.dealer.index,
      leader.index,
      artificial,
    );
    bidSuitCases.push({
      calls,
      dealer_index: history.dealer.index,
      leader_index: leader.index,
      artificial,
      result: [partnerSuits, theirSuits],
    });
  }
  return {
    boards,
    boards_with_history: [
      {
        identifier: withHistory.identifier,
        calls: withHistory.callHistory.callsString(),
        dealer: withHistory.callHistory.dealer.char,
        vulnerability: withHistory.callHistory.vulnerability.name,
      },
    ],
    call_histories: CORE_AUCTIONS.map((auction) => callHistoryCase(...auction)),
    hands: CORE_HANDS.map((hand) => handCase(Hand.fromCdhsString(hand))),
    calls: {
      sorted: [...ALL_CALL_NAMES],
      suited_names: Call.suitedNames(),
      notrump_names: Call.notrumpNames(),
      suited_names_between_2C_5S: Call.suitedNamesBetween("2C", "5S"),
    },
    vulnerability: Object.fromEntries(
      Array.from({ length: 16 }, (_, index) => index + 1).map((number) => {
        const vulnerability = Vulnerability.fromBoardNumber(number);
        return [
          String(number),
          {
            name: vulnerability.name,
            identifier: vulnerability.identifier,
            dealer: CallHistory.dealerFromBoardNumber(number).char,
            vulnerable: Object.fromEntries(
              POSITIONS.map((position) => [
                position.char,
                vulnerability.isVulnerable(position),
              ]),
            ),
          },
        ];
      }),
    ),
    positions: POSITIONS.map((p) => ({
      char: p.char,
      name: p.name,
      index: p.index,
      lho: p.lho.char,
      partner: p.partner.char,
      rho: p.rho.char,
    })),
    leads: leadCases,
    bid_suits: bidSuitCases,
  };
}

// --- the export --------------------------------------------------------------------------

export interface ExportOptions {
  /** The boards to deal: `seedSetFromFixtures` of the committed files, or a fresh draw. */
  seedSet: SeedSet;
  /** Only the first N harness tests (a quick run). */
  limit?: number | null;
  /** Progress, as the Python wrote it to stderr. */
  log?: (message: string) => void;
}

export interface ExportSummary {
  auctions: number;
  auction_errors: string[];
  meanings: number;
  meaning_errors: number;
  interpretation_errors: string[];
  decisions: number;
  decision_errors: string[];
  bidder_disagreements: [string, string][];
  deals: number;
  deal_errors: number[];
  seconds: number;
}

export interface ExportResult {
  /** The text of every fixture file, by name. */
  files: ReadonlyMap<FixtureFile, string>;
  summary: ExportSummary;
}

/** `export`: every fixture file, in memory, and the Python's summary. */
export function exportFixtures(options: ExportOptions): ExportResult {
  const log = options.log ?? (() => {});
  const started = performance.now();
  const elapsed = () => ((performance.now() - started) / 1000).toFixed(0);
  const files = new Map<FixtureFile, string>();
  // `_silenced`: the bidder prints WARNING and COLLISION lines.
  const restoreLog = setBidderLog(() => {});
  try {
    const system = new Bidder().system;
    files.set("rules-manifest.json", jsonFileText(rulesManifest(system)));
    files.set("vocabulary.json", jsonFileText(vocabulary()));
    files.set(
      "categories.json",
      jsonFileText(categoriesFixture(system.rules.map((rule) => rule.name))),
    );
    files.set("model-expressions.json", jsonFileText(modelExpressions()));

    const tests = harnessTests(options.limit ?? null);
    const auctions = corpusAuctions(tests);
    const seedSet = options.seedSet;
    log(
      `exporting ${auctions.length} auctions, ${tests.length} decisions, ${seedSet.deals.length} deals`,
    );
    const results: AuctionRecords[] = [];
    auctions.forEach((head, index) => {
      results.push(snapshotAuction(system, head, index < SAMPLE_AUCTIONS));
      if ((index + 1) % 100 === 0) {
        log(`  ${index + 1} of ${auctions.length} auctions at ${elapsed()}s`);
      }
    });
    const snapshots = results.map((result) => result.snapshot);
    files.set("auction-snapshots.jsonl", jsonlFileText(snapshots));
    files.set(
      "meanings.jsonl",
      jsonlFileText(results.map((result) => result.meanings)),
    );
    files.set(
      "meanings-sample.jsonl",
      jsonlFileText(
        results
          .map((result) => result.sample)
          .filter((sample) => sample !== null),
      ),
    );
    files.set(
      "interpretations.jsonl",
      jsonlFileText(results.map((result) => result.interpretation)),
    );
    log(`snapshots done at ${elapsed()}s`);

    const decisions: DecisionRecord[] = [];
    tests.forEach((test, index) => {
      decisions.push(decide(system, test));
      if ((index + 1) % 100 === 0) {
        log(`  ${index + 1} of ${tests.length} decisions at ${elapsed()}s`);
      }
    });
    files.set("decisions.jsonl", jsonlFileText(decisions));
    log(`decisions done at ${elapsed()}s`);

    const dealRecords = seedSet.deals.map((board, index) =>
      bidRandomDeal(index, board),
    );
    // The annotations of every call, for leads.bid_suits cases: from the
    // deal's own auction.
    for (const record of dealRecords) {
      annotateDeal(record);
    }
    files.set("random-deals.jsonl", jsonlFileText(dealRecords));
    files.set(
      "core-cases.json",
      jsonFileText(coreCases(seedSet.coreBoards, dealRecords)),
    );

    const summary: ExportSummary = {
      auctions: auctions.length,
      auction_errors: snapshots
        .filter((snapshot) => "error" in snapshot)
        .map((snapshot) => snapshot.calls),
      meanings: results.reduce(
        (total, result) =>
          total + (result.meanings.calls_and_rules?.length ?? 0),
        0,
      ),
      meaning_errors: results.reduce(
        (total, result) =>
          total +
          (result.meanings.calls_and_rules ?? []).filter(
            (record) => record.error !== undefined,
          ).length,
        0,
      ),
      interpretation_errors: results
        .filter((result) => result.interpretation.error !== undefined)
        .map((result) => result.interpretation.calls),
      decisions: decisions.length,
      decision_errors: decisions
        .filter((decision) => decision.error !== undefined)
        .map((decision) => decision.calls),
      bidder_disagreements: decisions
        .filter((decision) => "bidder_call" in decision)
        .map((decision) => [decision.hand, decision.calls]),
      deals: dealRecords.length,
      deal_errors: dealRecords
        .filter((record) => record.error !== undefined)
        .map((record) => record.index),
      seconds: Math.round((performance.now() - started) / 100) / 10,
    };
    log(`done in ${elapsed()}s`);
    return { files, summary };
  } finally {
    setBidderLog(restoreLog);
  }
}
