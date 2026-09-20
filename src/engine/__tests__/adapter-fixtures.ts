// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The recorded answers the adapter is measured against: the three fixtures
// python/tests/export_fixtures.py writes for it (the schemas are in its
// docstrings) and the golden cases python/tests/test_z3b_golden_cases.py
// reads.  Like src/engine/z3b/__tests__/fixtures.ts they are loaded through
// Vite's `?raw` imports, so the tests need no file system.

import coreCasesText from "../../../tests/engine-fixtures/core-cases.json?raw";
import interpretationsText from "../../../tests/engine-fixtures/interpretations.jsonl?raw";
import randomDealsText from "../../../tests/engine-fixtures/random-deals.jsonl?raw";
import goldenCasesText from "../../../tests/z3b_golden_cases.json?raw";
import type { CallInterpretation, OpeningLead } from "../adapter";

function parseJsonl<T>(text: string): T[] {
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

/** One case of tests/z3b_golden_cases.json. */
export interface GoldenCase {
  identifier: string;
  call_name: string;
  rule_name: string | null;
  description: string | null;
  knowledge_string: string | null;
  category: string[];
}

/** One line of interpretations.jsonl. */
export interface InterpretationRecord {
  calls: string;
  dealer: string;
  vulnerability: string;
  interpretations: CallInterpretation[];
  error?: string;
}

/** One decision of a random deal. */
export interface DealDecision {
  position: string;
  call: string;
  rule: string | null;
  collision: boolean;
  no_call?: boolean;
  dropped?: number;
}

/** One line of random-deals.jsonl. */
export interface RandomDealRecord {
  index: number;
  board: string;
  number: number;
  dealer: string;
  vulnerability: string;
  hands: Record<string, string>;
  decisions: DealDecision[];
  annotations_by_call: string[][];
  calls: string;
  contract: string | null;
  declarer: string | null;
  lead: (OpeningLead & { error?: string }) | null;
  error?: string;
}

/** The `leads` cases of core-cases.json. */
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

/** The `bid_suits` cases of core-cases.json. */
export interface BidSuitsCase {
  calls: string[];
  dealer_index: number;
  leader_index: number;
  artificial: boolean[] | null;
  result: [string[], string[]];
}

export interface CoreCases {
  leads: LeadCase[];
  bid_suits: BidSuitsCase[];
}

export const goldenCases = JSON.parse(goldenCasesText) as GoldenCase[];
export const interpretationRecords =
  parseJsonl<InterpretationRecord>(interpretationsText);
export const randomDealRecords = parseJsonl<RandomDealRecord>(randomDealsText);
export const coreCases = JSON.parse(coreCasesText) as CoreCases;
