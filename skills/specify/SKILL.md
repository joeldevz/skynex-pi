---
name: specify
description: Substantial-path specification skill. Invokes product-planner + architect IN PARALLEL, merges into unified SPEC.md. By default AUTO-CONTINUES to /skill:plan (no gate). Only blocks for user approval when SKYNEX_HITL=strict.
---

# specify — Phase 2: parallel WHAT+WHY+HOW specification

> Triage path: `substantial` · Sub-agents: `product-planner` + `architect` (parallel mode) · Mutates files: **yes** (writes `SPEC.md` to `.skynex/<feature-slug>/SPEC.md`)

## Compact Rules

- Invoke product-planner + architect IN PARALLEL via single subagent({tasks: [...]}) call — NEVER serial
- Pass scope: "FULL spec" so product-planner produces complete acceptance criteria (up to 10) and architect produces full design
- Both agents receive: user task + scout envelope + approved-or-auto-generated proposal.md content
- Merge both envelopes into .skynex/<feature-slug>/SPEC.md with two sections: "## What & Why (Product)" and "## How (Architecture)"
- Highlight any architect risks of severity `critical` or `high` at the top of SPEC.md in a "⚠️ Risks to Confirm" box
- Default behavior: AUTO-CONTINUE to /skill:plan immediately after writing SPEC.md. Do NOT stop, do NOT ask user.
- ONLY if env var SKYNEX_HITL=strict is set: STOP after writing. Show the gate panel and wait for approve/dale/ok/sí/go (continue), edit "<note>" (revise), or cancel/no/stop (abort)
- If SKYNEX_HITL=none: same as default (auto-continue)
- When auto-continuing, surface a brief one-line notification: "📄 SPEC written: .skynex/<slug>/SPEC.md (N high/critical risks) → continuing to /skill:plan"
- If ANY sub-agent envelope returns status=questions_pending or status=blocked, you MUST surface the questions to the user and STOP. Do NOT synthesize SPEC.md yourself using prior context. Do NOT assume earlier user answers cover the pending questions. Re-invoke the sub-agent with the user's new answers to get a status=ready envelope.

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

## HITL Behavior

Controlled by env var `SKYNEX_HITL`:

| `SKYNEX_HITL` | Behavior |
|---|---|
| _(unset)_ or `single` | AUTO-CONTINUE to /skill:plan after writing SPEC.md |
| `strict` | STOP. Show gate panel. Wait for approve/edit/cancel. |
| `none` | AUTO-CONTINUE (same as default) |

Default = `single` = only the final gate in /skill:plan blocks.

### Strict-mode gate panel (only when SKYNEX_HITL=strict)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚦 GATE 2 of 3 — Spec review (SKYNEX_HITL=strict)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Feature: <feature-slug>
  Artifact: .skynex/<feature-slug>/SPEC.md

  ⚠️ Risks summary:
    critical: <N> | high: <N> | medium: <N> | low: <N>

  Reply with one of:
    • approve | dale | ok | sí | go     → continue to /skill:plan
    • edit "<note>"                      → revise (product, architect, or both)
    • cancel | no | stop | abortar       → abort workflow

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Accept these as approval (case-insensitive): `approve`, `yes`, `y`, `dale`, `ok`, `sí`, `si`, `go`, `continúa`, `continua`, `next`.
Accept these as cancel: `cancel`, `no`, `n`, `stop`, `para`, `abortar`, `abort`.
Anything starting with `edit` → re-invoke whichever agent(s) the note targets.
If response ambiguous, ASK ONCE to clarify.

## Workflow

**a. Read proposal.md** — verify `.skynex/<feature-slug>/proposal.md` exists and user approved it.
   - If not present → surface error "proposal.md not found; workflow skipped", stop.
   - Extract feature-slug from the proposal's frontmatter.

**b. Invoke both agents in parallel** via the `subagent` call shown above with:
   - User task (verbatim from original request)
   - Full proposal.md content (verbatim)
   - Scout envelope (YAML, verbatim from discover)

**c. Wait for BOTH envelopes.**
   - If BOTH status=ready → proceed to merge into SPEC.md
   - If EITHER status=questions_pending → collect ALL pending questions from BOTH agents, surface to user, STOP. Do NOT write SPEC.md. Do NOT synthesize from your own knowledge.
   - If EITHER status=blocked → surface blocker_reason, STOP.
   - **There is no fourth option.** You must not proceed with any status other than ready.

**d. Merge envelopes into SPEC.md** (template below).
   - Product-planner output → "## What & Why (Product)" section.
   - Architect output → "## How (Architecture)" section.
   - Extract architect's `risks: [...]` and filter for `severity: critical` or `high`.
   - Synthesize those into the "⚠️ Risks to Confirm" box at the top.

**e. Write to `.skynex/<feature-slug>/SPEC.md`.**

**f. Check `SKYNEX_HITL` env var:**
   - If `strict` → render the gate panel (see HITL Behavior section) and wait for response
   - Otherwise → emit a one-line notification "📄 SPEC written: <path> (N high/critical risks) → continuing to /skill:plan" and immediately invoke /skill:plan

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

## Anti-bypass rules

These rules exist because LLMs sometimes "helpfully" bypass contracts when they think they have enough context. **Do NOT do this.**

1. **NEVER write SPEC.md manually.** SPEC.md is ALWAYS synthesized from two sub-agent envelopes (product-planner + architect). If you write it from your own knowledge, the spec lacks the structured fields (acceptance_criteria, modules, risks) that downstream skills depend on.

2. **NEVER assume prior user answers cover new questions.** If product-planner asks "which IdP?" and the user said "Okta" during discover, that answer was for scout — not for product-planner. The product-planner may be asking for a DIFFERENT level of detail. Surface the question.

3. **NEVER proceed with status != ready.** The ONLY valid state for writing SPEC.md is: BOTH product-planner AND architect returned status=ready. Any other combination → STOP.

4. **If you're tempted to "just write it yourself"** — that's the signal that something went wrong upstream. Surface the issue to the user instead.

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
  critical: 0
  high: 0
  medium: 0
  low: 0
hitl_mode: single | strict | none
awaiting: approval | edit_note | none
next_action: continue_to_plan | wait_for_approval | aborted
```

Return this envelope to the orchestrator.

## Common pitfalls

- **Never invoke product-planner and architect serially** — they must run in parallel via `tasks: [...]` in a single `subagent` call. Sequential invocation doubles latency unnecessarily.
- **Do not collapse the two sections into one** — keep "What & Why (Product)" and "How (Architecture)" strictly distinct. They address different audiences (product team vs engineering team).
- **Don't omit the ⚠️ Risks box even if empty** — always include it; show "None reported at this stage." instead of deleting the section entirely.
- **If feature-slug doesn't have a proposal.md, the workflow was skipped** — surface error, do NOT fabricate or re-run propose.
- **Don't reshape scout findings or proposal content** — pass them verbatim to the agents; merging happens after agent output, not before.
- **Don't STOP on default behavior** — only stop on SKYNEX_HITL=strict.
- **Don't skip the one-line notification** — user needs visibility into SPEC.md being written + risk counts before plan takes over.
- **The strict-mode panel includes risk counts; the default-mode notification also surfaces high/critical risk count** — both modes show this info, format differs.
