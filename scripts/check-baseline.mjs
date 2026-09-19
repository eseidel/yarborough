// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// `pnpm baseline:check` / `pnpm baseline:accept`: bid every hand in
// src/engine/harness/sayc_data.ts and compare the run with the accepted
// baselines under python/tests/baselines/, the TypeScript replacement for
// `python -m tests.check_baseline`.
//
// The logic is TypeScript (src/engine/harness/cli.ts); this launcher loads it
// through Vite, which resolves the extensionless imports the engine uses (Node
// cannot import those directly), and supplies the file system, git and the
// bidder, none of which src/ may import itself.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServer } from "vite";

const KERNEL_BIDDER_MODULE = "/src/engine/z3b/harness-bidder.ts";

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
      return readFileSync(join(process.cwd(), path), "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      throw error;
    }
  },
  writeFile(path, text) {
    const absolute = join(process.cwd(), path);
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
    process.stdout.write(`${message}\n`);
  },
  async loadBidder() {
    // Probed rather than imported so the absence of the kernel is reported by
    // the CLI instead of logged as a Vite resolution failure.
    if (!existsSync(join(process.cwd(), KERNEL_BIDDER_MODULE.slice(1)))) {
      return null;
    }
    const module = await server.ssrLoadModule(KERNEL_BIDDER_MODULE);
    return module.createHarnessBidder ? module.createHarnessBidder() : null;
  },
};

let exitCode = 2;
try {
  const cli = await server.ssrLoadModule("/src/engine/harness/cli.ts");
  exitCode = await cli.run(process.argv.slice(2), host);
} finally {
  await server.close();
}

process.exit(exitCode);
