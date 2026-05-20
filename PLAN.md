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

### S1-1 — `triage` ✅ DONE 2026-05-20

**Files**:
- `extensions/core/triage/types.ts` — `TriageResult`, `TriageConfig`, `DEFAULT_TRIAGE_CONFIG`
- `extensions/core/triage/rules.ts` — pure deterministic matchers (zero I/O, zero LLM)
- `extensions/core/triage/index.ts` — Pi extension (hook `before_agent_start`, commands `/triage:status`, `/triage:test`)
- `extensions/core/triage/rules.test.ts` — 25 unit tests (all pass)

**Hook**: `before_agent_start`
**Status**: implemented, typechecked, 25/25 tests pass
**Lines**: 415 (types: 90, rules: 145, index: 145, tests: 135)

Reads the user prompt, runs deterministic rules to classify path = small / medium / substantial. Detects `tdd` flag and risk keywords. Result stored in `sessionTriageStore` keyed by session file, retrievable by phase extensions via exported `getTriage(sessionFile)` helper.

Config loaded from `.skynex/triage.json` if present, defaults otherwise.

Output:
```typescript
interface TriageResult {
  path: "small" | "medium" | "substantial";
  reason: string;
  tdd: boolean;
  estimated_files: number;
  estimated_modules: number;
  has_risk_keywords: boolean;
  signals: string[];   // audit trail
  ts: string;          // ISO 8601
}
```

**Decision during implementation**: `auth`/`payment`/etc. risk keywords promote to `substantial` even for trivial-looking changes (e.g., renaming inside `src/auth/`). Intentional — anything touching auth deserves the rigor.

Stored in session state. Read by all subsequent phase extensions in Sprint 2-3.

### S1-2 — `iron-law` (L4) ✅ DONE 2026-05-20

**Files**:
- `extensions/core/iron-law/types.ts` — `IronLawConfig`, `DEFAULT_IRON_LAW_CONFIG`, override + state types
- `extensions/core/iron-law/matcher.ts` — pure glob matching (uses `minimatch`)
- `extensions/core/iron-law/index.ts` — Pi extension: 3 hook rules + 2 commands
- `extensions/core/iron-law/matcher.test.ts` — 28 unit tests (all pass)

**Hook**: `tool_call` on `write`/`edit`
**Status**: implemented, typechecked, 28/28 matcher tests pass + 53/53 overall
**Lines**: ~580 (types: 110, matcher: 75, index: 280, tests: 115)

Enforces three rules:
1. Production code (`src/**/*.ts`, etc.) requires a test file
2. Test must fail BEFORE writing impl (runs the test if pre-existing)
3. Cannot edit a passing test

Whitelist: docs, configs, `.github/`, `scripts/`, `.skynex/`, test files themselves.

Test runner detected from `package.json` scripts (jest/vitest/tsx supported).

Override: `/iron-law:override <file> [reason]` — one-shot per file, logged to `.skynex/iron-law-overrides.md` for team audit.

Status command: `/iron-law:status` — shows files written this session + active overrides.

**Decision during implementation**: replaced hand-rolled `globToRegex` with `minimatch` (8 glob tests failed with custom impl, 0 with minimatch). Added minimatch as direct dep. Same library Pi itself uses.

See `docs/design/request-flow.md` § TDD Iron Law (L4).

### S1-3 — `skill-registry` ✅ DONE 2026-05-20

**Files**:
- `extensions/core/skill-registry/types.ts` — `SkillEntry`, `SkillRegistry`, `RegistryConfig` + defaults
- `extensions/core/skill-registry/parser.ts` — pure: `extractCompactRules`, `estimateTokens`, `sha256`, `formatRulesForPrompt`
- `extensions/core/skill-registry/registry.ts` — builder, cache, agent-map lookup (uses Pi's `loadSkills` + `parseFrontmatter`)
- `extensions/core/skill-registry/index.ts` — Pi extension + 5 commands
- `extensions/core/skill-registry/parser.test.ts` — 21 pure-parser tests
- `extensions/core/skill-registry/registry.test.ts` — 13 integration tests with tmp dirs

**Hook**: `session_start`
**Status**: implemented, typechecked, 34/34 tests pass + 53 prior = 87/87 overall
**Lines**: ~830 (types: 90, parser: 130, registry: 175, index: 250, tests: 185)

What it does:
- Discovers all SKILL.md via Pi's `loadSkills` (`~/.pi/agent/skills/`, `~/.agents/skills/`, `.pi/skills/`, `.agents/skills/`)
- For each: reads SKILL.md → `parseFrontmatter` → `extractCompactRules` from `## Compact Rules` section
- Hashes each file (SHA-256), caches result in `.skynex/skill-registry.json`
- On next session: validates cache by re-hashing source files → reuses if unchanged, rebuilds otherwise
- Token-budget enforcement (default 1000 tokens/skill) with `exceedsBudget` flag + diagnostics
- Per-agent subset assignment via `AGENT_SKILL_MAP` (orchestrator/coder/verifier/security/etc.)
- Exports `getCurrentRegistry()`, `getSkillsForAgent(agent)`, `buildPromptInjection(agent)` for Sprint 2-3 phase extensions

Commands: `/skills:list`, `/skills:refresh`, `/skills:audit`, `/skills:budget`, `/skills:show <name>`

**Deferred to Sprint 2-3** (need sub-agent dispatch + return envelope):
- Skill resolution feedback loop (auto-refresh on `skill_resolution: fallback-*`)
- Per-skill usage metrics (count, last_used) → drift detector

**Decision during implementation**: reuse Pi's `loadSkills` instead of writing our own scanner. Same discovery rules as Pi, same locations, same diagnostics. We only add the value layer (compact rules + token budget + per-agent subset).

See `docs/design/request-flow.md` § Skill Registry.

### S1-4 — `smart-zone` ✅ DONE 2026-05-20

**Files**:
- `extensions/core/smart-zone/types.ts` — `SmartZoneConfig`, `DEFAULT_SMART_ZONE_CONFIG`, `ZoneDecision`
- `extensions/core/smart-zone/calc.ts` — pure: `decideAction`, `formatBar`, `formatTokens`, `formatStatusLine`
- `extensions/core/smart-zone/index.ts` — Pi extension: `turn_end` hook + 2 commands
- `extensions/core/smart-zone/calc.test.ts` — 19 pure-logic tests

**Hook**: `turn_end`
**Status**: implemented, typechecked, 19/19 tests pass + 87 prior = 106/106 overall
**Lines**: ~430 (types: 60, calc: 80, index: 190, tests: 100)

Reads `ctx.getContextUsage()` after each LLM turn. At 80K notifies user (with hysteresis: re-warn only every +5K to avoid spam). At 100K triggers `ctx.compact()` with custom instructions, prevents re-fire via `compactionInFlight` flag.

Status bar shows live `tokens 45K/100K ████░░░░░░ 45%` updated every turn.

Threshold is in **absolute tokens**, not percent of context window: a 200K window does NOT mean we can use 160K — the smart zone is 100K regardless. (Validated by Chroma research 2025: attention degrades quadratically beyond ~100K.)

**Decision during implementation**: hysteresis on warning step (default +5K) prevents notification spam. The model emits 5-10 tokens per turn end on incremental builds; without hysteresis the user would see the same warning every turn.

See `docs/design/request-flow.md` § principles #1.

### S1-5 — `neurox-tool` ✅ DONE 2026-05-20

**Files**:
- `extensions/core/neurox-tool/types.ts` — config + 5 tool input shapes + `NeuroxCliResult`
- `extensions/core/neurox-tool/cli.ts` — pure CLI arg builders + JSON parser
- `extensions/core/neurox-tool/index.ts` — Pi extension: 5 tools + 1 command
- `extensions/core/neurox-tool/cli.test.ts` — 18 pure tests

**Hook**: `pi.registerTool` × 5
**Status**: implemented, typechecked, 18/18 cli tests + 19 smart-zone + 34 skill-registry + 28 iron-law + 25 triage = 124/124 overall
**Lines**: ~640 (types: 90, cli: 90, index: 330, tests: 130)

Tools registered:
- `neurox_recall(query, namespace?, limit?, kind?, type?, files?, include_stale?)` — search memory
- `neurox_save(title, content, namespace?, type?, kind?, tags?, files?, topic_key?, confidence?, retention?)` — persist
- `neurox_context(namespace?, limit?, files?)` — load relevant context
- `neurox_session_start(title?, directory?, branch?, namespace?)` — begin session
- `neurox_session_end(session_id, summary)` — close session

Binary auto-detection: checks `~/.local/bin/neurox`, `/usr/local/bin/neurox`, `/opt/homebrew/bin/neurox`, `/usr/bin/neurox`, then falls back to `which neurox`. Configurable via `.skynex/neurox.json`.

**Decision during implementation**: if the binary is not found, tools are STILL registered but `execute()` returns `isError: true`. Rationale: registering the tools lets the model see them in its capability list (so it doesn't waste tokens trying to fall back to other methods); the error response when called tells the model the issue directly.

**Why wrap the CLI instead of using MCP**: the neurox MCP server burns ~200-400 tokens just in tool schema declarations per session. Wrapping the CLI as 5 Pi tools means the schema lives in our code (typebox), no MCP overhead, no separate process to manage.

**Deferred to Sprint 2-3**: skill-resolution feedback loop integration (when a sub-agent returns `skill_resolution: fallback-registry`, auto-trigger `neurox_recall("skill-registry")`).

See `docs/design/request-flow.md` § Skill Registry feedback loop.

### S1-6 — `production-gate` ✅ DONE 2026-05-20

**Files**:
- `extensions/core/production-gate/types.ts` — config schema, pattern catalog, audit shapes
- `extensions/core/production-gate/detector.ts` — pure pattern matching (uses minimatch for kubectl/branch globs)
- `extensions/core/production-gate/audit.ts` — append-only JSONL log + rotation + auto-gitignore
- `extensions/core/production-gate/index.ts` — Pi extension: tool_call hook + 7 commands
- `extensions/core/production-gate/detector.test.ts` — 51 pattern tests

**Hook**: `tool_call` on `bash`
**Status**: implemented, typechecked, 51/51 detector tests pass. Sprint 1 total: 175/175.
**Lines**: ~1100 (types: 170, detector: 320, audit: 100, index: 380, tests: 320)

Pattern catalog (all enabled by default):
- `kubectl` mutations (apply/delete/scale/rollout/drain/exec/edit/patch/replace) — always-allow verbs: get/describe/logs/top/diff
- `db_migrations` (prisma/rails/alembic/knex/sqlx/flyway/drizzle/atlas)
- `db_direct` SQL DELETE FROM/DROP TABLE/TRUNCATE/UPDATE without WHERE/FLUSHALL/deleteMany
- `terraform` apply/destroy/import
- `pulumi` up/destroy/refresh
- `helm` upgrade/uninstall/rollback/install
- `git_force` (--force / --force-with-lease / -f / -fu)
- `git_main_push` to main/master/production/prod/release/* (with safe-branch exemption: personal/* feat/* fix/* chore/*)
- `publishing` (npm/pnpm/yarn/cargo publish; twine upload)
- `destructive_fs` (rm -rf /, sudo rm, chmod 777 /)
- `cloud_delete` aws/gcloud/az + delete/remove/terminate/destroy
- `container_destructive` (docker volume rm, docker system prune, kubectl delete pvc)
- `service_control` (systemctl restart/stop, pm2 reload)
- `custom_patterns` (team-defined regex via config)

Modes:
- `strict` (default) — block + require typed confirmation `"yes apply"`
- `warn` — show warning, log, allow
- `silent` — log only, no UI
- `off` — disabled

First-run UX: creates `.skynex/production-gate.json` (gitignored) + `.skynex/production-gate.example.json` (committable) + adds both `production-gate.json` and `audit.log` to `.gitignore`.

Audit log JSONL append-only at `.skynex/audit.log`. Rotation at 50 MB. Entries include: timestamp, command, category, subtype, severity, context (kubectl context, git branch), confirmed/aborted, response, outcome, mode, session, duration_ms. Mode changes logged as separate entries.

Commands:
- `/production-gate:status` — mode + recent audit
- `/production-gate:test "<cmd>"` — dry-run
- `/production-gate:add-safe <name>` — add to safe_contexts (auto-detects branch vs kubectl by `*` or `/`)
- `/production-gate:remove-safe <name>`
- `/production-gate:audit [--category=X]` — query log
- `/production-gate:mode <strict|warn|silent|off>` — change mode (logged)
- `/production-gate:reload-config` — re-read config

**Decisions during implementation**:
1. JavaScript regex doesn't support `(?i)` inline flag → wrote `compileRegex()` that extracts POSIX-style `(?i)`/`(?im)` prefix to JS regex flags. This let us keep the user-facing config syntax POSIX-compatible.
2. `db_direct` regex required SQL context (`DELETE FROM`, `DROP TABLE`, etc.) — initial broad `(DELETE|DROP)` matched `kubectl delete` command. Required SQL keyword + object-noun to be specific.
3. Real kubectl context resolved via `kubectl config current-context` (best-effort, 2s timeout) when the command doesn't specify `--context=`.
4. `auto-gitignore` runs every audit append (idempotent, cheap check) — guarantees the file never accidentally gets committed if user removed it from `.gitignore`.

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
