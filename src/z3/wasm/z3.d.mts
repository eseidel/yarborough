// Type surface of the Emscripten module built by native/z3/build.sh: the raw
// Z3 C API (pointers and integers), used only by src/z3/z3.ts.

/** A pointer into the module's linear memory (Z3_context, Z3_ast, char*, ...). */
export type Pointer = number;

export interface Z3Module {
  _malloc(bytes: number): Pointer;
  _free(pointer: Pointer): void;
  _z3_wasm_install_error_handler(context: Pointer): void;

  _Z3_mk_config(): Pointer;
  _Z3_set_param_value(config: Pointer, id: Pointer, value: Pointer): void;
  _Z3_del_config(config: Pointer): void;
  _Z3_mk_context_rc(config: Pointer): Pointer;
  _Z3_del_context(context: Pointer): void;
  _Z3_get_version(
    major: Pointer,
    minor: Pointer,
    build: Pointer,
    revision: Pointer,
  ): void;
  _Z3_get_full_version(): Pointer;
  _Z3_set_ast_print_mode(context: Pointer, mode: number): void;
  _Z3_get_error_code(context: Pointer): number;
  _Z3_get_error_msg(context: Pointer, code: number): Pointer;

  _Z3_inc_ref(context: Pointer, ast: Pointer): void;
  _Z3_dec_ref(context: Pointer, ast: Pointer): void;

  _Z3_mk_int_sort(context: Pointer): Pointer;
  _Z3_mk_bool_sort(context: Pointer): Pointer;
  _Z3_mk_string_symbol(context: Pointer, text: Pointer): Pointer;
  _Z3_mk_const(context: Pointer, symbol: Pointer, sort: Pointer): Pointer;
  _Z3_mk_int(context: Pointer, value: number, sort: Pointer): Pointer;
  _Z3_mk_true(context: Pointer): Pointer;
  _Z3_mk_false(context: Pointer): Pointer;
  _Z3_mk_add(context: Pointer, count: number, args: Pointer): Pointer;
  _Z3_mk_sub(context: Pointer, count: number, args: Pointer): Pointer;
  _Z3_mk_mul(context: Pointer, count: number, args: Pointer): Pointer;
  _Z3_mk_eq(context: Pointer, left: Pointer, right: Pointer): Pointer;
  _Z3_mk_distinct(context: Pointer, count: number, args: Pointer): Pointer;
  _Z3_mk_lt(context: Pointer, left: Pointer, right: Pointer): Pointer;
  _Z3_mk_le(context: Pointer, left: Pointer, right: Pointer): Pointer;
  _Z3_mk_gt(context: Pointer, left: Pointer, right: Pointer): Pointer;
  _Z3_mk_ge(context: Pointer, left: Pointer, right: Pointer): Pointer;
  _Z3_mk_and(context: Pointer, count: number, args: Pointer): Pointer;
  _Z3_mk_or(context: Pointer, count: number, args: Pointer): Pointer;
  _Z3_mk_not(context: Pointer, ast: Pointer): Pointer;
  _Z3_mk_implies(context: Pointer, left: Pointer, right: Pointer): Pointer;
  _Z3_mk_ite(
    context: Pointer,
    condition: Pointer,
    then: Pointer,
    otherwise: Pointer,
  ): Pointer;
  _Z3_ast_to_string(context: Pointer, ast: Pointer): Pointer;
  _Z3_simplify(context: Pointer, ast: Pointer): Pointer;
  _Z3_is_numeral_ast(context: Pointer, ast: Pointer): number;
  _Z3_get_numeral_int(context: Pointer, ast: Pointer, out: Pointer): number;

  _Z3_mk_solver_for_logic(context: Pointer, logic: Pointer): Pointer;
  _Z3_solver_inc_ref(context: Pointer, solver: Pointer): void;
  _Z3_solver_dec_ref(context: Pointer, solver: Pointer): void;
  _Z3_solver_push(context: Pointer, solver: Pointer): void;
  _Z3_solver_pop(context: Pointer, solver: Pointer, count: number): void;
  _Z3_solver_assert(context: Pointer, solver: Pointer, ast: Pointer): void;
  _Z3_solver_check(context: Pointer, solver: Pointer): number;
  _Z3_solver_reset(context: Pointer, solver: Pointer): void;
  _Z3_solver_get_model(context: Pointer, solver: Pointer): Pointer;
  _Z3_model_inc_ref(context: Pointer, model: Pointer): void;
  _Z3_model_dec_ref(context: Pointer, model: Pointer): void;
  _Z3_model_eval(
    context: Pointer,
    model: Pointer,
    ast: Pointer,
    completion: number,
    out: Pointer,
  ): number;

  UTF8ToString(pointer: Pointer): string;
  stringToUTF8(text: string, pointer: Pointer, maxBytes: number): void;
  lengthBytesUTF8(text: string): number;
  getValue(pointer: Pointer, type: "i32"): number;
  setValue(pointer: Pointer, value: number, type: "i32"): void;
  /** Re-read after any call: memory growth replaces the views. */
  HEAP32: Int32Array;
  HEAPU32: Uint32Array;
  ccall(
    name: string,
    returnType: "number" | "string" | null,
    argumentTypes: string[],
    arguments_: unknown[],
  ): unknown;
  cwrap(
    name: string,
    returnType: "number" | "string" | null,
    argumentTypes: string[],
  ): (...arguments_: unknown[]) => unknown;
}

export default function createZ3Module(
  options?: Record<string, unknown>,
): Promise<Z3Module>;
