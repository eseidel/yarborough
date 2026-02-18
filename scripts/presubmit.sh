#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "🚀 Running presubmit..."

# 1. TypeScript / Web Foundation
echo "--- TypeScript ---"

echo "Building WASM dependencies..."
pnpm wasm:dev

echo "Formatting code (Prettier)..."
pnpm exec prettier --write .
echo "Linting and fixing (ESLint)..."
pnpm exec eslint . --fix

echo "Running TypeScript tests..."
pnpm exec vitest run

# 2. Rust
echo "--- Rust ---"

echo "Running Rust tests..."
cargo test --workspace
echo "Formatting Rust code..."
cargo fmt
echo "Running Clippy with fixes..."
cargo clippy --fix --all-targets --allow-dirty --allow-staged -- -D warnings

echo "✅ Presubmit passed!"
