#!/usr/bin/env bash
set -euo pipefail

# Local helper to iterate across Kysely versions without committing lockfile changes.

versions=(0.28.8 0.28.7 0.28.6)

for v in "${versions[@]}"; do
  echo "\n=== Testing Kysely ${v} ==="
  pnpm up -D "kysely@${v}"
  pnpm run typecheck
  pnpm test
done
