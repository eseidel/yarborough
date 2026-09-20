# Yarborough

A client-only bridge bidding tutor using the SAYCBridge z3b engine, ported to
TypeScript. Bidding and Z3 solving run in a browser Web Worker; board data and
auction state are never sent to a server.

**Try it:** <https://eseidel.github.io/yarborough/> (moving to
<https://saycbridge.com> — see [docs/deployment.md](docs/deployment.md))

## Getting started

The application needs Node.js 22+ and pnpm. Nothing else is needed to run,
build or test it: the engine, its tests and its baseline gate are TypeScript.

```bash
pnpm install
pnpm dev
```

Use `pnpm build` for a production build, which is served from the domain root
by Cloudflare. The build has no download step: the Z3 solver is a committed
WebAssembly module.

## Architecture

The React frontend calls the async functions in `src/bridge/engine.ts`. They
communicate with one module worker, `src/bridge/z3b.worker.ts`, which loads
the bidding engine (`src/engine/`) together with Z3 compiled to WebAssembly
(`src/z3/`) and dispatches requests to `src/engine/adapter.ts`. The worker
serializes requests because z3b keeps mutable solver and history caches. The
engine and the solver are one code-split chunk that only the worker imports,
so the app shell stays small and the eleven-megabyte module is fetched once.

The practice presets are selected by the actual z3b opening rule:
`NotrumpOpening`, `PreemptiveOpen`, and `StrongTwoClubs`. The built site
downloads nothing at runtime beyond its own content-hashed assets.

## Testing

```bash
pnpm test
pnpm test:browser
pnpm baseline:check
pnpm format:check
pnpm lint
npx cspell --no-progress --dot "**"
pnpm build
```

Run `pnpm exec playwright install chromium` once to install the browser used
by the real-worker test. `pnpm baseline:check` bids the whole SAYC corpus,
`src/engine/harness/sayc_data.ts` (hand, expected call, auction), through the
engine and compares the run with the accepted output in `tests/baselines/`;
`pnpm baseline:accept` records a reviewed change; `YARBOROUGH_FULL_BASELINE=1
pnpm test` runs the same corpus inside Vitest. That baseline, with the golden
cases in `tests/z3b_golden_cases.json`, is the regression test of the engine.
`tests/bidding/*.yaml` are reference documents from the SAYC book that no code
loads, and their expected bids must not be rewritten.

## Third-party software

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the SAYCBridge
sources the engine is derived from and the browser runtime dependencies.
