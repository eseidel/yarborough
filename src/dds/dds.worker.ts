/// <reference lib="webworker" />

// The double-dummy solver (DDS compiled to WebAssembly, native/dds) in its own
// module worker: one request at a time, the module loaded on first use.

import createDdsModule, { type DdsModule } from "./wasm/dds.mjs";
import type { EngineResponse } from "../bridge/engine-protocol";
import { type DdsRequest, isDdsRequest } from "./dds-protocol";

let moduleInitialization: Promise<DdsModule> | undefined;
let requestQueue = Promise.resolve();

function initializedModule(): Promise<DdsModule> {
  moduleInitialization ??= createDdsModule();
  return moduleInitialization;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  return value;
}

function requireInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

function solve(dds: DdsModule, request: DdsRequest): unknown {
  const { arguments: args } = request;
  switch (request.method) {
    case "calc_dd_table":
      return dds.ccall(
        "dds_calc_table",
        "string",
        ["string"],
        [requireString(args.pbn, "pbn")],
      );
    case "solve_after_lead": {
      const tricks = dds.ccall(
        "dds_solve_after_lead",
        "number",
        ["string", "number", "number", "number", "number"],
        [
          requireString(args.pbn, "pbn"),
          requireInteger(args.trump, "trump"),
          requireInteger(args.leader, "leader"),
          requireInteger(args.suit, "suit"),
          requireInteger(args.rank, "rank"),
        ],
      );
      if (tricks < 0) {
        throw new Error(`The double-dummy solver failed: DDS error ${-tricks}`);
      }
      return tricks;
    }
  }
}

async function execute(request: DdsRequest): Promise<EngineResponse> {
  try {
    const dds = await initializedModule();
    return { id: request.id, ok: true, result: solve(dds, request) };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: { message: errorMessage(error) },
    };
  }
}

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isDdsRequest(event.data)) {
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
