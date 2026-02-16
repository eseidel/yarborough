# SAYC Test Harness

This directory contains the integration test harness for the SAYC bidding engine.

## Files

- `harness.rs`: The test runner logic. It iterates over test vectors in `tests/bidding/` and validates the engine's output against corresponding expectations.
- `sayc_standard.expectations.yaml`: A snapshot of the current engine results for the standard bidding suite.
- `sayc_regression.expectations.yaml`: A snapshot of the current engine results for custom regression cases.

### Test Vectors

Test vectors are located in `tests/bidding/`:
- `sayc_standard.yaml`: The primary suite of standard bidding scenarios (over 700 tests).
- `sayc_regression.yaml`: Specific test cases added to prevent regressions of bug fixes or to test new generalized features (e.g., handling second-seat openings).

## How to Run

To run the test harness and compare the engine's current behavior against the recorded expectations for all files:

```bash
cargo test --test harness
```

The test will fail if any test case changes status in any of the test files.

## How to Update Expectations

When you intentionally change the engine logic and want to accept the new results as the official baseline for all suites, run the following command:

```bash
UPDATE_EXPECTATIONS=1 cargo test --test harness
```

This will overwrite the corresponding `<stem>.expectations.yaml` files with the latest results. You can then review the diffs in Git to see how your changes affected the bidding behavior across both the standard and regression suites.

## Why Multi-Call Validation?

The harness doesn't just check the final bid. For every test case, it walks through the entire auction history and verifies that the engine would have made the same calls as recorded in the history for the target hand. The test stops and reports at the **first failure** for each case.
