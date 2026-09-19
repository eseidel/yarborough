// Loads the Z3 WebAssembly module once per thread (Node for the tests, a
// module worker on the site) and hands out one shared context, like z3py's
// main_ctx().  Only this file imports the multi-megabyte module, so nothing
// that does not import the loader pays for it.

import createZ3Module, { type Z3Module } from "./wasm/z3.mjs";
import { Z3Context } from "./z3";

let moduleInitialization: Promise<Z3Module> | undefined;
let contextInitialization: Promise<Z3Context> | undefined;

export function loadZ3Module(): Promise<Z3Module> {
  moduleInitialization ??= createZ3Module();
  return moduleInitialization;
}

/** The shared context (z3py's `main_ctx()`), created on first use. */
export function loadZ3(): Promise<Z3Context> {
  contextInitialization ??= loadZ3Module().then(
    (module) => new Z3Context(module),
  );
  return contextInitialization;
}
