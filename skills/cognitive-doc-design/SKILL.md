---
name: cognitive-doc-design
description: Design documentation that reduces cognitive load — progressive disclosure, recognition over recall, signposting. Apply to PRDs, SPECs, architecture docs, READMEs, PR descriptions.
---

# Cognitive Doc Design

> The best documentation respects the reader's attention budget.
> Reduce time-to-understand, not time-to-write.

## When to Use

Load before writing or reviewing:
- README.md / CONTRIBUTING.md / project entry docs
- Architecture decision records (ADRs)
- PRD.md / SPEC.md / PLAN.md
- PR descriptions (especially for large or substantial-path PRs)
- API documentation
- Onboarding docs / runbooks
- Any doc someone other than the author will read

## Core Principles

### 1. Progressive Disclosure

Don't dump everything at once. Layer information so readers stop when they have enough.

```
Layer 1: TL;DR (1 sentence)
Layer 2: Summary (3 bullets)
Layer 3: Detail (full text)
Layer 4: References (links to deep dives)
```

A reader scanning for a quick answer should find it in Layer 1-2.
A reader implementing should reach Layer 3 within 30 seconds.
A reader debugging an edge case should reach Layer 4 via deep links.

### 2. Recognition Over Recall

Show, don't make them remember. Use:

- **Tables** instead of paragraphs for comparisons
- **Examples** instead of abstract descriptions
- **Diagrams** for relationships (mermaid, ASCII art)
- **Lists** for enumerations
- **Code blocks** for syntax

If reader has to scroll back to remember what term X meant, the doc failed.

### 3. Signposting

Tell readers what's coming and where they are.

```markdown
# Doc Title

> One-line purpose (TL;DR)

## What this doc is for
<who reads it, what they get>

## What this doc is NOT
<links to related docs that cover other things>

## Sections in this doc
1. Overview
2. ...
```

## Compact Rules

1. Lead with the answer, then the explanation (BLUF — Bottom Line Up Front)
2. ≤3 levels of heading nesting (H1 → H2 → H3, stop)
3. Tables for ANY comparison of 2+ things
4. Concrete examples for every abstract concept
5. Diagrams for any non-trivial flow (mermaid preferred)
6. "TL;DR" or "Summary" section at top for docs >100 lines
7. NO walls of text — break into ≤5-sentence chunks
8. Active voice always ("the user clicks save", not "save is clicked")
9. Cross-reference related docs with relative links
10. Stale-check: every doc has a "Last updated" date + owner

## Doc Structure Templates

### Architecture Decision Record (ADR)

```markdown
# ADR-NNN: <Decision Title>

**Status:** Proposed | Accepted | Superseded by ADR-XXX
**Date:** YYYY-MM-DD
**Deciders:** <names>

## Context

<2-3 sentences: what problem, why now>

## Decision

<1 sentence: what we decided>

## Rationale

<3-5 bullets: why we chose this over alternatives>

## Alternatives Considered

| Option | Rejected Because |
|--------|------------------|
| Alt A | <reason> |
| Alt B | <reason> |

## Consequences

**Positive:**
- <good outcome>

**Negative:**
- <accepted tradeoff>

**Neutral:**
- <neither bad nor good, just changes>
```

### README

```markdown
# Project Name

> One-sentence description (TL;DR)

## What it does
<3 bullets max>

## Quick start
<5 lines max, shell commands>

## When to use it
- <case 1>
- <case 2>

## When NOT to use it
- <alternative for case X>

## Docs
- [Architecture](docs/architecture.md)
- [Contributing](CONTRIBUTING.md)

## Status
<Production | Beta | Experimental> — Last updated YYYY-MM-DD
```

### PR Description (cognitive-friendly)

```markdown
## TL;DR
<one sentence>

## What changed
- bullet 1
- bullet 2

## Why
<2-3 sentences, business or technical reason>

## Testing
- [ ] Unit tests pass
- [ ] Manual scenario: <one concrete walkthrough>

## Risk
<low | medium | high> — <one sentence why>

## Reviewer guide
> If you only review one file, review `<path>` — that's where the core logic is.
```

### Architecture Diagram (mermaid example)

```markdown
## Data flow

\`\`\`mermaid
sequenceDiagram
    User->>Browser: clicks login
    Browser->>IdP: SAML request
    IdP->>Browser: SAML response
    Browser->>App: POST /sso/callback
    App->>Session: create session
    App->>Browser: redirect /dashboard
\`\`\`
```

A picture > a paragraph for anything with > 3 actors.

## Anti-Patterns (do NOT do)

| Anti-pattern | Why it fails | Fix |
|--------------|--------------|-----|
| Wall of text | Reader skims, misses key info | Bullets + tables |
| Burying the lede | Key answer in paragraph 4 | BLUF — answer first |
| Jargon without definition | Excludes new readers | Glossary or inline definition |
| "See the code" | Reader has to context-switch | Inline a 5-line example |
| Stale TODOs in docs | Erodes trust | Date-stamp TODOs, review monthly |
| One giant doc | Reader can't find anything | Split + link |
| No examples | Abstract concepts unanchored | Concrete example per concept |
| Passive voice | Hides agency, increases mental load | Active voice |
| No diagrams for flows | Wall of text describes state machine | Mermaid diagram |
| Heading inflation (H5) | Reader loses context | Max H3 |

## Compact Rules for PR Descriptions Specifically

A PR description is read in <2 minutes. Optimize for skimming:

1. **TL;DR first** — 1 sentence above the fold
2. **What/Why before How** — readers want context before code
3. **Reviewer guide** — tell them which file matters most
4. **Risk callout** — set expectations for review depth
5. **Checklist** for self-verification (tests, lint, etc.)

See `comment-writer` skill for PR review COMMENT tone.

## Recognition Patterns

### Use a table when:
- Comparing 2+ options
- Listing fields/properties with types
- Showing examples (good vs bad)

### Use a list when:
- Order doesn't matter (unordered)
- Order matters and represents sequence (ordered)
- 3-7 items (more → split into multiple lists)

### Use a code block when:
- Showing exact syntax
- Showing example commands
- Showing config/JSON/YAML structure

### Use a diagram when:
- Showing data flow with >2 actors
- Showing state transitions
- Showing system architecture

### Use prose when:
- Explaining nuanced rationale
- Telling a story (e.g., post-mortem)
- Tone matters (e.g., apology or warning)

## Length Budget

| Doc type | Target length |
|----------|---------------|
| README intro | <50 lines |
| ADR | <100 lines |
| PRD | <200 lines |
| SPEC.md | <300 lines (split if more) |
| PR description | <80 lines |
| RFC | <500 lines (split into sub-docs if more) |

If you blow the budget, you probably need to SPLIT into multiple docs.

## Neurox Integration

- **At start**: `neurox_recall(query="doc style conventions <project>")` 
- **Save reusable doc templates**: `neurox_save(observation_type="pattern", topic_key="doc-template/<type>")` 
- **Cross-namespace**: doc principles apply globally

## Connection to Other Skills

- **comment-writer**: this skill is for DOCS, that one is for COMMENTS (PR review, async chat)
- **prd**: applies these principles to PRD specifically
- **branch-pr**: PR body template informed by this skill
- **chained-pr**: each PR in chain follows the cognitive-friendly description structure
