import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { slimWheel } from "./slim-wheel.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const vendorRoot = join(repositoryRoot, "vendor");
const z3Wheel = {
  fileName: "z3_solver-5.1.0.0-py3-none-pyemscripten_2026_0_wasm32.whl",
  sha256: "d49a91527dc4f65e4a5a938b86a16937decadcbdbd806833d28ce25eb24cd3a9",
  url: "https://files.pythonhosted.org/packages/08/2c/842c3ca4ce8e503a5095c1883e0f18d45e202b1c75451a807ee3a6e4b83e/z3_solver-5.1.0.0-py3-none-pyemscripten_2026_0_wasm32.whl",
};

// Half of the upstream Z3 wheel is dead weight in a browser, so it is slimmed
// before it is served. `z3/lib/libz3.so.5.1` is byte for byte the same 8.2 MB
// WebAssembly module as `z3/lib/libz3.so`, and only the latter is ever loaded:
// z3core.py builds its candidate name list from `sys.platform`, which is
// "emscripten" here, so it looks for "libz3.so" and nothing else. The
// `z3/include/*.h` C headers are there for people compiling against Z3, which
// nothing does at runtime. Dropping both halves the site's largest asset, from
// 6,046,959 bytes to 3,021,362.
//
// Entries that stay keep their upstream compressed bytes, so the served wheel
// is a deterministic derivation of the checksum-verified download and is
// pinned here in turn. Update this digest deliberately when the drop list or
// the Z3 version changes; `pnpm assets:prepare` prints the digest it got.
const slimZ3WheelSha256 =
  "7a9991b637df4ef6be1a50e908243c1855356d0c32fcbe1b2f7f3394ba1ddd90";

function isServedFromZ3Wheel(name) {
  return name !== "z3/lib/libz3.so.5.1" && !name.startsWith("z3/include/");
}

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

async function prepareZ3Wheel() {
  const z3Root = join(vendorRoot, "z3");
  const upstreamDirectory = join(z3Root, "upstream");
  await downloadAsset(z3Wheel, upstreamDirectory);

  const destination = join(z3Root, z3Wheel.fileName);
  if (existsSync(destination)) {
    const existing = await readFile(destination);
    if (sha256(existing) === slimZ3WheelSha256) {
      return;
    }
  }

  const upstream = await readFile(join(upstreamDirectory, z3Wheel.fileName));
  const { wheel } = slimWheel(upstream, isServedFromZ3Wheel);
  const digest = sha256(wheel);
  if (digest !== slimZ3WheelSha256) {
    throw new Error(
      `Slimmed ${z3Wheel.fileName} is ${digest} (${wheel.length} bytes), ` +
        `expected ${slimZ3WheelSha256}`,
    );
  }

  await mkdir(z3Root, { recursive: true });
  const temporaryDestination = `${destination}.tmp`;
  await writeFile(temporaryDestination, wheel);
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
    prepareZ3Wheel(),
  ]);
}

await main();
