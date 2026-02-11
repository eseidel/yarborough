---
description: How to fix a bidding test suite in the bridge engine
---

# Workflow: Fix Bidding Test Suite

This workflow describes the process for identifying, analyzing, fixing, and verifying bidding test suites in the `bridge-engine` crate.

## 1. Identify and Confirm Failures
Locate the failing test suite in the expectations file and confirm the current behavior.

- Use `grep` to find the failing suite in `crates/bridge-engine/tests/*.expectations.yaml`.
- Run the specific test suite to see the failures:
// turbo
```bash
cargo test -p bridge-engine --test harness run_sayc_test_vectors -- --nocapture
```

## 2. Analyze Root Cause
Examine the failing hand(s) and auction context.

- Compare the hand and auction in `tests/bidding/sayc_standard.yaml` against SAYC rules.
- Identify if the issue is:
    - **Missing Rule**: A required bidding sequence is not in the YAML rules.
    - **Constraint Issue**: HCP or length requirements are incorrect.
    - **Priority Conflict**: Multiple rules match, but the lower-priority one is selected.
    - **Engine Bug**: The core evaluation logic in `engine.rs` or `hand.rs` is incomplete (e.g., missing distribution points).

## 3. Plan and Execute Fix
Implement the necessary changes in the code or rule shards.

- **For Logic Changes**: Update `crates/bridge-core/src/hand.rs` or `crates/bridge-engine/src/engine.rs`.
- **For Rule Changes**: Update the relevant YAML shard in `crates/bridge-engine/src/rules/` (e.g., `majors.yaml`, `openings.yaml`).
- **Standard Priorities**:
    - Opening: ~30
    - Responses: ~10-30 (Simple Raise: 25, Limit Raise: 26, Weak Game Jump: 27, GF: 30)
    - Pass: 1

## 4. Verification with Diagnostics
If rule selection or priorities are unclear, add temporary diagnostic logging to `get_best_bid` in `crates/bridge-engine/src/engine.rs`.

- Log matching variants and their priorities.
- Force a clean rebuild if rules are not refreshing:
// turbo
```bash
cargo clean -p bridge-engine
```

## 5. Finalize Expectations
Once the code behaves correctly, update the expectation files.

// turbo
```bash
UPDATE_EXPECTATIONS=1 cargo test -p bridge-engine --test harness run_sayc_test_vectors -- --nocapture
```
- Review the `git diff` of the expectations file to ensure no unintended regressions were introduced.
