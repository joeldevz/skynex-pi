---
name: grill-me
description: Relentless one-question-at-a-time discovery for non-trivial features. Use BEFORE writing a PRD, proposal, or plan. Stops vibe coding. Forces shared design concept with the user.
---

# Grill Me — Discovery Through Relentless Questioning

> "Conceptual integrity is the most important consideration in system design."
> — Fred Brooks, The Mythical Man-Month
>
> The goal is not a fast plan. The goal is the same wavelength.

## When to Use

Invoke `/skill:grill-me` when ANY of these is true:
- The user requested a non-trivial feature, change, or design decision
- A PRD or plan is about to be written
- Multiple plausible approaches exist and the right one isn't obvious
- The task description has hidden assumptions (e.g., "make it scalable" without metrics)

DO NOT use for:
- Trivial bug fixes (typos, single-file changes)
- Tasks crystal-clear from context (user explicitly stated all details)
- Conversational requests

## Compact Rules

1. ONE question at a time. Never bundle 3 questions in one message.
2. Always offer a RECOMMENDED answer with rationale (don't make user choose blind)
3. After each answer, save the decision to Neurox immediately
4. Stop when you have a "shared design concept" — not when you've asked enough
5. If user says "you decide", record that as a decision, document the rationale
6. NEVER substitute this skill with inline grilling in the orchestrator — duplicates logic
7. After grilling, proceed to /skill:propose or /skill:prd with full context
8. Questions must surface HIDDEN assumptions, not confirm OBVIOUS ones
9. Don't grill on implementation details (that's tech-planner's job) — only product/scope
10. If user pushes back, accept and move on — don't grill into hostility

## Question Categories

Cover these dimensions in order. Stop when each is clear:

### 1. Purpose
- Who is the user? (persona, role, context)
- What problem does this solve? (root cause, not symptom)
- What does success look like? (concrete, measurable)

### 2. Scope
- What's in? What's explicitly out?
- What edge cases must work? What can we punt?
- What's the smallest version that delivers value?

### 3. Constraints
- Performance budget? (latency, throughput)
- Security requirements? (auth, data sensitivity)
- Existing systems to integrate with?
- Timeline / urgency?

### 4. Tradeoffs
- Simplicity vs flexibility?
- Speed vs correctness?
- Cost vs quality?

### 5. Validation
- How will we know it works?
- What metrics matter?
- What test cases prove correctness?

## Question Format

Every question follows this shape:

```
[Category: <Purpose | Scope | Constraints | Tradeoffs | Validation>]

<Question in plain language>

Why I'm asking: <1 sentence why this matters>

Recommended answer: <your best guess with rationale>

Your call?
```

Example:

```
[Category: Scope]

For SAML SSO, do we need to support both SP-initiated and IdP-initiated flows,
or just one?

Why I'm asking: SP-initiated is simpler (50% less code, no IdP-side config),
but enterprise customers often require IdP-initiated.

Recommended answer: Start with SP-initiated only. Add IdP-initiated in v2 if
a customer explicitly needs it. Saves 2-3 days of implementation.

Your call?
```

## Workflow

```
1. Check Neurox first: neurox_recall(query="<feature> design decisions")
2. Read prior context (existing specs, related code) — 1-3 files max
3. Identify HIDDEN assumptions in the user's request (not just literal gaps)
4. Pick the MOST important question (highest reduction in uncertainty)
5. Ask it — wait for answer
6. Save the decision: neurox_save(observation_type="decision", ...)
7. Repeat from step 4 until shared design concept reached
8. Stop and confirm: "I think we have enough. Should I proceed to /skill:propose?"
```

## Stopping Criteria

Stop grilling when ALL of these are true:
- You can describe the feature in 3 sentences without ambiguity
- You can list 3-5 acceptance criteria the user would approve
- You can name 2-3 risks the user is aware of
- You can state what's explicitly OUT of scope

If NOT all true after 10 questions, surface: "I'm stuck on alignment. Should we step back?"

## Anti-Patterns (do NOT do)

- Asking 3 questions in one message → splits attention, gets shallow answers
- Asking without a recommendation → "I don't know, what do you think?" forces user to design
- Re-asking questions already answered → check Neurox first
- Grilling implementation details → "should we use Redis or memcached?" is tech-planner territory
- Grilling into exhaustion — 10 questions max, then surface
- Substituting this skill with inline orchestrator logic — violates single-source-of-truth

## Neurox Integration

- **At start**: `neurox_recall(query="<feature topic>")` — load prior decisions
- **After each answer**: `neurox_save(observation_type="decision", kind="semantic")` immediately
- **Cross-namespace**: design decisions often apply across projects, search globally
- **On user contradiction with prior decision**: invalidate the old one explicitly

## Examples (one-question-at-a-time in action)

### Round 1 (Scope)
```
[Category: Scope]

For the SAML SSO feature, should we support multiple SAML IdPs per organization
(e.g., one customer with both Okta and Azure AD), or one IdP per org?

Why I'm asking: Multi-IdP doubles config complexity but covers enterprise mergers.

Recommended answer: One IdP per org. Multi-IdP is a v3 feature when a customer
asks. Saves 1 day of config UI work.

Your call?
```

### Round 2 (Constraints — after answer to Round 1)
```
[Category: Constraints]

For role mapping (IdP role → app role), do you want it to be hardcoded in env vars
or dynamic via admin UI?

Why I'm asking: Env vars is faster (2 hours) but means redeploy to change roles.
UI is slower (1 day) but lets admins iterate without engineering.

Recommended answer: Env vars for v1. Add UI in v1.1 after first customer
has stable role mapping.

Your call?
```

## Handoff

After grilling complete, the next skill (`/skill:propose` or `/skill:prd`) reads
all Neurox decisions tagged with the feature topic and uses them as input.

DO NOT re-grill in the next skill — that's duplication.
