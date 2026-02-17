```bash
pnpm test
pnpm format:check
cargo test
cargo fmt --check
```

Write tests for all code changes. Goal is 90% test coverage.
Do not use manual testing. Write automated tests instead.

- **TypeScript**: Vitest tests in `src/**/__tests__/*.test.ts`
- **Rust**: Inline `#[cfg(test)]` unit tests; YAML test vectors in `tests/`

## Conventions

**Hand string format is C.D.H.S** (Clubs.Diamonds.Hearts.Spades), matching `Suit::ALL` order. Example: `"AK.J.T8753.JT432"` = AK clubs, J diamonds, T8753 hearts, JT432 spades.

## Bidding Engine Development

### Testing Bidding Logic

**YAML test vectors:**

- `sayc_standard.yaml` is from the SAYC book — **never change expected bids**, only annotate failures with reasons
- Other YAML files (e.g. `sayc_regression.yaml`) are fine to update as bidding logic evolves
- When changing bidding logic, run `UPDATE_EXPECTATIONS=1 cargo test --test harness` to update expectations
- Rust unit tests in `inference.rs` should test the inference _mechanism_, not specific bid scenarios

**z3b is a reference implementation, not ground truth:**

- z3b (`sayc.abortz.net`) is the state-of-the-art SAYCBridge implementation — use it as a reference but it has its own bugs
- kbb (`saycbridge.com`) is the old original implementation, not authoritative
- Over time yarborough will intentionally diverge from z3b where we're more correct

### Debugging Bidding Issues

**Use the debugging tools together:**

1. `cargo run --bin bidder_fight -- -n 200 -s <seed>` - batch comparison against z3b with categorized statistics
2. `cargo run --bin bidding-debug -- "<board-id>"` - shows why a bid was chosen
3. `cargo run --bin bidding-debug -- "<board-id>" --bid N` - detailed trace for specific bid

**Partner Profile Inference:**

- Lives in `crates/engine/src/inference.rs`
- Takes MINIMUM HCP/length across all matching rule variants
- To add implicit HCP assumptions (like RuleOfTwenty → 10 HCP), modify the inference logic, NOT the rules themselves
- Modifying opening bid rules changes which hands can open (side effects!)
