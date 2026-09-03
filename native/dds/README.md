# DDS for the browser

`src/dds/wasm/dds.mjs` is Bo Haglund's double-dummy solver
([dds-bridge/dds](https://github.com/dds-bridge/dds), Apache-2.0) compiled to
WebAssembly, with the two entry points the site uses wrapped in `dds_wasm.cpp`:

- `dds_calc_table(pbn)`: the full double-dummy table (twenty trick counts).
- `dds_solve_after_lead(pbn, trump, leader, suit, rank)`: declarer's tricks
  after a fixed opening lead, double-dummy from the second card on.

`build.sh` rebuilds it from the pinned DDS tag with the pinned Emscripten
version; `emscripten-hardware.patch` is the one source change. The module is
committed so nobody needs Emscripten to work on the site; rebuild only to move
the DDS version or change the wrapper, and commit the result with the script
change that produced it.

The TypeScript side is `src/dds/`.
