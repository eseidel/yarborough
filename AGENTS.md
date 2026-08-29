```bash
pnpm test
pnpm test:browser
pnpm test:python
pnpm format:check
pnpm lint
npx cspell --no-progress --dot "**"
pnpm build
```

Write tests for all code changes. Do not use manual testing.

- **TypeScript:** Vitest tests in `src/**/__tests__/*.test.ts(x)`.
- **Browser runtime:** Chromium tests in
  `src/**/__tests__/*.browser.test.ts`, run with `pnpm test:browser`.
- **Python:** `unittest` tests live in `python/**/test_*.py`; install native
  test dependencies with `python3 -m venv .venv && .venv/bin/python -m pip install -e ./python`.

## Conventions

**Hand strings use C.D.H.S** (Clubs.Diamonds.Hearts.Spades), matching
`Suit::ALL` order. For example, `"AK.J.T8753.JT432"` is AK clubs, J diamonds,
T8753 hearts, and JT432 spades.

## Bidding engine development

- The production engine is vendored in `python/core/` and `python/z3b/`.
  `python/yarborough_z3b.py` is its narrow JSON-facing adapter.
- `src/bridge/z3b.worker.ts` runs Pyodide and Z3 in one module worker. Keep
  requests serialized: z3b owns mutable solver and history caches.
- Browser assets are prepared by `pnpm assets:prepare`, checksum-verified, and
  served locally. Do not add a server-side bidding fallback.
- `tests/bidding/sayc_standard.yaml` is a source reference from the SAYC book:
  never change expected bids. The curated executable z3b regression corpus is
  `python/tests/test_z3b_expectations.py`; explicitly classify unsupported
  historical cases rather than rewriting expectations.
