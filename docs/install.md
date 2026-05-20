# Install & Run skynex-pi

> **Status**: Sprint 1 complete (6 core extensions). Ready to test end-to-end.

---

## Requirements

- **Node.js ≥ 20**
- **pnpm** (recommended) or npm
- **neurox** binary in `~/.local/bin` or any standard location (for `neurox_*` tools)
- **Anthropic API key** (Claude) or another supported provider

Optional but recommended:
- `kubectl` if you want the production gate to detect kubectl context
- Git ≥ 2.30

---

## Install

### 1. Clone the repo and check out the sprint-1 branch

```bash
git clone https://github.com/joeldevz/skynex-pi.git
cd skynex-pi
git checkout sprint-1
```

### 2. Install dependencies

```bash
pnpm install
```

This installs Pi locally (`@earendil-works/pi-coding-agent ^0.75.3`) plus `minimatch` and `typebox`.

### 3. Set your API key

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

For persistent use, add it to your shell rc (`~/.bashrc`, `~/.zshrc`, or `~/.config/fish/conf.d/anthropic.fish`).

### 4. (Optional) Install Pi globally

If you want to use `pi` from any directory, install it globally:

```bash
pnpm add -g @earendil-works/pi-coding-agent
```

Otherwise, use the local binary via `./node_modules/.bin/pi` or `npx pi` from inside the repo.

---

## Run

From the skynex-pi directory:

```bash
# If Pi is installed globally:
pi

# If using the local install:
./node_modules/.bin/pi
# or
npx pi
```

On startup you should see notifications from all 6 extensions:

```
🔋 Smart Zone active — warn at 80K, auto-compact at 100K
🛡️  Production Gate active (mode: strict)
🧠 Neurox tools available (binary: /home/.../neurox)
📚 Skill Registry: N skills loaded
... (triage, iron-law load silently — they activate per-message)
```

---

## Verify all 6 extensions loaded

Inside Pi, run:

```text
/triage:status
/iron-law:status
/skills:list
/smart-zone:status
/neurox:status
/production-gate:status
```

Each should return its current state. If any returns an error, see Troubleshooting below.

---

## First-run behavior (important)

The first time you run `pi` from the skynex-pi directory, several things happen:

1. **`.skynex/production-gate.json`** is auto-created with strict defaults. It is auto-added to `.gitignore` (so your real config never leaks).
2. **`.skynex/audit.log`** is created on the first gate trigger. Also auto-gitignored.
3. **`.skynex/skill-registry.json`** is built and cached from your SKILL.md files.

These files live in your local clone but are excluded from git.

---

## Test the production gate (the headline feature)

Once Pi is running:

```text
/production-gate:test "kubectl apply -f deployment.yaml"
```

Expected: `🔴 Would trigger gate: kubectl/kubectl-apply ... severity: high`

```text
/production-gate:test "kubectl get pods"
```

Expected: `✅ Would NOT trigger gate`

To see the gate in action, ask Pi to run a kubectl mutation:

```text
Run kubectl apply -f deploy.yaml please
```

The gate intercepts before execution and shows a typed-confirmation dialog.
Type `yes apply` to proceed, anything else to abort.

---

## Test the Iron Law

```text
/iron-law:status
```

Then ask Pi to write a production-code file without a test:

```text
Create src/utils/format.ts with a function that capitalizes strings
```

The Iron Law extension blocks the write because no `src/utils/format.test.ts` exists yet. Pi sees the error and adapts (writes the test first, then the impl).

---

## Test the triage

```text
/triage:test "fix typo in README.md"
```

Expected: `▪ TRIAGE: SMALL`

```text
/triage:test "rebuild auth with SAML SSO support"
```

Expected: `★ TRIAGE: SUBSTANTIAL` (risk keyword "auth" + "sso").

---

## Customize for your team

### Add safe kubectl contexts to bypass the gate

```text
/production-gate:add-safe staging-cluster
/production-gate:add-safe minikube
```

This writes to `.skynex/production-gate.json` (gitignored — each developer customizes locally).

### Change the production gate mode (logged in audit)

```text
/production-gate:mode warn
```

Modes:
- `strict` (default) — block + typed confirmation
- `warn` — log + show warning, allow
- `silent` — log only
- `off` — disabled

### View the audit trail

```text
/production-gate:audit
/production-gate:audit --category=kubectl
```

The audit log at `.skynex/audit.log` is append-only JSONL, rotated at 50 MB.

---

## Troubleshooting

### "Neurox binary not found"

Install neurox: <https://github.com/Gentleman-Programming/engram> or set `binary_path` in `.skynex/neurox.json`:

```json
{ "binary_path": "/your/custom/path/to/neurox" }
```

### "command not found: pi"

Either install globally (`pnpm add -g @earendil-works/pi-coding-agent`) or use `./node_modules/.bin/pi` from inside the repo.

### Extension fails to load

Check the startup logs. Each extension prints diagnostics on `session_start`. Common issues:
- Missing env var (e.g., `ANTHROPIC_API_KEY`)
- Permission denied on `.skynex/` dir
- TypeScript compile errors in your local edits

Run `pnpm typecheck` to find compile issues:
```bash
pnpm typecheck
```

### Tests should pass before you start

```bash
pnpm test
```

Expected: `175 passing, 0 failing` (Sprint 1 baseline).

---

## What's next

Sprint 1 (this branch) gives you 6 cross-phase infrastructure extensions. Sprint 2 will add the 4 phase extensions for Medium-path workflows (`discover`, `plan`, `build`, `validate`). See `PLAN.md`.

For now you can use skynex-pi as an enhanced Pi with:
- 🛡️ Production safety (Production Gate)
- 🔒 TDD discipline (Iron Law)
- 🧠 Persistent memory (Neurox tools)
- 📚 Skill registry with per-agent subsets
- 🔋 100K-token smart-zone watchdog
- 🎯 Deterministic request triage
