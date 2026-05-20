# skynex-pi — Request Flow (canonical)

> **Status**: Design v1 · **Owner**: Christopher · **Last revision**: 2026-05-20
> **Inherits from**: `joeldevz/skynex` (OpenCode version, Phase 0-4)
> **Distilled from**: Gentle SDD pipeline (9 phases) + Pi programmability (hooks, not prompts)
> **NOT a copy of**: Gentle SDD. Names, decomposition and enforcement are skynex's own.

---

## Goal

Define the canonical lifecycle of a user request inside skynex-pi.
Every request follows this flow. No exceptions. No "the model decides".

**One request = one of three paths**:
- **Small path** — 1 phase. Trivial mechanical changes.
- **Medium path** — 4 phases. Clear requirements, single module, contained risk.
- **Substantial path** — 9 phases. Ambiguous, cross-module, or risky.

The orchestrator runs **triage** first to pick the path. Then executes it.

---

## Principles (inherited from skynex, non-negotiable)

1. **Hard cap 100K tokens** — enforced by `smart-zone.ts` hook, not prompt
2. **HITL default, AFK opt-in** — `--afk` flag activates non-interactive mode
3. **Iron Law L4** — TDD always enforced with whitelist, code blocks tool calls
4. **Return envelope** — every sub-agent returns `{status, summary, artifacts, risks, skill_resolution, tokens_used}`
5. **Cross-namespace Neurox** — discovery searches global + project namespaces
6. **Skill registry compact** — per-agent subset, lazy-loaded, cached by hash
7. **Doc rot prohibited** — every promise here corresponds to a real file
8. **Code enforces, prompts guide** — Pi gives us hooks; we use them

---

## Triage — which path?

Run at the very start of every request. Outputs `path` and `tdd` flags.

```typescript
// extensions/core/triage.ts
interface TriageResult {
  path: "small" | "medium" | "substantial";
  reason: string;
  tdd: boolean;       // always true for L4 unless whitelist match
  estimated_files: number;
  estimated_modules: number;
  has_risk_keywords: boolean;  // auth, payment, schema, migration
}
```

### Decision rules (deterministic, in this order)

| Rule | If true → path |
|------|---------------|
| Risk keywords match (`auth`, `payment`, `migration`, `schema`, `security`, `crypto`) | substantial |
| Request mentions ≥3 modules or "across" / "all" | substantial |
| Ambiguity score ≥3 (vague terms: "improve", "refactor", "better") | substantial |
| Single file rename, typo, format, comment edit | small |
| Single file change ≤50 lines, clear intent | small |
| 2–10 files, single module, clear intent | medium |
| Everything else | medium (safe default) |

When in doubt → medium. Triage is a **first guess**, the orchestrator can promote a path mid-flow if it discovers complexity.

---

## Path: Small (1 phase)

For trivial mechanical changes. Orchestrator does it directly. No sub-agents.

```
USER → orchestrator
        ├─ read target file (max 1)
        ├─ apply change
        ├─ iron-law hook checks (whitelist usually passes)
        ├─ verifier mini-call (lint only, no tests)
        └─ done — return envelope to user
```

**Trigger examples**:
- "rename `getUser` to `getCurrentUser` in src/user/service.ts"
- "fix typo in line 42"
- "format this JSON"
- "add a comment explaining this regex"

**Time budget**: <30 seconds
**Tokens budget**: <3K
**Artifacts**: just the file change. No PLAN.md, no SPEC.md.

---

## Path: Medium (4 phases)

For tasks with clear requirements affecting a single module.

```
USER
  │
  ▼
1. discover    ──► neurox cross-ns + project + grill-me (if open Qs) + tests
  │               + read 1-3 files + skill registry per-agent
  ▼               artifact: .skynex/{slice}/discovery.md
2. plan        ──► tech-planner produces PLAN.md (vertical slices) +
  │               specify acceptance criteria inline
  ▼               artifact: PLAN.md
3. build       ──► per step in PLAN: coder → verifier → retry max 2
  │               iron-law L4 active throughout
  ▼               artifact: code changes + tests
4. validate    ──► test-reviewer + security x2 + skill-validator
                  archive: neurox_save + session_end + suggest commit
                  artifact: validation report
```

**Trigger examples**:
- "add email validation to the signup endpoint"
- "implement pagination in the orders list"
- "fix the bug where users with no avatar see undefined"

**Time budget**: 5-30 minutes
**Tokens budget**: 20-60K
**Artifacts**: `.skynex/{slice}/discovery.md`, `PLAN.md`, code + tests, validation report

---

## Path: Substantial (9 phases)

For ambiguous, cross-module, or risky tasks. Maximum rigor. Each phase produces a persistent artifact in `.skynex/{slice}/`.

Different from Gentle's SDD because:
- Names are ours (`calibrate`, `explore`, etc.), not `sdd-*`
- Phase 6 is `slice` (vertical decomposition), not `tasks` (atomic linear)
- Phase 8 `validate` uses skynex dual-judge with re-judgment (not Gentle's single judgment-day)
- Phase 9 `archive` integrates with Neurox cross-namespace

### The 9 phases

```
USER
  │
  ▼
1. calibrate  ── only first time per project, or on demand
  │               produces .skynex/project.json
  │               { stack, test_framework, conventions_file, package_manager,
  │                 doc_rot_paths, neurox_namespace }
  │               Model: Haiku (one-shot, mechanical scan)
  ▼
2. explore    ── scout agent (read-only) maps relevant codebase
  │               produces .skynex/{slice}/exploration.md
  │               { entry_points, related_modules, related_tests,
  │                 existing_patterns, gotchas_from_neurox }
  │               Model: Sonnet
  ▼
3. propose    ── 1-page what+why+stakeholders
  │               produces .skynex/{slice}/proposal.md
  │               { problem, goal, success_criteria, out_of_scope,
  │                 user_impact, business_rationale }
  │               Model: Opus (deep reasoning on tradeoffs)
  │               HITL: human approves before continuing
  ▼
4. specify    ── full requirements (the "what" in detail)
  │               produces .skynex/{slice}/spec.md
  │               { user_stories, acceptance_criteria, edge_cases,
  │                 error_modes, contract_with_existing_code }
  │               Model: Sonnet
  │               grill-me invoked if any open question
  ▼
5. architect  ── technical design (the "how" abstract)
  │               produces .skynex/{slice}/architecture.md
  │               { module_boundaries, data_flow, interfaces,
  │                 tradeoffs_considered, deep_modules_check }
  │               Model: Opus
  │               HITL: human approves before continuing
  ▼
6. slice      ── decompose into vertical slices (skynex's signature)
  │               produces .skynex/{slice}/slices.md
  │               { slice_1: { e2e_outcome, files, tests }, ... }
  │               Each slice = E2E user-visible value, not horizontal layer
  │               Model: Sonnet
  ▼
7. build      ── implement each slice sequentially (TDD L4 active)
  │               per slice: coder → verifier loop (max 2 retries)
  │               parallel build if slices are independent
  │               iron-law hook blocks writes without failing test first
  │               produces: code + tests + per-slice .skynex/{slice}/build-log.md
  │               Model: Sonnet (coder), Haiku (verifier)
  ▼
8. validate   ── dual-judge + test-reviewer + skill-validator
  │               security x2 in parallel with re-judgment (max 2 iterations)
  │               test-reviewer audits Iron Law compliance
  │               skill-validator checks project conventions
  │               produces .skynex/{slice}/validation.md
  │               Model: Opus (security), Sonnet (test-reviewer, skill-validator)
  │               HITL: human approves before archive
  ▼
9. archive    ── persist to Neurox, close session, suggest commit/PR
                  neurox_save observations:
                    - decision/arch/{slice} (architectural choices)
                    - discovery/codebase/{module} (what we learned)
                    - gotcha/{module}/{issue} (traps encountered)
                  produces .skynex/{slice}/archive.md (summary)
                  Model: Haiku (mechanical persist)
```

**Trigger examples**:
- "rebuild the auth system to support SSO"
- "migrate user storage from Postgres to DynamoDB"
- "add real-time notifications across all modules"
- "implement payment retries with idempotency"

**Time budget**: 30 min – 4 hours per slice
**Tokens budget**: 100-400K (compaction may fire at smart-zone)
**Artifacts**: 9 files in `.skynex/{slice}/` + code + tests + Neurox observations

---

## Production Gate — block before exec

> **Full spec**: `docs/design/production-gate.md`

Cross-phase hook (active in ALL paths: small, medium, substantial).
Implemented in `extensions/core/production-gate.ts`.

Intercepts every `tool_call` on `bash`, `write`, `edit` and checks if the command matches a production-affecting pattern (kubectl mutations, DB migrations, terraform/helm apply, git push --force, npm publish, destructive fs, etc.).

When matched in strict mode (default):
1. Runs dry-run preview where possible (e.g., `kubectl diff`, `terraform plan` parsed)
2. Shows risk analysis + predicted impact + safer alternatives
3. Requires typed confirmation (default phrase: `"yes apply"`)
4. Logs to append-only audit log `.skynex/audit.log`

Configured per team in `.skynex/production-gate.json` (gitignored). Default mode = `strict`. Empty `safe_contexts` = every kubectl context treated as production until explicitly whitelisted.

Interaction with Iron Law: Production Gate fires FIRST (intent confirmation), Iron Law fires AFTER (test discipline).
Interaction with AFK: `afk_behavior: "always_abort"` is the default safe behavior.

---

## TDD Iron Law (L4) — strict enforcement

Implemented as Pi hook in `extensions/core/iron-law.ts`. Cannot be bypassed by the model.

### Always active. No opt-out.

### Whitelist (paths that bypass Iron Law)

```typescript
const IRON_LAW_WHITELIST = [
  /\.md$/,                      // docs
  /\.(json|jsonc|yaml|yml)$/,   // configs
  /package\.json$/,
  /tsconfig\.json$/,
  /\.gitignore$/,
  /^docs\//,                    // anything under docs/
  /^\.skynex\//,                // skynex artifacts
  /^\.github\//,                // workflows, templates
  /^scripts\//,                 // tooling scripts
];
```

### Rules enforced (in order)

| # | Rule | Hook |
|---|------|------|
| 1 | Production code (`src/**/*.ts`, etc.) requires a test file | `tool_call` blocks `write`/`edit` |
| 2 | Test must exist AND fail before writing the implementation | `tool_call` runs the test, blocks if pass |
| 3 | Cannot modify a test that is currently passing | `tool_call` blocks `edit` on green tests unless reason provided |
| 4 | After implementation, all affected tests must pass | `tool_result` runs tests, blocks completion if any fail |
| 5 | Coverage on PR must be ≥80% on changed files | pre-commit / CI gate |

### Anti-cheat (skynex-specific, Gentle does not have)

- Block 4 detects "test deletion + reimplement" pattern. Reports as integrity violation.
- Block 5 measures coverage per **changed lines**, not whole file. Catches "added 10 lines, tested 1".

### Override

Human can override with `/iron-law:override "reason"` once. Logged in `.skynex/{slice}/iron-law-overrides.md` for audit.

---

## Skill Registry — better than Gentle

Implemented as Pi hook in `extensions/core/skill-registry.ts`.

### Key differentiators vs Gentle

| Feature | Gentle | skynex-pi |
|---|---|---|
| When loads | Every Pi startup | Lazy: when sub-agent dispatched |
| Scope | All skills for all agents | Per-agent subset |
| Cache | Yes (hash) | Yes (hash) + per-agent cache |
| Feedback loop | No | If `skill_resolution: fallback-*`, auto-refresh |
| Token budget | Max 15 rules/skill | Max 1000 tokens/skill, warn if over |
| Drift detector | No | Skills unused 30+ days flagged |
| Usage metrics | "Loaded N skills" | Per-skill: usage_count, last_used, avg_tokens |

### Per-agent skill subsets

```typescript
const AGENT_SKILL_MAP = {
  orchestrator: ["grill-me", "advisor-protocol", "return-envelope", "smart-zone-budget"],
  coder:        ["tdd-discipline", "verification-before-completion", /* + stack-specific */],
  verifier:     ["verification-before-completion"],
  security:     ["security", "adversarial-review"],
  "test-reviewer": ["tdd-discipline", "verification-before-completion"],
  "skill-validator": ["adversarial-review"],
};
```

Stack-specific skills (NestJS, TypeScript, Go) auto-inject based on `.skynex/project.json` from `calibrate`.

### Compact rules format

Each SKILL.md must have a `## Compact Rules` section:

```markdown
## Compact Rules
1. Always X
2. Never Y
3. When Z, do W
(max 15 rules, max 1000 tokens total compressed)
```

The extension extracts only this section, caches it, injects it as `## Project Standards (auto-resolved)` in the sub-agent prompt.

### Feedback loop

When sub-agent returns `{skill_resolution: "fallback-registry"}` or `"none"`:
- Extension increments miss counter
- After 2 misses on same skill, auto-refreshes registry
- Notifies user: "Skill registry refreshed (skill X showed drift)"

### Commands

- `/skills:list` — show all loaded skills with usage stats
- `/skills:refresh` — force rebuild (rare; usually automatic)
- `/skills:audit` — show drift candidates (unused 30+ days)
- `/skills:budget` — show token consumption per skill

---

## Artifacts produced (where they live)

| Path | Path lives | Produced by |
|---|---|---|
| `.skynex/project.json` | All | `calibrate` (Substantial) or `/skynex:init` |
| `.skynex/{slice}/exploration.md` | Substantial only | `explore` phase |
| `.skynex/{slice}/proposal.md` | Substantial only | `propose` phase |
| `.skynex/{slice}/spec.md` | Substantial only | `specify` phase |
| `.skynex/{slice}/architecture.md` | Substantial only | `architect` phase |
| `.skynex/{slice}/slices.md` | Substantial only | `slice` phase |
| `.skynex/{slice}/build-log.md` | Substantial only | `build` phase |
| `.skynex/{slice}/validation.md` | Substantial + Medium | `validate` phase |
| `.skynex/{slice}/archive.md` | Substantial only | `archive` phase |
| `.skynex/{slice}/discovery.md` | Medium only | `discover` phase |
| `PLAN.md` (root) | Medium only | `plan` phase |
| `.skynex/{slice}/iron-law-overrides.md` | Any path with overrides | `/iron-law:override` cmd |
| Neurox observations | All | every phase, automatic |
| Git commits | All | user manually, suggested by `archive` |

Small path produces **no artifacts** beyond the actual code change. That's intentional.

---

## Examples (so it's not abstract)

### Example 1 — Small path

User: "Rename `getUser` to `getCurrentUser` in src/auth/service.ts"

Triage: small (1 file, mechanical, no risk keywords)
Flow:
1. orchestrator reads service.ts
2. iron-law hook checks: edit on src/, no test file changing, refactor (no behavior change) → passes
3. orchestrator edits 3 occurrences
4. verifier runs lint → green
5. done, return envelope

Time: 15 seconds. Tokens: ~2K.

### Example 2 — Medium path

User: "Add pagination to the GET /orders endpoint"

Triage: medium (single module, clear intent, no risk keywords)
Flow:
1. `discover` — neurox_recall("pagination patterns", "orders module"); glob tests for orders; grill-me NOT invoked (clear intent); read controller + service + repo
2. `plan` — tech-planner produces PLAN.md with 3 vertical slices: schema migration, repo method, controller endpoint
3. `build` — per slice: write test (red) → coder writes impl → verifier runs tests (green) → next slice
4. `validate` — test-reviewer checks Iron Law compliance, security checks for injection on `?page=`, skill-validator checks NestJS conventions

Time: 12 minutes. Tokens: ~35K.

### Example 3 — Substantial path

User: "Rebuild auth to support SAML SSO"

Triage: substantial (risk keyword "auth", cross-module impact, ambiguity in "rebuild")
Flow:
1. `calibrate` — skipped (already done for project)
2. `explore` — scout maps current auth, identifies 12 affected files
3. `propose` — 1-page proposal with SAML approach, presented to user, **HITL gate**
4. `specify` — full spec with edge cases (expired assertions, idP downtime)
5. `architect` — Opus designs: SAML adapter pattern, deep modules check, **HITL gate**
6. `slice` — decomposed into 5 vertical slices (basic SAML, refresh, error handling, admin UI, migration)
7. `build` — slice 1-5 sequentially (some parallel where independent), TDD L4 throughout
8. `validate` — security dual-judge (critical for auth), re-judgment, **HITL gate**
9. `archive` — Neurox saves all decisions, suggests PR creation

Time: 6-8 hours over 2-3 sessions. Tokens: ~250K (compaction fires once around step 7).

---

## What this design does NOT do (explicit non-goals)

- No persona system (Argentino/Neutral) — team context doesn't need it
- No banner ASCII art at startup — decoration
- No Gentle's "sdd-*" naming — own brand
- No 9 phases for everything — triage selects appropriate depth
- No SDD as the only path — vertical slices remain canonical decomposition
- No MCP custom integration — `pi-mcp-adapter` package handles it
- No sub-agent reinvention — `pi-sub-agent` package handles it
- No model routing as a separate concept — embedded in phase definitions (each phase has Model: X)

---

## Implementation order (which extensions to build first)

**Sprint 1 — Infra (6 extensions)**
1. `triage.ts` — required for path selection
2. `iron-law.ts` — L4, blocks unsafe writes
3. `skill-registry.ts` — per-agent compact rules
4. `smart-zone.ts` — 80K warn, 100K cap
5. `neurox-tool.ts` — wrap neurox CLI as Pi tools
6. `production-gate.ts` — block exec on production-affecting commands

**Sprint 2-3 — Phase extensions**
Phase-specific extensions (calibrate, explore, propose, specify, architect, slice, build, validate, archive) — depend on Sprint 1 infra being complete.

The 6 are infrastructure (cross-phase hooks). The 9 phase extensions are the actual workflow.

---

## References

- `joeldevz/skynex` — predecessor (OpenCode version), inherits Phase 0-4 design
- Neurox memory `01KQ2DZTXWQMJZS86B8VFSY64G` — principle-driven design decision
- Neurox memory `01KQ2DVGPMS4WV4SXGFFSNCZ4M` — Iron Law origin
- Neurox memory `01KMYVRJK7253CKCT8MVWWTGEB` — Gentle SDD patterns analysis
- Pi docs `~/.npm/lib/node_modules/@earendil-works/pi-coding-agent/docs/`
- Gentleman Programming video (2026-05-19) — Gentle Pi walkthrough (reference, not copy)
