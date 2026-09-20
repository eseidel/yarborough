# Yarborough

A client-only bridge bidding tutor using the SAYCBridge z3b engine, ported to
TypeScript. Bidding and Z3 solving run in a browser Web Worker; board data and
auction state are never sent to a server.

**Try it:** <https://eseidel.github.io/yarborough/> (moving to
<https://saycbridge.com> — see [docs/deployment.md](docs/deployment.md))

## Getting started

The application needs Node.js 22+ and pnpm. Nothing else is needed to run or
build it.

```bash
pnpm install
pnpm dev
```

Use `pnpm build` for a production build, which is served from the domain root
by Cloudflare. The build has no download step: the Z3 solver is a committed
WebAssembly module.

The original Python engine is kept under `python/` as the reference the
TypeScript port is checked against, until phase 9 of
[docs/typescript-engine-plan.md](docs/typescript-engine-plan.md) retires it.
Its tests need Python 3.9+:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e ./python
pnpm test:python
```

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
pnpm test:python
pnpm format:check
pnpm lint
npx cspell --no-progress --dot "**"
pnpm build
```

Run `pnpm exec playwright install chromium` once to install the browser used
by the real-worker test. `tests/bidding/sayc_standard.yaml` is retained as a
SAYC reference corpus; its expected bids must not be rewritten. The corpus is
bid by the TypeScript harness (`pnpm baseline:check`) and compared with the
accepted baselines; `python/tests/test_z3b_expectations.py` keeps one pinned
hand per corpus group.

## Third-party software

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the vendored
SAYCBridge sources and browser runtime dependencies.
