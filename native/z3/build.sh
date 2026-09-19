#!/usr/bin/env bash
# Build Z3 (libz3, single-threaded) to a single-file WebAssembly ES module at
# src/z3/wasm/z3.mjs, the solver behind the TypeScript bidding engine
# (src/z3/z3.ts is the binding).  Reproducible: the Z3 tag and commit, the
# Emscripten version and every flag are pinned here; there are no source
# patches.  Installs nothing globally.
#
#   native/z3/build.sh            # needs emcc on PATH (source emsdk_env.sh)
#
# Single-threaded on purpose (like native/dds/build.sh): a pthreads build
# needs cross-origin isolation headers on the site, and the engine wants a
# synchronous solver check on the worker thread, so nothing may run on
# another thread anyway.  Z3_SINGLE_THREADED drops the locks; Z3_POLLING_TIMER
# keeps a timeout, if one is ever set, from trying to start a thread.
# cspell:ignore fwasm DCMAKE DNDEBUG malloc cwrap HEAPU
set -euo pipefail

Z3_REPOSITORY=https://github.com/Z3Prover/z3.git
Z3_TAG=z3-5.1.0
Z3_SHA=0b6cdcdbc65da25ef0f73ac9da210574d0f66cf8
EMSCRIPTEN_VERSION=6.0.9
JOBS=${JOBS:-4}

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
OUT=$ROOT/src/z3/wasm/z3.mjs
WORK=${Z3_BUILD_DIR:-$ROOT/node_modules/.cache/z3-build}

command -v emcc >/dev/null || { echo "emcc not on PATH: install emsdk $EMSCRIPTEN_VERSION and source emsdk_env.sh" >&2; exit 1; }
have=$(emcc --version | head -1 | sed -E 's/.* ([0-9]+\.[0-9]+\.[0-9]+) .*/\1/')
[ "$have" = "$EMSCRIPTEN_VERSION" ] || echo "warning: emscripten $have, pinned $EMSCRIPTEN_VERSION (the output may differ byte for byte)" >&2

mkdir -p "$WORK"
if [ ! -d "$WORK/z3/.git" ]; then
  git clone -q --branch "$Z3_TAG" --depth 1 "$Z3_REPOSITORY" "$WORK/z3"
fi
got=$(git -C "$WORK/z3" rev-parse HEAD)
[ "$got" = "$Z3_SHA" ] || { echo "z3 $Z3_TAG is $got, expected $Z3_SHA" >&2; exit 1; }

# C++ exceptions are part of Z3's control flow (every API call catches
# z3_exception), so they must work.  -fwasm-exceptions is the native
# WebAssembly exception ABI (Chrome 95, Firefox 100, Safari 15.2, Node 17): it
# is smaller and faster than the JavaScript-trampoline scheme that
# -sDISABLE_EXCEPTION_CATCHING=0 selects, and it is what Z3's own CMake build
# and the Pyodide libz3 the site shipped before this module use.  It must be
# on for every object file and at link time.
CXX_FLAGS="-fwasm-exceptions"
OPT=-Os

# Z3's own CMake adds -Os to its Emscripten link flags; -Os throughout gives an
# 11.2 MB module (3.6 MB gzipped) against 16.7 MB with -O2, at the same solver
# speed on the engine's hand-model checks (about 0.7 ms each in Node).
emcmake cmake -S "$WORK/z3" -B "$WORK/build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_CXX_FLAGS="$CXX_FLAGS" \
  -DCMAKE_CXX_FLAGS_RELEASE="$OPT -DNDEBUG" \
  -DZ3_SINGLE_THREADED=ON \
  -DZ3_POLLING_TIMER=ON \
  -DZ3_BUILD_LIBZ3_SHARED=OFF \
  -DZ3_BUILD_EXECUTABLE=OFF \
  -DZ3_BUILD_TEST_EXECUTABLES=OFF \
  -DZ3_BUILD_PYTHON_BINDINGS=OFF \
  -DZ3_ENABLE_EXAMPLE_TARGETS=OFF \
  -DZ3_BUILD_DOCUMENTATION=OFF \
  -DZ3_INCLUDE_GIT_HASH=OFF \
  -DZ3_INCLUDE_GIT_DESCRIBE=OFF \
  -DZ3_USE_LIB_GMP=OFF
cmake --build "$WORK/build" --target libz3 -j "$JOBS"

# The C API the binding uses (src/z3/z3.ts), plus the shim's handler installer
# and malloc/free for the strings and argument arrays the binding marshals.
EXPORTS=(
  z3_wasm_install_error_handler malloc free
  Z3_mk_config Z3_set_param_value Z3_del_config Z3_mk_context_rc Z3_del_context
  Z3_get_version Z3_get_full_version Z3_set_ast_print_mode
  Z3_get_error_code Z3_get_error_msg
  Z3_inc_ref Z3_dec_ref
  Z3_mk_int_sort Z3_mk_bool_sort Z3_mk_string_symbol Z3_mk_const Z3_mk_int
  Z3_mk_true Z3_mk_false Z3_mk_add Z3_mk_sub Z3_mk_mul
  Z3_mk_eq Z3_mk_distinct Z3_mk_lt Z3_mk_le Z3_mk_gt Z3_mk_ge
  Z3_mk_and Z3_mk_or Z3_mk_not Z3_mk_implies Z3_mk_ite
  Z3_ast_to_string Z3_simplify Z3_is_numeral_ast Z3_get_numeral_int
  Z3_mk_solver_for_logic Z3_solver_inc_ref Z3_solver_dec_ref
  Z3_solver_push Z3_solver_pop Z3_solver_assert Z3_solver_check Z3_solver_reset
  Z3_solver_get_model Z3_model_inc_ref Z3_model_dec_ref Z3_model_eval
)
exported=$(printf '_%s,' "${EXPORTS[@]}")
exported=${exported%,}

mkdir -p "$(dirname "$OUT")"
em++ $OPT $CXX_FLAGS \
  -I"$WORK/z3/src/api" \
  "$HERE/z3_wasm.c" "$WORK/build/libz3.a" \
  -o "$OUT" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createZ3Module \
  -sSINGLE_FILE=1 \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sSTACK_SIZE=16777216 \
  -sENVIRONMENT=web,worker,node \
  -sEXPORTED_FUNCTIONS="$exported" \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString,stringToUTF8,lengthBytesUTF8,getValue,setValue,HEAP32,HEAPU32
echo "built $OUT ($(wc -c < "$OUT") bytes) from z3 $Z3_TAG with emscripten $have"
