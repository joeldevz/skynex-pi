# Archive Extension

Post-completion synthesis for substantial-path sessions. Detects when a session reaches the `build` phase and the triage classified it as `substantial`, then notifies the user to run `/archive:run` to synthesize the session into Neurox observations.

## Purpose

After a substantial-path session completes the build and validate phases, the archive extension:
- Tracks which phases were executed (discover, propose, specify, plan, build, validate)
- On `session_shutdown`, checks if the session was substantial AND reached build
- If yes, notifies the user that the session is eligible for archival
- Provides guidance for invoking the archivist sub-agent (`archivist.md`) and dispatching observations to Neurox

This ensures that valuable decisions, patterns, and learnings from substantial work are captured in persistent memory.

## Hooks Used

- **`session_start`** — Initialize per-session phase tracking (Map<sessionId, Set<phases>>)
- **`tool_call`** — Detect skill invocations (skill tool) and sub-agent invocations (subagent tool) to track which phases have been reached
- **`session_shutdown`** — Check if session qualifies for archival; notify user if so

## Sub-agent Invoked

**`archivist` (`.pi/agents/archivist.md`)** — Reads session artifacts and outputs a structured envelope with:
- `session_summary` — goal, outcome, duration, cost
- `observations_to_save` — list of Neurox observations (decision, discovery, bugfix, pattern, gotcha, config, preference)
- `artifacts_archived` — list of `.skynex/<feature>/*.md` files created
- `next_steps_suggested` — concrete follow-up actions (e.g., `/commit`, `/pr`)

## Commands

- **`/archive:run`** — Display guidance for manually invoking the archivist and dispatching observations to Neurox
- **`/archive:status`** — Show which phases (discover, propose, specify, plan, build, validate) have been reached in the current session

## Per-Session State

The extension maintains a `Map<sessionId, PhaseState>` where `PhaseState` tracks:
- `reached: Set<string>` — phases that have been invoked (populate by monitoring tool_call events)
- `startedAt: number` — timestamp of session start

This state is cleaned up on `session_shutdown`.

## Phase Detection

Phases are marked as "reached" when:
1. The model invokes `/skill:<phase>` (e.g., `/skill:build`)
2. The model invokes a sub-agent associated with a phase (e.g., `subagent({agent: "coder", ...})` → marks "build")

Supported phases: `discover`, `propose`, `specify`, `plan`, `build`, `validate`

## Decision Logic

The extension archives only when **both** conditions are met:
- Session triage classification is **`substantial`** (from triage extension)
- Session **reached at least the `build` phase** (from tool_call monitoring)

If either condition fails, the extension silently skips (no notification).

## Limitations (v0.1)

Pi v0.75 does not support invoking sub-agents from hooks. Therefore:
- The extension **cannot directly call the archivist** on session_shutdown
- Instead, it **notifies the user** and provides guidance to invoke `/archive:run`
- `/archive:run` displays a step-by-step workflow for the LLM to follow
- The **LLM then invokes the archivist** and dispatches observations to Neurox

**Future v0.2**: Once Pi supports async sub-agent invocation from hooks, the extension will:
- Automatically invoke `subagent({agent: "archivist", ...})`
- Parse the envelope output
- Dispatch each observation to `neurox_save()` automatically
- Require no user action beyond the session completing

## Integration Points

- **Triage extension** — reads `getTriage(sessionFile)` to determine if session is substantial
- **Neurox tool** — the LLM (guided by `/archive:run`) calls `neurox_save` for each observation
- **Skill system** — monitors `/skill:*` invocations to detect phase progression

## Example Workflow

1. User starts a substantial-path task
2. Model runs: `/skill:discover` → `/skill:propose` → `/skill:specify` → `/skill:plan` → `/skill:build` → `/skill:validate`
3. Session ends successfully
4. Archive extension fires on `session_shutdown`:
   - Checks: `substantial` + `build` reached? ✓
   - Notifies: "Substantial-path session completed. Run `/archive:run` to synthesize Neurox observations."
5. User runs `/archive:run`
6. Extension displays guidance; model invokes:
   - `subagent({agent: "archivist", confirmProjectAgents: false})`
   - Receives archivist envelope (YAML block)
   - For each observation: `neurox_save({...})`
7. Observations saved to Neurox; session knowledge persists
