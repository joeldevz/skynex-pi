---
name: discover
description: Phase 1 of the Medium-path workflow. Use when triage classifies a task as medium or substantial. Delegates to the scout sub-agent to gather codebase context + Neurox prior decisions, then returns a structured exploration envelope to be passed to the plan skill.
---

# discover — Phase 1: gather context

> Triage path: `medium` | `substantial` · Sub-agent: `scout` (single mode) · Mutates files: **no**

## Compact Rules

1. Always invoke the `subagent` tool with `agent: "scout"` and `agentScope: "project"` (or `"both"` if user agents needed too).
2. Pass the user's task description verbatim in the `task` field; do NOT pre-summarize.
3. The scout returns an envelope. Parse it but do NOT proceed to plan if `status: blocked` or `status: partial` — report the issue back to the user first.
4. Save key decisions surfaced from Neurox to in-session memory by referencing them in the next phase's prompt. Do NOT call `neurox_save` here.
5. If the scout's envelope has `open_questions: [...]`, surface them to the user BEFORE running plan. Plan cannot proceed with unresolved ambiguity.
6. Skip this skill entirely for `conversational` and `small` triage paths.

## How to invoke

```
subagent({
  agent: "scout",
  agentScope: "project",
  confirmProjectAgents: false,
  task: "<user's original task description>"
})
```

`confirmProjectAgents: false` skips the interactive "Run project-local agents?" dialog. This repo's `assets/agents/*.md` are trusted, version-controlled, and reviewed via PR — confirming on every invocation is noise. Set to `true` only when running an unfamiliar repo.

The subagent tool returns the agent's full output. Look for the `\`\`\`yaml envelope` fenced block at the end.

## What you DO with the envelope

- Read `entry_points`, `related_modules`, `related_tests`, `prior_decisions`, `conventions`, `open_questions`.
- If `status: ready` and no `open_questions` → invoke the `plan` skill, passing the envelope content to tech-planner.
- If `status: questions_pending` or `open_questions: [...]` → STOP. Present the questions to the user. Wait for answers before running plan.
- If `status: partial` → ask the user whether to proceed with partial context or expand the search.
- If `status: blocked` → report the blocker and ask the user to clarify the task.

## What you DO NOT do in this phase

- Do not write or edit code.
- Do not call `neurox_save`.
- Do not invent files or modules — only use what scout reported.
- Do not skip directly to plan if questions are unanswered.

## Output

Pass the scout's envelope (verbatim YAML) to the `plan` skill as input. Do NOT reformat it.
