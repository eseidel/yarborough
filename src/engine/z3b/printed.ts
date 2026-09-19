// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The printed form of a z3 expression as the fixture exporter
// (python/tests/export_fixtures.py) prints it: `sexpr()` with the aliasing of
// shared subterms turned off (`pp.min_alias_size` and `pp.max_depth` raised,
// so no `let`) and runs of whitespace collapsed to one space.
//
// The WebAssembly module exports no `Z3_global_param_set`, so the binding
// cannot raise those parameters and Z3 prints with its defaults: a subterm is
// replaced by an alias `a!N`, bound in a `(let ((a!N ...)) ...)`, when it is
// deep (pp.max_depth, 5) or shared and large (pp.min_alias_size, 10).  This
// module inlines the aliases back.  The result is the exporter's text exactly,
// because aliasing is the only thing those parameters change: Z3's printer
// flattens a nested associative operator (`(and (and a b) c)` prints as
// `(and a b c)`) only when the inner term is not shared in the expression
// DAG (`smt2_printer::flat_assoc` in ast_smt2_pp.cpp), a decision that does
// not depend on the alias parameters, and a shared inner term is either
// aliased or printed in place, nested either way.  The line limit
// (pp.max_num_lines) is unbounded by default, so nothing is elided.

import type { Expr } from "../../z3/z3";

type Node = string | Node[];

/** `" ".join(expr.sexpr().split())` with every `let` alias inlined. */
export function printedForm(expr: Expr): string {
  return printedFormOfText(expr.sexpr());
}

/** @internal `printedForm` on already printed text, for tests. */
export function printedFormOfText(text: string): string {
  if (text.includes("...")) {
    throw new Error(`the printer truncated: ${text.slice(0, 200)}`);
  }
  if (!text.includes("(let ")) {
    return text.split(/\s+/).filter(Boolean).join(" ");
  }
  const tokens = tokenize(text);
  let index = 0;
  const parse = (): Node => {
    const token = tokens[index++];
    if (token === "(") {
      const items: Node[] = [];
      while (tokens[index] !== ")") {
        if (index >= tokens.length) {
          throw new Error(`unbalanced printed form: ${text.slice(0, 200)}`);
        }
        items.push(parse());
      }
      index++;
      return items;
    }
    if (token === ")" || token === undefined) {
      throw new Error(`unbalanced printed form: ${text.slice(0, 200)}`);
    }
    return token;
  };
  const tree = parse();
  if (index !== tokens.length) {
    throw new Error(`trailing tokens in printed form: ${text.slice(0, 200)}`);
  }
  return serialize(expandLets(tree, new Map()));
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === "(" || char === ")") {
      tokens.push(char);
      i++;
    } else if (/\s/.test(char)) {
      i++;
    } else if (char === "|") {
      // A quoted symbol may hold spaces and parentheses.
      const end = text.indexOf("|", i + 1);
      if (end === -1) {
        throw new Error(`unterminated quoted symbol: ${text.slice(i, i + 40)}`);
      }
      tokens.push(text.slice(i, end + 1));
      i = end + 1;
    } else {
      let end = i;
      while (end < text.length && !/[\s()]/.test(text[end])) {
        end++;
      }
      tokens.push(text.slice(i, end));
      i = end;
    }
  }
  return tokens;
}

/** SMT-LIB `let` is parallel: the bindings of one `let` see the outer scope. */
function expandLets(node: Node, scope: Map<string, Node>): Node {
  if (typeof node === "string") {
    return scope.get(node) ?? node;
  }
  if (node.length === 3 && node[0] === "let" && Array.isArray(node[1])) {
    const inner = new Map(scope);
    for (const binding of node[1]) {
      if (!Array.isArray(binding) || binding.length !== 2) {
        throw new Error("malformed let binding in printed form");
      }
      const [name, value] = binding;
      if (typeof name !== "string") {
        throw new Error("malformed let binding in printed form");
      }
      inner.set(name, expandLets(value, scope));
    }
    return expandLets(node[2], inner);
  }
  return node.map((item) => expandLets(item, scope));
}

function serialize(node: Node): string {
  if (typeof node === "string") {
    return node;
  }
  return `(${node.map(serialize).join(" ")})`;
}
