/// <reference lib="webworker" />

import {
  type EngineRequest,
  type EngineResponse,
  isEngineRequest,
} from "./engine-protocol";

// The bidding engine (src/engine/) is imported dynamically so that it and the
// eleven-megabyte Z3 WebAssembly module it awaits at the top level stay out of
// the app bundle: they load once, here in the worker, on the first request.
type Engine = typeof import("../engine/adapter");

let engineInitialization: Promise<Engine> | undefined;
// Requests are serialized: z3b owns mutable solver and history caches, and
// every request runs to completion before the next one starts.
let requestQueue = Promise.resolve();

function initializedEngine(): Promise<Engine> {
  engineInitialization ??= import("../engine/adapter").catch((error) => {
    // A failed load (a dropped connection while fetching the engine chunk)
    // is reported to that request and retried by the next one.
    engineInitialization = undefined;
    throw error;
  });
  return engineInitialization;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

async function execute(request: EngineRequest): Promise<EngineResponse> {
  try {
    const engine = await initializedEngine();
    // The adapter's null results (no adaptive board found) stay null, as they
    // did over JSON.
    const result = engine.dispatch(request.method, request.arguments) ?? null;
    return { id: request.id, ok: true, result };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: { message: errorMessage(error) },
    };
  }
}

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isEngineRequest(event.data)) {
    return;
  }
  const request = event.data;
  requestQueue = requestQueue
    .then(() => execute(request))
    .then((response) => self.postMessage(response))
    .catch((error) => {
      self.postMessage({
        id: request.id,
        ok: false,
        error: { message: errorMessage(error) },
      } satisfies EngineResponse);
    });
});
