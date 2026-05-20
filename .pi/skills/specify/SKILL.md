---
name: specify
description: Substantial-path specification skill. Invokes product-planner + architect in parallel, merges into unified SPEC.md, then STOPS for user approval before /skill:plan.
---

# specify — Phase 2: parallel WHAT+WHY+HOW specification

> Triage path: `substantial` · Sub-agents: `product-planner` + `architect` (parallel mode) · Mutates files: **yes** (writes `SPEC.md` to `.skynex/<feature-slug>/SPEC.md`)

## Compact Rules

- Invoke product-planner + architect IN PARALLEL via single `subagent({tasks: [...]})` call — NEVER serial.
- Pass scope: "FULL spec" so product-planner produces complete acceptance criteria (up to 10) and architect produces full design.
- Both agents receive: user task + scout envelope + approved proposal.md content.
- Merge both envelopes into `.skynex/<feature-slug>/SPEC.md` with two sections: "## What & Why (Product)" and "## How (Architecture)".
- Highlight any architect risks of severity `critical` or `high` at the top of SPEC.md in a "⚠️ Risks to Confirm" box.
- STOP after writing. Surface SPEC.md path + risks summary to user. Wait for `approve` / `edit "<note>"` / `cancel`.
- If user says `edit`, re-invoke whichever agent(s) the user note targets (product, architect, or both).
- Only proceed to `/skill:plan` after explicit `approve`.

## How to invoke

```
subagent({
  agentScope: "project",
  confirmProjectAgents: false,
  tasks: [
    {
      agent: "product-planner",
      task: "Produce FULL specification for: <user task verbatim>. Approved proposal: <proposal.md content>. Scout findings: <scout envelope YAML>. Scope: complete acceptance criteria (up to 10), edge cases, error modes, non-functional requirements, out-of-scope."
    },
    {
      agent: "architect",
      task: "Produce technical design for: <user task verbatim>. Approved proposal: <proposal.md content>. Scout findings: <scout envelope YAML>. Scope: modules, data flow, decisions with alternatives_rejected, tradeoffs, risks, new dependencies."
    }
  ]
})
```

The `subagent` tool returns an array of 2 results in submission order. Each contains a final `yaml envelope` fenced block. BOTH run in parallel; wait for both to complete before merging.

## Workflow

**a. Read proposal.md** — verify `.skynex/<feature-slug>/proposal.md` exists and user approved it.
   - If not present → surface error "proposal.md not found; workflow skipped", stop.
   - Extract feature-slug from the proposal's frontmatter.

**b. Invoke both agents in parallel** via the `subagent` call shown above with:
   - User task (verbatim from original request)
   - Full proposal.md content (verbatim)
   - Scout envelope (YAML, verbatim from discover)

**c. Wait for BOTH envelopes.** If either has `status: blocked` or `status: questions_pending`, surface and STOP — do NOT proceed to merge.
   - Collect all questions from both agents if present.
   - Return to user with awaiting=clarification.

**d. Merge envelopes into SPEC.md** (template below).
   - Product-planner output → "## What & Why (Product)" section.
   - Architect output → "## How (Architecture)" section.
   - Extract architect's `risks: [...]` and filter for `severity: critical` or `high`.
   - Synthesize those into the "⚠️ Risks to Confirm" box at the top.

**e. Write to `.skynex/<feature-slug>/SPEC.md`.**

**f. Surface to user** — display SPEC.md path, content, and risks summary.

**g. STOP and wait** for explicit user response:
   - `approve` → return envelope with status=ready, proceed to `/skill:plan`
   - `edit "<note>"` → determine which agent(s) to re-invoke and loop to step b
   - `cancel` → return envelope with status=cancelled, stop workflow

## SPEC.md template

```markdown
# Spec: <feature title>

**Status:** SPECIFIED (awaiting user approval)
**Feature slug:** <feature-slug>
**Date:** <YYYY-MM-DD>
**Sources:** proposal.md (approved) + product-planner envelope + architect envelope

## ⚠️ Risks to Confirm

<only present if architect reported risks with severity=critical or high>

- **<severity>** R-1: <risk> — Mitigation: <mitigation>
- **<severity>** R-2: <risk> — Mitigation: <mitigation>

(If no high/critical risks: "None reported at this stage.")

---

## What & Why (Product)

<from product-planner envelope>

### Acceptance Criteria

- AC-1: <description>
  - testable: <true|false>
- AC-2: <description>
  - testable: <true|false>

### Edge Cases

- <case>: <expected_behavior>
- <case>: <expected_behavior>

### Error Modes

- <error>: <recovery>
- <error>: <recovery>

### Non-Functional Requirements

- Performance: <...>
- Security: <...>
- Scalability: <...>

### Out of Scope

- <thing>
- <thing>

---

## How (Architecture)

<from architect envelope>

### Modules

- **<name>** (`<files>`) — <responsibility>
- **<name>** (`<files>`) — <responsibility>

### Data Flow

1. <from> → <to>: <description>
2. <from> → <to>: <description>

### Decisions

- **D-1**: <decision>
  - Rationale: <rationale>
  - Alternatives rejected: <list>

### Tradeoffs

- <tradeoff>: chose <choice>, accepted cost: <cost>

### Risks (full list)

- **<severity>** R-1: <risk> → <mitigation>
- **<severity>** R-2: <risk> → <mitigation>

### New Dependencies

- `<package>@<version>` — <why> — License: <license>
- `<package>@<version>` — <why> — License: <license>

## Next Step

On approval, run `/skill:plan` to produce executable PLAN.md.
```

## Output envelope

```yaml
status: ready | cancelled | edit_requested | blocked
feature_slug: "<slug>"
artifact: ".skynex/<feature-slug>/SPEC.md"
sources:
  proposal: ".skynex/<feature-slug>/proposal.md"
  product_planner_envelope: "<inline or path>"
  architect_envelope: "<inline or path>"
risks_summary:
  critical: <count>
  high: <count>
  medium: <count>
  low: <count>
awaiting: approval | edit_note | clarification | none
```

Return this envelope to the orchestrator. Do NOT invoke `/skill:plan` until user sends `approve`.

## Common pitfalls

- **Never invoke product-planner and architect serially** — they must run in parallel via `tasks: [...]` in a single `subagent` call. Sequential invocation doubles latency unnecessarily.
- **Do not collapse the two sections into one** — keep "What & Why (Product)" and "How (Architecture)" strictly distinct. They address different audiences (product team vs engineering team).
- **Don't omit the ⚠️ Risks box even if empty** — always include it; show "None reported at this stage." instead of deleting the section entirely.
- **If feature-slug doesn't have a proposal.md, the workflow was skipped** — surface error, do NOT fabricate or re-run propose.
- **Don't reshape scout findings or proposal content** — pass them verbatim to the agents; merging happens after agent output, not before.
