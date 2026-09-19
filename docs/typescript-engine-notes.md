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

| Phase | State   | Notes                                                  |
| ----- | ------- | ------------------------------------------------------ |
| 0a    | running | canonical iteration order in the Python bidder         |
| 0b    | running | fixture exporter, fixtures checked in                  |
| 1     | running | single-threaded Z3 wasm and `src/z3/` binding          |
| 2     | running | pure core, leads, categories                           |
| 3     | pending | hand model                                             |
| 4     | pending | DSL primitives against snapshots                       |
| 5     | pending | rules, rule compiler, priority ordering                |
| 6     | pending | kernel                                                 |
| 7     | pending | harness, baselines, adapter, golden and random corpora |
| 8     | pending | worker swap, Pyodide removal                           |
| 9     | pending | retire Python                                          |
| 10    | later   | optional bounded solver; separate decision             |

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

## Measurements

- Python harness: 956 corpus expectations plus sub-auctions, about 22 s wall on
  4 cores, 83 s CPU (`python -m tests.harness`).
- One decision: median 37 solver checks, max about 220; median 19 ms, max
  about 220 ms with native Z3 (60-hand sample, cold history cache).
- Abstract hand space: 560 distributions, 34,080,840 abstract hands.

## Open questions

- Which Z3 tag to build: the Pyodide wheel is `z3-solver 5.1.0.0`; build the
  matching `z3-5.1.0` tag if it exists, else the nearest release. Sat/unsat
  does not depend on the version; only speed and the printed form of
  expressions could, and the fixtures will tell.

## Log

- 2026-09-19: plan and notes written; branch created.
- 2026-09-19: dispatched agents: 0a (worktree, commits), 0b (main tree, no
  commits), 1 (worktree, commits), 2 core types and 2 leads/categories
  (worktrees, commit). The orchestrator merges worktree branches into this
  branch and commits the main-tree work.
