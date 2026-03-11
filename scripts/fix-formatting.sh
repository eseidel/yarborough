#!/usr/bin/env bash
# Auto-fix formatting issues

set -e

echo "========================================="
echo "Auto-fixing formatting issues"
echo "========================================="
echo ""

echo "✨ Fixing TypeScript formatting..."
pnpm prettier --write .

echo ""
echo "🦀 Fixing Rust formatting..."
cargo fmt

echo ""
echo "========================================="
echo "✅ Formatting fixed!"
echo "========================================="
echo ""
echo "Run './scripts/quick-check.sh' to verify"
