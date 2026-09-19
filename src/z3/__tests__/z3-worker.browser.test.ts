// The Z3 WebAssembly module inside a real module worker in Chromium, built by
// Vite exactly as the site builds `dds.worker.ts` and `z3b.worker.ts`.  This is
// the phase 8 de-risking step: if Z3 solves here, the engine can live in a
// worker without Pyodide.  The types are imported for their shapes only, so
// the eleven-megabyte module never enters the test bundle.
import { describe, expect, it } from "vitest";
import type { Z3ProbeRequest, Z3ProbeResponse } from "../z3.worker";

function probe(): Promise<Z3ProbeResponse> {
  const worker = new Worker(new URL("../z3.worker.ts", import.meta.url), {
    type: "module",
  });
  return new Promise<Z3ProbeResponse>((resolve, reject) => {
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      resolve(event.data as Z3ProbeResponse);
    });
    worker.addEventListener("error", (event) => {
      reject(new Error(event.message || "The Z3 worker failed to start"));
    });
    worker.postMessage({ id: 1, kind: "probe" } satisfies Z3ProbeRequest);
  }).finally(() => {
    worker.terminate();
  });
}

describe("z3 module worker", () => {
  it("loads Z3 and decides the hand model in a Chromium module worker", async () => {
    const response = await probe();
    if (!response.ok) {
      throw new Error(`The Z3 worker failed: ${response.error.message}`);
    }
    const result = response.result;
    expect(response.id).toBe(1);
    expect(result.version).toBe("5.1.0.0");
    expect(result.versionNumbers).toEqual([5, 1, 0, 0]);
    expect(result.sat).toBe("sat");
    expect(result.unsat).toBe("unsat");
    expect(result.loopSat + result.loopUnsat).toBe(result.loopChecks);
    expect(result.loopSat).toBeGreaterThan(0);
    expect(result.loopUnsat).toBeGreaterThan(0);

    console.log(
      `z3 module worker: load ${result.moduleLoadMs.toFixed(0)} ms, ` +
        `first check ${result.firstCheckMs.toFixed(1)} ms, ` +
        `${result.loopChecks} checks in ${result.loopMs.toFixed(1)} ms ` +
        `(${(result.loopMs / result.loopChecks).toFixed(3)} ms per check; ` +
        `${result.loopSat} sat, ${result.loopUnsat} unsat)`,
    );
  }, 120_000);
});
