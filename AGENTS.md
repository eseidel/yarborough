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

## Bidding Engine Development

### Testing Bidding Logic

**Use YAML expectations, not Rust unit tests for specific bids:**

- Specific bidding scenarios are tested via YAML test vectors in `crates/bridge-engine/tests/`
- When changing bidding logic, run `UPDATE_EXPECTATIONS=1 cargo test --test harness` to update expectations
- Rust unit tests in `inference.rs` should test the inference _mechanism_, not specific bid scenarios

### Debugging Bidding Issues

**Use the debugging tools together:**

1. `cargo run --bin bidder_fight` - finds differences with z3b/kbb
2. `cargo run --bin bidding-debug -- "<board-id>"` - shows why a bid was chosen
3. `cargo run --bin bidding-debug -- "<board-id>" --bid N` - detailed trace for specific bid

**Partner Profile Inference:**

- Lives in `crates/bridge-engine/src/inference.rs`
- Takes MINIMUM HCP/length across all matching rule variants
- To add implicit HCP assumptions (like RuleOfTwenty → 10 HCP), modify the inference logic, NOT the rules themselves
- Modifying opening bid rules changes which hands can open (side effects!)
