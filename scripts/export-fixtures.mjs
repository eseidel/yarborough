// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// `pnpm fixtures:check` / `pnpm fixtures:accept`: regenerate every file under
// tests/engine-fixtures/ from the TypeScript engine and compare with (or
// replace) the committed ones, the TypeScript replacement for
// `python -m tests.export_fixtures [--check]`.
//
// The logic is TypeScript (src/engine/fixtures/cli.ts); this launcher loads
// it through Vite, which resolves the extensionless imports the engine uses
// (Node cannot import those directly), and supplies the file system and git,
// neither of which src/ may import itself.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  appType: "custom",
  logLevel: "warn",
  // Nothing is served to a browser, so skip the dependency pre-bundling scan.
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
});

const host = {
  readFile(path) {
    try {
      return readFileSync(resolve(process.cwd(), path), "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      throw error;
    }
  },
  writeFile(path, text) {
    const absolute = resolve(process.cwd(), path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  },
  gitStatus() {
    return execFileSync("git", ["status", "--porcelain"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
  },
  log(message) {
    process.stderr.write(`${message}\n`);
  },
};

let exitCode = 2;
try {
  const cli = await server.ssrLoadModule("/src/engine/fixtures/cli.ts");
  exitCode = cli.run(process.argv.slice(2), host);
} finally {
  await server.close();
}

process.exit(exitCode);
