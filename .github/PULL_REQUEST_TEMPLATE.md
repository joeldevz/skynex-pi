## TL;DR

<!-- One sentence: what this PR does -->

## What changed

<!-- 2-5 bullets describing the changes at high level -->
- 

## Why

<!-- 2-3 sentences: business or technical reason. Link to issue if exists. -->

Closes #<!-- issue number, or remove if no linked issue -->

## Changes (per file)

| File | Change |
|------|--------|
| `path/to/file` | What changed and why |

## Test Plan

<!-- How was this verified? -->
- [ ] Existing tests pass: `pnpm test`
- [ ] Typecheck clean: `pnpm typecheck`
- [ ] New tests added for new behavior
- [ ] Manually tested: <describe one concrete scenario>

## Risk

<!-- low | medium | high — and one sentence explaining why -->

**Risk level:** <!-- low | medium | high -->

## Reviewer Guide

<!-- If you only review one file, review X. That's where the core logic is. -->

## Chain Info (only if part of a chained PR)

<!-- Remove this section if standalone PR -->

**Chain:** N of M
**Strategy:** stacked-to-main | feature-branch-chain

- ✅ PR #X — slice 1
- 🔄 **THIS PR** — slice 2
- ⬜ PR #Y — slice 3

## Checklist

- [ ] Conventional commit format on PR title (`type(scope): description`)
- [ ] Diff < 400 lines (or chained-pr explained above)
- [ ] No secrets, API keys, or env values committed
- [ ] Tests + typecheck green on local
- [ ] Updated docs if behavior changed
- [ ] Updated CHANGELOG.md if user-facing change
