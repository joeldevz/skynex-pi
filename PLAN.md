# skynex-pi — Sprint Plan

> **Status**: Active · **Owner**: Christopher · **Last revision**: 2026-05-20
> **Source of truth**: `docs/design/request-flow.md` + `docs/design/production-gate.md`

---

## Approach

Build infrastructure first (Sprint 1), then workflow (Sprint 2-3), then polish (Sprint 4).

Each sprint produces something that works end-to-end at increasing capability. At the end of Sprint 1 the team can use Small path. At the end of Sprint 2 the team can use Medium path. At the end of Sprint 3 the team can use Substantial path. Sprint 4 is for production-readiness.

**Total estimated**: 6-9 weeks. Estimates are honest, not optimistic.

---

## Pre-Sprint setup (done)

- [x] Repo created on GitHub: `joeldevz/skynex-pi`
- [x] Initial directory structure (`extensions/`, `.pi/`, `docs/`, `evals/`, `scripts/`)
- [x] `package.json`, `tsconfig.json`, `.pi/agent/settings.json`, `.pi/agent/AGENTS.md`
- [x] `docs/design/request-flow.md` — canonical flow spec (3 paths, 9 phases, triage)
- [x] `docs/design/production-gate.md` — full spec for production gate
- [x] README.md (honest, design-phase)
- [x] PLAN.md (this file)

---

## Sprint 1 — Core Infrastructure (~2-3 weeks)

**Goal**: 6 extensions that enforce the discipline of skynex through Pi hooks (not prompts). At the end of this sprint, Small path works end-to-end and infrastructure is ready for the workflow phases.

### S1-1 — `triage.ts`

**File**: `extensions/core/triage.ts`
**Hook**: `before_agent_start`
**Estimated**: 2 days
**Depends on**: nothing

Reads the user prompt, runs deterministic rules to classify path = small / medium / substantial. Also detects `tdd` flag and risk keywords.

Output:
```typescript
interface TriageResult {
  path: "small" | "medium" | "substantial";
  reason: string;
  tdd: boolean;
  estimated_files: number;
  estimated_modules: number;
  has_risk_keywords: boolean;
}
```

Stored in session state. Read by all subsequent phase extensions.

### S1-2 — `iron-law.ts` (L4)

**File**: `extensions/core/iron-law.ts`
**Hook**: `tool_call` on `write`/`edit`, `tool_result` after impl
**Estimated**: 3 days
**Depends on**: triage (reads `tdd` flag)

Always-on TDD enforcement with whitelist. Blocks `write` to production code unless a failing test exists. Blocks editing of green tests. Override available with logged reason.

See `docs/design/request-flow.md` § TDD Iron Law (L4).

### S1-3 — `skill-registry.ts`

**File**: `extensions/core/skill-registry.ts`
**Hook**: `before_subagent_dispatch`, `resources_discover`
**Estimated**: 3 days
**Depends on**: nothing (but provides input to all phase extensions)

Scans `.pi/skills/` + global, extracts `## Compact Rules` per skill, caches by hash, injects per-agent subset into sub-agent prompts. Tracks usage metrics. Detects skill drift.

See `docs/design/request-flow.md` § Skill Registry.

### S1-4 — `smart-zone.ts`

**File**: `extensions/core/smart-zone.ts`
**Hook**: `message`, `turn_end`
**Estimated**: 1 day
**Depends on**: nothing

Reads session token count after each turn. Warns at 80K. Triggers auto-compact at 100K (after notifying user). Updates status bar with live token usage.

Already drafted earlier in session. Will be cleaned up in this sprint.

### S1-5 — `neurox-tool.ts`

**File**: `extensions/core/neurox-tool.ts`
**Hook**: `pi.registerTool` x5 (recall, save, context, session_start, session_end)
**Estimated**: 2 days
**Depends on**: nothing

Wraps the existing `neurox` binary as Pi tools that the model can invoke directly. Replaces the MCP setup from skynex (more efficient, fewer tokens for tool definitions).

### S1-6 — `production-gate.ts`

**File**: `extensions/core/production-gate.ts`
**Hook**: `tool_call` on `bash`, `write`, `edit`
**Estimated**: 4 days
**Depends on**: nothing (integrates with smart-zone for token-aware preview)

Pattern-matching gate that blocks production-affecting commands. Strict by default. Typed confirmation. Audit log. Configurable via `.skynex/production-gate.json`.

See `docs/design/production-gate.md` for full spec.

### Sprint 1 deliverables

- 6 extensions, each with golden eval tests in `evals/golden/`
- `scripts/setup-env.sh` for team onboarding (env vars, dependencies)
- `docs/setup-env.md` documenting env vars required by each extension
- Smoke test: `pi` starts, all 6 extensions load, `/production-gate:status` works
- Working Small path end-to-end (orchestrator handles trivial requests)

---

## Sprint 2 — Medium Path (~1 week)

**Goal**: 4-phase workflow for clear, single-module changes. End of sprint: team can use skynex-pi for everyday work.

### S2-1 — `phases/medium/discover.ts`

**File**: `extensions/phases/medium/discover.ts`
**Estimated**: 2 days
**Depends on**: triage, skill-registry, neurox-tool

Phase 1 of Medium path. Combines: neurox cross-namespace search, project search, grill-me invocation if open questions, test discovery (glob + read 1-3 tests), file context (1-3 files), skill registry lookup. Produces `.skynex/{slice}/discovery.md`.

### S2-2 — `phases/medium/plan.ts`

**File**: `extensions/phases/medium/plan.ts`
**Estimated**: 1 day
**Depends on**: discover

Phase 2 of Medium path. Spawns `tech-planner` sub-agent (via pi-sub-agent), passes discovery.md as input, produces `PLAN.md` at repo root with vertical slices.

### S2-3 — `phases/medium/build.ts`

**File**: `extensions/phases/medium/build.ts`
**Estimated**: 2 days
**Depends on**: plan, iron-law

Phase 3 of Medium path. Iterates PLAN.md steps. Per step: spawns `coder` sub-agent, then `verifier`, retries max 2 if verifier fails. Iron Law and Production Gate active throughout.

### S2-4 — `phases/medium/validate.ts`

**File**: `extensions/phases/medium/validate.ts`
**Estimated**: 2 days
**Depends on**: build

Phase 4 of Medium path. Spawns `test-reviewer`, `security` x2 (parallel dual-judge), `skill-validator`. Re-judgment up to 2 iterations. Produces `.skynex/{slice}/validation.md`. Saves to Neurox. Ends session.

### Sprint 2 deliverables

- 4 phase extensions for Medium path
- 4 sub-agent definitions in `.pi/agent/agents/`: `tech-planner.md`, `coder.md`, `verifier.md`, `security.md`, `test-reviewer.md`, `skill-validator.md`
- Medium path golden evals (`evals/golden/medium-path/`)
- End-to-end test: ask "add pagination to GET /orders" → produces working code + tests + validation

---

## Sprint 3 — Substantial Path (~2-3 weeks)

**Goal**: 9-phase workflow for ambiguous, cross-module, risky changes. End of sprint: full skynex-pi capability.

### S3-1 — `phases/substantial/calibrate.ts` (1 day)

Produces `.skynex/project.json` with stack, conventions, test framework. One-shot mechanical scan (Haiku model).

### S3-2 — `phases/substantial/explore.ts` (2 days)

Spawns scout agent. Maps relevant codebase, identifies related modules/tests, surfaces Neurox gotchas. Produces `.skynex/{slice}/exploration.md`.

### S3-3 — `phases/substantial/propose.ts` (2 days)

1-page proposal (Opus model). HITL gate: human approves before continuing. Produces `.skynex/{slice}/proposal.md`.

### S3-4 — `phases/substantial/specify.ts` (2 days)

Full requirements with acceptance criteria, edge cases, error modes. Invokes grill-me if open questions. Produces `.skynex/{slice}/spec.md`.

### S3-5 — `phases/substantial/architect.ts` (2 days)

Technical design (Opus). Module boundaries, data flow, tradeoffs, deep modules check. HITL gate. Produces `.skynex/{slice}/architecture.md`.

### S3-6 — `phases/substantial/slice.ts` (1 day)

Decomposes into vertical slices (E2E user value per slice). Produces `.skynex/{slice}/slices.md`.

### S3-7 — `phases/substantial/build.ts` (2 days)

Sequential per-slice build with parallel-where-possible. Iron Law L4 + Production Gate active. Reuses logic from Medium `build.ts`. Produces per-slice build logs.

### S3-8 — `phases/substantial/validate.ts` (1 day)

Same as Medium validate but with HITL gate before archive. Re-judgment up to 2 iterations.

### S3-9 — `phases/substantial/archive.ts` (1 day)

Persists all decisions to Neurox (decision/discovery/gotcha types). Closes session. Suggests `commit` or `pr` command.

### Sprint 3 deliverables

- 9 phase extensions for Substantial path
- Additional sub-agent: `scout.md`, `product-planner.md`, `architect.md` (or reuse advisor for architect)
- Substantial path golden evals (`evals/golden/substantial-path/`)
- End-to-end test: ask "rebuild auth for SAML SSO" → produces 9 artifacts in `.skynex/{slice}/` + working code

---

## Sprint 4 — Team Polish (~1-2 weeks)

**Goal**: Production-readiness for engineering team usage.

### S4-1 — `status-bar.ts` (2 days)
Live status bar with tokens, cost, model, current phase, slice ID.

### S4-2 — `afk-runner.ts` (2 days)
Non-interactive mode. `pi --afk` flag. Auto-confirms safe operations, defers risky ones to Neurox checkpoint with notification.

### S4-3 — Team onboarding (2 days)
- `docs/team-onboarding.md` — install Pi, clone repo, env vars, first session walkthrough
- `scripts/setup.sh` — one-command setup for new team members
- `docs/troubleshooting.md` — common issues + fixes
- `.skynex/production-gate.example.json` — committed example for safe customization

### S4-4 — Golden eval suite (2 days)
- Coverage report: which behaviors are tested
- CI workflow: runs golden evals on every PR
- Baseline metrics: tokens per path, time per phase, cost per slice

### S4-5 — Cross-provider fallback (3 days, stretch)
Extend `neurox-tool.ts` and model routing to support OpenAI GPT-5 / Gemini as fallbacks when Anthropic is rate-limited. Documented in `docs/design/cross-provider.md`.

---

## Decision log

| Date | Decision | Why |
|------|----------|-----|
| 2026-05-20 | Build skynex-pi as parallel evolution, NOT replacement of joeldevz/skynex | OpenCode users still need maintenance. skynex-pi is for the team that wants programmable hooks. |
| 2026-05-20 | Triage with 3 paths (small/medium/substantial), not Gentle's 5 categories | Granularity matches skynex's substantial/medium/small. Don't over-classify. |
| 2026-05-20 | 9 phase names are skynex's own: calibrate/explore/propose/specify/architect/slice/build/validate/archive | Own brand, not copy of `sdd-*` |
| 2026-05-20 | Iron Law L4 (strict + whitelist) instead of L3 | Team context demands strict default. Whitelist handles docs/configs. |
| 2026-05-20 | Skill registry per-agent subset + lazy load + drift detector | Reduces tokens per agent. Enables auditability for team. |
| 2026-05-20 | Production Gate as Extension #6 of Sprint 1 | User specifically requested. Single most valuable safety feature for team. |
| 2026-05-20 | Production Gate config in `.skynex/production-gate.json` (gitignored) | Contains sensitive context (real cluster names). Example file committed. |
| 2026-05-20 | Production Gate default mode = `strict`, default `safe_contexts` = empty | Safest default. Team relaxes explicitly, never accidentally. |
| 2026-05-20 | Use `pi-mcp-adapter` instead of building our own MCP layer | Don't reinvent. Package exists and works. |
| 2026-05-20 | Use `pi-sub-agent` instead of building our own sub-agent system | Don't reinvent. Package provides isolation + parallel + chain modes. |
| 2026-05-20 | Each extension has golden evals from day 1 | Discipline: no feature ships without verification. |

---

## Non-goals (explicit, do not revisit without strong reason)

- ❌ Persona system (Argentino/Neutral) — team context doesn't need it
- ❌ Banner ASCII art at startup — decoration
- ❌ Copy of Gentle SDD naming (`sdd-*`) — own brand
- ❌ 9 phases for everything — triage selects appropriate depth
- ❌ Custom MCP integration — `pi-mcp-adapter` exists and works
- ❌ Custom sub-agent system — `pi-sub-agent` exists and works
- ❌ skilar Go CLI for Pi — npm/pnpm install is simpler
- ❌ Web UI dashboard — terminal-only for now
- ❌ Multi-user collaboration features — single dev per session

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Pi 0.75 API changes break extensions | Pin Pi version in `package.json`, document upgrade path |
| 6-9 week estimate slips | Sprint 1 alone has tangible value (Small path + Production Gate). Can ship after each sprint. |
| Team adoption friction | Sprint 4 dedicated to onboarding. Small path is approachable from day 1. |
| Iron Law too strict, kills productivity | Whitelist is permissive for docs/configs. Override mechanism logged. Can tune mid-sprint. |
| Production Gate false positives | Custom patterns extensible. `warn` mode for senior devs. Audit log shows what fired. |
| Skill registry per-agent breaks if mapping is wrong | Feedback loop auto-refreshes on `fallback-registry`. Drift detector surfaces issues. |

---

## Next immediate steps (after this commit)

1. Commit + push design (this commit)
2. Create branch `sprint-1` for infrastructure work
3. Start S1-1 (`triage.ts`) — smallest, no dependencies
4. Iterate sprint daily; update PLAN.md status

---

## References

- `docs/design/request-flow.md` — canonical request flow
- `docs/design/production-gate.md` — full production gate spec
- Pi docs (local): `~/.npm/lib/node_modules/@earendil-works/pi-coding-agent/docs/`
- [joeldevz/skynex](https://github.com/joeldevz/skynex) — predecessor (OpenCode)
- Neurox observations cited in design docs (saved during this session)
