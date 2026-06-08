---
name: skynex-sdd
description: SDD (Sustainable Design Delivery) mode lifecycle. Full 8-phase workflow — discover, propose, specify, plan (HITL gate), build, validate, sync, archive. Activated by /skynex:sdd. Delegates each phase to existing sub-skills (discover, propose, specify, plan, build, validate, sync, archive-spec).
---

# skynex-sdd — SDD Lifecycle Mode

> Use ONLY when SDD mode is active.
> Each phase transitions state — essential for /compact resume.

## Compact Rules

1. SEQUENTIAL — never skip or reorder the 8 phases
2. After each phase completes, announce the phase transition: "Phase: <name> ✓ → next: <name>"
3. HITL gate at Phase 4 (plan) — do NOT proceed to Phase 5 without explicit approval
4. Phase 5 (build) MUST pass all tests before Phase 6 (validate) starts
5. /skill:build in Phase 5 owns coder + verifier chain — do NOT orchestrate directly
6. /skill:validate in Phase 6 runs 4 agents in parallel — do NOT serialize them
7. /skill:sync in Phase 7 merges the delta into canonical spec
8. Approval keywords: approve / dale / ok / sí / go / proceed / ejecuta
9. Cancel keywords: cancel / no / stop / para / abortar
10. When user provides a PRD, reuse it as proposal.md (skip regeneration)

## Phase 1 — DISCOVER (phase: idle → discover)

Invoke: `/skill:discover`

Let scout explore the domain and identify relevant context.

Show: scout envelope summary (files found, prior Neurox context).

Transition: phase → "discover"

## Phase 2 — PROPOSE (phase: discover → propose)

Invoke: `/skill:propose` OR reuse user-provided PRD.

If user has a PRD: save it verbatim as .skynex/<slug>/proposal.md

If no PRD: invoke `/skill:propose` (product-planner writes proposal.md)

Show: proposal.md summary.

Transition: phase → "propose"

## Phase 3 — SPECIFY (phase: propose → specify)

Invoke: `/skill:specify`

product-planner + architect work IN PARALLEL → .skynex/<slug>/SPEC.md

SPEC.md contains: user stories, acceptance criteria, edge cases, error modes.

Show: SPEC.md summary.

Transition: phase → "specify"

## Phase 4 — PLAN (phase: specify → plan) — UNIFIED HITL GATE

Invoke: `/skill:plan`

tech-planner reads SPEC.md and produces .skynex/<slug>/PLAN.md

PLAN.md contains: slices, risk mitigation, module breakdown, dependencies.

Show: proposal.md + SPEC.md + PLAN.md together for approval.

Ask: "¿Aprobás el plan? / Do you approve the plan?"

Handling responses:

- **approve / dale / ok / sí / go / proceed / ejecuta**: transition phase → "build"
- **edit "<note>"**: apply the edit, re-show docs, ask again (loop)
- **cancel / no / stop / para / abortar**: abort, notify "Cancelado — SDD mode remains active"
- **anything else**: ask "¿Aprobás o querés hacer cambios?" (one clarifying question)

## Phase 5 — BUILD (phase: plan → build)

Invoke: `/skill:build` per slice from PLAN.md

Coder writes implementation; verifier confirms tests pass.

Goal: all slices pass, 0 failing tests.

Show: build envelope summary (changed files, test results).

Transition: phase → "build"

## Phase 6 — VALIDATE (phase: build → validate)

Invoke: `/skill:validate`

4 agents run in parallel: test-reviewer + security(judge1) + security(judge2) + skill-validator

Input: changed_files from build envelope.

Show: synthesized verdict.

- If APPROVED: transition phase → "validate"
- If NEEDS_FIX: return to `/skill:build` with blocker list; reset phase → "build"
- If ESCALATED: surface to user for decision; do NOT auto-advance

## Phase 7 — SYNC (phase: validate → sync)

Invoke: `/skill:sync`

The spec-syncer agent translates SPEC.md into delta format.

Delta merges into .skynex/specs/<domain>/spec.md (canonical).

Resolve domain if not set (ask user or infer from SPEC.md).

Show: sync report (delta, canonical state).

Transition: phase → "sync"

## Phase 8 — ARCHIVE (phase: sync → archive)

Invoke: `/skill:archive-spec`

Moves .skynex/<slug>/ to .skynex/archive/YYYY-MM-DD-<slug>/ (immutable audit trail).

Updates .skynex/archive/index.md with completion metadata.

Show: archive path + "Feature archived ✅"

Transition: phase → "archive" → "complete"

## Phase Transition Map

idle → discover → propose → specify → plan [GATE] → build → validate → sync → archive → complete

On /compact or session resume: SDD mode hint shows current phase.
Resume from that phase — do NOT restart from Phase 1.

## Phase-Skill Mapping

| Phase | Skill | Agent(s) |
|-------|-------|----------|
| discover | /skill:discover | scout |
| propose | /skill:propose | product-planner |
| specify | /skill:specify | product-planner + architect (parallel) |
| plan | /skill:plan | tech-planner |
| build | /skill:build | coder + verifier (chain) |
| validate | /skill:validate | test-reviewer + security×2 + skill-validator (parallel) |
| sync | /skill:sync | spec-syncer |
| archive | /skill:archive-spec | (filesystem + index update) |
