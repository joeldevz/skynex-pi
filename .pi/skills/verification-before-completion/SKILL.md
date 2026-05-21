---
name: verification-before-completion
description: Pre-completion checklist. Force evidence-based verification before claiming any task is done. Prevents false "complete" status when tests fail, requirements unmet, or scope changed mid-work.
---

# Verification Before Completion

> Empirical rule from skynex-pi sessions: agents say "done" before they actually are.
> This skill is the gate that catches the gap.

## When to Use

Load BEFORE any of these:
- Returning a sub-agent envelope with `status: success` or `status: ready`
- Marking a todo as `completed`
- Declaring a slice/step finished
- Closing a HITL gate as "approved"
- Saying "implementation complete" to the user

## Compact Rules

1. NEVER claim done without running the verification command (typecheck + tests)
2. NEVER claim done if any acceptance criteria from PLAN.md / SPEC.md is unmet
3. NEVER claim done if scope changed and the user hasn't been notified
4. Re-read the original task. Does the output match the request literally?
5. Run the project's test command. Capture exit code. Block if non-zero.
6. Run typecheck if TypeScript. Block if errors.
7. Check git status — uncommitted changes mean work-in-progress, not done
8. For new files: confirm they exist with `ls` (don't trust prior `write` calls)
9. If anything is partial, change status to `partial` with explicit `blockers`
10. The phrase "should work" is forbidden — prove it works

## Verification Checklist

Before emitting `status: success`, confirm all of these:

| Check | Command | Block if |
|-------|---------|----------|
| Tests pass | `pnpm test` / `npm test` / `pytest` / detected | exit != 0 |
| Typecheck clean | `pnpm typecheck` / `tsc --noEmit` | any error |
| Lint clean (if applicable) | `pnpm lint` | any error |
| Acceptance criteria met | Re-read PLAN/SPEC | any AC unmet |
| Files actually exist | `ls <paths>` | any missing |
| No regressions | Compare test count to baseline | tests decreased |
| Scope honored | Re-read original task | scope creep undisclosed |
| User constraints honored | Check Neurox preferences | any violation |

## Workflow

```
1. List acceptance criteria from PLAN.md (or original task description)
2. Run the test command — capture exit code + last 20 lines
3. Run typecheck — capture errors
4. For each AC: state evidence (file:line, test name, command output)
5. If ALL checks pass → return status: success with evidence
6. If ANY check fails → return status: partial with blockers list
7. Never paper over failures with retries unless explicitly enabled
```

## Output Format

When this skill is active, every completion claim MUST include:

```yaml
verification:
  tests:
    command: "<exact command>"
    exit_code: 0
    summary: "<N pass, 0 fail>"
  typecheck:
    command: "tsc --noEmit"
    exit_code: 0
  acceptance_criteria:
    - id: AC-1
      status: met | unmet
      evidence: "<file:line or test name or command output>"
  files_created:
    - path: <path>
      exists: true
  scope_unchanged: true
```

## Anti-Patterns (do NOT do)

- "I implemented X" without running tests → blocked
- "Tests should pass" → forbidden phrase
- "I'll fix the failing test later" → that's `status: partial`, not `success`
- Marking todo completed before the verifier passes → race condition
- Ignoring lint errors → they count as failures
- "Scope expanded a bit" without notifying user → mid-flow scope creep

## Neurox Integration

- **At start**: `neurox_recall(query="verification standards <project>")` — load project-specific test commands
- **On false-positive (claimed done, wasn't)**: `neurox_save(observation_type="gotcha", ...)` to remember the missed check
- **Save successful verification patterns** by project for reuse

## Edge Cases

| Situation | Handling |
|-----------|----------|
| Tests didn't exist before | Run typecheck only, note "no tests yet" in evidence |
| Verification command unknown | Ask user once before claiming done |
| Pre-existing failures unrelated to your change | Document baseline, prove no new failures |
| Slow tests (>5min) | Run targeted subset; user must approve full skip |
| External integration (cloud, API) | Run mock tests; note "integration tested separately" |
