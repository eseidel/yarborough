import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePath } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const pyodideDirectory = dirname(fileURLToPath(import.meta.resolve("pyodide")));
const pyodideFiles = [
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "pyodide-lock.json",
  "python_stdlib.zip",
];

export function pyodideAssets() {
  return viteStaticCopy({
    targets: [
      {
        src: pyodideFiles.map((file) =>
          normalizePath(join(pyodideDirectory, file)),
        ),
        dest: "assets/pyodide",
        rename: { stripBase: true },
      },
      {
        src: normalizePath(join(repositoryRoot, "vendor/pyodide/*.whl")),
        dest: "assets/pyodide",
        rename: { stripBase: true },
      },
      {
        src: normalizePath(join(repositoryRoot, "vendor/z3/*.whl")),
        dest: "assets/z3",
        rename: { stripBase: true },
      },
    ],
  });
}
