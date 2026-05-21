---
name: research
description: Deep web research on external topics — libraries, APIs, prior art, documentation. Use when local context is insufficient and internet lookup is needed.
---

# Research — Web Intelligence Skill

> Use when you need external information that doesn't exist locally:
> third-party library docs, prior art, API references, security advisories.

## When to Use

Invoke `/skill:research` when:
- Evaluating a third-party library before adding it as a dependency
- Looking up API documentation for an external service
- Checking for prior art or existing solutions before building something new
- Verifying a security advisory or CVE
- Finding the current best practice for a technology decision

Do NOT invoke for:
- Internal project conventions (read `.pi/` files)
- Things already recalled from Neurox
- General programming questions (use model knowledge)

## Compact Rules

1. Start with `web_search` using a specific query — not broad keywords
2. Fetch the top 2-3 most relevant URLs with `fetch_content` for depth
3. Check Neurox first: `neurox_recall(query="<topic>")` — avoid duplicate research
4. Summarize findings in ≤5 bullet points — no walls of text
5. Note the source URL and retrieval date for each key finding
6. If evaluating a library: check npm weekly downloads, last publish date, license, open issues count
7. If checking security: search for `<package> CVE` and `<package> vulnerability`
8. Save key findings to Neurox: `neurox_save(observation_type="discovery", ...)`
9. Return a structured research envelope (see below)
10. HITL gate: surface findings to user before acting on them

## HITL Gate

After research, STOP and surface findings to your human partner:
```
Research complete on: <topic>

Key findings:
- <finding 1> (source: <url>)
- <finding 2> (source: <url>)
- <finding 3> (source: <url>)

Recommendation: <what to do based on findings>

Proceed with this recommendation? (approve / edit "<note>" / cancel)
```

## Workflow

```
1. neurox_recall — check if already researched
2. web_search — 1-3 specific queries
3. fetch_content — top 2-3 URLs for depth
4. Synthesize findings (max 5 bullets)
5. Save to Neurox if findings are reusable
6. HITL gate — surface + wait for approval
```

## Research Envelope

```yaml
status: ready | blocked
topic: "<what was researched>"
queries_used:
  - "<query 1>"
  - "<query 2>"
findings:
  - fact: "<key finding>"
    source: "<url>"
    confidence: high | medium | low
recommendation: "<what to do>"
neurox_saved: true | false
```

## Library Evaluation Checklist

When evaluating an npm package:

| Signal | Good | Concerning |
|--------|------|------------|
| Weekly downloads | > 10k | < 1k |
| Last publish | < 6 months | > 1 year |
| Open issues | < 50 | > 200 |
| License | MIT/Apache/BSD | GPL/AGPL/proprietary |
| Dependencies | < 10 | > 50 |
| Known CVEs | None | Any critical/high |

## Neurox Integration

- **Always check first**: `neurox_recall(query="<topic> library research")` 
- **Save reusable findings**: `neurox_save(observation_type="discovery", kind="semantic", tags=["research", "<topic>"])`
- **Cross-namespace**: search without namespace — research findings apply globally
