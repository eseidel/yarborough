// cspell:ignore unpadded urlsafe
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  filterRecord,
  readCentralDirectory,
  readEntry,
  slimWheel,
} from "../scripts/slim-wheel.mjs";

const WHEEL_NAME = "z3_solver-5.1.0.0-py3-none-pyemscripten_2026_0_wasm32.whl";
const DROPPED_DUPLICATE = "z3/lib/libz3.so.5.1";

// `pnpm test` runs `assets:prepare` first, so both wheels are on disk. Vitest
// runs with the repository root as its working directory.
function wheel(relativePath: string): Buffer {
  return readFileSync(join(process.cwd(), relativePath));
}

const upstream = () => wheel(join("vendor", "z3", "upstream", WHEEL_NAME));
const served = () => wheel(join("vendor", "z3", WHEEL_NAME));

/** The predicate `scripts/prepare-pyodide-assets.mjs` slims the wheel with. */
function isServed(name: string): boolean {
  return name !== DROPPED_DUPLICATE && !name.startsWith("z3/include/");
}

function names(zip: Buffer): string[] {
  return readCentralDirectory(zip).map((entry) => entry.name);
}

function contents(zip: Buffer, name: string): Buffer {
  const entry = readCentralDirectory(zip).find(
    (candidate) => candidate.name === name,
  );
  if (!entry) {
    throw new Error(`${name} is not in the archive`);
  }
  return readEntry(zip, entry);
}

/** RECORD stores digests the way PEP 376 does: urlsafe base64, unpadded. */
function recordDigest(data: Buffer): string {
  return createHash("sha256")
    .update(data)
    .digest("base64url")
    .replace(/=+$/, "");
}

describe("filterRecord", () => {
  it("keeps only the lines whose file survived, and the trailing blank", () => {
    const record = Buffer.from(
      "a.py,sha256=AAA,1\nb.py,sha256=BBB,2\nRECORD,,\n",
    );
    expect(filterRecord(record, (name) => name !== "b.py").toString()).toBe(
      "a.py,sha256=AAA,1\nRECORD,,\n",
    );
  });

  it("leaves a record alone when nothing is dropped", () => {
    const record = Buffer.from("a.py,sha256=AAA,1\nRECORD,,\n");
    expect(filterRecord(record, () => true).toString()).toBe(record.toString());
  });
});

describe("slimWheel", () => {
  it("returns the input untouched when the predicate keeps everything", () => {
    const input = upstream();
    const { wheel: output, dropped } = slimWheel(input, () => true);
    expect(dropped).toEqual([]);
    expect(output).toBe(input);
  });

  it("drops the duplicate libz3 and the C headers, and nothing else", () => {
    const { dropped } = slimWheel(upstream(), isServed);
    expect(dropped).toContain(DROPPED_DUPLICATE);
    expect(dropped.filter((name) => !name.startsWith("z3/include/"))).toEqual([
      DROPPED_DUPLICATE,
    ]);
  });

  it("is deterministic", () => {
    const first = slimWheel(upstream(), isServed).wheel;
    const second = slimWheel(upstream(), isServed).wheel;
    expect(first.equals(second)).toBe(true);
  });

  it("produces the wheel that asset preparation serves", () => {
    expect(slimWheel(upstream(), isServed).wheel.equals(served())).toBe(true);
  });
});

describe("the served Z3 wheel", () => {
  it("still carries the one shared library z3core.py looks for", () => {
    const slim = served();
    expect(names(slim)).toContain("z3/lib/libz3.so");
    expect(names(slim)).not.toContain(DROPPED_DUPLICATE);
    // Byte for byte the upstream module, not a recompression of it.
    expect(
      contents(slim, "z3/lib/libz3.so").equals(
        contents(upstream(), "z3/lib/libz3.so"),
      ),
    ).toBe(true);
  });

  it("keeps every Python module from upstream", () => {
    const kept = names(served());
    for (const name of names(upstream())) {
      if (name.endsWith(".py")) {
        expect(kept).toContain(name);
      }
    }
  });

  it("has a RECORD that matches the archive exactly", () => {
    const slim = served();
    const lines = contents(slim, "z3_solver-5.1.0.0.dist-info/RECORD")
      .toString("utf8")
      .split("\n")
      .filter((line) => line !== "");

    expect(new Set(lines.map((line) => line.split(",")[0]))).toEqual(
      new Set(names(slim)),
    );

    for (const line of lines) {
      const [path, digest, size] = line.split(",");
      if (digest === "") {
        continue; // RECORD does not hash itself.
      }
      const data = contents(slim, path);
      expect(`sha256=${recordDigest(data)}`).toBe(digest);
      expect(Number(size)).toBe(data.length);
    }
  });

  it("is half the size of the upstream wheel", () => {
    expect(served().length).toBeLessThan(upstream().length / 1.9);
  });
});
