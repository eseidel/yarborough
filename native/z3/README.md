# Z3 for the browser

`src/z3/wasm/z3.mjs` is [Z3](https://github.com/Z3Prover/z3) (MIT) compiled to
WebAssembly as a single-file ES module: `libz3` built single-threaded by Z3's
own CMake build, linked in front of `z3_wasm.c`, a shim of one function that
installs a do-nothing error handler. It exports the part of the C API the
bidding engine uses (integer terms, `and`/`or`/`not`/`ite`, comparisons, a
`QF_LIA` solver with push/pop/assert/check, printing, models, reference
counting); `src/z3/z3.ts` is the synchronous TypeScript binding over it and
`src/z3/load.ts` instantiates the module once.

`build.sh` rebuilds it from the pinned Z3 tag with the pinned Emscripten
version. It installs nothing: Emscripten must already be on `PATH`, which
`emsdk` provides with

```sh
git clone https://github.com/emscripten-core/emsdk.git
emsdk/emsdk install 6.0.9 && emsdk/emsdk activate 6.0.9
source emsdk/emsdk_env.sh
native/z3/build.sh
```

The Z3 sources and the CMake tree go under `node_modules/.cache/z3-build`
(override with `Z3_BUILD_DIR`); the compile takes about an hour on four cores
(`JOBS`, default 4). The module is committed so nobody needs Emscripten to
work on the site; rebuild only to move the Z3 version, change the exported
function list or change the shim, and commit the result with the script change
that produced it.

Why not Z3's own JavaScript build or the `z3-solver` npm package: both need
pthreads, hence `SharedArrayBuffer` and cross-origin isolation headers, and
make `solver.check()` asynchronous. The engine wants a synchronous solver on a
plain module worker, like the DDS module in `native/dds/`.
