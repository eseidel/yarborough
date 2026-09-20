// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// `pnpm explain "K73.A3.AJ7654.A9" "1H P 2H P" [--expected 3H]`: every
// possible call for a hand in an auction, with its rule and priority, the
// maximal ones, and with --expected the conjunct-by-conjunct test of that
// call's meanings against the hand.  The TypeScript replacement for
// `python -m analysis.explain`.
//
// The logic is TypeScript (src/engine/analysis/explain.ts); this launcher
// loads it through Vite, which resolves the extensionless imports the engine
// uses (Node cannot import those directly), and supplies the output sink,
// which src/ may not import itself.

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
  log(message) {
    process.stdout.write(`${message}\n`);
  },
};

let exitCode = 2;
try {
  const explain = await server.ssrLoadModule("/src/engine/analysis/explain.ts");
  exitCode = explain.run(process.argv.slice(2), host);
} finally {
  await server.close();
}

process.exit(exitCode);
