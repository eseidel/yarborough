// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The port of `describe` and `rules_manifest` in python/tests/export_fixtures.py:
// a JSON description of a DSL value (constraints, preconditions, z3
// expressions, enum values, strains, calls, prefer entries and containers of
// those), and the manifest entry of a compiled rule.  Python spells names in
// snake_case; the TypeScript classes keep their Python class names, so only
// attribute and function names are translated (`snakeCase`).

import { Call, sortCalls } from "../core/call";
import { Strain } from "../core/suit";
import { Constraint } from "../z3b/constraints";
import { EnumValue, sortedEnumValues } from "../z3b/enum";
import * as prefer from "../z3b/prefer";
import { Precondition } from "../z3b/preconditions";
import { printedForm } from "../z3b/printed";
import {
  type CompiledRule,
  lookup,
  mro,
  RuleCompiler,
} from "../z3b/rule_compiler";
import { Expr } from "../z3b/z3";
import type {
  DescribedValue,
  ManifestConditionalPurpose,
  ManifestPreferEntry,
  ManifestRule,
} from "./types";

/** `voidInSpades` is `void_in_spades`: the Python spelling of a TypeScript name. */
export function snakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase());
}

/** `_enum_keys`: the keys of enum values in enum order. */
export function enumKeys(values: Iterable<EnumValue>): string[] {
  return sortedEnumValues(values).map((value) => value.key);
}

/** The port of export_fixtures.describe. */
export function describeValue(value: unknown): DescribedValue {
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
    // A ManifestPreferEntry is a plain JSON object; its interface lacks the
    // index signature DescribedValue's object case asks for.
    return describePreferEntry(value) as unknown as DescribedValue;
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

export function describePreferEntry(entry: prefer.Entry): ManifestPreferEntry {
  const described: ManifestPreferEntry = {
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

export function describePurpose(purpose: unknown): string | null {
  if (purpose === null || purpose === undefined) {
    return null;
  }
  if (typeof purpose === "function") {
    return `callable:${snakeCase(purpose.name)}`;
  }
  return purpose as string;
}

export function describeConditionalPurpose(
  entry: readonly unknown[],
): ManifestConditionalPurpose {
  return {
    condition: describeValue(entry[0]),
    purpose: describePurpose(entry[1]),
    base: entry.length > 2 ? describePurpose(entry[2]) : null,
  };
}

/** `_per_call`: a flattened per-call map, keyed by call name in Call order. */
export function perCall<T, U>(
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

/** The manifest entry the Python exporter writes for a compiled rule. */
export function manifestEntry(rule: CompiledRule): ManifestRule {
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
      .map(describePreferEntry),
    shared_constraints: describeValue(rule.sharedConstraints),
    constraints: perCall(rule.constraints, describeValue),
  };
}
