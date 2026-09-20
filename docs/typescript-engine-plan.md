<!-- cspell:ignore satisfiability unsat stdlib credentialless pthread repr sexpr -->

# Plan: the bidding engine in TypeScript, without Python

The bidding engine is vendored Python (`python/core/`, `python/z3b/`) run in the
browser by Pyodide, with Z3 installed from a wheel. This plan removes Python
from the product and the toolchain by porting the engine, its adapter, its
tests and its baseline machinery to TypeScript, **without changing a single
bid**. Progress and decisions are kept in `typescript-engine-notes.md` beside
this file, so the work can be resumed by anyone, including a coding agent that
has lost its context.

## Verdict

Feasible, on one condition: **keep Z3, drop Pyodide.** Every Python-specific
part of the engine is a translation problem with an exact oracle. The bids
themselves are decided by Z3 satisfiability answers, and sat/unsat is a
mathematical fact that does not depend on the solver's version or host, so
re-hosting Z3 as a WebAssembly library called from TypeScript keeps the answers
identical by construction. A hand-written replacement solver is the one part of
the system that could silently change bidding; it is deferred to an optional
last phase with its own acceptance gate.

## What the evidence says

- **Size.** About 14,000 lines of Python. The kernel is under 3,000 lines:
  `python/z3b/bidder.py` (823), `preconditions.py` (619), `constraints.py`
  (532), `rule_compiler.py` (368), `model.py` (309). The rules are about 280
  rule classes and 313 expression sites across `rules.py` (3,560 lines),
  `natural.py` and `cappelletti.py`. Core types (1,160 lines), `categories.py`
  (499), `leads.py` (183), the adapter `yarborough_z3b.py` (445) and the
  harness (445) have no solver dependency.
- **Z3 surface.** `And`, `Or`, `Not`, `If`, `Sum`, integer variables, a
  `QF_LIA` solver with `push`, `pop`, `add`, `check`. Nothing in production
  reads a model or simplifies; those appear only in debugging helpers and one
  test.
- **Workload.** Over a corpus sample, one bidding decision costs a median of
  37 solver checks (at most about 220) and about 19 ms with native Z3. Z3
  already runs as WebAssembly inside Pyodide today, so a direct binding can
  only be faster.
- **Payload.** `payload-size-analysis.md`: Pyodide is 6.05 MB of the 9.67 MB
  shipped before the first bid; Z3 is 3.02 MB. Removing Python removes the
  interpreter start-up, the stdlib zip, micropip and the wheel.
- **The hand model is finite.** Four suit lengths and twenty honor bits give
  about 34 million abstract hands over 560 distributions. A purpose-built
  solver is possible in principle but is a separate decision (phase 10).

## The hosting decision: a single-threaded Z3 build

The npm package `z3-solver` is not the right host:

- it requires `SharedArrayBuffer`, so the site would need cross-origin
  isolation headers, which block the cross-origin GA4 script unless every
  browser honors `credentialless`;
- its `solver.check()` is asynchronous (it runs on a pthread so the main
  thread can interrupt it), which would force the interpreter, its caches and
  every constraint to become async and diverge from the Python structure;
- it is 35 MB unpacked and bundles the wasm as a script that must not be
  bundled.

Instead, follow the DDS precedent (`native/dds/build.sh`): build `libz3`
single-threaded with the pinned Emscripten under `native/z3/`, export the
twenty or so C API functions the engine needs, and wrap them in a thin
**synchronous** TypeScript binding. Z3's own CMake build already supports
`Z3_SINGLE_THREADED=ON`. The port then stays structurally identical to the
Python, line for line. The wasm is committed like `src/dds/wasm/dds.mjs`.

## Semantic hazards a porter must reproduce

These are the places where Python behavior is not obvious from the code. Each
is pinned by a fixture (see "Fixtures") so an agent cannot get them wrong
silently.

1. **Call iteration order.** `RuleSelector.possible_calls_for_hand` iterates
   `history.legal_calls`, a Python `set`, and `PossibleCalls` keeps a maximal
   set under `PriorityOrdering.lt`, which is **not transitive** (a strain of
   `None` is incomparable with a strain, fallback and key only compare in some
   branches). The maximal set can therefore depend on insertion order. The
   harness pins `PYTHONHASHSEED=0` to keep the output stable. TypeScript
   cannot reproduce that order, so **phase 0 makes Python canonical first**
   (sorted calls, sorted rules) and reviews the baseline diff, if any.
2. **Rule registry.** `sayc.py` collects the leaf subclasses of `Rule`; a
   duplicate name is an assertion. DSL fields are joined ancestor-first, only
   from the classes that define them (`_collect_from_ancestors`). Per-call
   dicts may have tuple keys naming several calls.
3. **Categories compare backwards** (`category < existing_category` wins), and
   two rules at the same best category for one call means **no rule** for
   that call (the call is dropped, with a WARNING).
4. **Negations.** The meaning of a call is `Or` over its variants, each `And`
   of the variant's meaning with `Not` of every other possible call's meaning
   that the ordering prefers (`constraints_for_call`). Planning rules are
   never negated.
5. **Knowledge queries are solver searches.** `min_points` is a binary search
   on `points_expr <= n` where the points expression depends on whether the
   last call agreed a suit (`_points_shown_by_last_call`); `max_points` counts
   down `cap == points` from 37; lengths scan 0..12 / 13..1; `is_balanced` is
   `is_certain`. Reproduce the search bounds and predicates exactly.
6. **Collisions.** Several maximal calls are resolved by
   `_production_order` (a bid, then a double or redouble, then a pass; the
   cheapest first), after filtering out planning rules and sorting by name.
7. **Inconsistent histories.** A call no rule explains, or whose meaning is
   unsatisfiable with the history, is appended with no annotations, no
   constraints and no rule; the auction continues.
8. **Assertions.** Constraints and preconditions assert (for example that
   partner's last call is not artificial). An assertion aborts the request.
   Port every assertion as a throw at the same point.
9. **Expression construction.** Python's `sum(list)` starts from the integer
   `0` (so `(+ 0 a ...)` appears in the printed form); Z3's printer flattens
   nested associative operators, so `a + b + c` prints `(+ a b c)` whether
   built binary or n-ary; `z3.And([])` prints `and`. The fixtures print with
   `pp.min_alias_size` raised (no `let` aliases) and whitespace collapsed; the
   TypeScript binding must print the same way. The printed-form fixture forces
   the port to mirror the Python construction, which is the point: it catches
   transcription slips in 313 expression sites.
10. **Ordering helpers.** `Call.__lt__` (passes, doubles, then contracts by
    level then strain), `Strain` order `C D H S N`, the annotations enum order
    (`implies_artificial` is "greater than `Artificial`"), and `sorted(...)`
    on calls in `prefer.py` and `constraints.py`.
11. **Randomness is not behavior.** `Board.random` and `Deal.random` use
    Python's RNG; the TypeScript RNG may differ. Every test pins boards by
    identifier.

## Fixtures: the oracle, generated from Python

**Removed after the port was complete** (after phase 9): the fixtures under
`tests/engine-fixtures/`, their regenerator and every gate that read them were
deleted, because they re-verified the engine against itself once the port was
proven — the SAYC corpus baseline (`pnpm baseline:check`) and the golden cases
in `tests/z3b_golden_cases.json` are the regression test of the engine now —
and they remain in git history. The rest of this section describes them as
they were.

Everything under `tests/engine-fixtures/` is **generated** and never edited by
hand: first by `python -m tests.export_fixtures` from the Python engine, and
since phase 9 by `pnpm fixtures:accept` from the TypeScript engine, whose
first run reproduced the Python files byte for byte. They are checked in so
that the tests run without Python.

| File                      | Contents                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rules-manifest.json`     | Every compiled rule: name, category, purpose (or `"callable"`), known calls, annotations, per-call annotations, fallback, `requires_planning`, `forcing`, explanations, preconditions (`repr`), normalized `prefer` entries.                                                                                                                                                              |
| `vocabulary.json`         | `purposes.ORDER`, `BY_SUIT`, `PREFERENCES`; the annotations enum in order; `categories` levels; the rule categories enum.                                                                                                                                                                                                                                                                 |
| `categories.json`         | The category table and `format_rule_name` for every rule.                                                                                                                                                                                                                                                                                                                                 |
| `model-expressions.json`  | The printed form (`sexpr()`) of every axiom and every named expression in `model.py`.                                                                                                                                                                                                                                                                                                     |
| `auction-snapshots.jsonl` | One record per distinct auction prefix the corpus visits (dealer + calls + vulnerability): the observable state of `History` and its position views (last call, annotations, rule, min/max points, min/max lengths, balanced, bid suits, `bid_suit_naturally`, `first_natural_bidder`, unbid suits, legal calls, last contract, group points), and per legal call: the rule that owns it. |
| `meanings.jsonl`          | Per snapshot, per (call, rule) that passes preconditions: the priority `repr` and a hash of the printed meaning of every variant, and the hash of `constraints_for_call`. Hashes keep the file small; regenerate the text with `python -m analysis.explain` when one differs.                                                                                                             |
| `decisions.jsonl`         | Per corpus expectation: possible calls with priorities, the maximal set, collision, the chosen call and rule.                                                                                                                                                                                                                                                                             |
| `interpretations.jsonl`   | Per snapshot: `get_call_interpretations` output (rule name, description, knowledge string) for every legal call.                                                                                                                                                                                                                                                                          |
| `random-deals.jsonl`      | A seeded set of random deals bid to completion by the engine in all four seats, with the call and rule at every decision, and the opening lead. Covers auctions the SAYC corpus never visits.                                                                                                                                                                                             |
| `core-cases.json`         | Identifier round trips, hand strings, call-history strings and legality, board numbers, dealer and vulnerability, for the core types.                                                                                                                                                                                                                                                     |

The snapshot trick decouples the port: constraints, preconditions and rules
can be tested against recorded history state before the TypeScript
interpreter exists, so rule batches are independently verifiable.

## Phases and gates

Each phase is one or a few pull requests. A phase is done when its gate passes
in CI and the notes file says so. Python stays the reference until phase 9.

| #   | Phase                                                                                                                                                                                                                                                            | Gate                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0a  | Canonical iteration order in the Python bidder.                                                                                                                                                                                                                  | `test_z3b_baseline` passes, or its diff is reviewed and accepted with `check_baseline --accept`.                                                                         |
| 0b  | The fixture exporter and the checked-in fixtures.                                                                                                                                                                                                                | `python -m tests.export_fixtures --check` reproduces the committed files byte for byte.                                                                                  |
| 1   | `native/z3/build.sh`: single-threaded libz3 wasm, pinned tag and Emscripten; `src/z3/` synchronous binding (context, int vars and literals, add, mul, comparisons, and/or/not/ite, solver for QF_LIA, push/pop/assert/check, ast to string, reference counting). | Unit tests: sat/unsat on toy constraints; printed forms match `model-expressions.json` when the model is built through the binding.                                      |
| 2   | Pure core: suit, position, call, call history, call explorer, card, hand, deal, board; `leads`; `categories`.                                                                                                                                                    | Python unit tests translated one to one, plus `core-cases.json`; categories against `categories.json`; leads against the random-deal leads.                              |
| 3   | The hand model (`model.ts`) and the `is_possible` / `is_certain` helpers.                                                                                                                                                                                        | `model-expressions.json` matches exactly.                                                                                                                                |
| 4   | DSL primitives against snapshots: enum, purposes, prefer, `Constraint` classes, `Precondition` classes, `SAYCForcingOracle`.                                                                                                                                     | Every precondition `fits` and every constraint's printed form matches `meanings.jsonl` on a recorded `History`.                                                          |
| 5   | The rules, in the sections `rules.py` lists, plus `natural.py` and `cappelletti.py`; the rule compiler and `PriorityOrdering`.                                                                                                                                   | `rules-manifest.json` matches; per rule, every meaning hash in `meanings.jsonl` matches on recorded histories.                                                           |
| 6   | The kernel: `History`, views, `RuleSelector`, `PossibleCalls`, `Bidder`, `Interpreter`, `HistoryCache`, the solver pool.                                                                                                                                         | `decisions.jsonl` and `auction-snapshots.jsonl` reproduced from scratch (no recorded state).                                                                             |
| 7   | The harness in TypeScript (`pnpm baseline:check` / `pnpm baseline:accept`), the golden cases, the random-deal corpus, the adapter (`engine-core.ts`) and its tests.                                                                                              | The TypeScript harness output equals `python/tests/baselines/*.txt` byte for byte; `interpretations.jsonl`, `random-deals.jsonl` and `tests/z3b_golden_cases.json` pass. |
| 8   | Swap the worker: the module worker calls the adapter directly; remove Pyodide, micropip, the wheel and their asset preparation; update the docs, notices, `CLAUDE.md` and `AGENTS.md`.                                                                           | `pnpm test`, `pnpm test:browser`, `pnpm build` green with no Python asset; the browser test bids the golden corpus with the wasm.                                        |
| 9   | Retire Python: port `analysis/explain` and `analysis/random_deals`; delete `python/`, `test:python` and the venv instructions; move the baselines under `tests/`.                                                                                                | CI has no Python step; the baseline gate runs in TypeScript.                                                                                                             |
| 10  | Optional: a bounded solver replacing the Z3 wasm.                                                                                                                                                                                                                | Differential fuzzing against Z3 on millions of random queries, then the phase 7 gates. A separate decision, not part of the conversion.                                  |

## Working rules for agents

- **Never edit a baseline or a fixture by hand.** Baselines change only through
  `check_baseline --accept`; fixtures only through the exporter.
- **Python is the reference.** When TypeScript and Python disagree, TypeScript
  is wrong until a fixture proves otherwise. A behavior change in Python is a
  separate, reviewed commit with a baseline diff.
- **Mirror the structure.** Same module names, same class names, same method
  names in camelCase, same order of operations. The printed-form fixtures
  reward a literal translation and punish a clever one.
- **Tests before code.** Each port lands with its translated unit tests and its
  fixture test. Vitest tests live in `src/**/__tests__/`.
- **Keep the notes current.** `typescript-engine-notes.md` records what is
  done, what was decided and why, and what to do next, so that a fresh agent
  can continue from the file alone.
- **Model choice.** Design-heavy or semantics-critical tasks (the Z3 build and
  binding, the fixture exporter, the kernel, the first exemplar of each DSL
  class family, debugging a fixture mismatch) go to the strongest model.
  Mechanical translation with a fixture gate (core types, categories, leads,
  rule batches after the exemplar exists, docs) goes to a faster model.

## Conventions for the port

- `src/engine/core/` mirrors `python/core/`; `src/engine/z3b/` mirrors
  `python/z3b/`; `src/engine/leads.ts`, `src/engine/categories.ts`,
  `src/engine/adapter.ts` mirror the top-level modules; `src/z3/` is the
  solver binding; `native/z3/` the build.
- Expressions are built through a small typed layer over the binding that
  offers the same vocabulary as `z3py` (`And`, `Or`, `Not`, `If`, `Sum`,
  `Int`, comparisons and arithmetic as functions), plus a `pySum` that
  reproduces Python's `sum`.
- Hand strings stay C.D.H.S; board identifiers, call strings and knowledge
  strings keep their exact formats because the fixtures compare them.
