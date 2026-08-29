import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const vendorRoot = join(repositoryRoot, "vendor");
const z3Wheel = {
  fileName: "z3_solver-5.1.0.0-py3-none-pyemscripten_2026_0_wasm32.whl",
  sha256: "d49a91527dc4f65e4a5a938b86a16937decadcbdbd806833d28ce25eb24cd3a9",
  url: "https://files.pythonhosted.org/packages/08/2c/842c3ca4ce8e503a5095c1883e0f18d45e202b1c75451a807ee3a6e4b83e/z3_solver-5.1.0.0-py3-none-pyemscripten_2026_0_wasm32.whl",
};

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function downloadAsset(asset, directory) {
  const destination = join(directory, asset.fileName);
  if (existsSync(destination)) {
    const existing = await readFile(destination);
    if (sha256(existing) === asset.sha256) {
      return;
    }
  }

  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(
      `Could not download ${asset.fileName}: ${response.status} ${response.statusText}`,
    );
  }

  const contents = Buffer.from(await response.arrayBuffer());
  const actualDigest = sha256(contents);
  if (actualDigest !== asset.sha256) {
    throw new Error(
      `Checksum mismatch for ${asset.fileName}: expected ${asset.sha256}, got ${actualDigest}`,
    );
  }

  await mkdir(directory, { recursive: true });
  const temporaryDestination = `${destination}.tmp`;
  await writeFile(temporaryDestination, contents);
  await rename(temporaryDestination, destination);
}

async function main() {
  const pyodidePackagePath = join(
    repositoryRoot,
    "node_modules",
    "pyodide",
    "package.json",
  );
  const pyodideLockPath = join(
    repositoryRoot,
    "node_modules",
    "pyodide",
    "pyodide-lock.json",
  );
  const pyodidePackage = JSON.parse(await readFile(pyodidePackagePath, "utf8"));
  const pyodideLock = JSON.parse(await readFile(pyodideLockPath, "utf8"));
  const micropip = pyodideLock.packages.micropip;

  if (!micropip?.file_name || !micropip?.sha256) {
    throw new Error("The pinned Pyodide lockfile does not define micropip");
  }

  await Promise.all([
    downloadAsset(
      {
        fileName: micropip.file_name,
        sha256: micropip.sha256,
        url: `https://cdn.jsdelivr.net/pyodide/v${pyodidePackage.version}/full/${micropip.file_name}`,
      },
      join(vendorRoot, "pyodide"),
    ),
    downloadAsset(z3Wheel, join(vendorRoot, "z3")),
  ]);
}

await main();
