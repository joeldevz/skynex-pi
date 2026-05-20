#!/usr/bin/env bash
# Pre-flight diagnostic for skynex-pi.
# Verifies that everything is ready BEFORE arranging pi.
# Exits 0 if all checks pass, 1 otherwise.

set -uo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()    { printf "${GREEN}✓${NC} %s\n" "$1"; }
fail()  { printf "${RED}✗${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}⚠${NC} %s\n" "$1"; }
info()  { printf "${BLUE}ℹ${NC} %s\n" "$1"; }

FAIL=0
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || { fail "Cannot enter repo root: $REPO_ROOT"; exit 1; }

echo ""
printf "${BLUE}━━━ skynex-pi doctor ━━━${NC}\n"
echo ""

# ─── 1. Node ─────────────────────────────────────────────────────────────────
if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node --version)"
  NODE_MAJOR="$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')"
  if [ "$NODE_MAJOR" -ge 20 ]; then
    ok "Node $NODE_VERSION (>=20 required)"
  else
    fail "Node $NODE_VERSION is too old. Need >=20."
    FAIL=1
  fi
else
  fail "node not found. Install Node 20+"
  FAIL=1
fi

# ─── 2. Package manager ──────────────────────────────────────────────────────
if command -v pnpm >/dev/null 2>&1; then
  ok "pnpm $(pnpm --version)"
elif command -v npm >/dev/null 2>&1; then
  warn "pnpm not found, falling back to npm $(npm --version)"
else
  fail "Neither pnpm nor npm found"
  FAIL=1
fi

# ─── 3. Pi binary ────────────────────────────────────────────────────────────
PI_CMD=""
if command -v pi >/dev/null 2>&1; then
  PI_CMD="$(command -v pi)"
  PI_VERSION="$(pi --version 2>&1 | tr -d '\n')"
  ok "pi (global): $PI_CMD (v$PI_VERSION)"
elif [ -x "./node_modules/.bin/pi" ]; then
  PI_CMD="./node_modules/.bin/pi"
  PI_VERSION="$(./node_modules/.bin/pi --version 2>&1 | tr -d '\n')"
  ok "pi (local): $PI_CMD (v$PI_VERSION)"
  warn "Pi not in PATH globally. Either install with: pnpm add -g @earendil-works/pi-coding-agent"
  warn "Or use: ./node_modules/.bin/pi"
else
  fail "Pi binary not found. Run: pnpm install (and optionally pnpm add -g @earendil-works/pi-coding-agent)"
  FAIL=1
fi

# ─── 4. Neurox binary ────────────────────────────────────────────────────────
if command -v neurox >/dev/null 2>&1; then
  ok "neurox: $(command -v neurox) ($(neurox --version 2>&1 | head -1))"
else
  warn "neurox binary not in PATH — neurox_* tools will be disabled at runtime"
  warn "Install: https://github.com/Gentleman-Programming/engram or set binary_path in .skynex/neurox.json"
fi

# ─── 5. node_modules / deps ──────────────────────────────────────────────────
if [ -d "node_modules" ]; then
  if [ -d "node_modules/@earendil-works/pi-coding-agent" ]; then
    ok "Dependencies installed (pi-coding-agent present)"
  else
    fail "node_modules exists but pi-coding-agent missing. Run: pnpm install"
    FAIL=1
  fi
else
  fail "node_modules not found. Run: pnpm install"
  FAIL=1
fi

# ─── 6. Pi settings path ─────────────────────────────────────────────────────
if [ -f ".pi/settings.json" ]; then
  ok ".pi/settings.json exists"
  if node -e "JSON.parse(require('fs').readFileSync('.pi/settings.json','utf8'))" 2>/dev/null; then
    ok "  → valid JSON"
  else
    fail "  → .pi/settings.json is not valid JSON"
    FAIL=1
  fi
else
  fail ".pi/settings.json missing"
  FAIL=1
fi

# ─── 7. Extensions present ───────────────────────────────────────────────────
EXTS=(triage iron-law skill-registry smart-zone neurox-tool production-gate)
for ext in "${EXTS[@]}"; do
  if [ -f ".pi/extensions/$ext/index.ts" ]; then
    ok "extension: $ext"
  else
    fail "extension: $ext (missing .pi/extensions/$ext/index.ts)"
    FAIL=1
  fi
done

# ─── 8. AGENTS.md ────────────────────────────────────────────────────────────
if [ -f "AGENTS.md" ]; then
  ok "AGENTS.md present (Pi will scan from cwd)"
else
  warn "AGENTS.md missing — Pi will run without project context"
fi

# ─── 9. Auth state ───────────────────────────────────────────────────────────
HAS_AUTH=0
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  ok "ANTHROPIC_API_KEY exported (length ${#ANTHROPIC_API_KEY})"
  HAS_AUTH=1
fi
if [ -f "$HOME/.pi/agent/auth.json" ]; then
  AUTH_SIZE=$(wc -c < "$HOME/.pi/agent/auth.json")
  if [ "$AUTH_SIZE" -gt 5 ]; then
    ok "~/.pi/agent/auth.json present (probably has /login session)"
    HAS_AUTH=1
  fi
fi
if [ "$HAS_AUTH" -eq 0 ]; then
  warn "No auth detected. You'll need to run /login inside pi (Claude Pro/Max via OAuth)"
  warn "  OR export ANTHROPIC_API_KEY=sk-ant-... before running"
fi

# ─── 10. Tests sanity ────────────────────────────────────────────────────────
if [ -f "node_modules/.bin/tsx" ]; then
  info "Running test suite..."
  if ./node_modules/.bin/tsx --test .pi/extensions/triage/rules.test.ts >/dev/null 2>&1; then
    ok "Smoke test: triage rules pass (run pnpm test for full 175 tests)"
  else
    fail "Smoke test: triage rules failed. Run pnpm test to see details."
    FAIL=1
  fi
else
  warn "tsx not installed — skipping smoke test"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
if [ $FAIL -eq 0 ]; then
  printf "${GREEN}━━━ All checks passed ━━━${NC}\n"
  echo ""
  echo "Next steps:"
  echo "  1. ${PI_CMD:-pi}                                  # arranca Pi"
  echo "  2. /login                                       # OAuth Claude Pro/Max (si querés usar suscripción)"
  echo "  3. /triage:status (y los otros 5 /...:status)   # confirma que las extensions cargan"
  echo ""
  echo "Or just run: bash scripts/start.sh"
  exit 0
else
  printf "${RED}━━━ %s check(s) failed ━━━${NC}\n" "$FAIL"
  echo ""
  echo "Fix the items marked ✗ above and re-run: bash scripts/doctor.sh"
  exit 1
fi
