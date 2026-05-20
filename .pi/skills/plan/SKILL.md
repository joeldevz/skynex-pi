---
name: plan
description: Phase 2 of the Medium-path workflow. Use after discover has returned a ready scout envelope. Delegates to the tech-planner sub-agent to produce a prescriptive PLAN.md with vertical slices, then hands off to the build skill.
---

# plan — Phase 2: produce executable plan

> Triage path: `medium` | `substantial` · Sub-agent: `tech-planner` (single mode) · Mutates files: **yes** (writes `PLAN.md` to repo root or `.skynex/<feature>/PLAN.md`)

## Compact Rules

1. Always invoke the `subagent` tool with `agent: "tech-planner"` and `agentScope: "project"`. Single instance only — never parallelize tech-planner.
2. Pass BOTH inputs in the `task` field: the scout's envelope (verbatim YAML) AND the user's original task description. Do NOT pre-summarize or reshape the envelope — tech-planner needs the raw structured data.
3. Only run this skill if `discover` returned `status: ready` and no unresolved `open_questions`. Otherwise STOP.
4. The tech-planner returns an envelope with `status: ready | questions_pending | blocked`. Parse the fenced ` ```yaml envelope ` block at the end of its output.
5. Capture the `artifacts:` path (either `PLAN.md` or `.skynex/<feature>/PLAN.md`) — this is the handoff to `build`.
6. If the envelope lists `new_dependencies: [...]` or any slice has `requires_hitl: true`, surface that to the user BEFORE invoking `build`.
7. Skip this skill entirely for `conversational` and `small` triage paths.

## How to invoke

```
subagent({
  agent: "tech-planner",
  agentScope: "project",
  task: "<scout envelope verbatim YAML>\n\n---\n\n<user's original task description>"
})
```

The subagent tool returns the agent's full output. Look for the ` ```yaml envelope ` fenced block at the end.

## What you DO with the envelope

- Read `status`, `artifacts`, `slices_count`, `parallel_slices`, `new_dependencies`, `risks`.
- If `status: ready` → invoke the `build` skill, passing the PLAN.md path from `artifacts` and the `parallel_slices` hint.
- If `status: questions_pending` → STOP. Surface `open_questions` to the user verbatim. Do not invoke `build`. Re-run plan after the user answers.
- If `status: blocked` → STOP. Report the blocker (e.g. missing scout envelope, ambiguous task) and ask the user to clarify.
- If `new_dependencies` is non-empty OR any slice flagged `requires_hitl: true` → pause for human approval before `build`.

## What you DO NOT do in this phase

- Do not write or edit code. PLAN.md is written by tech-planner, not by you.
- Do not call `neurox_*` — scout already gathered prior context.
- Do not invoke `build` if status is `questions_pending` or `blocked`.
- Do not reshape, trim, or summarize the scout envelope before passing it down.
- Do not launch more than one tech-planner instance.

## Output

Pass the PLAN.md path (from `artifacts`) plus the `parallel_slices` hint to the `build` skill. Do NOT reformat the envelope.
