// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The Python engine leans on `assert` to state what it believes about its
// inputs, and an assertion that fires aborts the request. The port keeps every
// assertion at the same point, with the same condition, as a thrown Error.
export function assert(
  condition: unknown,
  message?: string,
): asserts condition {
  if (!condition) {
    throw new Error(message ?? "Assertion failed");
  }
}
