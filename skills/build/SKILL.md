---
name: build
description: Phase 3 of the Medium-path workflow. Use after plan produced PLAN.md. Iterates slices, spawning coder+verifier in chain mode (with retry-on-fail) or multiple coders in parallel for disjoint slices. Handles HITL gates for high-risk paths.
---

# build — Phase 3: implement plan slices

> Triage path: `medium` | `substantial` · Sub-agents: `coder`, `verifier` (chain for sequential slices, parallel for independent slices) · Mutates files: **yes**

## Compact Rules

1. Read `PLAN.md` produced by the plan skill. Iterate slices **in the order listed**, respecting `blocks:` markers.
2. For each slice, iterate its steps in order. One step = one `coder` invocation.
3. Default mode is `chain`: `coder` → `verifier` per step. Verifier sees only files the coder modified.
4. If two or more consecutive slices have `parallel: true` AND `blocks:` is empty AND their declared files are disjoint, launch them in `parallel` mode (one `coder` per slice).
5. Respect `pi-sub-agent` limits: `MAX_PARALLEL_TASKS=8`, `MAX_CONCURRENCY=4`. Queue the rest.
6. On `coder` `status: success` → the chain step automatically invokes `verifier`. No extra orchestrator action.
7. On `coder` `status: needs_review` → STOP. Surface `hitl_reason` + `files_changed` to user. Wait for explicit approval before next step.
8. On `coder` `status: blocked` → STOP. Report `blocker_reason` and last `verifier_feedback` to user.
9. On `verifier` `status: pass` → mark step done, advance to next step or next slice.
10. On `verifier` `status: fail` → re-invoke `coder` with `verifier_feedback`. Max **2 retries** per step; third failure → orchestrator marks step `status: blocked` and stops the slice.
11. On `verifier` `status: error` → distinct from fail. Report tooling issue (timeout, crashed runner, missing dep) to user; do not retry coder.
12. Pass the user-task verbatim portion of each step to the coder; do NOT re-summarize PLAN content.
13. Do NOT call `neurox_save` here — the orchestrator persists after `validate`.
14. Do NOT commit, push, or run the full suite manually. Verifier owns gates; production-gate handles publish.

## How to invoke

Single slice, sequential `coder` → `verifier` chain:

```
subagent({
  agentScope: "project",
  confirmProjectAgents: false,
  chain: [
    { agent: "coder", task: "Implement slice 1 step 1 from PLAN.md: <verbatim step content including files, tests, How snippets>" },
    { agent: "verifier", task: "Verify modified files: {previous.files_changed}" }
  ]
})
```

Multiple independent slices in parallel (only when `parallel: true` and disjoint files):

```
subagent({
  agentScope: "project",
  confirmProjectAgents: false,
  tasks: [
    { agent: "coder", task: "Implement slice 2 step 1: <verbatim step content>" },
    { agent: "coder", task: "Implement slice 3 step 1: <verbatim step content>" }
  ]
})
```

Retry after verifier `fail`:

```
subagent({
  agentScope: "project",
  chain: [
    { agent: "coder", task: "Retry slice 1 step 1. verifier_feedback: <feedback YAML from previous verifier envelope>" },
    { agent: "verifier", task: "Verify modified files: {previous.files_changed}" }
  ]
})
```

## Handling the coder envelope

Parse the `yaml envelope` block. Branch on `status`:

- `success` → chain auto-runs `verifier` next. Collect the verifier envelope.
- `needs_review` → **HITL gate**. STOP the entire build phase. Surface to user:
  - `hitl_reason` (auth / payment / migration path detected)
  - `files_changed` so far
  - Ask: "Approve continuing this slice, revert, or modify scope?"
  - Do NOT proceed without explicit user reply.
- `blocked` → STOP. Report `blocker_reason` + last `verifier_feedback` (if present) to user. Do not advance.

## Handling the verifier envelope

Parse the envelope. Branch on `status`:

- `pass` → advance: next step in slice, or next slice when current slice complete.
- `fail` → re-invoke `coder` with the verifier's `verifier_feedback` array as input. Increment retry counter for this step.
  - Retry count `< 2` → run another `coder` → `verifier` chain.
  - Retry count `== 2` (third overall attempt) → mark step `status: blocked`, stop the slice, report all three verifier reports to user.
- `error` → STOP this slice. Report tooling issue (command, exit_code, stdout_tail) to user. Do NOT retry coder — fix tooling first.

## Parallel slices

1. Read PLAN.md. Build a slice dependency graph from `blocks:` markers.
2. Find consecutive slices with `parallel: true` AND empty `blocks:` AND disjoint file sets.
3. Group up to `MAX_CONCURRENCY=4` such slices into one `tasks: []` call (parallel mode).
4. Wait for ALL parallel coders to return. Then run one `verifier` per slice (also parallel).
5. If ANY parallel coder returns `needs_review` or `blocked` → STOP all advancement; surface to user.
6. If files later prove to overlap (coder envelope shows unexpected `files_changed`), abort parallel group and re-run remaining slices sequentially.

## HITL gate

The `coder` returns `status: needs_review` when its step touches:

- `**/auth/**`, `**/authentication/**`, `**/login/**`
- `**/payment/**`, `**/billing/**`, `**/checkout/**`
- `**/migration*/**`, `**/migrate*/**`
- `**/secret*/**`, `**/credential*/**`, `**/key*/**`

When this happens:

1. STOP all parallel and sequential work.
2. Present `hitl_reason`, `files_changed`, `tests_added`, and the next planned step to the user.
3. Wait for explicit `approve` / `modify` / `abort`.
4. On `approve` → resume with next chain. On `modify` → restart the step with user's amended scope. On `abort` → return overall `status: blocked`.

## What you DO NOT do

- Do not write or edit code yourself — that is the `coder`'s exclusive job.
- Do not run lint/typecheck/tests yourself — that is the `verifier`'s job.
- Do not skip the HITL gate on `needs_review`, ever.
- Do not parallelize slices that share files, even if both marked `parallel: true`.
- Do not call `neurox_save` (orchestrator persists after `validate`).
- Do not commit, push, or publish.
- Do not exceed `MAX_CONCURRENCY=4` concurrent sub-agents.

## Output

Pass to the `validate` skill a build summary:

- `slices_completed: [<slice_id>...]`
- `files_changed: [<path>...]` (union of all coder envelopes)
- `tests_added: [<path>...]` (union of all coder envelopes)
- `retries_used: { <step_id>: <count> }`
- `hitl_approvals: [<slice_id> + reason]` (if any)
- `unfinished_slices: [<slice_id>...]` (if any `blocked`)
- Overall `status: success | partial | blocked`

The `validate` skill consumes this to scope test-reviewer + security + skill-validator runs.
