```bash
pnpm test
cargo test
cargo fmt --check
```

Write tests for all code changes. Goal is 90% test coverage.
Do not use manual testing. Write automated tests instead.

- **TypeScript**: Vitest tests in `src/**/__tests__/*.test.ts`
- **Rust**: Inline `#[cfg(test)]` unit tests; YAML test vectors in `tests/`
