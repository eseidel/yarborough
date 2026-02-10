# SAYC Test Harness

This directory contains the integration test harness for the SAYC bidding engine.

## Files

- `harness.rs`: The test runner logic. It parses the test vectors from `tests/bidding/standard_bidding_with_sayc.yaml`, simulates the auctions, and validates the engine's output.
- `expectations.yaml`: A snapshot of the current engine results. It tracks which tests are passing and what the failure message is for failing tests.

## How to Run

To run the test harness and compare the engine's current behavior against the recorded expectations:

```bash
cargo test --test harness
```

The test will fail if any test case changes status (e.g., a PASS becomes a FAIL, or a FAIL message changes).

## How to Update Expectations

When you intentionally change the engine logic and want to accept the new results as the official baseline, run the following command:

```bash
UPDATE_EXPECTATIONS=1 cargo test --test harness
```

This will overwrite `expectations.yaml` with the latest results from the engine. You can then review the diff of `expectations.yaml` in Git to see exactly how your changes affected the bidding behavior across the entire suite of over 700 tests.

## Why Multi-Call Validation?

The harness doesn't just check the final bid. For every test case, it walks through the entire auction history and verifies that the engine would have made the same calls as recorded in the history for the target hand. The test stops and reports at the **first failure** for each case.
