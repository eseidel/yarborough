#!/usr/bin/env bash
# Validate PR locally by running the same checks as CI

set -e

echo "========================================="
echo "Running PR validation checks"
echo "========================================="
echo ""

# TypeScript checks
echo "📦 Building WASM..."
pnpm wasm:dev

echo ""
echo "✨ Checking TypeScript formatting..."
pnpm format:check

echo ""
echo "🔍 Running TypeScript linter..."
pnpm lint

echo ""
echo "🧪 Running TypeScript tests..."
pnpm test -- --run

# Rust checks
echo ""
echo "🦀 Checking Rust formatting..."
cargo fmt --check

echo ""
echo "🔍 Running Rust linter (clippy)..."
cargo clippy --all-targets -- -D warnings

echo ""
echo "🧪 Running Rust tests..."
cargo test

echo ""
echo "========================================="
echo "✅ All checks passed!"
echo "========================================="
