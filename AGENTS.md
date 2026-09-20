```bash
pnpm test
pnpm test:browser
pnpm baseline:check
pnpm format:check
pnpm lint
npx cspell --no-progress --dot "**"
pnpm build
```

Write tests for all code changes. Do not use manual testing.

- **TypeScript:** Vitest tests in `src/**/__tests__/*.test.ts(x)`.
- **Browser runtime:** Chromium tests in
  `src/**/__tests__/*.browser.test.ts`, run with `pnpm test:browser`.

## Conventions

**Hand strings use C.D.H.S** (Clubs.Diamonds.Hearts.Spades), matching
`Suit::ALL` order. For example, `"AK.J.T8753.JT432"` is AK clubs, J diamonds,
T8753 hearts, and JT432 spades.

## Bidding engine development

- The production engine is `src/engine/`: a line-for-line TypeScript port of
  the SAYCBridge z3b engine, whose module and class names it keeps
  (`src/engine/core/`, `src/engine/z3b/`). `src/engine/adapter.ts` is its
  narrow JSON-facing adapter. Nothing in the repository is Python any more;
  `docs/typescript-engine-plan.md` and `docs/typescript-engine-notes.md`
  record how the port was done and what it was checked against.
- `src/bridge/z3b.worker.ts` runs the engine and Z3 in one module worker. Keep
  requests serialized: z3b owns mutable solver and history caches. The worker
  imports the engine dynamically so it and the Z3 module stay in their own
  chunk, out of the app bundle.
- `src/z3/wasm/z3.mjs` is `libz3` compiled to WebAssembly, single-threaded, by
  `native/z3/build.sh` from the pinned Z3 tag with the pinned Emscripten;
  `src/z3/z3.ts` is the synchronous binding over it and `src/z3/load.ts` loads
  it once per thread. It is committed, so rebuild only to move the Z3 version
  or change the export list, and commit the result with that change. The built
  site downloads nothing at runtime. Do not add a server-side bidding fallback.
  `docs/payload-size-analysis.md` measures the payload.
- `tests/bidding/sayc_standard.yaml` is a source reference from the SAYC book:
  never change expected bids. The executable corpus is
  `src/engine/harness/sayc_data.ts` (hand, expected call, auction); every hand
  in it is bid by the harness (`pnpm baseline:check`) and compared with the
  accepted output in `tests/baselines/`. Any behavior change of the bidder
  fails that check with a diff. `pnpm baseline:check` runs the whole corpus,
  and `YARBOROUGH_FULL_BASELINE=1 pnpm test` runs it inside Vitest. When the
  change is intended, commit it and run `pnpm baseline:accept` (it refuses a
  dirty tree) so the reviewed artifact is the baseline diff. Fix a known miss
  by making its FAIL line disappear; never edit the baselines by hand. When you
  fix a bidding bug, add the hand and auction that exposed it to the corpus
  first. This baseline, with the golden cases in `tests/z3b_golden_cases.json`,
  is the regression test of the engine.

## Double dummy

- `src/dds/wasm/dds.mjs` is DDS (Bo Haglund's double-dummy solver) compiled to
  WebAssembly, single-threaded, by `native/dds/build.sh` from the pinned tag with
  the pinned Emscripten; it is committed, so rebuild only to move the DDS version
  or change `native/dds/dds_wasm.cpp`, and commit the result with that change.
- `src/dds/dds.worker.ts` runs it in its own module worker; `src/dds/dds.ts` is
  the client (the table, and declarer's tricks after a fixed opening lead).
  `src/dds/dds-core.ts` holds the pure PBN and index conversions, unit-tested
  against tables from a native DDS in `tests/dd_golden_cases.json`.
- The opening lead comes from the engine (`src/engine/leads.ts`, textbook rules;
  `get_opening_lead` in the adapter) because it needs the interpreter's
  artificial-call flags to know which suits were bid naturally.
