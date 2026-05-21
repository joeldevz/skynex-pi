---
name: chained-pr
description: Split large changes (>400 lines OR >5 slices) into a series of reviewable PRs. Two strategies — stacked-to-main and feature-branch-chain. Prevents the 100-conflict merge disaster.
---

# Chained PR — Splitting Large Changes

> Real failure: PR #290 had 109 conflicts on merge. Root cause: 190 commits in
> one PR that grew over weeks while main moved on. Chained PRs would have
> capped each PR at ~400 lines and kept rebase pain manageable.

## When to Use

Invoke `/skill:chained-pr` when:
- Total changes > 400 lines (across all slices)
- PLAN.md has > 5 slices
- The change spans multiple modules/contexts
- Multiple developers will work on parallel slices
- Review-load forecast says "won't review in one sitting"

DO NOT use for:
- Single-slice changes < 400 lines
- Hot fixes (one commit, one PR)
- Refactors that must atomically change everything (rare — usually wrong)

## Compact Rules

1. Budget per PR: ≤400 lines diff (additions + deletions, generated files excluded)
2. Choose strategy: `stacked-to-main` (default) OR `feature-branch-chain` (large epics)
3. Every PR in chain ships GREEN: tests pass + typecheck clean on its own
4. Each PR has its own conventional title and structured body
5. Chain ORDER follows PLAN.md slice order (respect blockedBy dependencies)
6. NEVER skip a PR in the chain — even if "obvious"
7. Label first PR with chain marker: `chain:1/N`, `chain:2/N`, etc.
8. Diagram the chain in the description (dependency arrows)
9. Each PR description references the previous and next in the chain
10. HITL gate before opening the FIRST PR — confirm strategy + chain order

## Two Strategies

### Strategy A: Stacked-to-Main (default)

Each PR targets `main` directly, but waits for the previous to merge first.

```
PR 1 (slice 1) → main   ← merge first
PR 2 (slice 2) → main   ← rebase on main, merge second
PR 3 (slice 3) → main   ← rebase on main, merge third
```

**Pros:**
- Each PR is independent if reordered
- Easier for reviewers (one diff against main)
- CI runs against current main

**Cons:**
- Rebasing after each merge can be painful
- Conflicts compound if chain is long

**Use when:** chain ≤ 4 PRs AND slices are mostly independent.

### Strategy B: Feature-Branch-Chain

All PRs target an integration branch. Final merge to main is one big merge.

```
PR 1 (slice 1) → feature/auth-rebuild
PR 2 (slice 2) → feature/auth-rebuild   ← reviews can land in any order
PR 3 (slice 3) → feature/auth-rebuild
...
feature/auth-rebuild → main             ← final merge after all done
```

**Pros:**
- No rebase pain between PRs
- Slices can land out of order
- Big bang merge happens once, controlled

**Cons:**
- Reviewers see less context per PR (the integration branch isn't main)
- Final merge can still have conflicts with main

**Use when:** chain > 4 PRs OR slices share files heavily.

## Workflow

```
1. Read PLAN.md — confirm slice count + estimated lines per slice
2. Choose strategy: stacked-to-main or feature-branch-chain
3. HITL gate — surface strategy + chain plan to user
4. On approval, create first branch: feat/<slug>-1-<short-title>
5. Implement slice 1 (use coder + verifier from build skill)
6. Open PR 1 with chain:1/N label and link to chain plan
7. Wait for review and (if stacked) merge before slice 2
8. For each subsequent slice: rebase (stacked) or branch from integration (chain)
9. Open PR N with chain:N/N label
10. After all PRs merged: close the chain epic / delete the integration branch
```

## PR Body Template (per PR in chain)

```markdown
## Chain Info

**Chain:** N of M
**Strategy:** stacked-to-main | feature-branch-chain
**Plan:** .skynex/<feature-slug>/PLAN.md

**Chain order:**
- ✅ PR #X — slice 1: <title>
- 🔄 **THIS PR** — slice 2: <title>
- ⬜ PR #Y — slice 3: <title>
- ⬜ ...

## Summary

<1-3 bullets: what THIS slice does>

## Changes

| File | Change |
|------|--------|
| ... | ... |

## Lines

Diff: +<N> / -<M> (target: ≤400 total)

## Linked Issue

Closes #<N> (or "part of #<epic>")

## Test Plan

- [ ] `pnpm test` passes
- [ ] `pnpm typecheck` clean
- [ ] Slice acceptance criteria from PLAN.md met:
  - AC-1: <criterion>
  - AC-2: <criterion>

## Dependencies

- Depends on: PR #<previous-in-chain> (must merge first)
- Blocks: PR #<next-in-chain>

## Reviewer Notes

<Anything specific reviewers should focus on>
```

## HITL Gate (before first PR)

```
Chain plan ready for: <feature-slug>

Strategy: <stacked-to-main | feature-branch-chain>
Total slices: N
Estimated total lines: ~<N>
Lines per PR (avg): ~<N>

Chain order:
1. <slice 1 title> — ~<N> lines — blockedBy: []
2. <slice 2 title> — ~<N> lines — blockedBy: [1]
3. ...

Reply: approve / edit "<note>" / cancel
```

## Rebase Discipline (stacked-to-main only)

After PR N-1 merges:

```bash
# 1. Update local main
git checkout main
git pull origin main

# 2. Rebase your branch on top
git checkout feat/<slug>-N-<title>
git rebase main

# 3. Resolve any conflicts (should be minimal if PRs are well-scoped)

# 4. Force-push (lease for safety)
git push --force-with-lease

# 5. Verify PR still passes CI
gh pr view --web
```

## Anti-Patterns

- 800-line "chain" PR → not a chain, that's a regular oversized PR
- Skipping a chain link "because it's small" → breaks the dependency story
- Out-of-order merges in stacked strategy → rebase nightmare
- No chain marker labels → reviewers can't tell it's a chain
- Each PR with full feature scope description → reviewers lost
- Chain without integration branch (in chain strategy) → no merge target
- Splitting unrelated changes "to hit budget" → not a slice, just a budget hack

## Tracking Tools

- **Label**: `chain:N/M` (auto-update or manual)
- **Project board**: optional column per chain
- **Stacked tools**: `git-town`, `Graphite`, `Sapling` (not required)
- **Issue tracker**: epic issue links all PRs in chain

## Connection to Other Skills

- **work-unit-commits**: chain PRs are made of well-structured commits
- **branch-pr**: each link in chain uses branch-pr workflow
- **plan**: PLAN.md's `parallel_groups` informs which slices can ship in parallel
- **build**: build skill executes per-slice; chained-pr packages results

## Neurox Integration

- **Save chain plan**: `neurox_save(observation_type="config", topic_key="chain/<feature>/<chain-id>")`
- **Recall prior chains**: `neurox_recall(query="chain strategy <similar-feature>")` 
- **Save chain conflicts**: when rebase hurts, save as `gotcha` for next time

## Commands

```bash
# Create branch for next slice in chain
git checkout main
git pull
git checkout -b feat/<slug>-<N>-<title>

# Open PR with chain label
gh pr create --title "feat(<scope>): <slice title> (chain N/M)" \
             --body-file /tmp/pr-body-<N>.md \
             --label "chain:N/M"

# Check chain status
gh pr list --label "chain:" --json number,title,state

# After PR merges, rebase the next branch (stacked strategy)
git checkout feat/<slug>-<next>-<title>
git rebase main
git push --force-with-lease
```

## Examples

### Stacked-to-Main (3 slices)
```
PR #100: feat(auth): saml strategy core (chain 1/3) → main ✅ merged
PR #101: feat(auth): jit provisioning (chain 2/3)   → main ✅ merged
PR #102: feat(auth): role mapping (chain 3/3)       → main 🔄 in review
```

### Feature-Branch-Chain (6 slices)
```
Integration branch: feature/saml-sso-epic

PR #200: feat(auth): saml types          → feature/saml-sso-epic ✅
PR #201: feat(auth): saml config         → feature/saml-sso-epic ✅
PR #202: feat(auth): saml strategy       → feature/saml-sso-epic 🔄
PR #203: feat(auth): callback handler    → feature/saml-sso-epic ⬜
PR #204: feat(auth): jit provisioning    → feature/saml-sso-epic ⬜
PR #205: feat(auth): role mapping        → feature/saml-sso-epic ⬜

Final: feature/saml-sso-epic → main (one big merge, controlled)
```
