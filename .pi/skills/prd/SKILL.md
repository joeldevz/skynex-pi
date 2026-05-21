---
name: prd
description: Formal Product Requirements Document for stakeholders. Use when a feature needs business sign-off before engineering. Produces user stories, acceptance criteria, NFRs, and out-of-scope sections.
---

# PRD — Product Requirements Document

> A PRD is the contract between Product and Engineering.
> If Engineering can ship something the PRD says, but Product won't accept it,
> the PRD failed.

## When to Use

Use `/skill:prd` when:
- A stakeholder (PM, business owner) needs to approve scope before engineering starts
- The feature touches multiple teams or external stakeholders
- The feature is a "v1 launch" candidate (something marketing will mention)
- The feature changes how customers interact with the product

DO NOT use for:
- Internal refactors with no external user impact
- Bug fixes (use `/skill:propose` if substantial)
- Engineering-only decisions (use `/skill:specify` for architecture)

## Distinction from propose / specify

| Skill | Audience | Format | When |
|-------|----------|--------|------|
| `grill-me` | User + you | Conversational | Discovery, alignment |
| `prd` | Stakeholders (PM, biz) | Formal markdown doc | Business sign-off |
| `propose` | Engineering | 1-page summary | Pre-spec sanity check |
| `specify` | Engineering | SPEC.md (product + architecture) | Pre-plan technical detail |

If unsure: PRD is the "user-facing what" — `specify` is the "engineering how".

## Compact Rules

1. Always run `/skill:grill-me` first if alignment unclear (don't grill inside this skill)
2. PRD lives at `.skynex/<feature-slug>/PRD.md`
3. Acceptance criteria MUST be Given/When/Then (testable, unambiguous)
4. Every user story has: persona, goal, value (As X, I want Y, so that Z)
5. Out-of-scope section is mandatory (what we're explicitly NOT doing)
6. NFRs include: performance budget, scalability target, security level
7. STOP and HITL gate before declaring PRD final
8. Save key decisions to Neurox with `observation_type: decision`
9. PRD is a CONTRACT — don't list features you can't commit to
10. Limit to ≤10 user stories — if more, scope is too big, split it

## Workflow

```
1. neurox_recall — load prior decisions from grill-me / past sessions
2. Read scout envelope (if /skill:discover ran first)
3. Build user stories from grill-me decisions
4. Write Given/When/Then acceptance criteria per story
5. Enumerate edge cases (what breaks the happy path)
6. Define NFRs (performance, security, scale)
7. Mark out-of-scope explicitly
8. Write PRD.md to .skynex/<feature-slug>/PRD.md
9. HITL gate — surface to user, wait for approve
10. Save decisions to Neurox with topic_key per decision
```

## PRD.md Template

```markdown
# PRD: <Feature Name>

**Status:** DRAFT | APPROVED | IN PROGRESS | SHIPPED
**Feature slug:** <kebab-case-slug>
**Date:** <YYYY-MM-DD>
**Owner:** <name>
**Stakeholders:** <PM, Engineering Lead, etc.>

## Problem Statement

<2-3 sentences: what's broken, who suffers, why now>

## Goal

<1 sentence: what success looks like, measurable>

## User Stories

### Story 1: <short title>

**As a** <persona>
**I want** <capability>
**So that** <business value>

**Acceptance Criteria:**
- **Given** <initial state>, **When** <action>, **Then** <expected outcome>
- **Given** <state>, **When** <action>, **Then** <outcome>

**Edge Cases:**
- <case>: <expected behavior>

---

### Story 2: <short title>

(same structure)

## Non-Functional Requirements

| Dimension | Requirement |
|-----------|-------------|
| Performance | <e.g., p95 latency < 200ms> |
| Scalability | <e.g., 10K concurrent users> |
| Security | <e.g., OWASP Top 10 covered, MFA required> |
| Availability | <e.g., 99.9% uptime> |
| Compliance | <e.g., GDPR, SOC2> |
| Internationalization | <languages supported> |

## Out of Scope

Explicitly NOT included in this PRD:

- <thing 1> — punted to <future PRD or never>
- <thing 2> — <reason>

## Success Metrics

How we'll know this worked:

- **Quantitative**: <metric, baseline, target>
- **Qualitative**: <user feedback signal>

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| <risk> | high/med/low | <how to handle> |

## Open Questions

(Only if PRD is still DRAFT)

- <question> — pending answer from <person>

## Approval

- [ ] Product owner approved
- [ ] Engineering lead reviewed
- [ ] Stakeholder sign-off received

## Next Steps

On approval, run `/skill:specify` to produce SPEC.md with architecture.
```

## HITL Gate

After writing PRD.md:

```
PRD complete: .skynex/<feature-slug>/PRD.md

Summary:
- User stories: <N>
- Acceptance criteria: <N total>
- NFRs covered: <list>
- Out of scope: <items>
- Risks: <N critical/high>

Reply: approve / edit "<note>" / cancel
```

## Anti-Patterns

- Skipping `/skill:grill-me` and inventing requirements → biggest source of PRD failures
- Vague acceptance criteria ("user can search") → must be Given/When/Then
- No out-of-scope section → scope creep guaranteed
- NFRs as "fast and secure" → must have concrete metrics
- 20 user stories in one PRD → split into multiple

## Neurox Integration

- **At start**: `neurox_recall(query="<feature> decisions stakeholder")` 
- **Per decision**: `neurox_save(observation_type="decision", topic_key="prd/<feature>/<decision>")`
- **Cross-namespace**: PRD patterns apply globally, search without namespace
- **On scope change**: invalidate the old PRD observation, save new one with same topic_key

## Examples

### Bad acceptance criterion
```
- User can search users
```
Too vague. What if no results? What if 1000 results? Latency budget?

### Good acceptance criterion
```
- Given the admin types 3+ characters in the search input,
  When the search debounces 300ms,
  Then results matching name/email are shown within 200ms.
- Edge case: empty result set displays "No matches found".
- Edge case: 1000+ results paginates at 20 per page.
```
