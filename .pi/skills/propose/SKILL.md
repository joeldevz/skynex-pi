---
name: propose
description: Substantial-path proposal skill. Invokes product-planner to write a 1-page proposal.md. By default AUTO-CONTINUES to /skill:specify (no gate). Only blocks for user approval when SKYNEX_HITL=strict.
---

# propose — Phase 1.5: early HITL gate for direction approval

> Triage path: `substantial` · Sub-agent: `product-planner` (single mode) · Mutates files: **yes** (writes `proposal.md` to `.skynex/<feature-slug>/proposal.md`)

## Compact Rules

- Invoke ONLY product-planner (single sub-agent, never parallel here)
- Pass scope: "proposal only — 1 page" so product-planner produces MINIMAL acceptance criteria (3-5), NOT full spec
- Write proposal.md to .skynex/<feature-slug>/proposal.md (feature-slug = kebab-case derived from user task, max 30 chars)
- proposal.md MUST contain: Goal (2 sentences), Approach proposed, Key acceptance criteria (3-5), Major risks (1-3), Rough effort estimate (S/M/L/XL)
- Default behavior: AUTO-CONTINUE to /skill:specify immediately after writing proposal.md. Do NOT stop, do NOT ask user.
- ONLY if env var SKYNEX_HITL=strict is set: STOP after writing. Show the gate panel and wait for approve/dale/ok/sí/go (continue), edit "<note>" (revise), or cancel/no/stop (abort)
- If SKYNEX_HITL=none: same as default (auto-continue)
- When auto-continuing, surface a brief one-line notification: "📄 Proposal written: .skynex/<slug>/proposal.md → continuing to /skill:specify"

## How to invoke

```
subagent({
  agent: "product-planner",
  agentScope: "project",
  confirmProjectAgents: false,
  task: "Propose approach for: <user task verbatim>. Scope: PROPOSAL ONLY — produce 3-5 high-level acceptance criteria, NOT full spec. Scout findings: <scout envelope YAML>"
})
```

`confirmProjectAgents: false` skips the interactive dialog. Product-planner is a trusted, version-controlled agent; confirming on every invocation is noise.

## HITL Behavior

This skill's gate is controlled by the env var `SKYNEX_HITL`:

| `SKYNEX_HITL` | Behavior |
|---|---|
| _(unset)_ or `single` | AUTO-CONTINUE to /skill:specify after writing proposal.md |
| `strict` | STOP. Show gate panel. Wait for approve/edit/cancel. |
| `none` | AUTO-CONTINUE (same as default) |

Default = `single` = only the final gate in /skill:plan blocks. This minimizes interruptions during planning while preserving one explicit human checkpoint before code execution.

### Strict-mode gate panel (only shown when SKYNEX_HITL=strict)

When stopping, render this panel:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚦 GATE 1 of 3 — Proposal review (SKYNEX_HITL=strict)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Feature: <feature-slug>
  Artifact: .skynex/<feature-slug>/proposal.md

  Reply with one of:
    • approve | dale | ok | sí | go     → continue to /skill:specify
    • edit "<note>"                      → revise proposal
    • cancel | no | stop | abortar       → abort workflow

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Accept these as approval (case-insensitive): `approve`, `yes`, `y`, `dale`, `ok`, `sí`, `si`, `go`, `continúa`, `continua`, `next`.
Accept these as cancel: `cancel`, `no`, `n`, `stop`, `para`, `abortar`, `abort`.
Anything starting with `edit` (e.g. `edit "add OIDC"`) → re-invoke product-planner with the note.
If the response is ambiguous, ASK ONCE to clarify; do not assume.

## Workflow

**a. Derive feature-slug** from user task (kebab-case, max 30 chars, deterministic).

**b. Ensure directory exists** — create `.skynex/<feature-slug>/` if not present.

**c. Invoke product-planner** with task field containing:
   - Exact user task description (verbatim)
   - Scope constraint: "PROPOSAL ONLY — 3-5 acceptance criteria, NOT full spec"
   - Scout envelope (YAML, verbatim from discover)

**d. Parse the envelope** returned by product-planner. Look for ` ```yaml envelope ` fenced block at end of output.
   - If `status: questions_pending` or `status: blocked` → surface questions/blocker to user and STOP.
   - If `status: ready` → proceed to step e.

**e. Synthesize proposal.md** using the template below and write to `.skynex/<feature-slug>/proposal.md`.

**f. Surface to user** — display proposal.md path and content (print or notify).

**g. Check `SKYNEX_HITL` env var:**
   - If `strict` → render the gate panel (see HITL Behavior section) and wait for response
   - Otherwise → emit a one-line notification "📄 Proposal written: <path> → continuing to /skill:specify" and immediately invoke /skill:specify

## proposal.md template

```markdown
# Proposal: <feature title>

**Status:** PROPOSED (awaiting user approval)
**Feature slug:** <feature-slug>
**Date:** <YYYY-MM-DD>

## Goal

<2 sentences max>

## Proposed Approach

<3-5 sentences describing the approach>

## Key Acceptance Criteria

- AC-1: <criterion>
- AC-2: <criterion>
- AC-3: <criterion>

## Major Risks

- **<severity>**: <risk> — <brief mitigation idea>

## Effort Estimate

<S | M | L | XL> (<rough hours/days>)

## Next Step

On approval, run `/skill:specify` to produce full SPEC.md with product-planner + architect in parallel.
```

## Output envelope

```yaml
status: ready | cancelled | edit_requested
feature_slug: "<slug>"
artifact: ".skynex/<feature-slug>/proposal.md"
summary: "<one-sentence what was proposed>"
hitl_mode: single | strict | none
awaiting: approval | edit_note | none
next_action: continue_to_specify | wait_for_approval | aborted
```

Return this envelope to the orchestrator. On default behavior, auto-continue to /skill:specify. Only wait for user response if SKYNEX_HITL=strict.

## Common pitfalls

- **Don't STOP on default behavior** — the user explicitly chose less friction. Only stop on SKYNEX_HITL=strict.
- **Don't suppress the one-line notification** — the user needs to know proposal.md was written before specify takes over.
- **Don't use the gate panel for the brief notification** — they're different (panel = full stop UI, notification = quick info).
- **Don't produce more than 5 acceptance criteria** — that's `/skill:specify`'s job to expand into full SPEC.
- **Don't reference architecture details** (decisions, modules, tech stack) — that's architect's job in `/skill:specify`.
- **Keep feature-slug deterministic** — same user task must always produce same slug for reproducibility.
- **Don't reshape scout findings** — pass them verbatim to product-planner.
