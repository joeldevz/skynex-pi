---
name: propose
description: Substantial-path proposal skill. Invokes product-planner for a 1-page proposal, writes it to .skynex/<feature>/proposal.md, then STOPS for user approval before /skill:specify.
---

# propose — Phase 1.5: early HITL gate for direction approval

> Triage path: `substantial` · Sub-agent: `product-planner` (single mode) · Mutates files: **yes** (writes `proposal.md` to `.skynex/<feature-slug>/proposal.md`)

## Compact Rules

- Invoke ONLY product-planner (single sub-agent, never parallel here).
- Pass scope: "proposal only — 1 page" so product-planner produces MINIMAL acceptance criteria (3-5), NOT full spec.
- Write proposal.md to `.skynex/<feature-slug>/proposal.md` (feature-slug = kebab-case derived from user task).
- proposal.md MUST contain: Goal (2 sentences), Approach proposed, Key acceptance criteria (3-5), Major risks (1-3), Rough effort estimate (S/M/L/XL).
- STOP after writing. Surface proposal.md content + path to user. Wait for `approve` / `edit "<note>"` / `cancel`.
- If user says `edit`, re-invoke product-planner with the user's note appended to task.
- If user says `cancel`, return envelope status=cancelled and stop the workflow.
- Only proceed to /skill:specify after explicit `approve`.

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

**g. STOP and wait** for explicit user response:
   - `approve` → return envelope with status=ready, proceed to `/skill:specify`
   - `edit "<note>"` → re-invoke product-planner with: original task + user's note, loop to step c
   - `cancel` → return envelope with status=cancelled, stop workflow

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
awaiting: approval | edit_note | none
```

Return this envelope to the orchestrator. Do NOT invoke `/skill:specify` until user sends `approve`.

## Common pitfalls

- **Don't skip the HITL gate** even if approach seems obvious. The proposal forces early alignment.
- **Don't produce more than 5 acceptance criteria** — that's `/skill:specify`'s job to expand into full SPEC.
- **Don't reference architecture details** (decisions, modules, tech stack) — that's architect's job in `/skill:specify`.
- **Keep feature-slug deterministic** — same user task must always produce same slug for reproducibility.
- **Don't reshape scout findings** — pass them verbatim to product-planner.
