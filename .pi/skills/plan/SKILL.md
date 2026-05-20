---
name: plan
description: Phase 2 of Medium and Substantial-path workflows. Invokes tech-planner to produce PLAN.md. On SUBSTANTIAL path, this is the SINGLE HITL gate by default — blocks for explicit user approval before /skill:build (showing proposal.md + SPEC.md + PLAN.md together). On medium path, only blocks if new_dependencies non-empty or any slice has requires_hitl=true (current Sprint 2 behavior).
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
8. On substantial path (SPEC.md present at .skynex/<feature-slug>/SPEC.md): pass SPEC.md content to tech-planner as additional input.
9. After tech-planner returns on SUBSTANTIAL path (SPEC.md present): ALWAYS show the unified gate panel and STOP — this is the single mandatory checkpoint before /skill:build. Wait for approve (or dale/ok/sí/go), edit "<note>", or cancel (or no/stop/abortar).
10. HITL behavior on substantial path is controlled by env var SKYNEX_HITL: default (unset or single) = ALWAYS gate at /skill:plan; strict = same gate at plan + propose/specify also gate; none = no gate, auto-continue to build (risky, escape hatch only).
11. On medium path, gate only if new_dependencies non-empty OR any slice has requires_hitl=true (preserves Sprint 2 behavior).

## How to invoke

**0. Detect path:** If `.skynex/<feature-slug>/SPEC.md` exists, this is substantial path — see 'Substantial-path additions' section below. Otherwise, medium path.

**Medium path (no SPEC.md):**
```
subagent({
  agent: "tech-planner",
  agentScope: "project",
  confirmProjectAgents: false,
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

## HITL Behavior (unified gate)

This is the **single mandatory gate** of the substantial-path workflow by default. Behavior controlled by env var `SKYNEX_HITL`:

| `SKYNEX_HITL` | Substantial path | Medium path |
|---|---|---|
| _(unset)_ or `single` | ALWAYS gate at /skill:plan after writing PLAN.md | gate only if new_dependencies OR any slice requires_hitl |
| `strict` | gates at propose + specify + plan (3 gates) | same as default for medium |
| `none` | NO gate, auto-continue to /skill:build (use with caution) | same as default for medium |

### Unified gate panel

When stopping for the gate (default substantial behavior), render this panel:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚦 GATE — review plan before execution
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Feature: <feature-slug>
  Mode:    SKYNEX_HITL=<single|strict|none>

  📂 Artifacts ready for review:
    • .skynex/<feature-slug>/proposal.md
    • .skynex/<feature-slug>/SPEC.md
    • .skynex/<feature-slug>/PLAN.md         ← review this

  📊 Plan summary:
    Slices: <N>
    Parallel groups: <[[1,2], [3]]>
    New dependencies: <N>
    Risks (high/critical): <N>

  Reply with one of:
    • approve | dale | ok | sí | go     → execute /skill:build
    • edit "<note>"                      → revise plan with note
    • cancel | no | stop | abortar       → abort workflow

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Response interpretation rules

- Approval keywords (case-insensitive): `approve`, `yes`, `y`, `dale`, `ok`, `sí`, `si`, `go`, `continúa`, `continua`, `next`, `proceed`, `ejecuta`
- Cancel keywords: `cancel`, `no`, `n`, `stop`, `para`, `abortar`, `abort`, `salir`
- Edit pattern: any response starting with `edit`, `modify`, `change`, `cambia`, `revisa`. Treat the rest as the note. Re-invoke tech-planner with the note appended to task.
- AMBIGUOUS responses (anything not matching above): ASK ONCE to clarify, do NOT assume.

### Visual prominence

When rendering the panel:
- Use `ctx.ui.notify("🚦 HITL Gate at /skill:plan — review .skynex/<slug>/PLAN.md", "warn")` if `ctx.hasUI` is true (this is a notification side-channel that survives scrollback)
- Print the panel text inline so the user sees it in the chat too
- Do NOT clear scrollback or use ANSI escapes — Pi handles terminal rendering

## Substantial-path additions

When invoked from substantial path (detected by presence of `.skynex/<feature-slug>/SPEC.md`):

1. **Read SPEC.md** at `.skynex/<feature-slug>/SPEC.md` (required input on substantial path)
2. **Invoke tech-planner with extended input**:
   ```
   subagent({
     agent: "tech-planner",
     agentScope: "project",
     confirmProjectAgents: false,
     task: "Produce PLAN.md for: <user task verbatim>. Scout findings: <scout envelope YAML>. Approved SPEC.md: <SPEC.md content>."
   })
   ```
3. **After tech-planner returns** (status=ready) on substantial path:
   - Check env var SKYNEX_HITL:
     - `none` → auto-continue to /skill:build (skip gate, risky escape hatch)
     - else (default `single` or `strict`) → render unified gate panel (see HITL Behavior section), STOP, wait for response
   - On `approve` → invoke /skill:build with PLAN.md path + parallel_groups
   - On `edit "<note>"` → re-invoke tech-planner with note, then re-render gate
   - On `cancel` → return envelope status=cancelled and stop workflow
   - On AMBIGUOUS → ask user to clarify (one question), then re-evaluate

4. **PLAN.md content** must include a top metadata block:
   ```markdown
   <!-- generated by /skill:plan from .skynex/<feature-slug>/SPEC.md (substantial path) -->
   **Feature slug:** <feature-slug>
   **Slices:** N
   **Parallel groups:** [...]
   ```

## Output

Pass the PLAN.md path (from `artifacts`) plus the `parallel_slices` hint to the `build` skill. Do NOT reformat the envelope.

### Output envelope

```yaml
status: ready | questions_pending | blocked | cancelled
substantial_path: true | false
spec_path: .skynex/<feature-slug>/SPEC.md  # only if substantial
hitl_mode: single | strict | none
gate_status: passed | awaiting_approval | bypassed_none | not_applicable_medium
artifacts:
   plan_path: PLAN.md or .skynex/<feature>/PLAN.md
slices_count: N
parallel_groups: [[1,2], [3]]  # only if slices_count > 1
new_dependencies: [...]  # if any
risks: [...]
```

Fields `hitl_mode` and `gate_status` are always present. `gate_status: bypassed_none` is set when SKYNEX_HITL=none caused us to skip the gate (audit trail).

## Common pitfalls

- This is the FINAL gate. Do NOT skip it on default substantial path even if everything looks fine.
- On SKYNEX_HITL=none, log a warning to ctx.ui.notify acknowledging the bypass — the user explicitly opted in.
- Accept natural-language responses. Strict keyword matching ("approve" only) frustrates users. Recognize "dale", "ok", "sí", etc.
- Do NOT auto-execute on ambiguous responses. Ask one clarifying question.
- The panel must mention ALL THREE artifacts (proposal.md, SPEC.md, PLAN.md) so the user knows where to look.
