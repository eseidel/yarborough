<!-- cspell:ignore unsat pycache -->

# Notes: the TypeScript engine port

Running notes for `typescript-engine-plan.md`. Whoever continues the work
(person or agent) reads this first, then the plan. Keep it current: status,
decisions, and the next action.

## How to resume

1. `git checkout claude/bidding-engine-python-typescript-tj1h1x` and read the
   "Status" table below; the first row that is not `done` is the next work.
2. Environment: `pnpm install`. Nothing else; the Python reference was deleted
   in phase 9 (6381d99) and is available from git history before that commit.
   Emscripten for a Z3 rebuild: see `native/z3/README.md`.
3. The checks: `pnpm test`, `pnpm baseline:check`, `pnpm lint`, `pnpm format:check`,
   `npx cspell --no-progress --dot "**"`, `pnpm build`, `pnpm test:browser`.
4. Commit per phase on this branch. Update this file in the same commit.

## Status

| Phase | State   | Notes                                                                                                                  |
| ----- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| 0a    | done    | canonical order in the bidder; baseline unchanged (27f1a4a)                                                            |
| 0b    | done    | `python -m tests.export_fixtures`; 17 MB under `tests/engine-fixtures/` (c5647c1)                                      |
| 1     | done    | Z3 5.1.0, Emscripten 6.0.9, `src/z3/wasm/z3.mjs` 11.2 MB (28d7170); Chromium worker probe (12f705e)                    |
| 2     | done    | `src/engine/core/`, `leads.ts`, `categories.ts` (a7b7efb, 4117de5)                                                     |
| 3     | done    | `src/engine/z3b/model.ts` matches `model-expressions.json` (364c91f)                                                   |
| 4     | done    | DSL foundation, recorded history, gate `dsl-fixtures.test.ts` (364c91f)                                                |
| 5     | done    | all 217 rules in `src/engine/z3b/rules/`, `natural.ts`, `cappelletti.ts`; every meaning and negation matches (bab1a8b) |
| 6     | done    | kernel `src/engine/z3b/bidder.ts`, `harness-bidder.ts` (3df1d99); every snapshot, decision and the baseline reproduced |
| 7     | running | harness and baseline done (2000558); adapter port and the interpretations, random-deal and golden gates in progress    |
| 8     | running | worker calls the adapter; Pyodide, micropip and the wheel removed                                                      |
| 9     | partial | `pnpm explain` and `pnpm random-deals` ported (c299573); deleting `python/` and moving the baselines remains           |
| 10    | later   | optional bounded solver replacing the 11 MB Z3 module; a separate decision with its own fuzzing gate                   |

## Decisions

- 2026-09-19: Keep Z3, drop Pyodide. A custom single-threaded Emscripten build
  of libz3 (DDS precedent) rather than the npm `z3-solver` package, which
  needs SharedArrayBuffer and an async `check`. See the plan for the reasons.
- 2026-09-19: Fixtures compare **printed forms** of Z3 expressions (hashed
  where large), so the TypeScript expression construction must mirror the
  Python operator structure exactly, including Python's `sum` starting from 0.
- 2026-09-19: In this environment GitHub tarball downloads are refused by the
  egress policy but `git clone` from github.com works; the emsdk binary host
  (storage.googleapis.com) is reachable. The Z3 build therefore clones the
  pinned tag with git.

## Decisions (continued)

- 2026-09-19: Rule declaration convention is the header comment of
  `src/engine/z3b/rule_compiler.ts`: one class per Python class, the DSL keys
  in one `static override dsl = rule({...})`, mixins as class factories so the
  prototype chain equals the Python MRO, leaves registered by name in
  `sayc.ts`. Phase 5 batches live in `src/engine/z3b/rules/<section>.ts`, each
  exporting its own `RULE_CLASSES`, so parallel agents never edit one file.
- 2026-09-19: The wasm exports no `Z3_global_param_set`, so `printed.ts`
  inlines Z3's `let` aliases instead of raising `pp.min_alias_size`; verified
  exact against the Z3 5.1.0 printer and the fixtures.

- 2026-09-19: Printed forms in the fixtures are produced with
  `pp.min_alias_size` raised (no `let` aliases) and whitespace collapsed; Z3's
  printer flattens associative operators, so `a + b + c` prints
  `(+ a b c)`. The TypeScript binding sets the same print mode and parameters.
- 2026-09-19: Agents work in git worktrees under `.claude/worktrees/`; those
  checkouts are picked up by Vitest, Prettier and cspell when run from the main
  tree, so remove finished worktrees (`git worktree remove --force`) before
  running the gates there. Worktree commits are cherry-picked onto this branch.
- 2026-09-19: `npx cspell --no-progress --dot "**"` reports 51 pre-existing
  unknown words in `docs/seo-baseline/*.csv` on main as well; not part of this
  work.

## Decisions (phase 9)

- 2026-09-20: The fixtures under `tests/engine-fixtures/` stay the oracle
  after Python is deleted, so they need a TypeScript regenerator
  (`pnpm fixtures:check` / `pnpm fixtures:accept`, refusing a dirty tree like
  the baselines). Its first run must reproduce the Python-generated files byte
  for byte; after that, an intended bidding change is accepted through both
  the baselines and the fixtures, and the diff is the reviewed artifact.
- 2026-09-20: Deleting `python/` is one commit and reversible with git; the
  parity evidence is in the log above and in the fixture gates.

## Measurements

- Python harness: 956 corpus expectations plus sub-auctions, about 22 s wall on
  4 cores, 83 s CPU (`python -m tests.harness`).
- One decision: median 37 solver checks, max about 220; median 19 ms, max
  about 220 ms with native Z3 (60-hand sample, cold history cache).
- Abstract hand space: 560 distributions, 34,080,840 abstract hands.
- Z3 wasm in Node: one push/add/check/pop cycle on the hand model about
  0.5 to 1.0 ms; module parse 0.24 s, instantiate 0.52 s.
- Fixture export: 1,510 auctions, 13,988 (call, rule) meanings, 1,540
  decisions, 300 random deals. Python: 11 to 14 minutes on 4 processes.
  TypeScript (`pnpm fixtures:check`): about 18 minutes single-threaded, byte
  for byte identical to the Python output.
- Python gates after phase 0: 112 tests, 53 s.
- After phase 8: payload to first bid 3.92 MB gzip (was 9.66 MB); the engine
  and Z3 land in one worker-only chunk of 13.4 MB (3.8 MB gzip); first bid in
  the production build 1.9 to 2.5 s after navigation (was about 20 s); 50
  sequential worker requests in about 10 s. In the Vitest browser run the dev
  server's transform of the 11 MB module costs about 15 s once.
- TypeScript kernel, all rules: `pnpm baseline:check` 77 s wall (Python: 22 s on
  4 processes); the full auction-snapshot gate 242 s, the decisions gate 84 s,
  so `pnpm test` checks every fifth record and `YARBOROUGH_FULL_BASELINE=1
pnpm test` checks all and the byte-for-byte baseline. Corpus average about
  43 ms per decision, slowest 550 ms.
- Z3 wasm in a Chromium module worker (src/z3/z3.worker.ts probe): module load
  about 0.2 s, first check 13 to 18 ms, 0.55 ms per check; the module lands in
  its own worker chunk (13.2 MB raw, 3.6 MiB gzip) and never in the app chunk.
  The existing Pyodide worker needs about 20 s before its first bid.

## Environment notes

- In this container Playwright 1.62.1 expects Chromium build 1234 under
  /opt/pw-browsers but build 1194 is installed. `pnpm test:browser` needs
  symlinks `chromium-1234/chrome-linux64` and
  `chromium_headless_shell-1234/chrome-headless-shell-linux64` pointing at the
  1194 directories, and `CI=1` for headless. Never run `playwright install`.

## Open questions

- (resolved) Z3 tag `z3-5.1.0` exists and is what is built.
- The forcing oracle reads `_history_after_last_call_for(LHO).us.unbid_suits`
  and `OpponentsSilent` walks the history; snapshots pin them only through
  `forced_to_bid` and the calls list. A recorded history answers them from the
  prefix snapshot when it exists and throws otherwise.

## Log

- 2026-09-19: plan and notes written; branch created.
- 2026-09-19: dispatched agents: 0a (worktree, commits), 0b (main tree, no
  commits), 1 (worktree, commits), 2 core types and 2 leads/categories
  (worktrees, commit). The orchestrator merges worktree branches into this
  branch and commits the main-tree work.
- 2026-09-19: phase 0a landed (27f1a4a). Bids on the corpus were already
  seed-independent (seeds 0, 1, 2 identical); the order of negations inside
  meanings was not, and now is Call order. Baseline unchanged.
- 2026-09-19: phases 0b, 1 and 2 landed (c5647c1, 28d7170, a7b7efb, 4117de5).
  All gates green: 438 TypeScript tests, 112 Python tests. Dispatched the DSL
  foundation (phases 3 and 4) and the early harness port (part of phase 7).
- 2026-09-19: harness port landed. `pnpm baseline:check` / `pnpm baseline:accept`
  exist and report that the kernel is missing until phase 6 provides
  `createHarnessBidder`. Two facts recorded by that port: the harness's
  `WARNING: Failed to interpret partner's last bid` branch is unreachable in
  Python (it stringifies before testing for None), and decisions.jsonl has 1,540
  records for 1,536 baseline hands because four identifiers repeat across groups.
- 2026-09-19: Z3 worker probe landed (Chromium browser test). Phase 8 needs no
  Vite config change for the 11 MB module.
- 2026-09-19: phases 3 and 4 landed (364c91f): 550 TypeScript tests green.
  Exemplars agree with the fixtures: 1,650 of 13,988 meaning records, 1,615
  call-to-rule pairs; 35 corpus auctions lack a recorded prefix for the forcing
  oracle and are skipped by the gate.
- 2026-09-19: phase 5 landed in seven batches (cba316c, ddd256e, 5e8f08b,
  b8614c0, 0b6f1c1, b684c92, 4aa176b, plus the reconciliation commit that
  replaced private cross-section copies with imports). The DSL gate now
  registers 217 of 217 rules and matches every meaning record; it takes about
  45 s, so `vite.config.ts` sets `testTimeout: 60000`.
- 2026-09-20: phase 6 landed (3df1d99). The TypeScript bidder reproduces all
  1,510 auction snapshots, all 1,540 decisions and both baseline files byte for
  byte. API: `new Interpreter().createHistory(callHistory)` must be paired with
  `history.release()` (or use `withHistory`); `new Bidder().callSelectionFor`;
  `setBidderLog` captures the Python-style WARNING and COLLISION lines.
  Dispatched the adapter port (rest of phase 7) and the analysis tools
  (part of phase 9).
- 2026-09-20: phase 7 complete (408f89d) and the analysis tools landed
  (c299573). The adapter found a solver leak: interpretation branches that are
  dropped (every legal call in get_call_interpretations, the partner-future in
  the knowledge string) must call `History.releaseBranch()`; Python relied on
  its garbage collector. The adapter corpus gate samples every 15th auction and
  every 10th deal in `pnpm test`; `YARBOROUGH_FULL_BASELINE=1` checks all
  (about 12 minutes). Dispatched phase 8.
- 2026-09-20: phase 8 landed (652419d, fa83100): no Python runtime in the
  product or the toolchain; 853 TypeScript tests green; `pnpm test:production`
  bids in 1.9 s. Dispatched phase 9 in two parts: the fixture regenerator and
  the deletion of `python/` with the CI and docs changes.
- 2026-09-20: phase 9 retirement landed (045dfd8, 6381d99): `python/` is gone,
  `tests/baselines/` holds the accepted output, CI's Python job is replaced by
  `pnpm baseline:check`, and the docs describe the TypeScript workflow. Local
  leftovers to delete after pulling this: `.venv/`, `python/__pycache__/`,
  `vendor/` (no longer ignored). Remaining: the fixture regenerator
  (`pnpm fixtures:check`), then enable its CI step.
- 2026-09-20: phase 9 complete (046d945): the TypeScript regenerator
  reproduces every Python-generated fixture byte for byte, which is the final
  parity proof of the port. CI has a separate `fixtures` job (18 minutes)
  beside `baseline`. Final gates on the branch: 901 Vitest tests, 16 browser
  tests, lint, format, build, `pnpm baseline:check`, `pnpm test:production`.
  The conversion is complete; phase 10 (a bounded solver replacing Z3) stays
  an optional, separate decision.

## Follow-ups worth considering

- Port the four remaining analysis tools (`collisions`, `harness_diff`,
  `triage`, `why_inconsistent`; one line each in the phase 9 log above) if
  they are missed; each is small on top of the kernel.
- Exclude `src/z3/wasm/z3.mjs` from Vite's browser-mode transform (as
  `vite.config.ts` does for Node) to cut about 15 s from `pnpm test:browser`.
- `docs/progress-plan.md` and `docs/practice-ux.md` still cite the old
  Python paths as history; the provenance comments in `src/engine/` ("ported
  from python/...") are kept on purpose for the SAYCBridge attribution.
- The 51 pre-existing cspell hits in `docs/seo-baseline/*.csv` predate this
  work.
