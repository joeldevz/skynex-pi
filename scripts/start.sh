#!/usr/bin/env bash
# One-command start for skynex-pi.
# Runs doctor.sh first; if all checks pass, launches Pi.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

bash "$SCRIPT_DIR/doctor.sh" || {
  echo ""
  echo "Doctor reported issues. Fix them and retry."
  exit 1
}

echo ""
echo "Launching Pi..."
echo ""

if command -v pi >/dev/null 2>&1; then
  exec pi "$@"
else
  exec ./node_modules/.bin/pi "$@"
fi
