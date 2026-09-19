// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/z3b/rules.py, one section of it (see the section list
// at the top of that file).  Filled in by phase 5 of
// docs/typescript-engine-plan.md; the base classes shared by every section
// stay in ../rules.ts.

import type { RuleClass } from "../rule_compiler";

/** The concrete rules of this section, by name (see sayc.ts). */
export const RULE_CLASSES: Readonly<Record<string, RuleClass>> = {};
