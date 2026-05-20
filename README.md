# skynex-pi

> Pi-based evolution of [skynex](https://github.com/joeldevz/skynex) for engineering teams.
> Status: **design phase**. Code follows.

---

## What this is

skynex-pi is the second generation of skynex, built on [Pi](https://pi.dev) instead of OpenCode. The change of harness is deliberate: Pi exposes TypeScript hooks that let us enforce discipline in **code** instead of asking models to follow **prompts**.

This repo will eventually contain:
- ~6 core infrastructure extensions (TypeScript)
- ~9 phase extensions for the Substantial workflow path
- ~6 skills migrated from skynex
- 4 phase extensions for the Medium workflow path
- Team-oriented onboarding scripts

**Right now this repo only contains the design.** Implementation is sprint-by-sprint, tracked in `PLAN.md`.

---

## Why Pi instead of OpenCode

The skynex (OpenCode) repo has 10 agents defined as JSON prompts. The Iron Law lives as a paragraph the model "should" follow. The smart-zone budget lives as a markdown file the model is asked to respect. The dual-judge security review depends on the model not skipping it.

In Pi:
- **Iron Law is a hook**. It blocks the `write` tool when no failing test exists. The model cannot rationalize past it.
- **Smart zone is a hook**. It reads actual token counts from session state and triggers compaction automatically.
- **Production gate is a hook**. It blocks `kubectl apply` and asks for typed confirmation before execution.
- **Skill registry is code**. Per-agent compact rules, lazy loaded, cached by hash.

For an engineering team this matters because guarantees become deterministic. A junior dev cannot accidentally bypass safety. A senior dev cannot rush past Iron Law because the code says no.

---

## Architecture

```
skynex-pi/
├── extensions/
│   ├── core/                # Cross-phase infra hooks (Sprint 1)
│   │   ├── triage.ts            # Routes requests to small/medium/substantial path
│   │   ├── iron-law.ts          # L4 TDD enforcement (always-on, whitelist-based)
│   │   ├── skill-registry.ts    # Per-agent compact rules, lazy + cached
│   │   ├── smart-zone.ts        # 80K warn, 100K hard cap with auto-compact
│   │   ├── neurox-tool.ts       # Wraps neurox CLI as Pi tools
│   │   └── production-gate.ts   # Blocks kubectl/migrations/etc. before exec
│   │
│   ├── phases/              # Workflow phase extensions (Sprint 2-3)
│   │   ├── medium/              # 4-phase flow (discover, plan, build, validate)
│   │   └── substantial/         # 9-phase flow (calibrate, explore, propose, ...)
│   │
│   └── automation/          # Sprint 4
│       ├── afk-runner.ts        # Non-interactive pipelines
│       └── status-bar.ts        # Live status (tokens, cost, model, phase)
│
├── .pi/
│   ├── agents/
│   │   ├── AGENTS.md            # Project-wide context for all Pi agents
│   │   └── settings.json        # Pi configuration (extensions, skills paths)
│   ├── skills/                  # Skills migrated from skynex (same MD format)
│   ├── extensions/              # Pi auto-discovery dir (symlinks to ../extensions)
│   └── prompts/                 # /command shortcuts
│
├── docs/
│   ├── design/                  # Canonical design docs (this is the source of truth)
│   │   ├── request-flow.md      # The 3 paths + triage + all phases
│   │   ├── production-gate.md   # Full production-gate spec
│   │   └── ...
│   └── lessons-learned/         # Post-mortems as we build
│
├── evals/golden/                # Test cases for every behavior
├── scripts/                     # setup.sh, ci helpers
├── PLAN.md                      # Sprint-by-sprint roadmap
└── README.md                    # This file
```

---

## The 3 paths

Every user request is routed by `triage.ts` to one of three paths. See `docs/design/request-flow.md` for the full spec.

| Path | Phases | Triggers | Time | Tokens |
|---|---|---|---|---|
| **Small** | 1 (orchestrator direct) | Mechanical change, ≤1 file, ≤50 lines, no risk keywords | <30s | <3K |
| **Medium** | 4: `discover → plan → build → validate` | Clear intent, single module, 2-10 files | 5-30min | 20-60K |
| **Substantial** | 9: `calibrate → explore → propose → specify → architect → slice → build → validate → archive` | Cross-module, ambiguous, or risky (auth/payment/migration) | 30min-4h | 100-400K |

---

## Principles (inherited from skynex, non-negotiable)

1. **Hard cap 100K tokens** — enforced in code by `smart-zone.ts`
2. **HITL default, AFK opt-in** — explicit flag required for non-interactive mode
3. **Iron Law L4** — always enforced, whitelist-based, blocks unsafe writes
4. **Return envelope** — every sub-agent returns structured JSON
5. **Cross-namespace Neurox** — discovery searches global + project memory
6. **Skill registry compact** — per-agent subset, lazy, cached
7. **Doc rot prohibited** — every promise in docs corresponds to real code
8. **Code enforces, prompts guide** — Pi gives us hooks; we use them
9. **Production Gate strict by default** — kubectl/db/cloud commands require typed confirmation

---

## What this is NOT

- Not a copy of [Gentle Pi](https://www.npmjs.com/package/gentleman-programming-pi). Names, phase decomposition, and enforcement rules are skynex's own. Gentle was a reference for what's possible on Pi, not a template.
- Not a fork of skynex. It's a parallel evolution. The original [skynex](https://github.com/joeldevz/skynex) remains for OpenCode users.
- Not feature-complete today. See `PLAN.md` for what exists vs what's planned.
- Not a public product. Built for an engineering team. May be opened later.

---

## Quick start (when implementation lands)

```bash
# 1. Install Pi
curl -fsSL https://pi.dev/install.sh | sh

# 2. Clone this repo
git clone https://github.com/joeldevz/skynex-pi
cd skynex-pi

# 3. Install dependencies
pnpm install

# 4. Install Pi packages we depend on
pi install npm:pi-mcp-adapter
pi install npm:pi-sub-agent
pi install npm:pi-skillful

# 5. Set env vars (see docs/setup-env.md when it exists)
export ANTHROPIC_API_KEY=sk-ant-...
export SLACK_BOT_TOKEN=...
# etc.

# 6. Run
pi
```

---

## Roadmap (high-level)

| Sprint | Focus | Estimated weeks |
|---|---|---|
| 1 | Core infrastructure (6 extensions) | 2-3 |
| 2 | Medium path (4 phase extensions) | 1 |
| 3 | Substantial path (9 phase extensions) | 2-3 |
| 4 | UI polish, AFK, team onboarding | 1-2 |
| **Total** | | **6-9 weeks** |

Estimates are honest. Sprints may take longer if Pi APIs change or unexpected complexity surfaces. See `PLAN.md` for detail.

---

## Related repos

- [joeldevz/skynex](https://github.com/joeldevz/skynex) — predecessor, OpenCode-based
- [pi.dev](https://pi.dev) — Pi coding agent (the harness)
- [agentskills.io](https://agentskills.io/specification) — skill format standard used here

---

## License

MIT. See `LICENSE` (to be added).
