<!-- cspell:ignore Ints asyncio bitvectors ctypes difflib dlopen doctest elementtree functools hashlib hexdigest itertools libz lsprof lzma mmap multibytecodec pathlib pickletools pydoc pyexpat pyrepl satisfiability stdlib termios testbuffer testcapi testclinic testinternalcapi testlimitedcapi tottime tracemalloc unicodedata unsat xxsubtype xxtestfuzz zoneinfo zstd -->

# Payload size analysis

The site shipped **12.7 MB** to the browser before it could bid the first hand.
Slimming the Z3 wheel (the one fix here that needed no change to how the engine
works and no cooperation from the CDN) has taken that to **9.7 MB**. This
document records where the bytes go, what the bidding engine actually uses of
them, what was changed, and what is left.

All "served" figures were measured against `https://saycbridge.com` with
`Accept-Encoding: br, gzip`, so they are real transfer sizes, not disk sizes.

## Status

| Fix                                                   |  Saving | State                       |
| ----------------------------------------------------- | ------: | --------------------------- |
| Drop the duplicate `libz3.so` and the C headers       | 3.03 MB | **done**                    |
| Serve the wheel and stdlib zip compressed             | 1.80 MB | blocked on a CDN check      |
| Pre-compress `pyodide.asm.wasm` at brotli 11          | 0.76 MB | blocked on the same check   |
| Trim `python_stdlib.zip` to the modules that are used | 0.82 MB | wants its own change        |
| Ship DDS as a separate `.wasm`                        | 0.04 MB | wants an Emscripten rebuild |

## What the browser downloads

| Asset                                     |        Was |           Now | Compressed by Cloudflare?  |
| ----------------------------------------- | ---------: | ------------: | -------------------------- |
| `assets/pyodide/pyodide.asm.wasm`         |  3,503,414 |     3,503,414 | brotli                     |
| `assets/z3/z3_solver-…whl`                |  6,046,959 |     3,021,362 | **no** (no content type)   |
| `assets/pyodide/python_stdlib.zip`        |  2,545,564 |     2,545,564 | **no** (`application/zip`) |
| `assets/pyodide/pyodide.asm.mjs`          |    258,732 |       258,732 | brotli                     |
| `assets/pyodide/micropip-…whl`            |    115,486 |       115,486 | **no**                     |
| `assets/index-*.js`                       |     99,341 |        99,341 | brotli                     |
| `assets/z3b.worker-*.js`                  |     97,890 |        97,890 | brotli                     |
| `assets/pyodide/pyodide-lock.json`        |     24,581 |        24,581 | brotli                     |
| `assets/index-*.css`                      |      5,465 |         5,465 | brotli                     |
| `index.html`                              |      1,072 |         1,072 | brotli                     |
| **Total to first bid**                    | 12,698,504 | **9,672,907** |                            |
| `assets/dds.worker-*.js` (first analysis) |    127,204 |       127,204 | brotli                     |
| **Total**                                 | 12,825,708 | **9,800,111** |                            |

Two things stand out. First, Pyodide is now the bulk: CPython plus its standard
library is 6.05 MB of the 9.67 MB, against Z3's 3.02 MB. Second, the two
remaining archive assets — 2.66 MB, 27% of the payload — are still served with
**no compression at all**, because Cloudflare skips archive content types on
the assumption that an archive is already compressed. They are compressed, but
only per-file with `deflate`, which is much weaker than brotli over the whole
stream.

## Inside each blob

### The Z3 wheel — was 6.05 MB, half of it redundant

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

**Fixed.** `scripts/prepare-pyodide-assets.mjs` now slims the wheel after the
checksum-verified download, dropping `libz3.so.5.1` and `z3/include/`, and
`scripts/slim-wheel.mjs` does the zip surgery. Entries that stay keep their
upstream compressed bytes, so the served wheel is a deterministic derivation of
the verified download and is checksum-pinned in turn; its RECORD manifest is
rewritten to match. The served wheel went from 6,046,959 to 3,021,362 bytes,
and Pyodide's virtual filesystem holds 8.2 MB less. `tests/slim-wheel.test.ts`
covers the surgery, and `src/bridge/__tests__/z3b-worker.browser.test.ts`
installs the slimmed wheel in a real Chromium and bids the golden corpus with
it.

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

| Change                                                     | Served after |  Saving | State   |
| ---------------------------------------------------------- | -----------: | ------: | ------- |
| Drop the duplicate `libz3.so.5.1` and `z3/include/*.h`     |    3,021,362 | 3.03 MB | done    |
| …and repack the wheel `ZIP_STORED` so brotli sees the wasm |    2,149,533 | 0.87 MB | blocked |
| Repack `python_stdlib.zip` `ZIP_STORED` + brotli           |    1,613,230 | 0.93 MB | blocked |
| …and trim it to the modules actually imported              |      789,229 | 0.82 MB | open    |
| Pre-compress `pyodide.asm.wasm` at brotli quality 11       |    2,739,674 | 0.76 MB | blocked |
| Ship DDS as a separate `.wasm` instead of `SINGLE_FILE`    |       84,882 | 0.04 MB | open    |

An "…and" row is cumulative for its asset rather than additive with the row
above it. Taking the best row per asset, the remaining Tier 0 work is 3.43 MB,
which would land the payload at about 6.2 MB.

**What was done.** The first row, because it is the only one that neither
depends on how the assets are served nor risks a runtime failure. It is
described under the Z3 wheel above.

**Why the rest is blocked.** Three of the remaining rows need the asset to
arrive brotli-compressed, and that is not a repo-side decision:

- Gzip is no help. A deduplicated wheel is 3,005,419 bytes with `deflate`
  inside it and 3,003,857 as `ZIP_STORED` + gzip — a wash. Only brotli moves
  it, to 2,149,533. So compressing in the worker with `DecompressionStream` is
  not an option either: the stream API supports gzip and deflate, not brotli.
- The win requires `ZIP_STORED`, and that is a bet. A `ZIP_STORED` wheel is
  8,914,259 bytes uncompressed. If Cloudflare compresses it, that is 2,149,533
  over the wire; if it does not, the site regresses by 5.9 MB. Shipping it
  without knowing which is reckless.

Cloudflare picks what to compress by content type. It compresses
`application/wasm`, `text/javascript`, `application/json`, `text/css` and
`text/html` here, and skips `application/zip` and the wheel's missing type.
So the experiment to run on dev.saycbridge.com, before changing anything, is:

1. Set an explicit `Content-Type` on `/assets/z3/*.whl` and
   `/assets/pyodide/python_stdlib.zip` in `public/_headers`.
2. Deploy to preview and check for `content-encoding: br` on both.
3. Only if it appears, switch the repack to `ZIP_STORED`.

Nothing consumes those content types — `micropip` and Pyodide read the bytes —
so step 1 is safe on its own. Whether `_headers` can instead set
`Content-Encoding: br` on a pre-compressed file, which would also capture the
0.76 MB still left on `pyodide.asm.wasm` (Cloudflare's brotli is not quality
11: it serves that file at 3,503,414 where quality 11 gives 2,739,674), is part
of the same experiment.

**Why the stdlib trim is still open.** It is worth 0.82 MB on top of the
compression work and does not depend on it, because trimming shrinks the raw
bytes that are being served uncompressed today. But a module that turns out to
be needed fails at runtime with an `ImportError` rather than at build time, and
possibly only on an error path that no test covers. It deserves its own change
with its own verification, not a ride-along here.

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

- **Saves** the whole Z3 wheel: 3.02 MB today, 2.15 MB once the rest of
  Tier 0 lands.
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

| Approach                       | Payload after | Effort    | Risk of behavior change  |
| ------------------------------ | ------------: | --------- | ------------------------ |
| Where it started               |       12.7 MB | —         | —                        |
| **Today, after the wheel fix** |    **9.7 MB** | done      | none                     |
| Rest of Tier 0                 |       ~6.2 MB | low       | an `ImportError` at most |
| Tier 0 + custom Pyodide build  |   ~5.4–5.9 MB | high      | low, but a fork to carry |
| Tier 0 + bespoke solver (T2)   |       ~4.1 MB | high      | caught by the baselines  |
| TypeScript port (T3a)          |       ~0.3 MB | very high | caught by the baselines  |
| Rust/C++ to wasm (T3b)         |       ~0.5 MB | very high | caught by the baselines  |

## Recommendations

**1. Run the Cloudflare compression experiment next.** It is three steps on
dev.saycbridge.com, it is the cheapest 1.8 MB left anywhere on this list, and
until it is answered three separate fixes stay blocked. It also decides whether
`pyodide.asm.wasm` can be pre-compressed for another 0.76 MB. Nothing else in
Tier 0 should be attempted before this, because the answer changes what the
right repack is.

**2. Then trim `python_stdlib.zip`,** as its own change, with the keep-list
derived from an import trace rather than guessed, and with the browser test
exercising the error paths as well as the happy path. 0.82 MB, and it is the
last of the easy work.

**3. Do not bother with a custom Pyodide or Z3 build.** Both are high effort,
both mean carrying a fork across upstream releases, and the combined win is
smaller than the solver replacement that makes the Z3 fork moot anyway. The one
exception would be if Pyodide upstream ever ships a slimmer distribution — the
`_sqlite3`, CJK-codec and test-only-extension baggage is theirs to drop, and
asking upstream is cheaper than forking.

**4. Treat everything past Tier 0 as one decision, not four.** After Tier 0 the
payload is ~6.2 MB and roughly 6 MB of that is Pyodide and Z3 together. Neither
a custom build nor a bespoke solver changes the order of magnitude; only
leaving Python does. So the real question is not "what else can be shaved" but
"is the engine staying in Python". If the answer is yes, Tier 0 is the end of
the road and 6.2 MB is the number to live with. If the answer is no, the
TypeScript port (T3a) is where the effort belongs, and the intermediate steps
are wasted motion.

**5. The baselines are the asset that makes a rewrite thinkable.**
`python/tests/baselines/` fails on any behavior change at all, so a
reimplemented solver or a ported engine can be validated against the whole
corpus instead of argued about. That is unusual, and it is worth more than any
of the packaging wins. Whatever happens, keep it working.

## Reproducing the measurements

```bash
pnpm install && pnpm assets:prepare && pnpm build

# transfer sizes actually served
curl -sSI -H 'Accept-Encoding: br, gzip' https://saycbridge.com/assets/…

# the duplicate, in the upstream wheel that assets:prepare now slims
python3 -c "import zipfile,hashlib; z=zipfile.ZipFile('vendor/z3/upstream/z3_solver-5.1.0.0-py3-none-pyemscripten_2026_0_wasm32.whl'); print(hashlib.sha256(z.read('z3/lib/libz3.so')).hexdigest() == hashlib.sha256(z.read('z3/lib/libz3.so.5.1')).hexdigest())"

# what is served, next to what was downloaded
ls -l vendor/z3/z3_solver-*.whl vendor/z3/upstream/z3_solver-*.whl

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
