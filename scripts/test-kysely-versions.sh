#!/usr/bin/env bash
# Compatibility matrix: peer range is kysely >=0.28.6.
# Exercises every published 0.28.x / 0.29.x release in that range.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Restore the workspace pin when the script exits (success or failure).
RESTORE_VERSION="${RESTORE_KYSELY_VERSION:-0.29.4}"
restore() {
  echo ""
  echo "=== Restoring kysely@${RESTORE_VERSION} ==="
  pnpm up -D -r "kysely@${RESTORE_VERSION}" >/dev/null
}
trap restore EXIT

versions=(
  # 0.28.x (from supported floor)
  0.28.6
  0.28.7
  0.28.8
  0.28.9
  0.28.10
  0.28.11
  0.28.12
  0.28.13
  0.28.14
  0.28.15
  0.28.16
  0.28.17
  # 0.29.x through current
  0.29.0
  0.29.1
  0.29.2
  0.29.3
  0.29.4
)

failed=()

for v in "${versions[@]}"; do
  echo ""
  echo "=== Testing Kysely ${v} ==="
  pnpm up -D -r "kysely@${v}"
  if ! pnpm run typecheck; then
    echo "!!! typecheck failed on kysely@${v}"
    failed+=("${v}:typecheck")
    continue
  fi
  if ! pnpm test; then
    echo "!!! tests failed on kysely@${v}"
    failed+=("${v}:test")
    continue
  fi
  echo "=== OK kysely@${v} ==="
done

echo ""
if ((${#failed[@]})); then
  echo "Failed on: ${failed[*]}"
  exit 1
fi

echo "All kysely versions passed: ${versions[*]}"
