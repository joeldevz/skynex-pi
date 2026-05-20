# .pi/agents/

Sub-agent definitions for the skynex-pi Medium-path and Substantial-path workflows.

The `pi-sub-agent` npm package (installed in Sprint 2) auto-discovers any `.md` file in this directory whose frontmatter has a `name` and `description`. Each becomes a callable sub-agent the orchestrator can spawn in an isolated `pi --mode rpc --no-session` subprocess.

## Files

| Agent | Role | Mutates files? | Can run in parallel? |
|---|---|---|---|
| `scout.md` | Read-only codebase exploration; gathers context before planning | No | Yes (multi-area scouts) |
| `tech-planner.md` | Produces prescriptive PLAN.md with vertical slices | No | No (single planner per task) |
| `coder.md` | Implements one PLAN step at a time (Iron Law L4 enforced) | Yes | Yes (independent slices) |
| `verifier.md` | Mechanical lint + typecheck + tests gate | No | Yes (per-slice verifier) |
| `test-reviewer.md` | Audits test substance + Iron Law compliance | No | Yes (post-build, in parallel with security/skill-validator) |
| `security.md` | Adversarial security judge (launched 2x in parallel) | No | Yes (always 2x parallel) |
| `skill-validator.md` | Enforces skill-registry compact rules on changed files | No | Yes (post-build, parallel with reviews) |

## Frontmatter contract (per Pi)

```yaml
---
name: <unique identifier>          # required
description: <when to use it>      # required, used by orchestrator routing
tools: read, write, edit, bash     # optional, comma-separated allowlist
model: claude-sonnet-4-5           # optional, override parent's model
---
```

The body is the system prompt loaded into the sub-agent's isolated session.

## Mandatory return envelope (canonical YAML in fenced block)

Every sub-agent MUST end its final reply with **exactly one** envelope block:

````
```yaml envelope
status: <agent-specific enum>
summary: <one-line outcome>
artifacts:
  - <path or identifier>
risks:
  - <one-line risk>
next: <one-line recommendation for the orchestrator>
# role-specific fields below as needed
```
````

Agent-specific extra fields go after `next:`. The orchestrator parses the envelope; everything outside the fenced block is human-readable context.

### Per-agent `status` enums

| Agent | Allowed status values |
|---|---|
| scout | `ready` / `partial` / `blocked` |
| tech-planner | `ready` / `questions_pending` / `blocked` |
| coder | `success` / `needs_review` / `blocked` |
| verifier | `pass` / `fail` / `error` |
| test-reviewer | `SOUND` / `WEAK` / `MISLEADING` |
| security | `APPROVED` / `NEEDS_FIX` / `ESCALATED` |
| skill-validator | `COMPLIANT` / `VIOLATIONS` |

## Termination rule (mandatory for every sub-agent)

After producing the envelope, the sub-agent **MUST exit immediately**. No follow-up questions, no proactive offers, no waiting for the parent. The only way to stay in the loop is to return `status: needs_review` / `questions_pending` / `blocked` — these signal to the orchestrator that a second turn is needed.

This is enforced via the **last sentence of every sub-agent prompt**: `Emit the envelope and stop. Do not produce any further output.`

## Parallelism (how the orchestrator runs sub-agents concurrently)

`pi-sub-agent` supports three modes: `single`, `parallel`, `chain`. The orchestrator picks per phase:

| Phase | Mode | Why |
|---|---|---|
| **discover** | single | Only one scout per task (focused context). |
| **plan** | single | One tech-planner. Multiple plans would conflict. |
| **build (independent slices)** | parallel | If PLAN.md marks slices as `parallel: true` and they touch disjoint files, launch N coders concurrently. |
| **build (dependent slices)** | chain | Sequential coder→verifier→coder→verifier per slice in order. |
| **validate** | parallel | test-reviewer + security ×2 + skill-validator all run on the same artifacts simultaneously. |
| **security dual-judge** | parallel | Always 2 security instances on the same change-set; the orchestrator synthesizes both reports. |

**Concurrency limits** (per `pi-sub-agent` defaults):
- `MAX_PARALLEL_TASKS = 8`
- `MAX_CONCURRENCY = 4` (4 sub-agents running at once; further are queued)

The orchestrator may override per-call. Sub-agents themselves never spawn other sub-agents (recursive fan-out is disabled by `pi-sub-agent` for safety).

## Design principles followed

1. **Tight prompts**: each ≤ 800 tokens of body to leave context for the actual task.
2. **Canonical envelope**: structured YAML at the end of every reply — orchestrator parses, not interprets.
3. **Tool restrictions**: scout / verifier / test-reviewer / security / skill-validator have NO `write`. Only the coder can mutate.
4. **Neurox usage centralized**: only `scout` calls `neurox_recall` (cross-namespace, for context). The orchestrator persists decisions via `neurox_save` after synthesis. No other sub-agent touches Neurox.
5. **Iron Law trust**: the coder doesn't have a "write" check in its prompt — the `iron-law` extension hook enforces it at runtime. Defense in code, not prompt.
6. **Model-agnostic**: no agent hardcodes a model (omits the `model:` field) so it works with whatever provider the user is on (Claude / GPT-5.5 / Gemini).
7. **Terminate on completion**: every prompt ends with the explicit kill-switch line.
8. **Parallel-safe**: read-only agents and disjoint-file mutations can run concurrently without coordination.

## How they fit together (Medium path)

```
USER prompt → triage (medium)
  ↓
discover.ts extension  →  spawns scout (single)        →  exploration envelope
  ↓
plan.ts extension      →  spawns tech-planner (single) →  PLAN.md + envelope
  ↓
build.ts extension     →  per slice:
                           if parallel: spawn N coders concurrently
                           if sequential: coder→verifier loop
                          →  build envelopes
  ↓
validate.ts extension  →  spawns IN PARALLEL:
                           - test-reviewer
                           - security × 2 (dual judge)
                           - skill-validator
                          →  4 envelopes, orchestrator synthesizes
  ↓
ORCHESTRATOR synthesizes + saves to Neurox + suggests commit
```

## What's NOT in this sprint

- Sub-agent definitions for the Substantial-path 9-phase workflow (`calibrate`, `explore`, `propose`, `specify`, `architect`, `slice`, `build`, `validate`, `archive`). Those reuse the same sub-agents above but in a different orchestration order — defined later in Sprint 3.
- `pi-sub-agent` package installation — happens at the start of the next code-task in Sprint 2.
