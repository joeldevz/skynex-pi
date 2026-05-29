---
name: skynex-research
description: Research mode synthesis protocol. Called by the main model after 3 parallel research agents (neurox, web, code) return their envelopes. Synthesizes a final verdict with source attribution.
---

# skynex-research — Research Mode Synthesis

> Use ONLY when research mode is active and you have received envelopes from
> research-neurox, research-web, and research-code.

## Compact Rules

1. Read ALL 3 envelopes before writing anything — do not synthesize from 1 or 2
2. Cite sources for every claim: `[Neurox: <id>]`, `[Web: <url>]`, `[Code: <path>]`
3. Resolve contradictions explicitly — if Neurox says X and web says Y, surface the conflict
4. Prioritize Neurox findings for project-internal decisions (they are ground truth for THIS repo)
5. Prioritize web findings for external library/API questions
6. Prioritize code findings for "what does the current codebase do?" questions
7. If all 3 sources return empty, say so — do NOT hallucinate findings
8. If any finding is reusable and durable, save to Neurox after synthesis
9. Keep synthesis ≤10 bullet points — no walls of text
10. Surface the `defense` from each agent (not just findings) — it tells the user WHY each source was relevant

## Parallel invocation pattern

```
subagent({
  agentScope: "project",
  confirmProjectAgents: false,
  tasks: [
    {
      agent: "research-neurox",
      task: "Research: <user question verbatim>. Return findings envelope."
    },
    {
      agent: "research-web",
      task: "Research: <user question verbatim>. Return findings envelope."
    },
    {
      agent: "research-code",
      task: "Research: <user question verbatim>. Return findings envelope."
    }
  ]
})
```

The `subagent` tool returns an array of 3 results in submission order. Wait for ALL 3 before synthesizing.

## Synthesis format

```
## Research: <user question (≤80 chars)>

**From memory (Neurox):**
- <finding> [Neurox: <id>]
- <finding> [Neurox: <id>]

**From web:**
- <finding> [Web: <url>]
- <finding> [Web: <url>]

**From codebase:**
- <finding> [Code: <path>]
- <finding> [Code: <path>]

**Verdict:**
<2-3 sentences synthesizing the answer. Resolve contradictions. State confidence level.>

**Saved to Neurox:** yes | no (and why if not saved)
```

## When to save to Neurox

Save if the synthesized finding is:
- A new decision or pattern not previously recorded
- Relevant beyond this session (future sessions would benefit)
- Factual (not a one-off exploration answer)

Do NOT save if:
- All 3 sources were empty
- The answer is already in Neurox (no duplicate saves)
- The finding is ephemeral/debugging only

## Anti-patterns

- ❌ Synthesizing before ALL 3 envelopes are ready
- ❌ Ignoring a source because it returned empty (report it as empty, don't skip)
- ❌ Mixing findings and hallucinations (if you don't know, say you don't know)
- ❌ Skipping source attribution (every claim needs a `[Source: ...]` tag)
- ❌ Calling the 3 agents sequentially instead of in a single parallel `subagent({tasks:[...]})` call
