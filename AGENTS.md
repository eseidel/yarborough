## Commands

```bash
pnpm dev              # Start Vite dev server
pnpm build            # Full build: wasm-pack → tsc → vite build
pnpm wasm:dev         # Build Rust WASM crate (debug, fast)
pnpm wasm:build       # Build Rust WASM crate (release, optimized)
pnpm test             # Run Vitest (watches by default)
pnpm test -- --run    # Run Vitest once without watch mode
pnpm lint             # ESLint
pnpm format:check     # Prettier format check
cargo test            # Run all Rust tests
cargo fmt --check     # Rust format check
cargo test -p bridge-core  # Run tests for a single crate
```

## Testing

Write tests for all code changes. Goal is 90% test coverage.

- **TypeScript**: Vitest tests in `src/**/__tests__/*.test.ts`
- **Rust**: Inline `#[cfg(test)]` unit tests; YAML test vectors in `tests/`

## Before Pushing

Run these checks before committing/pushing — CI will reject failures:

```bash
pnpm lint             # ESLint (includes react-refresh rules)
pnpm format:check     # Prettier — fix with: pnpm exec prettier --write .
cargo fmt --check     # Rust formatting
```

## Gotchas

- **verbatimModuleSyntax** is enabled — use `import type { Foo }` or `import { type Foo, bar }` for type-only imports
- **WASM is not auto-rebuilt** by the Vite dev server — run `pnpm wasm:dev` after Rust changes
- **bridge-engine** is currently a stub returning hardcoded data
