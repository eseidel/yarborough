<!-- cspell:ignore unsat -->

# Notes: the TypeScript engine port

Running notes for `typescript-engine-plan.md`. Whoever continues the work
(person or agent) reads this first, then the plan. Keep it current: status,
decisions, and the next action.

## How to resume

1. `git checkout claude/bidding-engine-python-typescript-tj1h1x` and read the
   "Status" table below; the first row that is not `done` is the next work.
2. Environment: `pnpm install`; `python3 -m venv .venv && .venv/bin/python -m pip install -e ./python`
   (Python stays the reference until phase 9). Emscripten for the Z3 build is
   installed by `native/z3/build.sh` instructions once phase 1 lands.
3. The Python checks that must stay green while Python is the reference:
   `pnpm test:python` (includes the baseline gate). The TypeScript checks:
   `pnpm test`, `pnpm lint`, `pnpm format:check`, `npx cspell --no-progress --dot "**"`, `pnpm build`.
4. Commit per phase on this branch. Update this file in the same commit.

## Status

| Phase | State   | Notes                                                       |
| ----- | ------- | ----------------------------------------------------------- |
| 0a    | done    | canonical order in the bidder; baseline unchanged (27f1a4a) |
| 0b    | running | fixture exporter, fixtures checked in                       |
| 1     | running | single-threaded Z3 wasm and `src/z3/` binding               |
| 2     | running | pure core, leads, categories                                |
| 3     | pending | hand model                                                  |
| 4     | pending | DSL primitives against snapshots                            |
| 5     | pending | rules, rule compiler, priority ordering                     |
| 6     | pending | kernel                                                      |
| 7     | pending | harness, baselines, adapter, golden and random corpora      |
| 8     | pending | worker swap, Pyodide removal                                |
| 9     | pending | retire Python                                               |
| 10    | later   | optional bounded solver; separate decision                  |

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

## Measurements

- Python harness: 956 corpus expectations plus sub-auctions, about 22 s wall on
  4 cores, 83 s CPU (`python -m tests.harness`).
- One decision: median 37 solver checks, max about 220; median 19 ms, max
  about 220 ms with native Z3 (60-hand sample, cold history cache).
- Abstract hand space: 560 distributions, 34,080,840 abstract hands.
- Z3 wasm in Node: one push/add/check/pop cycle on the hand model about
  0.5 to 1.0 ms; module parse 0.24 s, instantiate 0.52 s.
- Fixture export: 1,510 auctions, 13,988 (call, rule) meanings, 1,540
  decisions, 300 random deals; 11 to 14 minutes wall; `--check` as long again.
- Python gates after phase 0: 112 tests, 53 s.

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
