#!/usr/bin/env bash
# Build Bo Haglund's DDS (double-dummy solver) to a single-file WebAssembly ES
# module at src/dds/wasm/dds.mjs.  Reproducible: the DDS tag, the Emscripten
# version and every flag are pinned here; the one source change is
# emscripten-hardware.patch (DDS's hardware probe has no WebAssembly branch and
# reports zero free memory, which sizes zero solver threads).
#
#   native/dds/build.sh            # needs emcc on PATH (source emsdk_env.sh)
#
# Single-threaded on purpose: a pthreads build needs cross-origin isolation
# headers on the site, and one table plus one solve per completed auction does
# not need more than one thread (a table takes about a third of a second).
set -euo pipefail

DDS_REPOSITORY=https://github.com/dds-bridge/dds.git
DDS_TAG=v2.9.0
DDS_SHA=8d75755c8df81999557758c9757514edb94017bc
EMSCRIPTEN_VERSION=6.0.9

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
OUT=$ROOT/src/dds/wasm/dds.mjs
WORK=${DDS_BUILD_DIR:-$ROOT/node_modules/.cache/dds-build}

command -v em++ >/dev/null || { echo "em++ not on PATH: install emsdk $EMSCRIPTEN_VERSION and source emsdk_env.sh" >&2; exit 1; }
have=$(em++ --version | head -1 | sed -E 's/.* ([0-9]+\.[0-9]+\.[0-9]+) .*/\1/')
[ "$have" = "$EMSCRIPTEN_VERSION" ] || echo "warning: emscripten $have, pinned $EMSCRIPTEN_VERSION (the output may differ byte for byte)" >&2

mkdir -p "$WORK"
if [ ! -d "$WORK/dds/.git" ]; then
  git clone -q --branch "$DDS_TAG" --depth 1 "$DDS_REPOSITORY" "$WORK/dds"
fi
got=$(git -C "$WORK/dds" rev-parse HEAD)
[ "$got" = "$DDS_SHA" ] || { echo "dds $DDS_TAG is $got, expected $DDS_SHA" >&2; exit 1; }
git -C "$WORK/dds" checkout -q -- src
git -C "$WORK/dds" apply "$HERE/emscripten-hardware.patch"

SOURCES=(dds dump ABsearch ABstats CalcTables DealerPar File Init LaterTricks Memory Moves Par
         PlayAnalyser PBN QuickTricks Scheduler SolveBoard SolverIF System ThreadMgr Timer
         TimerGroup TimerList TimeStat TimeStatList TransTableS TransTableL)
files=()
for name in "${SOURCES[@]}"; do files+=("$WORK/dds/src/$name.cpp"); done

mkdir -p "$(dirname "$OUT")"
em++ -O2 -std=c++11 \
  -I"$WORK/dds/include" -I"$WORK/dds/src" \
  "${files[@]}" "$HERE/dds_wasm.cpp" \
  -o "$OUT" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createDdsModule \
  -sSINGLE_FILE=1 \
  -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=8388608 \
  -sENVIRONMENT=web,worker,node \
  -sEXPORTED_FUNCTIONS=_dds_version,_dds_calc_table,_dds_solve_after_lead \
  -sEXPORTED_RUNTIME_METHODS=ccall
git -C "$WORK/dds" checkout -q -- src
echo "built $OUT ($(wc -c < "$OUT") bytes) from dds $DDS_TAG with emscripten $have"
