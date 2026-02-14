# Development Scripts

Scripts to help validate changes locally before pushing.

## PR Validation

### Full Validation (mirrors CI exactly)

Runs all checks including tests - same as CI:

```bash
./scripts/validate-pr.sh
```

This runs:

- TypeScript: formatting, linting, tests
- Rust: formatting, linting, tests

### Quick Check (fast feedback)

Runs formatting and linting only (no tests):

```bash
./scripts/quick-check.sh
```

Useful for quick feedback while developing.

### Auto-fix Formatting

Automatically fix formatting issues:

```bash
./scripts/fix-formatting.sh
```

Then run `./scripts/quick-check.sh` to verify.

## Usage Workflow

1. **While developing**: Use `./scripts/quick-check.sh` for fast feedback
2. **Before committing**: Run `./scripts/validate-pr.sh` to ensure all tests pass
3. **If formatting fails**: Run `./scripts/fix-formatting.sh` to auto-fix

## CI Equivalence

These scripts run the same checks as GitHub Actions CI:

| Script              | CI Job            | Checks                     |
| ------------------- | ----------------- | -------------------------- |
| `validate-pr.sh`    | TypeScript + Rust | All checks including tests |
| `quick-check.sh`    | -                 | Formatting + linting only  |
| `fix-formatting.sh` | -                 | Auto-fix formatting issues |
