// The Z3 WebAssembly module and its binding, loaded in Node: sat and unsat on
// toy constraints, scopes, printed forms that must equal what z3py prints for
// the same construction (the engine fixtures compare printed forms), errors as
// exceptions, and a problem shaped like the engine's hand model.
import { describe, expect, it } from "vitest";
import { loadZ3 } from "../load";
import { type Expr, Z3Context, Z3Error } from "../z3";

// Every expected string below was produced by z3py (z3-solver 5.1.0.0) with
// the same calls, for example
//   (z3.Int('spades') + z3.Int('hearts') >= 4).sexpr()
// z3py prints in Z3_PRINT_SMTLIB2_COMPLIANT mode, so negative numerals are
// `(- 4)` and `And([])` is Z3's zero-argument `and`.
const printedForms: [string, (ctx: Z3Context) => Expr][] = [
  [
    "(>= (+ spades hearts) 4)",
    (z) => z.Int("spades").add(z.Int("hearts")).ge(4),
  ],
  ["(and (= a 1) (<= b 2))", (z) => z.And(z.Int("a").eq(1), z.Int("b").le(2))],
  ["(+ a b c)", (z) => z.Sum([z.Int("a"), z.Int("b"), z.Int("c")])],
  ["(+ a b c)", (z) => z.Int("a").add(z.Int("b")).add(z.Int("c"))],
  ["(+ 0 a b)", (z) => z.add(0, z.Int("a")).add(z.Int("b"))],
  ["(+ a)", (z) => z.Sum([z.Int("a")])],
  ["0", (z) => z.Sum([])],
  [
    "(ite (> x 4) (- x 4) 0)",
    (z) => z.If(z.Int("x").gt(4), z.Int("x").sub(4), 0),
  ],
  ["true", (z) => z.BoolVal(true)],
  ["false", (z) => z.BoolVal(false)],
  ["and", (z) => z.And([])],
  ["or", (z) => z.Or([])],
  ["(and (= a 1))", (z) => z.And(z.Int("a").eq(1))],
  ["(distinct x y)", (z) => z.Int("x").ne(z.Int("y"))],
  ["(+ x (- 4))", (z) => z.Int("x").add(-4)],
  ["(- 4)", (z) => z.IntVal(-4)],
  ["(* a 2)", (z) => z.Int("a").mul(2)],
  ["(* 4 a)", (z) => z.mul(4, z.Int("a"))],
  ["(not (= a b))", (z) => z.Not(z.Int("a").eq(z.Int("b")))],
  [
    "(=> (> a 1) (> b 2))",
    (z) => z.Implies(z.Int("a").gt(1), z.Int("b").gt(2)),
  ],
  ["(< a 3)", (z) => z.lt(z.Int("a"), 3)],
  ["|a b|", (z) => z.Int("a b")],
  ["p", (z) => z.Bool("p")],
  ["(and true (> x 1))", (z) => z.And(true, z.Int("x").gt(1))],
  ["(or p false)", (z) => z.Or(z.Bool("p"), false)],
  ["(not true)", (z) => z.Not(true)],
  ["(=> true p)", (z) => z.Implies(true, z.Bool("p"))],
  ["(ite true 1 2)", (z) => z.If(true, 1, 2)],
  ["x", (z) => z.simplify(z.Int("x").add(0))],
  [
    "(not (<= x 1))",
    (z) => z.simplify(z.And(z.Int("x").gt(1), z.Int("x").gt(1))),
  ],
];

const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
const HONORS: [string, number][] = [
  ["ace", 4],
  ["king", 3],
  ["queen", 2],
  ["jack", 1],
  ["ten", 0],
];

/** The shape of the engine's hand model: lengths, honor bits and points. */
function handModel(z: Z3Context) {
  const lengths = Object.fromEntries(SUITS.map((suit) => [suit, z.Int(suit)]));
  const axioms: Expr[] = [];
  const points: Expr[] = [];
  for (const suit of SUITS) {
    axioms.push(lengths[suit].ge(0), lengths[suit].le(13));
    const honors: Expr[] = [];
    for (const [honor, weight] of HONORS) {
      const bit = z.Int(`${suit}_${honor}`);
      axioms.push(bit.ge(0), bit.le(1));
      honors.push(bit);
      points.push(z.mul(weight, bit));
    }
    axioms.push(z.Sum(honors).le(lengths[suit]));
  }
  axioms.push(z.Sum(SUITS.map((suit) => lengths[suit])).eq(13));
  const hcp = z.Int("hcp");
  axioms.push(hcp.eq(z.Sum(points)));
  return { lengths, hcp, axioms };
}

describe("z3 wasm", () => {
  const contextPromise = loadZ3();

  it("reports the Z3 version it was built from", async () => {
    const z = await contextPromise;
    expect(z.version()).toBe("5.1.0.0");
    expect(z.versionNumbers()).toEqual([5, 1, 0, 0]);
  });

  it("decides sat and unsat over the integers", async () => {
    const z = await contextPromise;
    const x = z.Int("x");
    const y = z.Int("y");
    const solver = z.SolverFor("QF_LIA");
    solver.add(x.add(y).eq(3), x.ge(2));
    expect(solver.check()).toBe("sat");
    const model = solver.model();
    expect(model.evalInt(x)).toBeGreaterThanOrEqual(2);
    expect(model.evalInt(x) + model.evalInt(y)).toBe(3);
    expect(model.evalInt(x.add(y))).toBe(3);
    expect(z.isNumeral(model.eval(x))).toBe(true);
    expect(z.isNumeral(x)).toBe(false);

    const other = z.SolverFor("QF_LIA");
    other.add([x.gt(3), x.lt(2)]);
    expect(other.check()).toBe("unsat");
    other.dispose();
  });

  it("restores the assertions on pop", async () => {
    const z = await contextPromise;
    const x = z.Int("x");
    const solver = z.SolverFor("QF_LIA");
    solver.add(x.ge(2));
    solver.push();
    solver.add(x.lt(2));
    expect(solver.check()).toBe("unsat");
    solver.pop();
    expect(solver.check()).toBe("sat");
    solver.push();
    solver.push();
    solver.add(x.eq(5));
    solver.add(x.eq(6));
    expect(solver.check()).toBe("unsat");
    solver.pop(2);
    solver.add(x.eq(5));
    expect(solver.check()).toBe("sat");
    solver.reset();
    solver.add(x.lt(2));
    expect(solver.check()).toBe("sat");
  });

  it("prints terms exactly as z3py's sexpr()", async () => {
    const z = await contextPromise;
    for (const [expected, build] of printedForms) {
      const expr = build(z);
      expect(expr.sexpr()).toBe(expected);
      expect(String(expr)).toBe(expected);
    }
  });

  it("builds wide conjunctions (more arguments than the scratch buffer holds)", async () => {
    const z = await contextPromise;
    const x = z.Int("x");
    const terms = Array.from({ length: 100 }, (_, i) => x.gt(i + 1));
    // Z3's printer wraps long terms; z3py prints exactly this for the same list.
    const lines = terms.map((term, i) =>
      i === 0 ? `(and ${term}` : `     ${term}`,
    );
    expect(z.And(terms).sexpr()).toBe(lines.join("\n") + ")");
    const solver = z.SolverFor("QF_LIA");
    solver.add(z.And(terms), x.le(100));
    expect(solver.check()).toBe("unsat");
  });

  it("raises Z3 errors as exceptions", async () => {
    const z = await contextPromise;
    expect(() => z.And(z.Int("x"))).toThrow(Z3Error);
    expect(() => z.And(z.Int("x"))).toThrow(/[Ss]ort mismatch/);
    expect(() => z.IntVal(1.5)).toThrow(RangeError);
    // The context is still usable after an error.
    expect(z.And(z.Bool("p")).sexpr()).toBe("(and p)");
  });

  it("solves a problem shaped like the hand model", async () => {
    const z = await contextPromise;
    const { lengths, hcp, axioms } = handModel(z);
    const solver = z.SolverFor("QF_LIA");
    solver.add(axioms);

    solver.push();
    solver.add(hcp.ge(15), lengths.spades.ge(5));
    expect(solver.check()).toBe("sat");
    const model = solver.model();
    expect(model.evalInt(hcp)).toBeGreaterThanOrEqual(15);
    expect(model.evalInt(lengths.spades)).toBeGreaterThanOrEqual(5);
    expect(SUITS.reduce((n, suit) => n + model.evalInt(lengths[suit]), 0)).toBe(
      13,
    );
    solver.pop();

    // Two suits void and a doubleton at most: two honors plus four is 17.
    solver.push();
    solver.add(
      hcp.ge(20),
      lengths.spades.eq(0),
      lengths.hearts.eq(0),
      lengths.diamonds.le(2),
    );
    expect(solver.check()).toBe("unsat");
    solver.pop();
    solver.add(hcp.ge(17), lengths.spades.eq(0), lengths.hearts.eq(0));
    expect(solver.check()).toBe("sat");
  });

  it("times push/add/check/pop cycles on the hand model", async () => {
    const z = await contextPromise;
    const { lengths, hcp, axioms } = handModel(z);
    const solver = z.SolverFor("QF_LIA");
    solver.add(axioms);
    const cycles = 200;
    const results = { sat: 0, unsat: 0, unknown: 0 };
    const started = performance.now();
    for (let i = 0; i < cycles; i++) {
      solver.push();
      solver.add(
        hcp.ge(10 + (i % 12)),
        hcp.le(12 + (i % 12)),
        lengths.spades.ge(i % 7),
        lengths.hearts.ge(i % 5),
        z.Or(lengths.clubs.ge(4), lengths.diamonds.ge(4)),
        z.Sum(lengths.spades, lengths.hearts).le(13 - (i % 9)),
      );
      results[solver.check()] += 1;
      solver.pop();
    }
    const elapsed = performance.now() - started;
    console.log(
      `z3 wasm: ${cycles} push/add/check/pop cycles in ${elapsed.toFixed(1)} ms ` +
        `(${(elapsed / cycles).toFixed(3)} ms per check; ` +
        `${results.sat} sat, ${results.unsat} unsat, ${results.unknown} unknown)`,
    );
    expect(results.unknown).toBe(0);
    expect(results.sat + results.unsat).toBe(cycles);
  });
});
