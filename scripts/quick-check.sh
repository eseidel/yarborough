#!/usr/bin/env bash
# Quick validation - formatting and linting only (no tests)

set -e

echo "========================================="
echo "Running quick checks (no tests)"
echo "========================================="
echo ""

# TypeScript checks
echo "✨ Checking TypeScript formatting..."
pnpm format:check

echo ""
echo "🔍 Running TypeScript linter..."
pnpm lint

# Rust checks
echo ""
echo "🦀 Checking Rust formatting..."
cargo fmt --check

echo ""
echo "🔍 Running Rust linter (clippy)..."
cargo clippy --all-targets -- -D warnings

echo ""
echo "========================================="
echo "✅ Quick checks passed!"
echo "========================================="
