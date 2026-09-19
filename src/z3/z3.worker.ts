/// <reference lib="webworker" />

// A phase 8 de-risking probe, not the engine worker: it proves that the
// committed Z3 WebAssembly module loads and solves inside a real module worker
// built by Vite, and reports what that costs.  The engine worker that replaces
// `src/bridge/z3b.worker.ts` will load Z3 the same way, through `./load`.

import { type CheckResult, type Expr, Z3Context } from "./z3";
import { loadZ3 } from "./load";

export interface Z3ProbeRequest {
  id: number;
  kind: "probe";
}

export interface Z3ProbeResult {
  version: string;
  versionNumbers: [number, number, number, number];
  /** A hand with fifteen points and five spades: satisfiable. */
  sat: CheckResult;
  /** Twenty points in at most two cards of one suit: not satisfiable. */
  unsat: CheckResult;
  /** Instantiating the module and building the shared context. */
  moduleLoadMs: number;
  /** The first `check()` of the worker, axioms included. */
  firstCheckMs: number;
  /** A push/add/check/pop loop over the hand model. */
  loopChecks: number;
  loopMs: number;
  loopSat: number;
  loopUnsat: number;
}

export type Z3ProbeResponse =
  | { id: number; ok: true; result: Z3ProbeResult }
  | { id: number; ok: false; error: { message: string } };

const LOOP_CHECKS = 100;

const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;

const HONORS: readonly [string, number][] = [
  ["ace", 4],
  ["king", 3],
  ["queen", 2],
  ["jack", 1],
  ["ten", 0],
];

/** The shape of the engine's hand model, as in `__tests__/z3.test.ts`. */
function handModel(z: Z3Context) {
  const lengths: Record<string, Expr> = {};
  const axioms: Expr[] = [];
  const points: Expr[] = [];
  for (const suit of SUITS) {
    const length = z.Int(suit);
    lengths[suit] = length;
    axioms.push(length.ge(0), length.le(13));
    const honors: Expr[] = [];
    for (const [honor, weight] of HONORS) {
      const bit = z.Int(`${suit}_${honor}`);
      axioms.push(bit.ge(0), bit.le(1));
      honors.push(bit);
      points.push(z.mul(weight, bit));
    }
    axioms.push(z.Sum(honors).le(length));
  }
  axioms.push(z.Sum(SUITS.map((suit) => lengths[suit])).eq(13));
  const hcp = z.Int("hcp");
  axioms.push(hcp.eq(z.Sum(points)));
  return { lengths, hcp, axioms };
}

async function probe(): Promise<Z3ProbeResult> {
  const loadStarted = performance.now();
  const z = await loadZ3();
  const moduleLoadMs = performance.now() - loadStarted;

  const { lengths, hcp, axioms } = handModel(z);
  const solver = z.SolverFor("QF_LIA");
  solver.add(axioms);

  solver.push();
  solver.add(hcp.ge(15), lengths.spades.ge(5));
  const firstCheckStarted = performance.now();
  const sat = solver.check();
  const firstCheckMs = performance.now() - firstCheckStarted;
  solver.pop();

  solver.push();
  solver.add(
    hcp.ge(20),
    lengths.spades.eq(0),
    lengths.hearts.eq(0),
    lengths.diamonds.le(2),
  );
  const unsat = solver.check();
  solver.pop();

  let loopSat = 0;
  let loopUnsat = 0;
  const loopStarted = performance.now();
  for (let i = 0; i < LOOP_CHECKS; i++) {
    solver.push();
    solver.add(
      hcp.ge(10 + (i % 12)),
      hcp.le(12 + (i % 12)),
      lengths.spades.ge(i % 7),
      lengths.hearts.ge(i % 5),
      z.Or(lengths.clubs.ge(4), lengths.diamonds.ge(4)),
      z.Sum(lengths.spades, lengths.hearts).le(13 - (i % 9)),
    );
    const result = solver.check();
    if (result === "sat") {
      loopSat += 1;
    } else if (result === "unsat") {
      loopUnsat += 1;
    }
    solver.pop();
  }
  const loopMs = performance.now() - loopStarted;
  solver.dispose();

  return {
    version: z.version(),
    versionNumbers: z.versionNumbers(),
    sat,
    unsat,
    moduleLoadMs,
    firstCheckMs,
    loopChecks: LOOP_CHECKS,
    loopMs,
    loopSat,
    loopUnsat,
  };
}

function isProbeRequest(value: unknown): value is Z3ProbeRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Z3ProbeRequest).id === "number" &&
    (value as Z3ProbeRequest).kind === "probe"
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

let requestQueue = Promise.resolve();

async function execute(request: Z3ProbeRequest): Promise<Z3ProbeResponse> {
  try {
    return { id: request.id, ok: true, result: await probe() };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: { message: errorMessage(error) },
    };
  }
}

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isProbeRequest(event.data)) {
    return;
  }
  const request = event.data;
  requestQueue = requestQueue
    .then(() => execute(request))
    .then((response: Z3ProbeResponse) => {
      self.postMessage(response);
    });
});
