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
  never change expected bids. The executable corpus is
  `python/tests/test_sayc_data.py` (hand, expected call, auction); every hand in
  it is bid by `python -m tests.harness` and compared with the accepted output
  in `python/tests/baselines/` by `python/tests/test_z3b_baseline.py`. Any
  behavior change of the bidder fails that test with a diff. When the change is
  intended, commit it and run `python -m tests.check_baseline --accept` (it
  refuses a dirty tree) so the reviewed artifact is the baseline diff. Fix a
  known miss by making its FAIL line disappear; never edit the baselines by
  hand. When you fix a bidding bug, add the hand and auction that exposed it to
  `test_sayc_data.py` first. `python/tests/test_z3b_expectations.py` keeps one
  pinned hand per corpus group; classify a new group there.

## Double dummy

- `src/dds/wasm/dds.mjs` is DDS (Bo Haglund's double-dummy solver) compiled to
  WebAssembly, single-threaded, by `native/dds/build.sh` from the pinned tag with
  the pinned Emscripten; it is committed, so rebuild only to move the DDS version
  or change `native/dds/dds_wasm.cpp`, and commit the result with that change.
- `src/dds/dds.worker.ts` runs it in its own module worker; `src/dds/dds.ts` is
  the client (the table, and declarer's tricks after a fixed opening lead).
  `src/dds/dds-core.ts` holds the pure PBN and index conversions, unit-tested
  against tables from a native DDS in `tests/dd_golden_cases.json`.
- The opening lead comes from the engine (`python/leads.py`, textbook rules;
  `get_opening_lead` in the adapter) because it needs the interpreter's
  artificial-call flags to know which suits were bid naturally.
