// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The phase 4/5 gate (docs/typescript-engine-plan.md): the DSL primitives and
// the registered rules against the fixtures the Python engine exported.
//
// - vocabulary.json: the purposes, annotations, categories and positions.
// - rules-manifest.json: every field of every REGISTERED rule as the Python
//   compiler sees it (name, mro, category, purpose, known calls, annotations,
//   preconditions by repr, prefer entries, constraints by printed form, ...).
// - auction-snapshots.jsonl: on every auction the corpus visits, a recorded
//   History (recorded-history.ts) answers the DSL; the forcing oracle, the
//   preconditions (`callsOver`) and RuleSelector._call_to_rule (the maximal
//   category per call) are checked against what Python recorded, restricted
//   to the registered rules.
// - meanings.jsonl: for every (call, rule) whose rule is registered, the
//   priorities and the hashed printed meanings of every variant; and where
//   every rule of the auction is registered, the whole constraints_for_call
//   with its negations.
//
// Phase 5 lands rule batches incrementally: every assertion applies to the
// registered rules only, and the coverage is printed.  The test that ALL
// manifest rules are registered is a todo until phase 5 completes.

import { describe, expect, it } from "vitest";
import { Call, sortCalls } from "../../core/call";
import { Strain } from "../../core/suit";
import { Constraint } from "../constraints";
import { EnumValue, sortedEnumValues } from "../enum";
import { SAYCForcingOracle } from "../forcing";
import { printedForm } from "../printed";
import * as prefer from "../prefer";
import { Precondition, annotations, impliesArtificial } from "../preconditions";
import * as purposes from "../purposes";
import { positions } from "../model";
import {
  type CompiledRule,
  Rule,
  RuleCompiler,
  categories,
  lookup,
  mro,
} from "../rule_compiler";
import { StandardAmericanYellowCard } from "../sayc";
import { Expr, z3 } from "../z3";
import {
  type AuctionSnapshot,
  type DescribedValue,
  fixtureHash,
  type ManifestRule,
  type MeaningRecord,
  type MeaningsSnapshot,
  readJsonFixture,
  readJsonlFixture,
  type VocabularyFixture,
  auctionKey,
} from "./fixtures";
import { RecordedHistories, UnrecordedError } from "./recorded-history";

const manifest = readJsonFixture<ManifestRule[]>("rules-manifest.json");
const vocabulary = readJsonFixture<VocabularyFixture>("vocabulary.json");
const snapshots = readJsonlFixture<AuctionSnapshot>("auction-snapshots.jsonl");
const meanings = readJsonlFixture<MeaningsSnapshot>("meanings.jsonl");

const manifestByName = new Map(manifest.map((entry) => [entry.name, entry]));
const registered = new Map(
  StandardAmericanYellowCard.rules.map((rule) => [rule.name, rule]),
);
const store = new RecordedHistories(snapshots, (name) => {
  const rule = registered.get(name);
  if (rule) {
    return rule;
  }
  const entry = manifestByName.get(name);
  if (!entry) {
    throw new Error(`${name} is in no fixture`);
  }
  return {
    name,
    forcing: entry.forcing,
    requiresPlanning: entry.requires_planning,
  };
});

/** `voidInSpades` is `void_in_spades`: the Python spelling of a TypeScript name. */
function snakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase());
}

/** The port of export_fixtures.describe. */
function describeValue(value: unknown): DescribedValue {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value ?? null;
  }
  if (value instanceof Expr) {
    return { z3: printedForm(value) };
  }
  if (value instanceof EnumValue) {
    return { enum: value.key };
  }
  if (value instanceof Strain) {
    return { strain: value.char };
  }
  if (value instanceof Call) {
    return { call: value.name };
  }
  if (value instanceof Precondition) {
    return { precondition: value.repr() };
  }
  if (value instanceof prefer.Entry) {
    return describePreferEntry(value);
  }
  if (value instanceof Constraint) {
    const described: Record<string, DescribedValue> = {
      constraint: value.constructor.name,
    };
    for (const [name, attribute] of Object.entries(value)) {
      described[snakeCase(name)] = describeValue(attribute);
    }
    return described;
  }
  if (typeof value === "function") {
    return { callable: snakeCase(value.name) };
  }
  if (Array.isArray(value)) {
    return value.map(describeValue);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, describeValue(item)]),
    );
  }
  throw new Error(`cannot describe ${String(value)}`);
}

function describePreferEntry(entry: prefer.Entry): DescribedValue {
  const described: Record<string, DescribedValue> = {
    type: entry.constructor.name,
    names: [...entry.names],
    conditional: entry.conditional,
  };
  if (entry instanceof prefer.Conditional) {
    described.order = entry._order.constructor.name;
    described.condition = describeValue(entry._condition);
  }
  return described;
}

function describePurpose(purpose: unknown): string | null {
  if (purpose === null || purpose === undefined) {
    return null;
  }
  if (typeof purpose === "function") {
    return `callable:${snakeCase(purpose.name)}`;
  }
  return purpose as string;
}

function describeConditionalPurpose(entry: readonly unknown[]) {
  return {
    condition: describeValue(entry[0]),
    purpose: describePurpose(entry[1]),
    base: entry.length > 2 ? describePurpose(entry[2]) : null,
  };
}

/** `_per_call`: a flattened per-call map, keyed by call name in Call order. */
function perCall<T, U>(
  flattened: Record<string, T>,
  describe: (value: T) => U,
): Record<string, U> {
  const calls = sortCalls(
    Object.keys(flattened).map((name) => Call.fromString(name)),
  );
  return Object.fromEntries(
    calls.map((call) => [call.name, describe(flattened[call.name])]),
  );
}

function enumKeys(values: Iterable<EnumValue>): string[] {
  return sortedEnumValues(values).map((value) => value.key);
}

/** The manifest entry the Python exporter would write for a compiled rule. */
function manifestEntry(rule: CompiledRule): ManifestRule {
  const dsl = rule.dslRule;
  return {
    name: rule.name,
    mro: mro(dsl).map((cls) => cls.name),
    category: rule.category.key,
    purpose: describePurpose(lookup(dsl, "purpose")),
    purposes_per_call: perCall(rule.purposesPerCall, describePurpose),
    conditional_purposes: lookup(dsl, "conditionalPurposes").map(
      describeConditionalPurpose,
    ),
    conditional_purposes_per_call: perCall(
      rule.conditionalPurposesPerCall,
      (entries) => entries.map(describeConditionalPurpose),
    ),
    known_calls: sortCalls([...rule.knownCalls]).map((call) => call.name),
    annotations: enumKeys(rule._annotations),
    annotations_per_call: perCall(
      RuleCompiler._flattenTupleKeyedDict(lookup(dsl, "annotationsPerCall")),
      (value) => enumKeys(RuleCompiler._ensureList(value)),
    ),
    annotations_for_call: Object.fromEntries(
      sortCalls([...rule.knownCalls]).map((call) => [
        call.name,
        enumKeys(rule.annotationsForCall(call)),
      ]),
    ),
    fallback: Math.trunc(lookup(dsl, "fallback")),
    requires_planning: rule.requiresPlanning,
    forcing: rule.forcing,
    explanation: lookup(dsl, "explanation"),
    explanations_per_call: perCall(
      RuleCompiler._flattenTupleKeyedDict(lookup(dsl, "explanationsPerCall")),
      (value) => value,
    ),
    preconditions: rule.preconditions.map((precondition) =>
      precondition.repr(),
    ),
    preconditions_per_call: perCall(rule.preconditionsPerCall, (value) =>
      RuleCompiler._ensureList(value).map((precondition) =>
        precondition.repr(),
      ),
    ),
    prefer: prefer
      ._normalize(lookup(dsl, "prefer") ?? [])
      .map(describePreferEntry) as unknown as ManifestRule["prefer"],
    shared_constraints: describeValue(rule.sharedConstraints),
    constraints: perCall(rule.constraints, describeValue),
  };
}

/**
 * RuleSelector._call_to_rule over the registered rules: the rule of the best
 * category for each legal call, and the calls dropped because several rules
 * tie at the best category.
 */
function callToRule(history: ReturnType<RecordedHistories["historyFor"]>): {
  chosen: Map<Call, CompiledRule>;
  dropped: Map<Call, CompiledRule[]>;
} {
  const maximal = new Map<
    Call,
    { category: EnumValue; rules: CompiledRule[] }
  >();
  for (const rule of StandardAmericanYellowCard.rules) {
    for (const [category, call] of rule.callsOver(history)) {
      if (!history.callHistory.isLegalCall(call)) {
        continue;
      }
      const current = maximal.get(call);
      if (!current) {
        maximal.set(call, { category, rules: [rule] });
      } else if (category.lt(current.category)) {
        // FIXME: It's lame that enum's < is backwards.
        maximal.set(call, { category, rules: [rule] });
      } else if (category === current.category) {
        current.rules.push(rule);
      }
    }
  }
  const chosen = new Map<Call, CompiledRule>();
  const dropped = new Map<Call, CompiledRule[]>();
  for (const call of sortCalls([...maximal.keys()])) {
    const { rules } = maximal.get(call)!;
    if (rules.length > 1) {
      dropped.set(call, rules);
    } else {
      chosen.set(call, rules[0]);
    }
  }
  return { chosen, dropped };
}

describe("vocabulary.json", () => {
  it("orders the purposes as the Python module does", () => {
    expect([...purposes.ORDER]).toEqual(vocabulary.purposes.ORDER);
    expect(Object.fromEntries(purposes.RANK)).toEqual(vocabulary.purposes.RANK);
    expect(
      Object.fromEntries(
        Object.entries(purposes.BY_SUIT).map(([key, value]) => [
          key,
          [...value],
        ]),
      ),
    ).toEqual(vocabulary.purposes.BY_SUIT);
    expect(
      Object.fromEntries(
        Object.entries(purposes.PREFERENCES).map(([key, value]) => [
          key,
          value.map((entry) => [...entry]),
        ]),
      ),
    ).toEqual(vocabulary.purposes.PREFERENCES);
    expect(
      Object.fromEntries(
        [...purposes.CONDITIONS].map(([key, value]) => [
          key,
          describeValue(value),
        ]),
      ),
    ).toEqual(vocabulary.purposes.CONDITIONS);
  });

  it("enumerates the annotations, categories and positions in order", () => {
    expect([...annotations].map((value) => value.key)).toEqual(
      vocabulary.annotations,
    );
    expect(enumKeys(impliesArtificial)).toEqual(vocabulary.implies_artificial);
    expect([...categories].map((value) => value.key)).toEqual(
      vocabulary.rule_categories,
    );
    expect([...positions].map((value) => value.key)).toEqual(
      vocabulary.positions,
    );
    expect([...Rule.ALLOWED_KEYS].map(snakeCase).sort()).toEqual(
      vocabulary.rule_allowed_keys,
    );
  });
});

describe("rules-manifest.json", () => {
  const entries = manifest.filter((entry) => registered.has(entry.name));

  it(`registers ${registered.size} of the ${manifest.length} manifest rules`, () => {
    for (const name of registered.keys()) {
      expect(manifestByName.has(name), `${name} is not a Python rule`).toBe(
        true,
      );
    }
    console.log(
      `dsl-fixtures: ${registered.size} of ${manifest.length} rules registered`,
    );
  });

  it("registers every manifest rule", () => {
    expect([...registered.keys()].sort()).toEqual(
      manifest.map((entry) => entry.name),
    );
  });

  it.each(entries.map((entry) => [entry.name, entry] as const))(
    "compiles %s as the Python compiler does",
    (name, entry) => {
      expect(manifestEntry(registered.get(name)!)).toEqual(entry);
    },
  );
});

describe("auction-snapshots.jsonl", () => {
  it("holds a record per auction the corpus visits", () => {
    expect(snapshots.length).toBeGreaterThan(1000);
    expect(store.size).toBe(snapshots.length);
    expect(snapshots.filter((snapshot) => snapshot.error)).toHaveLength(0);
  });

  it("answers the last call of every position from the calls alone", () => {
    for (const snapshot of snapshots) {
      const history = store.historyFor(snapshot);
      for (const position of positions) {
        expect(
          history.lastCallForPosition(position)?.name ?? null,
          `${snapshot.calls} ${position.key}`,
        ).toBe(snapshot.views[position.key].last_call);
        expect(history.viewFor(position).lastCall?.name ?? null).toBe(
          snapshot.views[position.key].last_call,
        );
      }
      expect(history.lastContract?.name ?? null).toBe(snapshot.last_contract);
      expect([...history.legalCalls].map((call) => call.name).sort()).toEqual(
        [...snapshot.legal_calls].sort(),
      );
    }
  });

  it("decides forced_to_bid as the Python oracle did", () => {
    let checked = 0;
    let unrecorded = 0;
    for (const snapshot of snapshots) {
      const history = store.historyFor(snapshot);
      let forced: boolean;
      try {
        forced = new SAYCForcingOracle().forcedToBid(history);
      } catch (error) {
        if (error instanceof UnrecordedError) {
          unrecorded++;
          continue;
        }
        throw error;
      }
      expect(forced, `${snapshot.dealer} ${snapshot.calls}`).toBe(
        snapshot.forced_to_bid,
      );
      checked++;
    }
    console.log(
      `dsl-fixtures: forced_to_bid checked on ${checked} auctions, ${unrecorded} needed an unrecorded prefix`,
    );
    expect(checked).toBeGreaterThan(snapshots.length / 2);
  });

  it("assigns every call of a registered rule to it (RuleSelector._call_to_rule)", () => {
    let checked = 0;
    let claimed = 0;
    let unrecorded = 0;
    for (const snapshot of snapshots) {
      if (snapshot.legal_calls.length === 0) {
        continue; // a complete auction
      }
      const history = store.historyFor(snapshot);
      let selection: ReturnType<typeof callToRule>;
      try {
        selection = callToRule(history);
      } catch (error) {
        // A precondition (ForcedToBid) read a prefix the fixtures do not hold.
        if (error instanceof UnrecordedError) {
          unrecorded++;
          continue;
        }
        throw error;
      }
      const { chosen, dropped } = selection;
      const droppedNames = new Set(
        snapshot.dropped_calls.map((entry) => entry.call),
      );
      for (const [callName, ruleName] of Object.entries(
        snapshot.call_to_rule,
      )) {
        if (!registered.has(ruleName)) {
          continue;
        }
        const call = Call.fromString(callName);
        expect(
          chosen.get(call)?.name,
          `${snapshot.dealer} "${snapshot.calls}": ${callName}`,
        ).toBe(ruleName);
        checked++;
      }
      // A registered rule may claim a call the fixture gives to an unregistered
      // rule only when that rule's category is at least as good (it would have
      // won or tied); a call the fixture dropped or left without a rule is out
      // of reach of this check.
      for (const [call, rule] of chosen) {
        const fixtureRule = snapshot.call_to_rule[call.name];
        if (fixtureRule === undefined) {
          expect(
            droppedNames.has(call.name) ||
              !Object.hasOwn(snapshot.call_to_rule, call.name),
          ).toBe(true);
          continue;
        }
        if (!registered.has(fixtureRule)) {
          const category = categories.get(
            manifestByName.get(fixtureRule)!.category as never,
          );
          expect(
            category.lt(rule.category) || category === rule.category,
            `${snapshot.dealer} "${snapshot.calls}": ${call.name} is ${fixtureRule} (${category.key}) in Python, ${rule.name} (${rule.category.key}) here`,
          ).toBe(true);
          claimed++;
        }
      }
      for (const [call] of dropped) {
        expect(
          droppedNames.has(call.name) ||
            !registered.has(snapshot.call_to_rule[call.name] ?? ""),
          `${snapshot.dealer} "${snapshot.calls}": ${call.name} dropped here but not in Python`,
        ).toBe(true);
      }
    }
    console.log(
      `dsl-fixtures: call_to_rule checked on ${checked} (call, rule) pairs; ${claimed} calls of unregistered rules claimed at a category no better than Python's; ${unrecorded} auctions needed an unrecorded prefix`,
    );
    expect(checked).toBeGreaterThan(0);
  });
});

describe("meanings.jsonl", () => {
  const records: [string, AuctionSnapshot, MeaningRecord[]][] = [];
  for (const auction of meanings) {
    const snapshot = store.snapshot(
      auction.dealer,
      auction.vulnerability,
      auction.calls,
    );
    if (!snapshot || !auction.calls_and_rules) {
      continue;
    }
    const mine = auction.calls_and_rules.filter((record) =>
      registered.has(record.rule),
    );
    if (mine.length) {
      records.push([
        auctionKey(auction.dealer, auction.vulnerability, auction.calls),
        snapshot,
        mine,
      ]);
    }
  }

  it("holds every auction of the snapshots", () => {
    expect(meanings.length).toBe(snapshots.length);
    expect(meanings.filter((auction) => auction.error)).toHaveLength(0);
  });

  it("gives every variant of every registered rule the Python priority and meaning", () => {
    const started = performance.now();
    let checked = 0;
    let variants = 0;
    for (const [key, snapshot, mine] of records) {
      const history = store.historyFor(snapshot);
      for (const record of mine) {
        const call = Call.fromString(record.call);
        const rule = registered.get(record.rule)!;
        expect(record.error, `${key}: ${record.call}`).toBeUndefined();
        const computed = [...rule.meaningOf(history, call)].map(
          ([priority, meaning]) => ({
            priority: priority.repr(),
            meaning: fixtureHash(printedForm(meaning)),
          }),
        );
        expect(computed, `${key}: ${record.call} by ${record.rule}`).toEqual(
          record.variants,
        );
        checked++;
        variants += computed.length;
      }
    }
    const elapsed = performance.now() - started;
    console.log(
      `dsl-fixtures: ${checked} (call, rule) meanings (${variants} variants) of ${meanings.reduce((n, auction) => n + (auction.calls_and_rules?.length ?? 0), 0)} checked in ${elapsed.toFixed(0)} ms`,
    );
    expect(checked).toBeGreaterThan(0);
  });

  it("negates the unmade calls as Python did where every rule of the auction is registered", () => {
    let checked = 0;
    for (const [key, snapshot, mine] of records) {
      const callNames = Object.keys(snapshot.call_to_rule);
      if (
        mine.length !== callNames.length ||
        !callNames.every((name) => registered.has(snapshot.call_to_rule[name]))
      ) {
        continue;
      }
      const history = store.historyFor(snapshot);
      const ordering = StandardAmericanYellowCard.priorityOrdering;
      const variants = new Map(
        sortCalls(callNames.map((name) => Call.fromString(name))).map(
          (call) => [
            call,
            [
              ...registered
                .get(snapshot.call_to_rule[call.name])!
                .meaningOf(history, call),
            ],
          ],
        ),
      );
      for (const record of mine) {
        const call = Call.fromString(record.call);
        const rule = registered.get(record.rule)!;
        const situations: Expr[] = [];
        const negations: Record<string, number[]>[] = [];
        for (const [priority, meaning] of variants.get(call)!) {
          const exprs = [meaning];
          const negated: Record<string, number[]> = {};
          for (const [unmadeCall, unmadeVariants] of variants) {
            if (
              registered.get(snapshot.call_to_rule[unmadeCall.name])!
                .requiresPlanning
            ) {
              continue;
            }
            unmadeVariants.forEach(([unmadePriority, unmadeMeaning], index) => {
              if (ordering.lt(priority, unmadePriority)) {
                exprs.push(z3.Not(unmadeMeaning));
                (negated[unmadeCall.name] ??= []).push(index);
              }
            });
          }
          situations.push(z3.And(exprs));
          negations.push(negated);
        }
        expect(negations, `${key}: ${record.call} by ${rule.name}`).toEqual(
          record.negations,
        );
        expect(
          fixtureHash(printedForm(z3.Or(situations))),
          `${key}: ${record.call} by ${rule.name}`,
        ).toBe(record.constraints);
        checked++;
      }
    }
    console.log(
      `dsl-fixtures: constraints_for_call checked on ${checked} (call, rule) pairs of fully registered auctions`,
    );
    expect(checked).toBeGreaterThan(0);
  });
});
