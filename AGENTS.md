## Commands

```bash
pnpm dev              # Start Vite dev server
pnpm build            # Full build: wasm-pack → tsc → vite build
pnpm wasm:build       # Build Rust WASM crate only
pnpm test             # Run Vitest (watches by default)
pnpm test -- --run    # Run Vitest once without watch mode
pnpm lint             # ESLint
cargo test            # Run all Rust tests
cargo test -p bridge-core  # Run tests for a single crate
```

## Testing

Write tests for all code changes. Goal is 90% test coverage.

- **TypeScript**: Vitest tests in `src/**/__tests__/*.test.ts`
- **Rust**: Inline `#[cfg(test)]` unit tests; YAML test vectors in `tests/`

## Gotchas

- **verbatimModuleSyntax** is enabled — use `import type { Foo }` or `import { type Foo, bar }` for type-only imports
- **WASM is not auto-rebuilt** by the Vite dev server — run `pnpm wasm:build` after Rust changes
- **bridge-engine** is currently a stub returning hardcoded data
