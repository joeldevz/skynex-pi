---
name: validate
description: Phase 4 of the Medium-path workflow. Runs test-reviewer + security (×2 dual-judge) + skill-validator IN PARALLEL on the slice's changed files, then synthesizes 4 envelopes into one verdict (APPROVED | NEEDS_FIX | ESCALATED).
---

# validate — Phase 4: parallel adversarial review

> Triage path: `medium` | `substantial` · Sub-agents: `test-reviewer` + `security` ×2 + `skill-validator` (4 parallel) · Mutates files: **no**

## Compact Rules

1. Input is the `changed_files: string[]` from the build envelope. If empty → skip the phase and emit `APPROVED` with `note: "no changes to validate"`.
2. Always invoke the `subagent` tool with `agentScope: "project"` and `tasks: [...]` (parallel mode, 4 tasks).
3. Launch ALL FOUR sub-agents in a single `subagent` call. Do NOT serialize them. 4 tasks ≤ `MAX_PARALLEL_TASKS=8` and `MAX_CONCURRENCY=4` runs them truly concurrently.
4. The two `security` instances must receive the **same file list**. Distinguish them only by `(judge 1)` / `(judge 2)` in the task string for trace clarity. They must not know about each other.
5. Pass the test files subset (filter `changed_files` by `*.test.*` / `*.spec.*` / `__tests__/**`) to `test-reviewer`. Pass the full list to `security` and `skill-validator`.
6. Parse all four `yaml envelope` fenced blocks. If any envelope fails to parse → status `ESCALATED`, surface the broken envelope verbatim to the user.
7. Apply the synthesis logic below to produce ONE overall verdict. Do NOT report 4 raw envelopes — synthesize.
8. Do NOT call `neurox_save` here. The orchestrator persists post-synthesis.
9. Do NOT re-run validate to "break ties" between security judges — escalate instead.
10. If overall verdict is `NEEDS_FIX`, return control to the `build` phase with the union of all blocker findings; do NOT loop here.

## How to invoke

```
subagent({
  agentScope: "project",
  confirmProjectAgents: false,
  tasks: [
    { agent: "test-reviewer",  task: "Audit tests in files: <test-file-list>" },
    { agent: "security",       task: "Security review of files: <full-list> (judge 1)" },
    { agent: "security",       task: "Security review of files: <full-list> (judge 2)" },
    { agent: "skill-validator", task: "Validate against skill registry: <full-list>" }
  ]
})
```

The `subagent` tool returns an array of 4 results in submission order. Each result contains a final `yaml envelope` fenced block.

## Synthesizing the 4 envelopes

Extract from each envelope:

- `tr.status` ∈ {SOUND, WEAK, MISLEADING} from test-reviewer
- `s1.status`, `s2.status` ∈ {APPROVED, NEEDS_FIX, ESCALATED} from security ×2
- `s1.severity_summary`, `s2.severity_summary` (critical/high/medium/low counts)
- `sv.status` ∈ {COMPLIANT, VIOLATIONS} from skill-validator
- `sv.violations[*].severity` ∈ {blocker, warn, info}

Compute aggregates:

- `sv_blocker = any violation with severity == blocker`
- `security_agreement = (s1.status == s2.status)`
- `security_max_severity = max(critical, high) across s1+s2`

Then apply the decision matrix.

## Security dual-judge

The two `security` instances run independently on the same files.

- **Agreement (both `APPROVED`)** → trust the verdict, contribute `APPROVED` to synthesis.
- **Agreement (both `NEEDS_FIX`)** → trust, contribute `NEEDS_FIX`. Merge findings by `(file, line, domain)`; deduplicate.
- **Agreement (both `ESCALATED`)** → contribute `ESCALATED`; do NOT spawn a third judge yourself (orchestrator's call).
- **Disagreement**: see § Handling disagreement.

When merging findings, keep the higher severity if the two judges classify the same issue differently. Cite both judge IDs in the synthesized output for traceability.

## Decision matrix

Overall verdict is computed in this exact order (first match wins):

| Condition | Verdict |
|---|---|
| any `security.status == ESCALATED` | **ESCALATED** |
| security judges disagree significantly (one `APPROVED`, the other `NEEDS_FIX` with ≥1 high or critical) | **ESCALATED** |
| `tr.status == WEAK` AND security has ≥1 medium-or-higher finding | **ESCALATED** |
| `tr.status == MISLEADING` | **NEEDS_FIX** |
| any `security.status == NEEDS_FIX` | **NEEDS_FIX** |
| `sv.status == VIOLATIONS` AND `sv_blocker == true` | **NEEDS_FIX** |
| `tr.status == SOUND` AND both `security == APPROVED` AND `sv.status == COMPLIANT` | **APPROVED** |
| otherwise (e.g. `tr.WEAK` + clean security + `sv.warn` only) | **APPROVED with warnings** |

`APPROVED with warnings` is reported as `APPROVED` but the synthesized summary lists every `warn`/`info` finding so the user can decide whether to address them before commit.

## Handling disagreement

If the two security judges disagree:

- **Minor disagreement** (one `APPROVED`, one `NEEDS_FIX` with only low/medium findings) → contribute `NEEDS_FIX` to synthesis. Surface both reports' findings to the user with a `disagreement: minor` flag. Do not escalate.
- **Significant disagreement** (one `APPROVED`, one `NEEDS_FIX` with high or critical findings) → verdict `ESCALATED`. Recommend the orchestrator spawn a third `security` judge with the same file list. Do not spawn it yourself.
- **Both `ESCALATED`** → verdict `ESCALATED` with `confidence_concern: true`; surface both judges' `confidence: low` findings.

Never average or vote-down. Security findings are not democratic.

## What you DO NOT do

- Do not write or edit any file. This phase is read-only.
- Do not run the tests yourself — the `verifier` already gated on pass/fail in build.
- Do not call `neurox_*`. The orchestrator persists after this phase.
- Do not spawn additional sub-agents beyond the 4 listed (no third judge from here, no extra scouts).
- Do not re-order, re-prioritize, or silently drop any sub-agent's findings.
- Do not block on `warn`-severity skill-validator violations; only `blocker` severity gates the verdict.

## Output

Return to the user (and to the orchestrator) a synthesized envelope:

```
verdict: APPROVED | APPROVED with warnings | NEEDS_FIX | ESCALATED
summary: <one line, e.g. "2 blockers, 1 high security, tests sound">
sources:
  test-reviewer: <SOUND|WEAK|MISLEADING>
  security_judge_1: <status + counts>
  security_judge_2: <status + counts>
  skill-validator: <status + violation count>
agreement: full | minor-disagreement | significant-disagreement
blockers:
  - <file:line — one-line description per blocker finding>
warnings:
  - <file:line — one-line description per warn finding>
next: <commit | return-to-build | escalate-to-user>
```

Pass this synthesized envelope to the orchestrator. If `verdict == NEEDS_FIX`, the orchestrator returns control to `build` with the blocker list. If `ESCALATED`, the orchestrator surfaces to the user for decision (proceed / spawn third judge / abort).
