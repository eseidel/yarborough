/// <reference lib="webworker" />

import { loadPyodide, type PyodideAPI } from "pyodide";
import {
  type EngineRequest,
  type EngineResponse,
  isEngineRequest,
} from "./engine-protocol";

const PYTHON_ROOT = "/home/pyodide/yarborough";
const PYTHON_SOURCE_PREFIX = "../../python/";
const Z3_WHEEL_FILE =
  "z3_solver-5.1.0.0-py3-none-pyemscripten_2026_0_wasm32.whl";

const pythonSources = {
  ...import.meta.glob(
    [
      "../../python/{core,z3b,third_party}/**/*.py",
      "!../../python/{core,z3b,third_party}/tests/**/*.py",
    ],
    {
      eager: true,
      import: "default",
      query: "?raw",
    },
  ),
  ...import.meta.glob(
    ["../../python/yarborough_z3b.py", "../../python/leads.py"],
    {
      eager: true,
      import: "default",
      query: "?raw",
    },
  ),
} as Record<string, string>;

let pyodideInitialization: Promise<PyodideAPI> | undefined;
let requestQueue = Promise.resolve();

function assetUrl(path: string): string {
  return new URL(
    `${import.meta.env.BASE_URL}${path}`,
    self.location.origin,
  ).toString();
}

function pythonPath(sourcePath: string): string {
  if (!sourcePath.startsWith(PYTHON_SOURCE_PREFIX)) {
    throw new Error(`Unexpected Python source path: ${sourcePath}`);
  }
  return `${PYTHON_ROOT}/${sourcePath.slice(PYTHON_SOURCE_PREFIX.length)}`;
}

function installPythonSources(pyodide: PyodideAPI): void {
  for (const [sourcePath, source] of Object.entries(pythonSources)) {
    const destination = pythonPath(sourcePath);
    const lastSlash = destination.lastIndexOf("/");
    pyodide.FS.mkdirTree(destination.slice(0, lastSlash));
    pyodide.FS.writeFile(destination, source);
  }
  pyodide.runPython(
    `import sys
if ${JSON.stringify(PYTHON_ROOT)} not in sys.path:
    sys.path.insert(0, ${JSON.stringify(PYTHON_ROOT)})`,
  );
}

async function initializePyodide(): Promise<PyodideAPI> {
  const pyodide = await loadPyodide({
    indexURL: assetUrl("assets/pyodide/"),
  });
  installPythonSources(pyodide);
  await pyodide.loadPackage("micropip");
  pyodide.globals.set(
    "yarborough_z3_wheel_url",
    assetUrl(`assets/z3/${Z3_WHEEL_FILE}`),
  );
  await pyodide.runPythonAsync(
    `import micropip
await micropip.install(yarborough_z3_wheel_url)
import z3
yarborough_z3_probe = z3.Int("yarborough_z3_probe")
yarborough_z3_solver = z3.SolverFor("QF_LIA")
yarborough_z3_solver.add(yarborough_z3_probe == 1)
assert yarborough_z3_solver.check() == z3.sat
assert yarborough_z3_solver.model()[yarborough_z3_probe].as_long() == 1
assert z3.is_int_value(z3.simplify(z3.IntVal(1) + 1))
import yarborough_z3b`,
  );
  return pyodide;
}

function initializedPyodide(): Promise<PyodideAPI> {
  pyodideInitialization ??= initializePyodide();
  return pyodideInitialization;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

async function execute(request: EngineRequest): Promise<EngineResponse> {
  try {
    const pyodide = await initializedPyodide();
    pyodide.globals.set(
      "yarborough_request_json",
      JSON.stringify({
        method: request.method,
        arguments: request.arguments,
      }),
    );
    const resultJson = await pyodide.runPythonAsync(
      `from yarborough_z3b import dispatch_json
dispatch_json(yarborough_request_json)`,
    );
    if (typeof resultJson !== "string") {
      throw new Error(
        "The Python bidding adapter returned a non-string response",
      );
    }
    return { id: request.id, ok: true, result: JSON.parse(resultJson) };
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
