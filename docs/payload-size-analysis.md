<!-- cspell:ignore Ints asyncio bitvectors ctypes difflib dlopen doctest elementtree functools hashlib hexdigest itertools libz lsprof lzma mmap multibytecodec pathlib pickletools pydoc pyexpat pyrepl satisfiability stdlib termios testbuffer testcapi testclinic testinternalcapi testlimitedcapi tottime tracemalloc unicodedata unsat xxsubtype xxtestfuzz zoneinfo zstd -->

# Payload size analysis

The site ships about **12.7 MB** to the browser before it can bid the first
hand. This document measures where those bytes go, what the bidding engine
actually uses of them, and what the realistic options are for making the
number smaller. Nothing here has been changed; it is a study.

All "served" figures were measured against `https://saycbridge.com` with
`Accept-Encoding: br, gzip`, so they are real transfer sizes, not disk sizes.

## What the browser downloads today

| Asset                                     |         Served | Compressed by Cloudflare?  |
| ----------------------------------------- | -------------: | -------------------------- |
| `assets/z3/z3_solver-…whl`                |      6,046,959 | **no** (no content type)   |
| `assets/pyodide/pyodide.asm.wasm`         |      3,503,414 | brotli                     |
| `assets/pyodide/python_stdlib.zip`        |      2,545,564 | **no** (`application/zip`) |
| `assets/pyodide/pyodide.asm.mjs`          |        258,732 | brotli                     |
| `assets/pyodide/micropip-…whl`            |        115,486 | **no**                     |
| `assets/index-*.js`                       |         99,341 | brotli                     |
| `assets/z3b.worker-*.js`                  |         97,890 | brotli                     |
| `assets/pyodide/pyodide-lock.json`        |         24,581 | brotli                     |
| `assets/index-*.css`                      |          5,465 | brotli                     |
| `index.html`                              |          1,072 | brotli                     |
| **Total to first bid**                    | **12,698,504** |                            |
| `assets/dds.worker-*.js` (first analysis) |        127,204 | brotli                     |
| **Total**                                 | **12,825,708** |                            |

Two things stand out before looking inside anything. First, the Z3 wheel alone
is 48% of the payload. Second, the three `.whl`/`.zip` assets — 8.7 MB, 69% of
the total — are served with **no compression at all**, because Cloudflare skips
archive content types on the assumption that an archive is already compressed.
They are compressed, but only per-file with `deflate`, which is much weaker
than brotli over the whole stream.

## Inside each blob

### The Z3 wheel — 6.05 MB, roughly half of it redundant

| Entry                 | Uncompressed |  In wheel |
| --------------------- | -----------: | --------: |
| `z3/lib/libz3.so`     |    8,233,780 | 2,909,901 |
| `z3/lib/libz3.so.5.1` |    8,233,780 | 2,909,901 |
| `z3/z3.py`            |      367,434 |    65,700 |
| `z3/include/*.h` (27) |      635,809 |   111,495 |
| `z3/z3core.py`        |      207,924 |    19,739 |
| everything else (13)  |      103,295 |    25,005 |

`libz3.so` and `libz3.so.5.1` are **byte-identical** (sha256
`561d5c4d…63bb1`). The wheel carries the same 8.2 MB WebAssembly module twice,
which costs 2.91 MB of transfer and 8.2 MB of Pyodide virtual-filesystem
memory, because `micropip` unpacks both. Only one is ever `dlopen`ed.

The `z3/include/*.h` C headers are another 111 KB in the wheel and are
meaningless in a browser: nothing compiles against Z3 at runtime.

`libz3.so` itself is 93.1% `code` section, 5.8% `data`. It is already stripped
— there is no name or DWARF section to remove.

### `pyodide.asm.wasm` — 9.6 MB on disk, 3.5 MB served

| Section  |     Bytes | Share |
| -------- | --------: | ----: |
| `code`   | 5,849,140 | 60.9% |
| `data`   | 3,335,328 | 34.7% |
| `export` |   349,420 |  3.6% |
| rest     |    64,330 |  0.7% |

This is CPython 3.14.2 plus every C extension module Pyodide builds in. Scanning
its `PyInit_*` symbols shows what is along for the ride:

- `_sqlite3` — a whole SQL database engine
- `_testbuffer`, `_testcapi`, `_testcapi_datetime`, `_testclinic`,
  `_testclinic_limited`, `_testinternalcapi`, `_testlimitedcapi`, `_xxtestfuzz`,
  `xxsubtype` — CPython's **test-only** C extensions, shipped to production
- `_codecs_cn`, `_codecs_hk`, `_codecs_jp`, `_codecs_kr`, `_codecs_tw`,
  `_codecs_iso2022`, `_multibytecodec` — CJK codec tables
- `unicodedata`, `_zstd`, `_lzma`, `_bz2`, `pyexpat`, `_elementtree`, `_socket`,
  `_zoneinfo`, `_remote_debugging`, `_lsprof`, `_tracemalloc`, `mmap`,
  `termios`, `_csv`, `_pickle`, `_sha3`, `_blake2`

The bidding engine touches none of them.

### `python_stdlib.zip` — 2.55 MB served, mostly unused

Largest packages by compressed size: `encodings` 317 KB, `asyncio` 130 KB,
`email` 107 KB, `multiprocessing` 82 KB, `xml` 75 KB, `_pyrepl` 70 KB,
`unittest` 64 KB, `importlib` 63 KB, `http` 63 KB, `logging` 50 KB, then
`pdb.py`, `doctest.py`, `pydoc.py`, `tarfile.py`, `xmlrpc`, `difflib.py`,
`argparse.py`, `pickletools.py`.

Tracing a real `find_call_for` shows the engine loads **128 modules**, 90 of
them top-level, and the genuinely needed set is small: `re`, `json`,
`collections`, `functools`, `itertools`, `math`, `random`, `copy`, `enum`,
`typing`, `ctypes` (Z3's binding), `decimal` and `fractions` (pulled in by Z3),
`zipfile`/`zlib` (module loading), `os`, `io`, `pathlib`, `encodings`. Pyodide
itself additionally needs `asyncio`, and `micropip` needs `urllib` and
`importlib`.

### `dds.mjs` — 368 KB on disk, 127 KB served

Built by `native/dds/build.sh` with `-sSINGLE_FILE=1`, so the 278,498-byte
WebAssembly module is embedded in the JavaScript as a one-byte-per-character
string and bundled into `dds.worker-*.js`. That embedding costs about 20%:

| Form                              |     Raw |  brotli |
| --------------------------------- | ------: | ------: |
| the wasm alone, as a `.wasm` file | 278,498 |  84,882 |
| `dds.mjs` (single file)           | 367,927 | 103,519 |
| `dds.worker-*.js` as shipped      | 404,856 | 105,774 |

The module is 92.6% `code` and already stripped. At 127 KB served it is 1% of
the payload, so it is not where the problem is.

## What the engine actually uses

### The Z3 API surface is fifteen names

Across `python/z3b/` and `python/yarborough_z3b.py`, the entire use of Z3 is:

```
z3.And (149)  z3.Or (75)   z3.Not (11)  z3.BoolVal (10)  z3.Ints (6)
z3.Int (5)    z3.simplify (2)  z3.Sum (2)  z3.If (2)  z3.Implies (1)
z3.SolverFor('QF_LIA')  z3.sat  z3.unsat  z3.is_true  z3.ExprRef
```

`QF_LIA` is quantifier-free linear integer arithmetic — the weakest useful
fragment Z3 offers. Everything else Z3 can do (bitvectors, arrays, strings,
floating point, quantifiers, Horn clauses, optimization, nonlinear arithmetic)
is dead weight.

### The model is a small bounded-integer problem

`python/z3b/model.py` declares roughly forty integer variables, and every one of
them has a tiny finite domain:

- four suit lengths, `0..13`, summing to 13
- twenty honor indicators (ace/king/queen/jack/ten per suit), `0..1`
- `high_card_points` `0..37`, plus `points`, `playing_points`, `length_points`
- four `points_supporting_*`
- twelve `void_in_*` / `singleton_in_*` / `doubleton_in_*` indicators, `0..1`
- `voids`, `singletons`, `doubletons`

Everything except the four lengths and the twenty honor bits is functionally
determined by them. The whole universe is

> 560 suit-length shapes × honor patterns with honors ≤ length
> = **34,080,840 states**, about 2^25.

A bitset over that universe is 4.26 MB, so brute-force enumeration is not
automatically the answer, but it does mean the problem is finite and small —
this is a constraint-propagation problem, not an SMT problem. The queries are
only `is_possible` and `is_certain`, i.e. satisfiability, with `push`/`pop`
around an incrementally built constraint set. No models are extracted in the
hot path.

### Where the time goes

A native run (CPython 3.11, native Z3) over 40 random deals, 347 calls:

- **37 ms per call**, ~40 `Solver.check()` calls per bid, 370 µs per check
- profiling 8.385 s of that work attributes it as:
  - **1.69 s (20%)** — `Z3_solver_check_assumptions`, the actual solving
  - **~3.05 s (36%)** — Z3's Python binding: `ctypes` marshalling,
    `Z3_sort_to_ast`, `as_ast`, `inc_ref`/`dec_ref`, `push`/`pop`, and the
    `Check` error wrapper called 694,501 times
  - **~3.6 s (44%)** — the engine's own Python, mostly
    `rule_compiler._fits_preconditions` and memoization

Only a fifth of bidding time is SMT solving. Over a third is the cost of
talking to Z3 through `ctypes` — which is materially worse under Pyodide than
it is natively. This matters for the options below: removing Z3 removes far
more work than the solver itself represents.

## Options

### Tier 0 — packaging only, no engine change

These are measured, not estimated, and none of them changes a single bid.

| Change                                                     | Served after |  Saving |
| ---------------------------------------------------------- | -----------: | ------: |
| Drop the duplicate `libz3.so.5.1` and `z3/include/*.h`     |    3,022,171 | 3.02 MB |
| …and repack the wheel `ZIP_STORED` so brotli sees the wasm |    2,149,533 | 3.90 MB |
| Repack `python_stdlib.zip` `ZIP_STORED` + brotli           |    1,613,230 | 0.93 MB |
| …and trim it to the modules actually imported              |      789,229 | 1.76 MB |
| Pre-compress `pyodide.asm.wasm` at brotli quality 11       |    2,739,674 | 0.76 MB |
| Ship DDS as a separate `.wasm` instead of `SINGLE_FILE`    |       84,882 | 0.04 MB |

Each saving is measured against what that asset costs today, and an "…and" row
is cumulative for its asset rather than additive with the row above it. Taking
the best row per asset gives 5.63 MB, or 6.46 MB with the stdlib trim.

Two notes on mechanism. The wheel and the stdlib zip are served uncompressed
today purely because of their content type; the repack only pays off if they
are also served under a type Cloudflare compresses, or pre-compressed. And
Cloudflare's own brotli is not quality 11 — it serves `pyodide.asm.wasm` at
3,503,414 bytes where quality 11 gives 2,739,674, so 0.76 MB is available just
from compressing the artifact at build time.

Taken together, Tier 0 lands at roughly **7.0 MB** without trimming the stdlib,
or **6.2 MB** with it — a 44–51% reduction with no change to how the engine
works. The stdlib trim is the only item here with real risk, since a missing
module surfaces as a runtime `ImportError` rather than a build failure.

### Tier 1 — custom builds of the same components

**A custom Pyodide build.** Dropping `_sqlite3`, the CJK codecs, the nine
test-only extensions, `unicodedata`, `_zstd`/`_lzma`/`_bz2`, `pyexpat`/
`_elementtree`, `_socket` and `_zoneinfo` from CPython would remove a
meaningful slice of the 9.6 MB. I have not built it, so this is an estimate:
plausibly 1–2 MB raw, 0.3–0.8 MB compressed. The cost is the real problem —
the project currently pins an upstream npm package and verifies checksums, and
this replaces that with a forked build to maintain across Pyodide releases.

**A custom `libz3` build.** `-Oz` and LTO, plus excluding components the
`QF_LIA` path never reaches, would shrink the 8.2 MB module. Z3's build system
is not designed for fine-grained theory exclusion, so this is speculative and
the maintenance story is similar to the above. Probably not worth it on its own
given Tier 2 exists.

### Tier 2 — replace Z3 with a purpose-built solver

The measurements above make a strong case that Z3 is enormously oversized for
this job: fifteen API names, one logic fragment, forty bounded variables, a
34-million-state universe, and satisfiability-only queries. A dedicated
decision procedure — interval propagation over the bounded domains with search,
or a BDD over the shape/honor universe — is a few thousand lines.

- **Saves** the whole Z3 wheel: 2.15 MB after Tier 0, 6.05 MB today.
- **Also saves** the 36% of bid time spent in `ctypes` marshalling, which is
  worse under Pyodide than in the native profile.
- **Risk** is the obvious one: it must agree with Z3 on every hand. The repo is
  unusually well set up for this — `python/tests/baselines/` plus
  `python/tests/test_z3b_baseline.py` fail on _any_ behavior change, so a
  replacement solver can be validated against the full corpus rather than
  argued about.
- **Does not** remove Pyodide, which is still the larger half of the payload.

### Tier 3 — leave Python entirely

Porting the engine off Python removes Pyodide _and_ Z3 together. The engine is
8,671 lines — 7,511 in `python/z3b/` and 1,160 in `python/core/` — and 353 KB
of `.py` source is currently inlined into `z3b.worker-*.js` anyway. The bulk is
`rules.py` (3,560 lines), which is a declarative rule table: tedious to port
but mechanical.

**(a) TypeScript port with a bespoke solver.** The payload becomes app code:
no Pyodide, no Z3, no wasm for bidding at all. Estimating from the source size,
the whole engine would land somewhere around 100–200 KB brotli, so the site
would ship well under 0.5 MB including DDS — call it a **25× reduction**. It
keeps everything in the toolchain the repo already has, makes the engine
debuggable in browser devtools, and removes the worker's Pyodide startup
entirely. It is also by far the most work.

**(b) Rust or C++ compiled to wasm.** Probably 300–500 KB brotli with the
solver embedded, and the fastest of all the options. The repo already has a
native toolchain precedent in `native/dds/`, so the build pattern is familiar.
It costs a second language and a compile step that contributors need, and it
keeps the engine harder to inspect than (a).

Between the two, (a) is the better fit for this codebase: the engine is
branch-heavy rule evaluation over tiny integers, not number-crunching, so the
performance argument for (b) is weaker than it looks, and the DDS module
already demonstrates how much friction a pinned Emscripten toolchain adds.

### Not an option

A server-side bidding fallback is ruled out by design — the site is
client-only, and board data and auction state never leave the browser.

## Trade-offs at a glance

| Approach                      | Payload after | Effort    | Risk of behavior change  |
| ----------------------------- | ------------: | --------- | ------------------------ |
| Today                         |       12.7 MB | —         | —                        |
| Tier 0, no stdlib trim        |       ~7.0 MB | low       | none                     |
| Tier 0, with stdlib trim      |       ~6.2 MB | low       | runtime `ImportError`s   |
| Tier 0 + custom Pyodide build |   ~5.4–5.9 MB | high      | low, but a fork to carry |
| Tier 0 + bespoke solver (T2)  |       ~4.1 MB | high      | caught by the baselines  |
| TypeScript port (T3a)         |       ~0.3 MB | very high | caught by the baselines  |
| Rust/C++ to wasm (T3b)        |       ~0.5 MB | very high | caught by the baselines  |

The shape of the decision is that Tier 0 is close to free and cuts the payload
roughly in half, Tier 2 halves it again but only pays off after Tier 0, and
Tier 3 is the only thing that changes the order of magnitude. If the goal is
"the site should not ship 12 MB", Tier 0 answers it this week. If the goal is
"the site should feel like a web page", only Tier 3 gets there.

## Reproducing the measurements

```bash
pnpm install && pnpm assets:prepare && pnpm build

# transfer sizes actually served
curl -sSI -H 'Accept-Encoding: br, gzip' https://saycbridge.com/assets/…

# wheel contents and the duplicate
python3 -c "import zipfile,hashlib; z=zipfile.ZipFile('vendor/z3/z3_solver-5.1.0.0-py3-none-pyemscripten_2026_0_wasm32.whl'); print(hashlib.sha256(z.read('z3/lib/libz3.so')).hexdigest() == hashlib.sha256(z.read('z3/lib/libz3.so.5.1')).hexdigest())"

# the Z3 API surface the engine uses
grep -rhoE '\bz3\.[A-Za-z_]+' python/z3b python/yarborough_z3b.py | sort | uniq -c | sort -rn

# where bidding time goes: bid random deals under cProfile, sorted by tottime,
# with z3.Solver.check wrapped to count calls
.venv/bin/python -m pip install -e ./python   # native CPython + native Z3
```

The timing and profile figures came from a throwaway script that deals random
boards with a fixed seed, bids each auction to completion through
`Bidder.find_call_for`, and runs the loop under `cProfile`. It is not checked
in; the numbers are reported here so the conclusions can be re-derived rather
than taken on trust.
