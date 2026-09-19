// A synchronous binding over the single-threaded Z3 WebAssembly module
// (native/z3/build.sh), with z3py's vocabulary so the engine port reads like
// the Python it mirrors: Int, IntVal, BoolVal, And, Or, Not, Implies, If, Sum,
// the arithmetic and comparison operators as methods, SolverFor("QF_LIA") with
// push/pop/add/check, and sexpr() printing exactly what z3py prints.
//
// Reference counting.  The context is created with Z3_mk_context_rc, so every
// AST, solver and model the C API hands back must be inc_ref'd to stay alive
// and dec_ref'd to be freed.  Each wrapper inc_refs once on construction and
// registers itself with a FinalizationRegistry, which dec_refs when the
// JavaScript wrapper is garbage collected.  So a Z3 object lives exactly as
// long as some JavaScript reference to it (or a solver that asserted it): the
// engine's caches keep what they hold and nothing else accumulates, at the
// price of memory being returned to Z3 only when the collector runs, not at
// the last use.  Z3 hash-conses terms, so a term that is collected and rebuilt
// later is the same node again.  A context is never deleted: the registry may
// dec_ref against it at any later time.
//
// Errors.  The shim installs a do-nothing Z3 error handler (the default one
// exits the process), and every API call is followed by Z3_get_error_code, as
// z3py does; a non-zero code becomes a thrown Z3Error carrying
// Z3_get_error_msg.

// cspell:ignore HEAPU
import type { Pointer, Z3Module } from "./wasm/z3.mjs";

export type CheckResult = "sat" | "unsat" | "unknown";

/** What z3py accepts where an integer term is expected. */
export type IntLike = Expr | number;
/** What z3py accepts where a boolean term is expected. */
export type BoolLike = Expr | boolean;

export class Z3Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Z3Error";
  }
}

const Z3_PRINT_SMTLIB2_COMPLIANT = 2;
const Z3_L_FALSE = -1;
const Z3_L_TRUE = 1;
const Z3_OK = 0;

type Released =
  | { kind: "ast"; module: Z3Module; context: Pointer; pointer: Pointer }
  | { kind: "solver"; module: Z3Module; context: Pointer; pointer: Pointer }
  | { kind: "model"; module: Z3Module; context: Pointer; pointer: Pointer };

const registry = new FinalizationRegistry<Released>((held) => {
  switch (held.kind) {
    case "ast":
      held.module._Z3_dec_ref(held.context, held.pointer);
      break;
    case "solver":
      held.module._Z3_solver_dec_ref(held.context, held.pointer);
      break;
    case "model":
      held.module._Z3_model_dec_ref(held.context, held.pointer);
      break;
  }
});

/** A Z3 term (z3py's ExprRef): an integer or boolean expression. */
export class Expr {
  readonly ctx: Z3Context;
  readonly pointer: Pointer;

  constructor(ctx: Z3Context, pointer: Pointer) {
    this.ctx = ctx;
    this.pointer = pointer;
  }

  /** The s-expression Z3 prints for this term, as z3py's `sexpr()`. */
  sexpr(): string {
    return this.ctx.sexpr(this);
  }

  toString(): string {
    return this.sexpr();
  }

  add(other: IntLike): Expr {
    return this.ctx.add(this, other);
  }
  sub(other: IntLike): Expr {
    return this.ctx.sub(this, other);
  }
  mul(other: IntLike): Expr {
    return this.ctx.mul(this, other);
  }
  eq(other: IntLike): Expr {
    return this.ctx.eq(this, other);
  }
  ne(other: IntLike): Expr {
    return this.ctx.ne(this, other);
  }
  lt(other: IntLike): Expr {
    return this.ctx.lt(this, other);
  }
  le(other: IntLike): Expr {
    return this.ctx.le(this, other);
  }
  gt(other: IntLike): Expr {
    return this.ctx.gt(this, other);
  }
  ge(other: IntLike): Expr {
    return this.ctx.ge(this, other);
  }
}

/** A model of a satisfiable check (z3py's ModelRef). */
export class Model {
  readonly ctx: Z3Context;
  readonly pointer: Pointer;

  constructor(ctx: Z3Context, pointer: Pointer) {
    this.ctx = ctx;
    this.pointer = pointer;
  }

  /** The value of `expr` in this model; `completion` as in z3py's `eval`. */
  eval(expr: Expr, completion = false): Expr {
    return this.ctx.modelEval(this, expr, completion);
  }

  /** `eval(expr).as_long()`: the integer value of an integer term. */
  evalInt(expr: Expr): number {
    return this.ctx.numeralInt(this.eval(expr, true));
  }
}

/** A z3py Solver: incremental, with push/pop scopes. */
export class Solver {
  readonly ctx: Z3Context;
  readonly pointer: Pointer;
  private released = false;

  constructor(ctx: Z3Context, pointer: Pointer) {
    this.ctx = ctx;
    this.pointer = pointer;
  }

  push(): void {
    this.ctx.solverPush(this);
  }

  pop(count = 1): void {
    this.ctx.solverPop(this, count);
  }

  add(...exprs: (Expr | Expr[])[]): void {
    for (const expr of exprs.flat()) {
      this.ctx.solverAssert(this, expr);
    }
  }

  check(): CheckResult {
    return this.ctx.solverCheck(this);
  }

  reset(): void {
    this.ctx.solverReset(this);
  }

  model(): Model {
    return this.ctx.solverModel(this);
  }

  /**
   * Release the solver now rather than when it is collected; it must not be
   * used afterwards.  For pools that retire solvers deterministically.
   */
  dispose(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    registry.unregister(this);
    this.ctx.solverRelease(this);
  }
}

export class Z3Context {
  readonly module: Z3Module;
  private readonly context: Pointer;
  private readonly intSort: Pointer;
  private readonly boolSort: Pointer;
  /** Scratch space for argument arrays and out-parameters. */
  private scratch: Pointer;
  private scratchSlots: number;

  /**
   * A fresh Z3 context, configured as z3py's `Context()`: reference counted,
   * a do-nothing error handler, SMT-LIB 2 compliant printing.  `params` are
   * Z3 global parameters (z3py's keyword arguments, for example `proof`).
   */
  constructor(module: Z3Module, params: Record<string, string> = {}) {
    this.module = module;
    const config = module._Z3_mk_config();
    for (const [key, value] of Object.entries(params)) {
      this.withCString(key, (keyPointer) =>
        this.withCString(value, (valuePointer) =>
          module._Z3_set_param_value(config, keyPointer, valuePointer),
        ),
      );
    }
    this.context = module._Z3_mk_context_rc(config);
    module._Z3_del_config(config);
    module._z3_wasm_install_error_handler(this.context);
    module._Z3_set_ast_print_mode(this.context, Z3_PRINT_SMTLIB2_COMPLIANT);
    this.scratchSlots = 16;
    this.scratch = module._malloc(this.scratchSlots * 4);
    // Sorts are ASTs too and need a reference to stay alive.
    this.intSort = this.checked(module._Z3_mk_int_sort(this.context));
    module._Z3_inc_ref(this.context, this.intSort);
    this.boolSort = this.checked(module._Z3_mk_bool_sort(this.context));
    module._Z3_inc_ref(this.context, this.boolSort);
  }

  // --- version ---------------------------------------------------------

  /** "5.1.0.0": what `Z3_get_full_version` prints, minus the "Z3 " prefix. */
  version(): string {
    const text = this.module.UTF8ToString(this.module._Z3_get_full_version());
    return text.replace(/^Z3 /, "");
  }

  versionNumbers(): [number, number, number, number] {
    const out = this.scratchFor(4);
    this.module._Z3_get_version(out, out + 4, out + 8, out + 12);
    const heap = this.module.HEAP32;
    return [
      heap[out >> 2],
      heap[(out >> 2) + 1],
      heap[(out >> 2) + 2],
      heap[(out >> 2) + 3],
    ];
  }

  // --- terms -----------------------------------------------------------

  /** z3py `Int(name)`: an integer constant (variable). */
  Int(name: string): Expr {
    return this.wrap(
      this.module._Z3_mk_const(this.context, this.symbol(name), this.intSort),
    );
  }

  /** z3py `Bool(name)`: a boolean constant (variable). */
  Bool(name: string): Expr {
    return this.wrap(
      this.module._Z3_mk_const(this.context, this.symbol(name), this.boolSort),
    );
  }

  /** z3py `IntVal(n)` for a JavaScript integer (32-bit, which the engine needs). */
  IntVal(value: number): Expr {
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
      throw new RangeError(`IntVal needs a 32-bit integer, got ${value}`);
    }
    return this.wrap(this.module._Z3_mk_int(this.context, value, this.intSort));
  }

  BoolVal(value: boolean): Expr {
    return this.wrap(
      value
        ? this.module._Z3_mk_true(this.context)
        : this.module._Z3_mk_false(this.context),
    );
  }

  /** z3py `And(*args)` / `And(list)`: `And()` is Z3's zero-argument `and`. */
  And(...args: (BoolLike | BoolLike[])[]): Expr {
    return this.nary(
      this.module._Z3_mk_and,
      args.flat().map((arg) => this.bool(arg)),
    );
  }

  Or(...args: (BoolLike | BoolLike[])[]): Expr {
    return this.nary(
      this.module._Z3_mk_or,
      args.flat().map((arg) => this.bool(arg)),
    );
  }

  Not(expr: BoolLike): Expr {
    return this.wrap(
      this.module._Z3_mk_not(this.context, this.bool(expr).pointer),
    );
  }

  Implies(left: BoolLike, right: BoolLike): Expr {
    return this.wrap(
      this.module._Z3_mk_implies(
        this.context,
        this.bool(left).pointer,
        this.bool(right).pointer,
      ),
    );
  }

  /** z3py `If(c, a, b)`. */
  If(condition: BoolLike, then: IntLike, otherwise: IntLike): Expr {
    return this.wrap(
      this.module._Z3_mk_ite(
        this.context,
        this.bool(condition).pointer,
        this.int(then).pointer,
        this.int(otherwise).pointer,
      ),
    );
  }

  /** z3py `Sum(*args)` / `Sum(list)`: one n-ary `+`; `Sum([])` is 0. */
  Sum(...args: (IntLike | IntLike[])[]): Expr {
    const terms = args.flat();
    if (terms.length === 0) {
      return this.IntVal(0);
    }
    return this.nary(
      this.module._Z3_mk_add,
      terms.map((term) => this.int(term)),
    );
  }

  add(left: IntLike, right: IntLike): Expr {
    return this.binary(this.module._Z3_mk_add, left, right);
  }

  sub(left: IntLike, right: IntLike): Expr {
    return this.binary(this.module._Z3_mk_sub, left, right);
  }

  mul(left: IntLike, right: IntLike): Expr {
    return this.binary(this.module._Z3_mk_mul, left, right);
  }

  eq(left: IntLike, right: IntLike): Expr {
    return this.wrap(
      this.module._Z3_mk_eq(
        this.context,
        this.int(left).pointer,
        this.int(right).pointer,
      ),
    );
  }

  /** z3py `a != b`, which is `Z3_mk_distinct`. */
  ne(left: IntLike, right: IntLike): Expr {
    return this.binary(this.module._Z3_mk_distinct, left, right);
  }

  lt(left: IntLike, right: IntLike): Expr {
    return this.compare(this.module._Z3_mk_lt, left, right);
  }

  le(left: IntLike, right: IntLike): Expr {
    return this.compare(this.module._Z3_mk_le, left, right);
  }

  gt(left: IntLike, right: IntLike): Expr {
    return this.compare(this.module._Z3_mk_gt, left, right);
  }

  ge(left: IntLike, right: IntLike): Expr {
    return this.compare(this.module._Z3_mk_ge, left, right);
  }

  /** z3py `expr.sexpr()`: `Z3_ast_to_string` on this context. */
  sexpr(expr: Expr): string {
    const text = this.checked(
      this.module._Z3_ast_to_string(this.context, expr.pointer),
    );
    return this.module.UTF8ToString(text);
  }

  simplify(expr: Expr): Expr {
    return this.wrap(this.module._Z3_simplify(this.context, expr.pointer));
  }

  isNumeral(expr: Expr): boolean {
    return (
      this.checked(
        this.module._Z3_is_numeral_ast(this.context, expr.pointer),
      ) !== 0
    );
  }

  /** The value of an integer numeral (z3py `as_long()`), as a number. */
  numeralInt(expr: Expr): number {
    const out = this.scratchFor(1);
    const ok = this.checked(
      this.module._Z3_get_numeral_int(this.context, expr.pointer, out),
    );
    if (ok === 0) {
      throw new Z3Error(`not a machine integer numeral: ${this.sexpr(expr)}`);
    }
    return this.module.HEAP32[out >> 2];
  }

  // --- solvers ---------------------------------------------------------

  /** z3py `SolverFor(logic)`, for example "QF_LIA". */
  SolverFor(logic: string): Solver {
    const pointer = this.checked(
      this.module._Z3_mk_solver_for_logic(this.context, this.symbol(logic)),
    );
    this.module._Z3_solver_inc_ref(this.context, pointer);
    const solver = new Solver(this, pointer);
    registry.register(
      solver,
      { kind: "solver", module: this.module, context: this.context, pointer },
      solver,
    );
    return solver;
  }

  /** @internal */
  solverPush(solver: Solver): void {
    this.module._Z3_solver_push(this.context, solver.pointer);
    this.checked(0);
  }

  /** @internal */
  solverPop(solver: Solver, count: number): void {
    this.module._Z3_solver_pop(this.context, solver.pointer, count);
    this.checked(0);
  }

  /** @internal */
  solverAssert(solver: Solver, expr: Expr): void {
    this.module._Z3_solver_assert(this.context, solver.pointer, expr.pointer);
    this.checked(0);
  }

  /** @internal */
  solverCheck(solver: Solver): CheckResult {
    const result = this.checked(
      this.module._Z3_solver_check(this.context, solver.pointer),
    );
    if (result === Z3_L_TRUE) {
      return "sat";
    }
    if (result === Z3_L_FALSE) {
      return "unsat";
    }
    return "unknown";
  }

  /** @internal */
  solverReset(solver: Solver): void {
    this.module._Z3_solver_reset(this.context, solver.pointer);
    this.checked(0);
  }

  /** @internal */
  solverModel(solver: Solver): Model {
    const pointer = this.checked(
      this.module._Z3_solver_get_model(this.context, solver.pointer),
    );
    this.module._Z3_model_inc_ref(this.context, pointer);
    const model = new Model(this, pointer);
    registry.register(model, {
      kind: "model",
      module: this.module,
      context: this.context,
      pointer,
    });
    return model;
  }

  /** @internal */
  solverRelease(solver: Solver): void {
    this.module._Z3_solver_dec_ref(this.context, solver.pointer);
  }

  /** @internal */
  modelEval(model: Model, expr: Expr, completion: boolean): Expr {
    const out = this.scratchFor(1);
    const ok = this.checked(
      this.module._Z3_model_eval(
        this.context,
        model.pointer,
        expr.pointer,
        completion ? 1 : 0,
        out,
      ),
    );
    if (ok === 0) {
      throw new Z3Error(`the model cannot evaluate ${this.sexpr(expr)}`);
    }
    return this.wrap(this.module.HEAPU32[out >> 2]);
  }

  // --- marshalling -----------------------------------------------------

  private wrap(pointer: Pointer): Expr {
    this.checked(pointer);
    this.module._Z3_inc_ref(this.context, pointer);
    const expr = new Expr(this, pointer);
    registry.register(expr, {
      kind: "ast",
      module: this.module,
      context: this.context,
      pointer,
    });
    return expr;
  }

  /** Coerce a number to an IntVal, as z3py does for Python ints. */
  private int(value: IntLike): Expr {
    return typeof value === "number" ? this.IntVal(value) : value;
  }

  /** Coerce a boolean to a BoolVal, as z3py does for Python bools. */
  private bool(value: BoolLike): Expr {
    return typeof value === "boolean" ? this.BoolVal(value) : value;
  }

  private binary(
    make: (context: Pointer, count: number, args: Pointer) => Pointer,
    left: IntLike,
    right: IntLike,
  ): Expr {
    return this.nary(make, [this.int(left), this.int(right)]);
  }

  private compare(
    make: (context: Pointer, left: Pointer, right: Pointer) => Pointer,
    left: IntLike,
    right: IntLike,
  ): Expr {
    return this.wrap(
      make(this.context, this.int(left).pointer, this.int(right).pointer),
    );
  }

  private nary(
    make: (context: Pointer, count: number, args: Pointer) => Pointer,
    args: Expr[],
  ): Expr {
    const array = this.scratchFor(args.length);
    const heap = this.module.HEAPU32;
    const base = array >> 2;
    for (let i = 0; i < args.length; i++) {
      heap[base + i] = args[i].pointer;
    }
    return this.wrap(make(this.context, args.length, array));
  }

  /** Scratch space for `slots` 32-bit values, valid until the next call. */
  private scratchFor(slots: number): Pointer {
    if (slots > this.scratchSlots) {
      this.module._free(this.scratch);
      this.scratchSlots = Math.max(slots, this.scratchSlots * 2);
      this.scratch = this.module._malloc(this.scratchSlots * 4);
    }
    return this.scratch;
  }

  private symbol(name: string): Pointer {
    return this.withCString(name, (text) =>
      this.checked(this.module._Z3_mk_string_symbol(this.context, text)),
    );
  }

  private withCString<T>(text: string, consume: (pointer: Pointer) => T): T {
    const bytes = this.module.lengthBytesUTF8(text) + 1;
    const pointer = this.module._malloc(bytes);
    try {
      this.module.stringToUTF8(text, pointer, bytes);
      return consume(pointer);
    } finally {
      this.module._free(pointer);
    }
  }

  /** Raise the pending Z3 error, if any, as an exception; pass `value` through. */
  private checked<T>(value: T): T {
    const code = this.module._Z3_get_error_code(this.context);
    if (code !== Z3_OK) {
      const message = this.module.UTF8ToString(
        this.module._Z3_get_error_msg(this.context, code),
      );
      throw new Z3Error(`Z3 error ${code}: ${message}`);
    }
    return value;
  }
}
