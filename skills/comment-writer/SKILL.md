---
name: comment-writer
description: Draft warm, direct collaboration comments for PR reviews, issue replies, Slack messages, and async project updates.
---

# Comment Writer — Voice Protocol for Human Collaboration

> The best review comment is the one the author can act on immediately
> without feeling attacked. Start with the action, not the preamble.

## When to Use

Load this skill whenever you draft a comment another human will read:
- PR review feedback (request change, approve, nitpick)
- GitHub issue replies and maintainer responses
- Slack or Discord async project updates
- Any written output directed at a collaborator

## Compact Rules

1. Start with the actionable point — no recap, no preamble
2. Sound like a thoughtful teammate, not a corporate bot
3. Keep it short: 1-3 paragraphs or a tight bullet list
4. Explain the technical reason when requesting a change
5. Comment on the single highest-value issue per review pass
6. Match the thread language; check Neurox `language_preference` first
7. No em dashes — use commas, periods, or parentheses
8. For first-time contributors, frame requests as suggestions, not demands
9. Distinguish severity: "Blocker:", "Suggestion:", or "Nit:" prefix
10. Before sending, re-read as the receiver: is it warm? is it actionable?

## HITL Gate

Before drafting, confirm with your human partner:
- Target language and register (English? Spanish? formal/informal?)
- Severity: blocking change request, approval with note, or nitpick?
- Audience: maintainer, contributor, teammate, external?

If Neurox has a `language_preference` observation, use it and skip the question.

## Voice Rules

| Rule | Requirement |
|------|-------------|
| Be useful fast | Open with the action item. Skip "great PR!" openers. |
| Be warm and direct | Teammate voice, not bot voice. |
| Keep it short | 1-3 paragraphs max. Bullet list if 3+ items. |
| Explain why | Always give the technical reason for change requests. |
| Avoid pile-ons | One highest-value issue per pass, not every preference. |
| Match language | Use thread language. Respect regional registers when known. |
| No em dashes | Commas, periods, parentheses instead. |
| Severity signal | Lead with: "Blocker:", "Suggestion:", or "Nit:" |

## Comment Formula

```
[Severity signal, if not approval]

<Direct observation or request>

<Why it matters — only if not obvious>

<Concrete next action or offer>
```

## Examples

### Request change (blocker)

```markdown
Blocker: this function mutates the input array in place.

Downstream callers that pass the same array will see unexpected state.
Return a new array or document the mutation contract explicitly.
```

### Approve with a note

```markdown
Scope is clear and the approach is solid. Approving.

One thing worth doing before the next PR: add a link to the preceding
and following PR in the description so the chain stays navigable.
```

### Nit (non-blocking)

```markdown
Nit: the variable name `data` is used in three different scopes here.
Renaming to `rawResponse`, `parsedPayload`, etc. would make it easier
to trace in debuggers. Non-blocking — your call.
```

### First-time contributor

```markdown
Nice first contribution — the structure makes sense.

One suggestion: consider splitting the validation logic into its own
function so it can be tested independently. Happy to pair on this if useful.
```

### Ask for PR split

```markdown
This PR mixes the validation change with the UI wiring — splitting them
would make each review faster and any rollback more surgical.

Suggested split: (1) validation + tests, (2) UI integration.
If splitting isn't practical, add a note in the description explaining why.
```

## Edge Cases

| Situation | Handling |
|---|---|
| First-time contributor | Phrase as suggestion; offer to pair |
| Draft PR | Prefix with "Draft comment (not sent yet):" |
| Multilingual thread | Prefer the language of the original message |
| No technical reason available | State uncertainty; ask human partner |
| Correcting a previous comment | Lead with what changed, not an apology |

## Neurox Integration

- **At start**: `neurox_recall(query="language preference comment style")` — load saved preferences
- **If user corrects tone/language**: `neurox_save(observation_type="preference", ...)` immediately
- **Cross-namespace**: search without namespace for global preferences

## Commands

```bash
# Inspect a PR before writing review feedback
gh pr view <PR_NUMBER> --json title,body,additions,deletions,changedFiles,reviews

# List existing review comments
gh pr view <PR_NUMBER> --json reviews,reviewRequests
```
