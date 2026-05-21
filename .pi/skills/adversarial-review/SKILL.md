---
name: adversarial-review
description: On-demand adversarial review for non-code decisions — proposals, architecture, plans, specs. Two independent judges in parallel surface blind spots the single-author missed.
---

# Adversarial Review

> A single author cannot see their own blind spots. Two independent judges,
> run in parallel without seeing each other's output, will catch what one
> review misses.

## When to Use

Invoke `/skill:adversarial-review` BEFORE:
- Approving a large proposal (10+ acceptance criteria)
- Locking in an architectural decision (D-1, D-2, etc. in SPEC.md)
- Committing to a PLAN.md with > 3 slices
- Submitting a PRD for stakeholder review
- Any decision that's hard to reverse

DO NOT use for:
- Code review (`/skill:validate` already does dual security judges)
- Trivial decisions (single bug fix, typo)
- Conversational responses

## Compact Rules

1. Always run 2 judges IN PARALLEL via `subagent({ tasks: [...] })` — never serial
2. Each judge gets the SAME input but receives explicit "you are judge A/B" framing
3. Judges return findings as YAML envelope with severity (critical/high/medium/low)
4. Synthesize: count agreement (both judges flagged same issue = high confidence)
5. Conflicting findings → ask the human partner, don't auto-decide
6. STOP if either judge returns severity: critical without remediation path
7. Output a single synthesis report — never raw judge outputs
8. HITL gate before applying any judge recommendation

## How to Invoke (parallel)

```
subagent({
  agentScope: "project",
  confirmProjectAgents: false,
  tasks: [
    {
      agent: "security",
      task: "ADVERSARIAL JUDGE A. Review this <proposal|plan|architecture>: <content>. Focus: gaps, risks, missing edge cases, hidden assumptions. Be ruthless. Return YAML envelope with findings array."
    },
    {
      agent: "security",
      task: "ADVERSARIAL JUDGE B. Review this <proposal|plan|architecture>: <content>. Focus: gaps, risks, missing edge cases, hidden assumptions. Be ruthless. Return YAML envelope with findings array."
    }
  ]
})
```

We use `security` agent because it already has the adversarial review framing from Sprint 2.

## Synthesis Protocol

After both envelopes return:

1. Group findings by domain (architecture / security / business / operability)
2. Mark findings as `agreed` (both judges) or `unique` (one judge)
3. `agreed` findings → high confidence, surface to user immediately
4. `unique` findings → lower confidence, surface with note
5. Critical findings → STOP, do not proceed without remediation

## Output Envelope

```yaml
status: APPROVED | NEEDS_REVISION | ESCALATED
target_artifact: "<path to proposal/plan/spec reviewed>"
agreement_summary:
  agreed_findings: <N>
  unique_to_judge_a: <N>
  unique_to_judge_b: <N>
findings:
  - id: F-1
    severity: critical | high | medium | low
    domain: architecture | security | business | operability
    agreement: agreed | unique_a | unique_b
    description: "<what's wrong>"
    evidence: "<which lines/sections>"
    remediation: "<concrete fix>"
    confidence: high | medium | low
recommendation: APPROVE | REVISE | ESCALATE
next_action: "<concrete step>"
```

## HITL Gate

After synthesis, STOP and surface to user:

```
Adversarial review complete on: <target>

Agreement: <N> findings both judges flagged
Unique findings: <N> from judge A, <N> from judge B
Severity: <N> critical, <N> high, <N> medium, <N> low

Top blockers (if any):
- <finding> — <remediation>

Recommendation: <APPROVE | REVISE | ESCALATE>

Reply: approve / edit "<note>" / cancel
```

## Anti-Patterns

- Running judges sequentially — defeats the purpose (judge B sees A's bias)
- Telling judges they're a "second opinion" — frames them as confirmatory
- Synthesizing without counting agreement — loses signal
- Auto-applying judge recommendations — bypasses user judgment
- Using this for code review — that's `/skill:validate`'s job

## Neurox Integration

- **Save high-confidence findings** (agreed by both judges): `neurox_save(observation_type="gotcha", ...)` for future review reuse
- **Recall prior reviews on same domain**: `neurox_recall(query="adversarial review <domain>")` before starting
- **Cross-namespace**: review patterns are project-agnostic, search globally

## Examples

### Reviewing a SPEC.md

```
/skill:adversarial-review .skynex/saml-sso/SPEC.md
```

Two security judges review the spec for: architectural gaps, missing edge cases, security blind spots, scalability assumptions, integration risks.

### Reviewing a PLAN.md

```
/skill:adversarial-review .skynex/saml-sso/PLAN.md
```

Two judges review for: slicing strategy soundness, dependency cycles, missing rollback paths, parallel-group correctness.
