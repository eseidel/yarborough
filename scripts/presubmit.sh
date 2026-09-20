#!/bin/bash

set -euo pipefail

pnpm format:check
pnpm lint
pnpm test
pnpm test:browser
npx cspell --no-progress --dot "**"
pnpm baseline:check
pnpm test:production
