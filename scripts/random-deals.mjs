// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// `pnpm random-deals [--deals N] [--seed S] [--save FILE] [--diff FILE]`: bid
// seeded random deals to completion with SAYC in all four seats and count the
// collisions, the hands with no call, the exceptions and the dropped calls.
// The TypeScript replacement for `python -m analysis.random_deals`.
//
// The logic is TypeScript (src/engine/analysis/random-deals.ts); this launcher
// loads it through Vite, which resolves the extensionless imports the engine
// uses (Node cannot import those directly), and supplies the file system and
// the output, neither of which src/ may import itself.

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
  log(message) {
    process.stdout.write(`${message}\n`);
  },
};

let exitCode = 2;
try {
  const tool = await server.ssrLoadModule(
    "/src/engine/analysis/random-deals.ts",
  );
  exitCode = tool.run(process.argv.slice(2), host);
} finally {
  await server.close();
}

process.exit(exitCode);
