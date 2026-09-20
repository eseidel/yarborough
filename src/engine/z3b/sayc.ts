// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/sayc.py.  The Python collects the leaf subclasses of
// Rule by reflection; here the leaves are listed by name (see the convention
// in rule_compiler.ts), and the key of each entry is the rule's name, so
// that neither a minifier nor a class renamed in error can change what the
// engine reports.  The list is complete: all 217 rules of the Python system.

import * as cappelletti from "./cappelletti";
import * as natural from "./natural";
import {
  type CompiledRule,
  priorityOrdering,
  type RuleClass,
  RuleCompiler,
} from "./rule_compiler";
import * as rules from "./rules";
import * as doubles from "./rules/doubles";
import * as notrump from "./rules/notrump";
import * as overcalls from "./rules/overcalls";
import * as preemptsSlam from "./rules/preempts_slam";
import * as rebids from "./rules/rebids";
import * as responses from "./rules/responses";

/** Every concrete rule, by name: the port of `_concrete_rule_classes()`. */
export const RULE_CLASSES: Readonly<Record<string, RuleClass>> = {
  // The sections of rules.py, each in its own file, plus natural.py and
  // cappelletti.py.  A name listed twice is an error, as in Python.
  ...responses.RULE_CLASSES,
  ...rebids.RULE_CLASSES,
  ...notrump.RULE_CLASSES,
  ...overcalls.RULE_CLASSES,
  ...doubles.RULE_CLASSES,
  ...preemptsSlam.RULE_CLASSES,
  ...natural.RULE_CLASSES,
  ...cappelletti.RULE_CLASSES,
  JumpShiftByOpener: rules.JumpShiftByOpener,
  NotrumpOpening: rules.NotrumpOpening,
  OneLevelSuitOpening: rules.OneLevelSuitOpening,
  PreemptiveOpen: rules.PreemptiveOpen,
  StrongTwoClubs: rules.StrongTwoClubs,
  ThreeNotrumpOpening: rules.ThreeNotrumpOpening,
};

export interface BiddingSystem {
  readonly rules: readonly CompiledRule[];
  readonly priorityOrdering: typeof priorityOrdering;
}

const registryNames = [
  responses,
  rebids,
  notrump,
  overcalls,
  doubles,
  preemptsSlam,
  natural,
  cappelletti,
].flatMap((section) => Object.keys(section.RULE_CLASSES));
if (new Set(registryNames).size !== registryNames.length) {
  throw new Error("Duplicate rules!");
}

export const StandardAmericanYellowCard: BiddingSystem = {
  // Rule ordering never decides a call (a category tie between two rules drops the call),
  // but it shows in warnings and in every walk over the rules: sorted by name so the order
  // is the same whatever order the registry lists them in.
  rules: Object.entries(RULE_CLASSES)
    .map(([name, descriptionClass]) =>
      RuleCompiler.compile(descriptionClass, name),
    )
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
  priorityOrdering,
};
