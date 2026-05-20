# .pi/agents/

Sub-agent definitions for the skynex-pi Medium-path workflow.

The `pi-sub-agent` npm package (installed in Sprint 2) auto-discovers any `.md` file in this directory whose frontmatter has a `name` and `description`. Each becomes a callable sub-agent the orchestrator can spawn in an isolated `pi --mode rpc` subprocess.

## Files

| Agent | Role | Mutates files? |
|---|---|---|
| `scout.md` | Read-only codebase exploration; gathers context before planning | No |
| `tech-planner.md` | Produces prescriptive PLAN.md with vertical slices | No |
| `coder.md` | Implements one PLAN step at a time (Iron Law L4 enforced) | Yes |
| `verifier.md` | Mechanical lint + typecheck + tests gate | No |
| `test-reviewer.md` | Audits test substance + Iron Law compliance | No |
| `security.md` | Adversarial security judge (launched 2x in parallel) | No |
| `skill-validator.md` | Enforces skill-registry compact rules on changed files | No |

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

## Design principles followed

1. **Tight prompts**: each ≤ 800 tokens to leave context for the actual task.
2. **Return envelope**: every agent's output is structured (status / summary / artifacts / risks).
3. **Tool restrictions**: scout/verifier/test-reviewer/security/skill-validator have NO `write`. Only the coder can mutate.
4. **No Neurox-by-default**: only `scout` calls Neurox (cross-namespace). The orchestrator persists decisions, not each sub-agent.
5. **Iron Law trust**: the coder doesn't have a "write" check in its prompt — the `iron-law` extension hook enforces it at runtime. Defence in code, not prompt.
6. **Model-agnostic**: no agent hardcodes a model (omits the `model:` field) so it works with whatever provider the user is on (Claude / GPT-5.5 / Gemini).

## How they fit together (Medium path)

```
USER prompt → triage (medium)
  ↓
discover.ts extension  →  spawns scout            →  exploration report
  ↓
plan.ts extension      →  spawns tech-planner     →  PLAN.md
  ↓
build.ts extension     →  spawns coder + verifier →  code + tests (loop until green)
  ↓
validate.ts extension  →  spawns:
                           - test-reviewer
                           - security (×2 parallel)
                           - skill-validator
                          →  decision: APPROVED | NEEDS_FIX | ESCALATED
  ↓
ORCHESTRATOR synthesizes + saves to Neurox + suggests commit
```

## Not in this sprint

- Sub-agent definitions for the Substantial-path 9-phase workflow (`calibrate`, `explore`, `propose`, `specify`, `architect`, `slice`, `build`, `validate`, `archive`). Those reuse the same sub-agents above but in a different orchestration order — defined later in Sprint 3.
- `pi-sub-agent` package installation — happens at the start of Sprint 2 code work.
