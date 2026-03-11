# Agent Workflows

Workflows for validating and fixing PRs locally.

## Quick Reference

| Workflow                | Description                              |
| ----------------------- | ---------------------------------------- |
| `check-lints`           | Check formatting & linting (fast)        |
| `fix-lints`             | Auto-fix formatting issues               |
| `run-tests`             | Run all tests (TypeScript + Rust)        |
| `validate-pr`           | Full validation (mirrors CI)             |
| `update-expectations`   | Update Rust test expectations            |
| `watch-and-fix-ci <pr>` | Watch CI and auto-fix issues iteratively |

## Usage

### Before Pushing

```bash
# Quick check
.agent/workflows/check-lints

# Fix any issues
.agent/workflows/fix-lints

# Full validation
.agent/workflows/validate-pr
```

### After Pushing (Watching CI)

```bash
# Watch PR #28 and auto-fix issues
.agent/workflows/watch-and-fix-ci 28
```

This will:

1. Monitor CI status
2. Auto-fix formatting/linting issues
3. Commit and push fixes
4. Wait for CI to pass

### After Changing Bidding Rules

```bash
# Update test expectations
.agent/workflows/update-expectations

# Review changes
git diff crates/bridge-engine/tests/*.expectations.yaml
```

## Workflow Details

### check-lints

Fast feedback - runs formatting and linting only (no tests):

- TypeScript: prettier check + eslint
- Rust: cargo fmt check + clippy

### fix-lints

Auto-fixes formatting issues:

- TypeScript: runs prettier --write
- Rust: runs cargo fmt

### run-tests

Runs all tests:

- TypeScript: vitest
- Rust: cargo test

### validate-pr

Full validation that mirrors CI:

1. Build WASM
2. Check lints
3. Run tests

### update-expectations

Updates Rust bidding test expectations after rule changes.

### watch-and-fix-ci

Monitors a PR's CI status and automatically fixes common issues:

1. Checks CI status every 15 seconds
2. If lints fail: auto-fixes, commits, and pushes
3. If tests fail: alerts you to fix manually
4. Stops when all checks pass

## Examples

```bash
# Quick development workflow
.agent/workflows/check-lints          # Fast check
.agent/workflows/fix-lints            # Fix issues
.agent/workflows/run-tests            # Test changes

# Before pushing
.agent/workflows/validate-pr          # Full check

# After pushing
.agent/workflows/watch-and-fix-ci 28  # Monitor and auto-fix
```
