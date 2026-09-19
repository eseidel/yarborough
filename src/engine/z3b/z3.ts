// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The `import z3` of the Python engine: one shared context (z3py's main_ctx)
// with z3py's vocabulary (z3.And, z3.Or, z3.Not, z3.If, z3.Sum, z3.Int,
// z3.IntVal, z3.BoolVal, z3.SolverFor, ...), so the ported modules read like
// the Python they mirror.  The module awaits the WebAssembly load at the top
// level: everything downstream (the hand model, the rules) builds expressions
// at module evaluation time, exactly as the Python modules do at import time.

import { loadZ3 } from "../../z3/load";
import type { Expr, IntLike } from "../../z3/z3";

export const z3 = await loadZ3();

export { Expr, Solver } from "../../z3/z3";
export type { BoolLike, IntLike } from "../../z3/z3";

/**
 * Python's `sum(terms)` over z3 terms: it starts from the integer 0, so the
 * result is `((0 + a) + b) + ...`, which Z3 prints flat as `(+ 0 a b ...)`.
 * z3py's `Sum` (one n-ary `+`, no leading 0) is `z3.Sum`.
 */
export function pySum(terms: IntLike[]): Expr {
  let total: Expr = z3.IntVal(0);
  for (const term of terms) {
    total = z3.add(total, term);
  }
  return total;
}
