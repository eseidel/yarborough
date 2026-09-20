// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The records of tests/engine-fixtures/ (the schemas are the docstrings of
// python/tests/export_fixtures.py, whose writers `export.ts` reproduces).
// Shared by the regenerator, which builds them, and the fixture gates under
// `src/engine/**/__tests__/`, which compare the engine against them.

// --- model-expressions.json ---------------------------------------------

export interface ModelExpressionsFixture {
  axioms: string[];
  named: Record<string, string>;
  hands: Record<string, string>;
  by_suit: Record<string, Record<string, string>>;
  NO_CONSTRAINTS: string;
}

// --- rules-manifest.json ------------------------------------------------

export type DescribedValue =
  | null
  | boolean
  | number
  | string
  | DescribedValue[]
  | { [key: string]: DescribedValue };

export interface ManifestPreferEntry {
  type: string;
  names: string[];
  conditional: boolean;
  order?: string;
  condition?: DescribedValue;
}

export interface ManifestConditionalPurpose {
  condition: DescribedValue;
  purpose: string | null;
  base: string | null;
}

export interface ManifestRule {
  name: string;
  mro: string[];
  category: string;
  purpose: string | null;
  purposes_per_call: Record<string, string | null>;
  conditional_purposes: ManifestConditionalPurpose[];
  conditional_purposes_per_call: Record<string, ManifestConditionalPurpose[]>;
  known_calls: string[];
  annotations: string[];
  annotations_per_call: Record<string, string[]>;
  annotations_for_call: Record<string, string[]>;
  fallback: number;
  requires_planning: boolean;
  forcing: boolean | null;
  explanation: string | null;
  explanations_per_call: Record<string, string>;
  preconditions: string[];
  preconditions_per_call: Record<string, string[]>;
  prefer: ManifestPreferEntry[];
  shared_constraints: DescribedValue;
  constraints: Record<string, DescribedValue>;
}

// --- vocabulary.json ----------------------------------------------------

export interface VocabularyFixture {
  purposes: {
    ORDER: string[];
    RANK: Record<string, number>;
    BY_SUIT: Record<string, string[]>;
    PREFERENCES: Record<string, [string, string | null][]>;
    CONDITIONS: Record<string, DescribedValue>;
  };
  annotations: string[];
  implies_artificial: string[];
  rule_categories: string[];
  positions: string[];
  strains: string[];
  strain_names: string[];
  suits: string[];
  majors: string[];
  minors: string[];
  calls: string[];
  levels: number[];
  categories: {
    LEVEL_ONE: string[];
    PASSING: string;
    NATURAL: string;
    CONTEXTUAL: Record<string, string>;
  };
  points_tables: {
    suited: (number | null)[];
    notrump: (number | null)[];
    min_hcp_for_open: number;
  };
  rule_allowed_keys: string[];
}

// --- categories.json ----------------------------------------------------

export interface CategoryRuleEntry {
  formatted: string;
  level_one: string | null;
  level_two: string;
  contextual: boolean;
}

export interface CategoryRoleCase {
  calls: string;
  dealer: string;
  role: string;
  pass_category: string[];
  natural_category: string[];
}

export interface CategoriesFixture {
  rules: Record<string, CategoryRuleEntry>;
  known_rule_names: string[];
  roles: CategoryRoleCase[];
}

// --- auction-snapshots.jsonl --------------------------------------------

export interface ViewSnapshot {
  last_call: string | null;
  annotations_for_last_call: string[];
  rule_for_last_call: string | null;
  annotations: string[];
  min_points: number;
  max_points: number;
  min_length: number[];
  max_length: number[];
  is_balanced: boolean;
  bid_suits: string[];
  unbid_suits: string[];
  contract_bid_suits: string[];
  could_have_more_points_than: Record<string, boolean>;
}

export interface GroupSnapshot {
  min_points: number;
  bid_suits: string[];
  unbid_suits: string[];
  annotations: string[];
}

export interface DroppedCall {
  call: string;
  category: string;
  rules: string[];
}

/** The dealer, vulnerability and calls every per-auction record starts with. */
export interface AuctionHead {
  dealer: string;
  vulnerability: string;
  calls: string;
}

export interface AuctionSnapshot extends AuctionHead {
  error?: string;
  legal_calls: string[];
  unbid_suits: string[];
  last_contract: string | null;
  us: GroupSnapshot;
  them: GroupSnapshot;
  everyone: GroupSnapshot;
  views: Record<string, ViewSnapshot>;
  bid_suit_naturally: Record<string, Record<string, boolean>>;
  first_natural_bidder: Record<string, string | null>;
  annotations_by_call: string[][];
  rule_by_call: (string | null)[];
  call_to_rule: Record<string, string>;
  selector_call_to_rule?: Record<string, string>;
  dropped_calls: DroppedCall[];
  forced_to_bid: boolean | { error: string };
}

// --- meanings.jsonl and meanings-sample.jsonl ---------------------------

export interface MeaningVariant {
  priority: string;
  meaning: string;
}

export interface MeaningRecord {
  call: string;
  rule: string;
  error?: string;
  variants?: MeaningVariant[];
  negations?: Record<string, number[]>[];
  constraints?: string;
  selector_constraints?: string;
  excluded_errors?: string[];
}

export interface MeaningsSnapshot extends AuctionHead {
  error?: string;
  calls_and_rules?: MeaningRecord[];
}

// --- decisions.jsonl ----------------------------------------------------

/** One line of decisions.jsonl. */
export interface DecisionRecord {
  group: string;
  hand: string;
  calls: string;
  dealer: string;
  vulnerability: string;
  expected: string;
  subtest_of: string | null;
  error?: string;
  possible: [string, string][];
  maximal: [string, string][];
  collision: { calls: string[]; rules: string[]; priorities: string[] } | null;
  call: string | null;
  rule: string | null;
  bidder_call?: string | null;
  bidder_rule?: string | null;
}

/** The part of a decision the kernel reproduces. */
export type DecisionOutcome = Pick<
  DecisionRecord,
  "possible" | "maximal" | "collision" | "call" | "rule"
>;

// --- interpretations.jsonl ----------------------------------------------

export interface InterpretationEntry {
  call_name: string;
  rule_name: string | null;
  description: string | null;
  knowledge_string: string | null;
}

export interface InterpretationRecord extends AuctionHead {
  interpretations?: InterpretationEntry[];
  error?: string;
}

// --- random-deals.jsonl -------------------------------------------------

export interface DealDecision {
  position: string;
  call: string;
  rule: string | null;
  collision: boolean;
  no_call?: boolean;
  dropped?: number;
}

export interface OpeningLeadRecord {
  leader: string;
  card: string;
  reason: string;
  partner_suits: string[];
  their_suits: string[];
}

export interface RandomDealRecord {
  index: number;
  board: string;
  number: number;
  dealer: string;
  vulnerability: string;
  hands: Record<string, string>;
  decisions: DealDecision[];
  error?: string;
  calls?: string;
  contract?: string | null;
  declarer?: string | null;
  lead?: OpeningLeadRecord | { error: string } | null;
  annotations_by_call?: string[][];
  annotations_error?: string;
}

// --- core-cases.json ----------------------------------------------------

export interface LeadCase {
  hand: string;
  strain: string;
  partner_suits: string[];
  their_suits: string[];
  card: string;
  reason: string;
  blind_card: string;
  blind_reason: string;
}

export interface BidSuitsCase {
  calls: string[];
  dealer_index: number;
  leader_index: number;
  artificial: boolean[] | null;
  result: [string[], string[]];
}

export interface CoreBoardCase {
  identifier: string;
  number: number;
  dealer: string;
  vulnerability: string;
  hands: Record<string, string>;
  deal_identifier: string;
  old_identifier: string;
  round_trip: boolean;
  old_identifier_round_trip: boolean;
  pretty_one_line: string;
}

export interface CoreBoardWithHistoryCase {
  identifier: string;
  calls: string;
  dealer: string;
  vulnerability: string;
}

export interface CoreCases {
  boards: CoreBoardCase[];
  boards_with_history: CoreBoardWithHistoryCase[];
  call_histories: Record<string, unknown>[];
  hands: Record<string, unknown>[];
  calls: Record<string, string[]>;
  vulnerability: Record<string, unknown>;
  positions: Record<string, unknown>[];
  leads: LeadCase[];
  bid_suits: BidSuitsCase[];
}

/** The exporter's auction key: dealer, vulnerability and the calls string. */
export function auctionKey(
  dealer: string,
  vulnerability: string,
  calls: string,
): string {
  return `${dealer}|${vulnerability}|${calls}`;
}
