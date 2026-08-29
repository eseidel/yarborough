#!/bin/bash

set -euo pipefail

pnpm format:check
pnpm lint
pnpm test
pnpm test:browser
pnpm test:python
npx cspell --no-progress --dot "**"
pnpm test:production
