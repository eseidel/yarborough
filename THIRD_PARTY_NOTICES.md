# Third-party notices

## SAYCBridge / z3b

`src/engine/` — the bidding engine, its rules, its harness and the expectation
data in `src/engine/harness/sayc_data.ts` — is a TypeScript port of
[SAYCBridge](https://github.com/eseidel/saycbridge) revision `f058f1f`, as
continued in Andrew Bortz's SAYCBridge fork through revision `fba188e`. It is
Copyright (c) 2013 The SAYCBridge Authors and is distributed under the BSD
3-Clause License. The ported files retain the original license header. The
accepted baselines under `tests/baselines/` are derived from the same
sources.

```text
Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.
* Neither the name of Eric Seidel nor the names of its contributors may be
  used to endorse or promote products derived from this software without
  specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## DDS

`src/dds/wasm/dds.mjs` is Bo Haglund's Double Dummy Solver
([dds-bridge/dds](https://github.com/dds-bridge/dds), version 2.9.0) compiled
to WebAssembly by `native/dds/build.sh`, distributed under the
[Apache License 2.0](https://github.com/dds-bridge/dds/blob/develop/LICENSE).
`native/dds/emscripten-hardware.patch` is the one change to its source.

## Z3

`src/z3/wasm/z3.mjs` is `libz3` from Z3 release 5.1.0 (tag `z3-5.1.0`,
[Z3Prover/z3](https://github.com/Z3Prover/z3)) compiled to WebAssembly,
single-threaded, by `native/z3/build.sh`, with no source changes. Z3 is
distributed under the
[MIT License](https://github.com/Z3Prover/z3/blob/master/LICENSE.txt).
