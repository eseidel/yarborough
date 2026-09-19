// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/rule_compiler.py: the rule categories, the priority
// ordering, the Rule DSL base class, and the compiler that turns a rule class
// into a CompiledRule the bidder reads.
//
// =====================================================================
// Declaring a rule in TypeScript (the convention phase 5 translates by)
// =====================================================================
//
// A Python rule class becomes a TypeScript class with the same name and the
// same base class; its DSL fields become the keys of one static `dsl` object
// built by `rule({...})`, in camelCase, in the Python order:
//
//     class OneLevelSuitOpening(Opening):
//         purpose = "MajorDiscovery"
//         shared_constraints = OpeningRuleConstraint()
//         annotations_per_call = {'1C': annotations.BidClubs, ...}
//         annotations = annotations.OneLevelSuitOpening
//         constraints = {'1C': clubs >= 3, ...}
//         prefer = [Longest('1H', '1S'), '1S', ('1C', z3.And(clubs == 3, diamonds == 3))]
//
//     export class OneLevelSuitOpening extends Opening {
//       static override dsl = rule({
//         purpose: "MajorDiscovery",
//         sharedConstraints: new OpeningRuleConstraint(),
//         annotationsPerCall: { "1C": annotations.BidClubs, ... },
//         annotations: annotations.OneLevelSuitOpening,
//         constraints: { "1C": clubs.ge(3), ... },
//         prefer: [new Longest("1H", "1S"), "1S", ["1C", z3.And(clubs.eq(3), diamonds.eq(3))]],
//       });
//     }
//
// One object per class rather than one static field per key because
// TypeScript narrows an inferred static field to its initializer's type and
// then rejects a subclass whose value has another shape (an annotation list
// under a single annotation, another call map); `rule()` gives every class
// the same wide type and type-checks each value in place.  The rules:
//
// - Keys: annotations, annotationsPerCall, callNames, category, constraints,
//   forcing, preconditions, preconditionsPerCall, prefer, fallback, purpose,
//   purposesPerCall, conditionalPurposes, conditionalPurposesPerCall,
//   requiresPlanning, sharedConstraints, explanationsPerCall, explanation.
//   `rule()` rejects any other key at compile time and `_validateRule` at
//   run time, as the Python does; helpers go in module scope, and a rule
//   class has no other static member.
// - Python operators on model variables become the binding's methods:
//   `clubs >= 3` is `clubs.ge(3)`, `points == 15` is `points.eq(15)`,
//   `a + b` is `a.add(b)`, `2 * x` is `z3.mul(2, x)`, `z3.Not(balanced)`
//   stays `z3.Not(balanced)`, `sum(list)` is `pySum(list)`, `z3.And(a, b)`
//   and `z3.And([a, b])` stay as they are.  Keep the nesting and the argument
//   order: the fixtures hash the printed forms.
// - A Python tuple of constraints, calls or preconditions is a plain array.
//   A tuple that `repr` prints (LastBidHasStrain's strains) is `tuple(...)`
//   from py.ts.
// - A dict with a tuple key, `{('2D', '2H', '2S', '3C'): ...}`, is an object
//   whose key lists the call names separated by spaces:
//   `{ "2D 2H 2S 3C": ... }` (`_flattenTupleKeyedDict` splits it).
// - A prefer tuple `('1C', condition)` or `(('2D', '2H'), condition, Highest)`
//   is an array `["1C", condition]` or `[["2D", "2H"], condition, Highest]`.
//   A conditional purpose `(condition, "PreemptWeak")` or
//   `(condition, promoted, base)` is likewise an array.
// - A callable purpose is a function `(history, call) => string` declared at
//   module scope, named as the Python function in camelCase.
// - A field that reads another field of the same class (`prefer =
//   [Longest(*call_names)]`) reads a module constant holding that value.
// - A Python mixin (a class deriving from `object` that only carries DSL
//   fields: JumpShift, MichaelsCuebid, SimplePreference, CappellettiEntries)
//   is a mixin function returning a class extending its argument, with the
//   Python class's name:
//
//       class JumpShift(object):
//           preconditions = [UnbidSuit(), JumpFromLastContract(exact_size=1)]
//       class JumpShiftByOpener(JumpShift, RebidAfterOneLevelOpen):
//
//       export function JumpShift<B extends MixinBase>(Base: B) {
//         return class JumpShift extends Base {
//           static override dsl = rule({
//             preconditions: [new UnbidSuit(), new JumpFromLastContract(1)],
//           });
//         };
//       }
//       export class JumpShiftByOpener extends JumpShift(RebidAfterOneLevelOpen) {
//
//   Python's C3 linearization of `class X(Mixin, Base)` is X, Mixin, Base, ...
//   and the prototype chain of `X extends Mixin(Base)` is the same list, so
//   `_collectFromAncestors` joins the fields in the Python order and the
//   fixtures' `mro` reads straight off the chain.  Every mixin in the Python
//   is listed first among the bases and derives from object, which is what
//   makes this exact.
// - Fields are joined ancestor first from the classes that DEFINE them
//   (`Object.hasOwn` on each class's own `dsl`, the port of `vars(ancestor)`),
//   never from inherited lookups; a subclass that repeats a parent's field
//   contributes it again, as in Python.  A single value (`category`,
//   `purpose`, `fallback`, ...) is the nearest definition up the chain.
// - Only leaf classes are rules.  The registry in sayc.ts lists them by name
//   (`{ OneLevelSuitOpening, NotrumpOpening, ... }`): the key is the rule's
//   name, so minification of class names cannot change what the engine
//   reports.  Add every translated leaf rule there; the abstract sections
//   (Opening, Response, OpenerRebid, ...) are exported but not registered.

import { assert } from "../core/assert";
import { Call, sortCalls } from "../core/call";
import { Constraint, type Constraints } from "./constraints";
import { type EnumValue, makeEnum } from "./enum";
import type { History } from "./history";
import * as model from "./model";
import * as prefer from "./prefer";
import type { PreferList } from "./prefer";
import {
  annotations,
  impliesArtificial,
  type Precondition,
} from "./preconditions";
import * as purposes from "./purposes";
import { Priority, type PriorityKey } from "./purposes";
import { Expr, z3 } from "./z3";

export function _isNotEmptyOrNone(x: unknown): boolean {
  // x may be a z3 expression, which must not be compared with ==.
  if (Array.isArray(x)) {
    return x.length > 0;
  }
  if (x !== null && typeof x === "object" && isPlainObject(x)) {
    return Object.keys(x).length > 0;
  }
  return x !== null && x !== undefined;
}

/** A Python dict: an object literal, as opposed to an Expr or a Constraint. */
function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export const categories = makeEnum(
  "Relay",
  "Gadget",
  "NotrumpSystem",
  "Default",
  "Natural",
  "LawOfTotalTricks",
  "NaturalPass",
  "DefaultPass",
);

/** Python's tuple comparison of two prefer keys. */
function compareKeys(left: PriorityKey, right: PriorityKey): number {
  if (left[0] !== right[0]) {
    return left[0] - right[0];
  }
  return left[1] - right[1];
}

/** Compares two variants of possible calls (purposes.Priority). */
export class PriorityOrdering {
  /**
   * left is a worse call than right: a worse purpose; the same purpose and a worse
   * strain under the purpose's preference; a deeper fallback; or, within one rule, a
   * worse place in the rule's own preference.  Two rules of one purpose and strain are
   * otherwise incomparable: a collision if both are possible (their meanings should not
   * both admit one hand).
   */
  lt(left: Priority, right: Priority): boolean {
    if (left.rank !== right.rank) {
      return left.rank > right.rank; // a lower rank number is a better purpose
    }
    if (
      left.strain !== right.strain &&
      left.strain !== null &&
      right.strain !== null
    ) {
      return left.strain > right.strain;
    }
    if (left.fallback !== right.fallback) {
      return left.fallback > right.fallback; // a deeper fallback loses
    }
    const sameRule =
      left.rule === right.rule ||
      (left.rule !== null &&
        right.rule !== null &&
        left.rule.name === right.rule.name);
    if (sameRule) {
      return compareKeys(left.key, right.key) > 0;
    }
    return false;
  }
}

export const priorityOrdering = new PriorityOrdering();

/** A rule's purpose: a name, or a function of the auction and the call. */
export type Purpose = string | ((history: History, call: Call) => string);

/**
 * A conditional purpose `[condition, purpose]` or `[condition, purpose, base]`:
 * the hand meeting the condition promotes the call.
 */
export type ConditionalPurpose =
  | readonly [Constraints, Purpose]
  | readonly [Constraints, Purpose, Purpose | null];

/**
 * A per-call map: the key is a call name, or several call names separated by
 * spaces (a Python tuple key).
 */
export type PerCall<T> = Readonly<Record<string, T>>;

export type AnnotationsField = EnumValue | readonly EnumValue[];
export type PreconditionsField = Precondition | readonly Precondition[];

/** The DSL keys and their values: what a rule class may declare. */
export interface DslFields {
  annotations?: AnnotationsField;
  annotationsPerCall?: PerCall<AnnotationsField>; // { '1C' : [annotations.Foo, annotations.Bar] }
  callNames?: string | readonly string[] | null; // For when all calls share the same constraints
  category?: EnumValue; // Intra-bid priority
  // { '1C' : constraints, '1H 1S': [constraints, constraints] }
  constraints?: PerCall<Constraints>;
  forcing?: boolean | null;
  preconditions?: PreconditionsField;
  preconditionsPerCall?: PerCall<PreconditionsField>; // { '3N': precondition, '2N 3N': [preconditions] }
  // The rule's own order among its calls (prefer.ts); null or []: the cheaper call first.
  prefer?: PreferList | null;
  // The call of last resort for its purpose (and strain, where the purpose prefers one):
  // loses to every rule of the purpose that is not one, and partner reads it as denying
  // their calls.  An integer for a deeper level of last resort (2 loses to 1).
  fallback?: number;
  // Why the call is made (purposes.ts): the ordering between calls of different purposes.
  purpose?: Purpose | null;
  purposesPerCall?: PerCall<Purpose>; // { '1C': purpose }
  conditionalPurposes?: readonly ConditionalPurpose[]; // [[condition, purpose]]: the hand meeting the condition promotes the call
  conditionalPurposesPerCall?: PerCall<readonly ConditionalPurpose[]>; // { '1C': [[condition, purpose]] }
  requiresPlanning?: boolean;
  // constraints which apply to call possible call_names.
  sharedConstraints?: Constraints;
  explanationsPerCall?: PerCall<string>;
  explanation?: string | null;
}

/** The DSL fields of a rule class: `static override dsl = rule({...})`. */
export function rule(fields: DslFields): DslFields {
  return fields;
}

// The rules of SAYC are all described in terms of Rule.
// These classes exist to support the DSL and make it easy to concisely express
// the conventions of SAYC.
export class Rule {
  // All properties with [] (empty list) defaults, auto-collect
  // from parent classes.  foo = Parent.foo + [bar] is never necessary in this DSL.
  static dsl: DslFields = rule({
    annotations: [],
    annotationsPerCall: {},
    callNames: null,
    category: categories.Default,
    constraints: {},
    forcing: null,
    preconditions: [],
    preconditionsPerCall: {},
    prefer: null,
    fallback: 0,
    purpose: null,
    purposesPerCall: {},
    conditionalPurposes: [],
    conditionalPurposesPerCall: {},
    requiresPlanning: false,
    sharedConstraints: [],
    explanationsPerCall: {},
    explanation: null,
  });

  // These are the only properties which are allowed to be defined in subclasses.
  // The RuleCompiler will enforce this.
  // FIXME: Should we autogenerate this list from this Rule declaration?
  static readonly ALLOWED_KEYS: ReadonlySet<string> = new Set(
    Object.keys(Rule.dsl),
  );

  constructor() {
    assert(
      false,
      "Rule objects should be compiled into EngineRule objects instead of instantiating them.",
    );
  }
}

/** A rule class: `typeof Rule` or a subclass (a mixin returns one too). */
export type RuleClass = typeof Rule;

/** What a mixin function takes: a rule class, as TypeScript's mixins want it typed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MixinBase = (new (...args: any[]) => Rule) & { dsl: DslFields };

/** Python's `Rule.name()`: the class name (the registry key in production). */
export function ruleName(dslClass: RuleClass): string {
  return dslClass.name;
}

/** The classes of `dslClass.__mro__` but object: the class, its bases, ..., Rule. */
export function mro(dslClass: RuleClass): RuleClass[] {
  const chain: RuleClass[] = [];
  let cls: unknown = dslClass;
  while (typeof cls === "function" && cls !== Function.prototype) {
    chain.push(cls as RuleClass);
    cls = Object.getPrototypeOf(cls);
  }
  return chain;
}

/** `vars(dslClass)[key]` for a DSL key: the value the class itself defines, if any. */
function ownDsl<K extends keyof DslFields>(
  dslClass: RuleClass,
  key: K,
): { defined: boolean; value: DslFields[K] } {
  if (Object.hasOwn(dslClass, "dsl") && Object.hasOwn(dslClass.dsl, key)) {
    return { defined: true, value: dslClass.dsl[key] };
  }
  return { defined: false, value: undefined };
}

/** `getattr(dslClass, key)`: the nearest definition up the class chain. */
export function lookup<K extends keyof DslFields>(
  dslClass: RuleClass,
  key: K,
): Required<DslFields>[K] {
  for (const ancestor of mro(dslClass)) {
    const own = ownDsl(ancestor, key);
    if (own.defined) {
      return own.value as Required<DslFields>[K];
    }
  }
  throw new Error(`${key} is not a DSL key`);
}

// This is a public interface from DSL Rules to the rest of the system.
export class CompiledRule implements purposes.PriorityRule {
  readonly dslRule: RuleClass;
  readonly name: string;
  readonly preconditionsPerCall: Record<string, PreconditionsField>;
  readonly purposesPerCall: Record<string, Purpose>;
  readonly conditionalPurposesPerCall: Record<
    string,
    readonly ConditionalPurpose[]
  >;
  readonly preconditions: readonly Precondition[];
  readonly knownCalls: readonly Call[];
  readonly sharedConstraints: readonly Constraints[];
  readonly _annotations: ReadonlySet<EnumValue>;
  readonly constraints: Record<string, Constraints>;
  // FIXME: Should forcing be an annotation instead?  It has an awkward tri-state currently.
  readonly forcing: boolean | null;

  constructor(
    rule: RuleClass,
    name: string,
    options: {
      preconditions: readonly Precondition[];
      knownCalls: readonly Call[];
      sharedConstraints: readonly Constraints[];
      annotations: ReadonlySet<EnumValue>;
      constraints: Record<string, Constraints>;
      purposesPerCall?: Record<string, Purpose>;
      conditionalPurposesPerCall?: Record<
        string,
        readonly ConditionalPurpose[]
      >;
      preconditionsPerCall?: Record<string, PreconditionsField>;
    },
  ) {
    this.dslRule = rule;
    this.name = name;
    this.preconditionsPerCall = options.preconditionsPerCall ?? {};
    this.purposesPerCall = options.purposesPerCall ?? {};
    this.conditionalPurposesPerCall = options.conditionalPurposesPerCall ?? {};
    this.preconditions = options.preconditions;
    this.knownCalls = options.knownCalls;
    this.sharedConstraints = options.sharedConstraints;
    this._annotations = options.annotations;
    this.constraints = options.constraints;
    this.forcing = lookup(this.dslRule, "forcing");
  }

  /** `self.dsl_rule.<key>`: the rule class's field, inherited. */
  field<K extends keyof DslFields>(key: K): Required<DslFields>[K] {
    return lookup(this.dslRule, key);
  }

  get category(): EnumValue {
    return this.field("category");
  }

  get requiresPlanning(): boolean {
    return this.field("requiresPlanning");
  }

  annotationsForCall(call: Call): ReadonlySet<EnumValue> {
    const annotationsPerCall = this.field("annotationsPerCall");
    if (Object.keys(annotationsPerCall).length) {
      // Tuple keys name several calls, as in constraints (Cappelletti's ('2C', '2D', '2N')
      // was never matched before this flattening, so those calls read as natural).
      const perCallAnnotations =
        RuleCompiler._flattenTupleKeyedDict(annotationsPerCall)[call.name];
      if (
        perCallAnnotations !== undefined &&
        _isNotEmptyOrNone(perCallAnnotations)
      ) {
        return new Set([
          ...this._annotations,
          ...RuleCompiler._ensureList(perCallAnnotations),
        ]);
      }
    }
    return this._annotations;
  }

  toString(): string {
    return this.name;
  }

  repr(): string {
    // List printing looks nicer if we lie here.
    return this.name;
  }

  // FIXME: This exists for compatibility with KBB's Rule interface and is used by autobid_handler.py
  explanationForBid(call: Call): string | null {
    const explanationsPerCall = this.field("explanationsPerCall");
    const explanation = Object.hasOwn(explanationsPerCall, call.name)
      ? explanationsPerCall[call.name]
      : undefined;
    if (explanation) {
      return explanation;
    }
    return this.field("explanation");
  }

  _fitsPreconditions(
    history: History,
    call: Call,
    expectedCall: Call | null = null,
  ): boolean {
    const perCall = Object.hasOwn(this.preconditionsPerCall, call.name)
      ? RuleCompiler._ensureList(this.preconditionsPerCall[call.name])
      : [];
    for (const precondition of [...this.preconditions, ...perCall]) {
      if (!precondition.fits(history, call)) {
        if (
          expectedCall !== null &&
          call === expectedCall &&
          this.knownCalls.includes(expectedCall)
        ) {
          console.log(` ${this.name} failed: ${precondition.repr()}`);
        }
        return false;
      }
    }
    return true;
  }

  *callsOver(
    history: History,
    expectedCall: Call | null = null,
  ): Generator<[EnumValue, Call]> {
    // A set intersection iterates in hash order; yield the calls in Call order instead.
    for (const call of sortCalls(
      this.knownCalls.filter((known) => history.legalCalls.has(known)),
    )) {
      if (this._fitsPreconditions(history, call, expectedCall)) {
        yield [this.category, call];
      }
    }
  }

  _constraintExprsForCall(history: History, call: Call): Expr[] {
    const exprs: Expr[] = [];
    if (Object.hasOwn(this.constraints, call.name)) {
      exprs.push(
        ...RuleCompiler.exprsFromConstraints(
          this.constraints[call.name],
          history,
          call,
        ),
      );
    }
    exprs.push(
      ...RuleCompiler.exprsFromConstraints(
        this.sharedConstraints,
        history,
        call,
      ),
    );
    return exprs;
  }

  /**
   * The declared purpose of this rule making `call`: per call, else the rule's; a
   * callable purpose is asked with the auction (a natural bid raises, rebids or
   * discovers depending on who bid the suit).
   */
  purposeForCall(history: History, call: Call): string {
    let purpose = Object.hasOwn(this.purposesPerCall, call.name)
      ? this.purposesPerCall[call.name]
      : this.field("purpose");
    assert(purpose, `${this.name} declares no purpose`);
    if (typeof purpose === "function") {
      purpose = purpose(history, call);
    }
    return purposes.resolve(purpose, call);
  }

  /**
   * (priority, meaning) pairs, one per variant of the call: the rule's purpose (or a
   * conditional purpose, its condition folded into the meaning), the purpose's strain
   * preference, and the rule's own preference (prefer).
   */
  *meaningOf(history: History, call: Call): Generator<[Priority, Expr]> {
    const exprs = this._constraintExprsForCall(history, call);
    const purpose = this.purposeForCall(history, call);

    /** (key, exprs): the rule's own preference, one variant per entry that fits. */
    const variants = (): [PriorityKey, Expr[]][] =>
      prefer
        .variants(this.field("prefer") ?? [], this.knownCalls, history, call)
        .map(([key, condition]) => [
          key,
          condition === null
            ? []
            : RuleCompiler.exprsFromConstraints(condition, history, call),
        ]);

    /**
     * (rank, exprs) under the purpose's strain preference; a pass takes the
     * strain of the contract it passes.
     */
    const strainVariants = (purposeName: string): [number | null, Expr[]][] => {
      const target = call.isContract()
        ? call
        : history.callHistory.lastContract();
      if (target === null) {
        return [[null, []]];
      }
      return purposes
        .strainVariants(purposeName, target)
        .map(([rank, conditionName]) => [
          rank,
          conditionName === null
            ? []
            : RuleCompiler.exprsFromConstraints(
                purposes.CONDITIONS.get(conditionName)!,
                history,
                call,
              ),
        ]);
    };

    const priority = (
      purposeName: string,
      key: PriorityKey,
      strain: number | null,
    ) =>
      new Priority(purposeName, {
        rule: this,
        key,
        strain,
        fallback: Math.trunc(this.field("fallback")),
      });

    // A conditional purpose promotes the call when the hand meets the condition.
    const conditionalPurposes: ConditionalPurpose[] = [
      ...(Object.hasOwn(this.conditionalPurposesPerCall, call.name)
        ? this.conditionalPurposesPerCall[call.name]
        : []),
      ...this.field("conditionalPurposes"),
    ];
    for (const entry of conditionalPurposes) {
      const [condition, promoted] = entry;
      // A third element names the base purpose the promotion applies to (a natural
      // bid is a raise only when partner bid the suit).
      if (
        entry.length > 2 &&
        entry[2] !== null &&
        entry[2] !== undefined &&
        purposes.resolve(entry[2] as string, call) !== purpose
      ) {
        continue;
      }
      assert(
        entry.length <= 3,
        `${this.name}: a conditional purpose is (condition, purpose[, base purpose])`,
      );
      const promotedName = purposes.resolve(promoted as string, call);
      const conditionExprs = RuleCompiler.exprsFromConstraints(
        condition,
        history,
        call,
      );
      for (const [key, keyExprs] of variants()) {
        for (const [strain, strainExprs] of strainVariants(promotedName)) {
          yield [
            priority(promotedName, key, strain),
            z3.And([...exprs, ...keyExprs, ...conditionExprs, ...strainExprs]),
          ];
        }
      }
    }
    for (const [key, keyExprs] of variants()) {
      for (const [strain, strainExprs] of strainVariants(purpose)) {
        yield [
          priority(purpose, key, strain),
          z3.And([...exprs, ...keyExprs, ...strainExprs]),
        ];
      }
    }
  }
}

const compiled = new Map<RuleClass, CompiledRule>();

export class RuleCompiler {
  static exprsFromConstraints(
    constraints: Constraints | null | undefined,
    history: History,
    call: Call,
  ): Expr[] {
    if (
      constraints === null ||
      constraints === undefined ||
      (Array.isArray(constraints) && constraints.length === 0)
    ) {
      return [model.NO_CONSTRAINTS];
    }

    if (constraints instanceof Constraint) {
      return [constraints.expr(history, call)];
    }

    if (constraints instanceof Expr) {
      return [constraints];
    }

    return (constraints as readonly Constraints[]).flatMap((constraint) =>
      RuleCompiler.exprsFromConstraints(constraint, history, call),
    );
  }

  static _collectFromAncestors<K extends keyof DslFields>(
    dslClass: RuleClass,
    propertyName: K,
  ): Required<DslFields>[K][] {
    // The DSL expects that parent preconditions, etc. apply before child ones.  Only the
    // class that DEFINES the property contributes it: an inherited lookup would also
    // return a parent's value for every child that inherits it, listing the same objects
    // several times.
    return mro(dslClass)
      .reverse()
      .map((ancestor) => ownDsl(ancestor, propertyName))
      .filter((own) => own.defined)
      .map((own) => own.value as Required<DslFields>[K]);
  }

  static _ensureList<T>(valueOrList: T | readonly T[]): readonly T[] {
    if (Array.isArray(valueOrList)) {
      return valueOrList as readonly T[];
    }
    return [valueOrList as T];
  }

  static _joinedListFromAncestors<K extends keyof DslFields>(
    dslClass: RuleClass,
    propertyName: K,
  ): unknown[] {
    const valuesFromAncestors = RuleCompiler._collectFromAncestors(
      dslClass,
      propertyName,
    );
    return valuesFromAncestors.flatMap((value) =>
      RuleCompiler._ensureList(value as unknown),
    );
  }

  static _compileKnownCalls(
    dslClass: RuleClass,
    name: string,
    constraints: Record<string, Constraints>,
  ): Call[] {
    let callNames: readonly string[];
    const declared = lookup(dslClass, "callNames");
    if (declared && declared.length) {
      callNames = RuleCompiler._ensureList(declared);
    } else {
      callNames = Object.keys(constraints);
    }
    assert(
      callNames.length,
      `${name}: call_names or a constraints map is required.`,
    );
    return callNames.map((callName) => Call.fromString(callName));
  }

  /** The port of a tuple key: several call names separated by spaces. */
  static _keyNames(key: string): string[] {
    return key.split(/[\s,]+/).filter(Boolean);
  }

  static _flattenTupleKeyedDict<T>(
    originalDict: PerCall<T>,
  ): Record<string, T> {
    const flattenedDict: Record<string, T> = {};
    for (const [tupleKey, value] of Object.entries(originalDict)) {
      // FIXME: Unclear what this is for?
      for (const key of RuleCompiler._keyNames(tupleKey)) {
        assert(
          !Object.hasOwn(flattenedDict, key),
          `Key (${key}) was listed twice in ${JSON.stringify(Object.keys(originalDict))}`,
        );
        flattenedDict[key] = value;
      }
    }
    return flattenedDict;
  }

  static _compileAnnotations(dslClass: RuleClass): Set<EnumValue> {
    const compiledSet = new Set(
      RuleCompiler._joinedListFromAncestors(dslClass, "annotations"),
    ) as Set<EnumValue>;
    // FIXME: We should probably assert that no more than one of the "implies_artificial"
    // annotations are in this set at once.  Those all have distinct meanings.
    if ([...impliesArtificial].some((value) => compiledSet.has(value))) {
      compiledSet.add(annotations.Artificial);
    }
    return compiledSet;
  }

  static _validateRule(dslClass: RuleClass, name: string): void {
    // Rules have to apply some constraints to the hand.
    assert(
      _isNotEmptyOrNone(lookup(dslClass, "constraints")) ||
        _isNotEmptyOrNone(lookup(dslClass, "sharedConstraints")),
      `${name} is missing constraints`,
    );
    // The class's own statics: `dsl` and nothing else public; the keys of `dsl`
    // are the DSL keys (Python: the public keys of the class's __dict__).
    const properties = [
      ...Object.keys(dslClass).filter((p) => p !== "dsl"),
      ...(Object.hasOwn(dslClass, "dsl") ? Object.keys(dslClass.dsl) : []),
    ];
    const publicProperties = properties.filter((p) => !p.startsWith("_"));
    const unexpectedProperties = publicProperties.filter(
      (p) => !Rule.ALLOWED_KEYS.has(p),
    );
    assert(
      unexpectedProperties.length === 0,
      `${name} defines unexpected properties: ${unexpectedProperties.join(", ")}`,
    );
  }

  /**
   * The compiled rule for a rule class, compiled once (Python's `@cache`).
   * `name` is the rule's name, the registry key in sayc.ts; it defaults to the
   * class name, which a minifier may have changed, so production passes it.
   */
  static compile(
    dslRule: RuleClass,
    name: string = ruleName(dslRule),
  ): CompiledRule {
    const cached = compiled.get(dslRule);
    if (cached) {
      return cached;
    }
    RuleCompiler._validateRule(dslRule, name);
    const constraints = RuleCompiler._flattenTupleKeyedDict(
      lookup(dslRule, "constraints"),
    );
    const knownCalls = RuleCompiler._compileKnownCalls(
      dslRule,
      name,
      constraints,
    );
    const known = new Set(knownCalls.map((call) => call.name));
    const unknown = [...prefer.names(lookup(dslRule, "prefer") ?? [])]
      .filter((callName) => !known.has(callName))
      .sort();
    assert(
      unknown.length === 0,
      `${name}: prefer names calls it cannot make: ${JSON.stringify(unknown)}`,
    );
    // Unclear if compiled results should be cached on the rule?
    const rule = new CompiledRule(dslRule, name, {
      knownCalls,
      annotations: RuleCompiler._compileAnnotations(dslRule),
      preconditions: RuleCompiler._joinedListFromAncestors(
        dslRule,
        "preconditions",
      ) as Precondition[],
      sharedConstraints: RuleCompiler._joinedListFromAncestors(
        dslRule,
        "sharedConstraints",
      ) as Constraints[],
      constraints,
      purposesPerCall: RuleCompiler._flattenTupleKeyedDict(
        lookup(dslRule, "purposesPerCall"),
      ),
      conditionalPurposesPerCall: RuleCompiler._flattenTupleKeyedDict(
        lookup(dslRule, "conditionalPurposesPerCall"),
      ),
      preconditionsPerCall: RuleCompiler._flattenTupleKeyedDict(
        lookup(dslRule, "preconditionsPerCall"),
      ),
    });
    compiled.set(dslRule, rule);
    return rule;
  }
}
