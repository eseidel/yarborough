# Yarborough

A client-only bridge bidding tutor using the SAYCBridge z3b engine. Bidding,
Python execution, and Z3 solving run in a browser Web Worker; board data and
auction state are never sent to a server.

**Try it:** <https://eseidel.github.io/yarborough/>

## Getting started

The application needs Node.js 22+ and pnpm. Native engine tests additionally
need Python 3.9+.

```bash
pnpm install
python3 -m venv .venv
.venv/bin/python -m pip install -e ./python
pnpm dev
```

`pnpm dev` prepares checksum-verified Pyodide and Z3 assets in ignored
`vendor/` before starting Vite. Use `pnpm build` for a GitHub Pages-compatible
production build.

## Architecture

The React frontend calls the four async functions in `src/bridge/engine.ts`.
They communicate with one module worker, which initializes Pyodide, installs
the local pinned Z3 wheel, and dispatches requests to
`python/yarborough_z3b.py`. The worker serializes requests because z3b keeps
mutable solver and history caches.

The practice presets are selected by the actual z3b opening rule:
`NotrumpOpening`, `PreemptiveOpen`, and `StrongTwoClubs`. Asset preparation
downloads only pinned artifacts and verifies their SHA-256 digests; the built
site does not download packages at runtime.

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
SAYC reference corpus; its expected bids must not be rewritten. The curated
native z3b regression suite is `python/tests/test_z3b_expectations.py`.

## Third-party software

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the vendored
SAYCBridge sources and browser runtime dependencies.
