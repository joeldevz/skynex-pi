---
name: skynex-execute
description: Execution mode flow. Sequential 8 steps — fetch, discover, test-audit, TDD-proposal (HITL), generate-tests, implement, validate, PR. Activated by /skynex:execute. Delegates discovery, build, validate, and PR phases to existing sub-skills.
---

# skynex-execute — Execution Flow

> Use ONLY when execution mode is active.
> Each step transitions the phase in state — essential for /compact resume.

## Compact Rules

1. SEQUENTIAL — never skip or reorder the 8 steps
2. After each step completes, announce the phase transition to the user: "Phase: <name> ✓ → next: <name>"
3. HITL gate at Step 4 — do NOT proceed to Step 5 without explicit approval
4. Step 5 MUST produce ALL-FAILING tests before Step 6 starts
5. If any test PASSES in Step 5, warn user and ask: continue or abort?
6. /skill:build in Step 6 owns coder + verifier chain — do NOT orchestrate directly
7. /skill:validate in Step 7 runs 4 agents in parallel — do NOT serialize them
8. PR transition (Step 8) calls mcp_Atlassian_transitionJiraIssue AFTER PR URL confirmed
9. Approval keywords: approve / dale / ok / sí / go / proceed / ejecuta
10. Cancel keywords: cancel / no / stop / para / abortar

## Step 1 — FETCH TASK (phase: idle → discovery)

Call: `mcp_Atlassian_getJiraIssue(taskKey)` with your Jira MCP.

Extract: title, description, acceptance_criteria from response.

Show: "Ejecutando: <taskKey> — <title>"

Show: acceptance_criteria as bullet list to user.

Transition: phase → "discovery"

## Step 2 — DISCOVERY (phase: discovery → test-audit)

Invoke: `/skill:discover`

Pass to scout: Jira task context (title + description + acceptance_criteria).

Show: scout envelope summary (files found, prior Neurox context).

Check: If envelope.status !== "ready" → STOP, surface blocker to user.

Transition: phase → "test-audit"

## Step 3 — TEST AUDIT (phase: test-audit → tdd-proposal)

Review files from scout envelope (entry_points, related_tests).

List: integration tests (most important) — count and file paths.

List: unit tests — count and file paths.

Show: "Tests existentes: X integración, Y unitarios"

Transition: phase → "tdd-proposal"

## Step 4 — TDD PROPOSAL (phase: tdd-proposal) — HITL GATE

For each acceptance_criterion → propose 1-2 test cases.

Present as table:

```
| Test description | Type (integration/unit) | Criterion covered |
|---|---|---|
| <test 1> | integration | <criterion 1> |
| <test 2> | unit | <criterion 1> |
```

Ask: "¿Aprobás estos tests? Podés editar antes de generarlos."

Handling responses:

- **approve / dale / ok / sí / go / proceed / ejecuta**: proceed to Step 5, phase → "generating-tests"
- **edit "<note>"**: apply the edit, re-show the table, ask again (loop)
- **cancel / no / stop / para / abortar**: abort, notify "Cancelado — execution mode remains active"
- **anything else**: ask "¿Aprobás o querés hacer cambios?" (one clarifying question)

## Step 5 — GENERATE TESTS / RED PHASE (phase: generating-tests → implementing)

Invoke: `/skill:build`

Pass to coder: "Write ONLY the approved tests. Do not write any implementation."

After coder completes: invoke verifier to run test suite.

Check: ALL approved tests MUST FAIL.

If all fail → show "Tests generados: X/X fallan ✅" → transition phase → "implementing"

If any pass → show "⚠️ Y tests pasan (no deberían)" → ask user: continue or abort?

## Step 6 — IMPLEMENT / GREEN PHASE (phase: implementing → validating)

Invoke: `/skill:build`

Pass: full context from discovered files and tests — coder writes implementation only.

Verifier confirms all tests pass after each slice.

Goal: 0 failing tests.

Transition: phase → "validating"

## Step 7 — VALIDATE (phase: validating → pr-review)

Invoke: `/skill:validate`

Input: changed_files from build envelope (union of all coder slices).

4 agents run in parallel: test-reviewer + security(judge1) + security(judge2) + skill-validator

Show: synthesized verdict.

If APPROVED or APPROVED with warnings → transition phase → "pr-review"

If NEEDS_FIX → return to `/skill:build` with blocker list; reset phase → "implementing"

If ESCALATED → surface to user for decision; do NOT auto-advance

## Step 8 — PR REVIEW (phase: pr-review → complete)

Invoke: `/skill:branch-pr`

PR description MUST include:

- Task key: <taskKey>
- Acceptance criteria: bullet list from Step 1
- Test coverage: list of tests added from Step 5

After PR URL confirmed:

Call: `mcp_Atlassian_transitionJiraIssue(taskKey, "In Review")`

Transition: phase → "complete"

Show: PR URL + "Task <taskKey> transitioned to In Review ✅"

## Phase Transition Map

idle → discovery → test-audit → tdd-proposal → generating-tests → implementing → validating → pr-review → complete

On /compact or session resume: execution mode hint shows current phase.
Resume from that phase — do NOT restart from Step 1.
