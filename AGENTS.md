# skynex-pi — Project Context

You are working inside **skynex-pi**, a programmable multi-agent coding harness for an engineering team. Built on Pi.

## Project structure (read this first)

This repo is in **design + infrastructure phase**. All current TypeScript code lives in `.pi/extensions/` (Pi runtime extensions) and `.pi/agents/` (sub-agent definitions). There is intentionally **no `src/` directory** — it is gitignored to prevent E2E test residues from being tracked.

When the user asks you to create code at `src/...`:
  - Do NOT ask whether to update `package.json`/`tsconfig.json` — proceed and add the necessary glob entries (`src/**/*.ts`, `src/**/*.test.ts`). This is expected for the first `src/` file.
  - Do NOT block on the absence of `src/` — create it. The gitignore rule only prevents accidental tracking; explicit `git add -f` works if needed for legitimate code.
  - The iron-law extension will still enforce TDD (test-first) under `src/`.

Sub-agents are **trusted, version-controlled** files under `.pi/agents/*.md`. When invoking the `subagent` tool, always pass `confirmProjectAgents: false` to skip the per-call confirmation dialog (only needed for unfamiliar repos).

## Core principles (non-negotiable)

1. **Code enforces, prompts guide** — enforcement logic lives in TypeScript extensions, not in your instructions.
2. **100K token hard cap** — smart-zone extension manages this; when you see a warning, take it seriously.
3. **TDD Iron Law** — when `tdd=true` is active, the iron-law extension blocks writes before tests; do not try to bypass it.
4. **HITL default** — always confirm significant changes with the user unless AFK mode is explicitly active.
5. **Return envelope** — when completing a task, structure your response as: status / summary / artifacts / risks / next.

## When to call Neurox (important — do NOT call it for greetings)

The Triage extension classifies every user message into one of four paths:

- `conversational` — greeting, small talk, ack ("hola", "thanks", "ok") → **DO NOT call any neurox_* tool**. Just respond conversationally and briefly.
- `small` — trivial mechanical change → only call `neurox_save` if a meaningful decision was made.
- `medium` — clear technical task → call `neurox_recall` at the start to fetch relevant prior context for the area being touched.
- `substantial` — risky / cross-module / ambiguous → call `neurox_recall` AND `neurox_context` at the start; save decisions as they happen.

**Explicit search intent** ("recuerda...", "busca en memoria...", "qué decisión tomamos sobre X") → call `neurox_recall` regardless of path.

**Do NOT call `neurox_session_start` on every prompt.** Call it only once at the beginning of a real work session, not for "hola" or "gracias".

## How to search Neurox effectively (mandatory protocol)

Neurox stores observations across MANY projects in different namespaces (e.g. `default`, `clasing-api`, `skynex`, etc.). The current project is `skynex-pi` but the user often has relevant knowledge in other projects.

**Search protocol — follow in order, do NOT skip steps:**

1. **Cross-project search first (no namespace filter)** — gives the broadest results:
   ```
   neurox_recall(query: "auth decisions login")
   ```
   Most user knowledge lives in `default` or older project namespaces.

2. **If step 1 returns 0 OR few relevant results, try synonyms / variations** — at least 2-3 attempts:
   - User asked about `auth` → also try `authentication`, `login`, `jwt`, `session`, `token`
   - User asked about `payment` → also try `billing`, `checkout`, `invoice`, `subscription`
   - User asked about `bug` → also try `fix`, `error`, `issue`, `regression`
   Show variations to the user so they see what you tried.

3. **Project-namespace search** — only if you specifically need recent project-local decisions:
   ```
   neurox_recall(query: "...", namespace: "skynex-pi")
   ```

4. **If after 2-3 search variations you STILL have 0 results**, report exactly:
   - What queries you tried
   - Suggest the user phrase the question differently OR confirm the topic was never saved.

**Never report "no memories found" after a single search attempt.** That is a failure of your search strategy, not a Neurox limitation.

**When presenting results**, tell the user which namespace they came from (`default`, `clasing-api`, etc.) and link back with the observation `id`.

## Extensions active in this project

- `triage` — classifies your incoming request (conversational/small/medium/substantial). Use `/triage:status` to see the last decision.
- `iron-law` — enforces TDD when active; blocks `write`/`edit` if no test exists for production code.
- `skill-registry` — loads SKILL.md files, injects per-agent compact rules.
- `smart-zone` — monitors token budget; warning at 80K, auto-compact at 100K.
- `neurox-tool` — gives you `neurox_recall`, `neurox_save`, `neurox_context`, `neurox_session_start`, `neurox_session_end`.
- `production-gate` — blocks production-affecting commands (`kubectl apply`, `terraform apply`, `git push --force`, `npm publish`, `rm -rf /`, etc.) and requires typed confirmation.
- `archive` — post-completion archival hook. Detects substantial-path sessions that reached the build phase and notifies the user to run `/archive:run`, which dispatches the archivist sub-agent to synthesize Neurox observations.
- `rpiv-todo` (`@juicesharp/rpiv-todo`) — Live todo overlay + `todo` tool for the model. Tracks slice/step progress with state machine (pending → in_progress → completed). Survives /compact via branch replay. Use `/todos` to inspect current task list.

## How to interact with the production-gate (important)

The `production-gate` extension is a `tool_call` hook. It intercepts dangerous commands at the moment you invoke `bash`. **The user already trusts this layer** — your job is NOT to pre-block production commands in your text response.

When the user asks for a production-affecting action (e.g. `kubectl apply`, `terraform apply`, `npm publish`):

- ✅ **DO**: call the `bash` tool with the actual command. The production-gate will intercept, show the user an arrow-key dialog (approve / cancel / show details), and either block or let it through. The user sees the dialog and decides.
- ❌ **DO NOT**: refuse to call the tool and reply with a text envelope asking for typed confirmation. That defeats the gate's UX (the dialog is much better than typed text). The gate is the source of truth, not your prompt.
- ⚠️ Exception: if the user's request is ambiguous (e.g. "deploy this" without specifying what), ask the clarifying question FIRST, then call the tool.

If the user manually configured the gate to mode `off` or `warn`, you'll see commands execute without a dialog — that's their explicit decision.

## Workflow per triage path (MANDATORY)

The triage extension classifies every request. **You MUST follow the workflow assigned to the detected path.** Do NOT improvise or skip phases just because a task looks small.

### `conversational` — no workflow

Respond briefly. Do NOT call any `neurox_*` tool, do NOT invoke any `/skill:*`.

### `small` — direct execution, no skills

Handle the change yourself with TDD if needed (the iron-law hook enforces it for production code). Do NOT invoke `/skill:discover` or any other phase skill for trivial mechanical changes.

### `medium` — workflow RECOMMENDED with escape hatch

1. **Invoke `/skill:discover` first** to gather context via the scout sub-agent (this also calls `neurox_recall` for prior decisions).
2. After reading the scout's envelope:
   - If scout returned **prior decisions relevant to this task** OR **open_questions** → continue to `/skill:plan`.
   - If scout found **no relevant context** AND the task is **self-contained (≤2 files, no risk keywords)** → you MAY skip plan/validate and go directly to build with TDD.
3. If you proceeded to plan → continue to `/skill:build` → `/skill:validate`.

### `substantial` — workflow MANDATORY, single HITL gate by default

Required steps in order:

1. `/skill:discover` — REQUIRED (scout exploration, read scout envelope)
2. `/skill:propose` — REQUIRED (product-planner writes 1-page proposal.md, auto-continues to specify)
3. `/skill:specify` — REQUIRED (product-planner + architect IN PARALLEL → SPEC.md, auto-continues to plan)
4. `/skill:plan` — REQUIRED (tech-planner reads SPEC.md → PLAN.md → **🚦 UNIFIED HITL GATE**)
5. `/skill:build` — REQUIRED per slice (coder + verifier chain; parallel for disjoint slices)
6. `/skill:validate` — REQUIRED before completion (test-reviewer + security ×2 + skill-validator, parallel)

**The unified gate at step 4 is the SINGLE checkpoint by default.** The user sees `proposal.md`, `SPEC.md`, and `PLAN.md` together in `.skynex/<feature-slug>/` and approves once before execution.

### HITL behavior — env var `SKYNEX_HITL`

| `SKYNEX_HITL` | Behavior |
|---|---|
| _(unset)_ or `single` | **Default.** One gate at /skill:plan. Auto-continues propose → specify → plan, then blocks. |
| `strict` | Three gates: after proposal.md, after SPEC.md, after PLAN.md. |
| `none` | Escape hatch. NO gates. Full auto execution end-to-end. Use only when you trust the workflow completely. |

### Responding to the gate

At the gate, reply with natural language:
- **Approve** (continue to /skill:build): `approve`, `dale`, `ok`, `sí`, `go`, `proceed`, `ejecuta`
- **Edit** (revise plan with note): `edit "add OIDC support"`, `modify "split slice 3"`, etc.
- **Cancel** (abort): `cancel`, `no`, `stop`, `para`, `abortar`

Ambiguous responses are met with one clarifying question. The model does NOT proceed without an unambiguous answer.

### Auto-archive on session_shutdown

The `archive` extension detects substantial-path sessions that reached at least the build phase, and notifies you to run `/archive:run` which invokes the archivist sub-agent to synthesize Neurox observations.

**Triggers for substantial classification**: auth/payment/migration/security/cross-cutting keywords, OR `module_count >= 3`, OR `ambiguity_hits >= 3` (configurable in `.skynex/triage.config.json`).

### The 6 phase skills (substantial path)

| Phase | Skill | Sub-agent(s) | Mode |
|---|---|---|---|
| 1 | `/skill:discover` | `scout` | single |
| 2 | `/skill:propose` | `product-planner` | single |
| 3 | `/skill:specify` | `product-planner` + `architect` | parallel |
| 4 | `/skill:plan` | `tech-planner` | single |
| 5 | `/skill:build` | `coder` + `verifier` | chain (sequential) or parallel (independent slices) |
| 6 | `/skill:validate` | `test-reviewer` + `security`×2 + `skill-validator` | parallel (4 at once) |

Each skill emits a structured envelope. The next phase consumes that envelope. If any envelope has `status: blocked` or `status: questions_pending`, STOP and surface to the user.

### Sub-agents in substantial path

- `scout` — Context discovery and open question detection (read-only, calls Neurox)
- `product-planner` — Produces acceptance criteria, edge cases, error modes (read-only)
- `architect` — Produces modules, data flow, decisions, tradeoffs, risks (read-only)
- `tech-planner` — Converts SPEC.md into technical PLAN.md with slices and risk mitigation (read-only)
- `coder` — Implements slices per PLAN.md with TDD (executes bash, git, edit/write)
- `verifier` — Post-implementation verification chain (test runner, type checker, lint)
- `test-reviewer` — Post-completion test quality audit (read-only)
- `security` — Security review (appears 2× in validation phase, read-only)
- `skill-validator` — Checks adherence to project conventions and skills (read-only)
- `archivist` — Post-completion session synthesis for Neurox archival (read-only + bash for git inspection)

## Other skills (load on-demand with `/skill:name`)

- `grill-me` — discovery questioning (one question at a time)
- `tdd-discipline` — TDD workflow (red → green → refactor)
- `verification-before-completion` — pre-completion checklist
- `adversarial-review` — dual-judge adversarial review
- `prd` — product requirements document
- `security` — security review
- `propose` — early HITL gate for substantial path. Invokes product-planner solo to produce proposal.md.
- `specify` — produces unified SPEC.md. Invokes product-planner + architect in parallel.

## Response format

Keep responses concise. Match the tone to the triage path:

- `conversational`: 1-2 lines max. No envelope, no checklists, no Neurox dumps.
- `small`: brief. Show what changed and what's next. Envelope optional.
- `medium`/`substantial`: full return envelope (status / summary / artifacts / risks / next).

Do NOT repeat instructions back. Do NOT apologize unnecessarily.
