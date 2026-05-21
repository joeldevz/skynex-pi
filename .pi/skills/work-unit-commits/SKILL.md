---
name: work-unit-commits
description: Commit discipline. Each commit is a self-contained, reviewable work unit — code + tests + docs together. Stops the 190-commit PR disaster before it starts.
---

# Work-Unit Commits

> Real failure from skynex-pi history: PR #290 had 190 commits and 109 conflicts
> on merge. Root cause: commits were "save points", not "work units".
> A work unit is what one reviewer can understand in 5 minutes.

## When to Use

Load BEFORE every commit. Especially:
- After implementing a slice from PLAN.md
- After fixing a bug
- After refactoring a module
- After completing a step (one todo marked completed)

## Compact Rules

1. ONE work unit per commit — code + tests + docs ship together
2. NEVER commit code without its tests (iron-law enforced for `write`/`edit`)
3. NEVER commit failing tests — fix them or revert
4. NEVER commit "WIP" / "save before lunch" / "fix later" — those aren't units
5. Commit message tells the STORY of what changed, not the diff
6. Conventional commits format: `type(scope): description`
7. If the diff feels too big to describe in 72 chars, it's not one unit — split it
8. Bundle related changes (same feature, same fix) into ONE commit
9. Separate unrelated changes (refactor + feature) into SEPARATE commits
10. Reorder commits to tell the story before opening a PR (`git rebase -i`)

## What Counts as a Work Unit

A commit is a valid work unit when ALL of these are true:

| Check | Question |
|-------|----------|
| Self-contained | Could it be reverted without breaking others? |
| Tested | Does it include tests that verify the change? |
| Story-telling | Can you explain it in 1 sentence? |
| Reviewable | Could a reviewer understand it in 5 minutes? |
| Stable | Does the codebase still build + test green? |

If ANY answer is no → split the commit or amend it.

## Conventional Commits Format

```
type(scope): description

[optional body]

[optional footer]
```

**Types** (use exactly these):

| Type | When to use |
|------|-------------|
| `feat` | New user-facing capability |
| `fix` | Bug fix (be specific: `fix(auth): handle null refresh token`) |
| `refactor` | Code change with no behavior change |
| `test` | Adding/improving tests only |
| `docs` | Documentation only |
| `chore` | Tooling, deps, config |
| `ci` | CI/CD config changes |
| `perf` | Performance improvement (with measurement) |
| `style` | Formatting only (prettier, no logic) |
| `build` | Build system changes |
| `revert` | Reverting a prior commit |

**Scopes**: project-specific (e.g., `auth`, `payment`, `cli`). Omit if cross-cutting.

**Description**: imperative present tense, no period, max 72 chars total.

## Examples

### Good work-unit commits

```
feat(auth): add JWT refresh token rotation

Refresh tokens now rotate on every use. Old refresh token is
invalidated immediately. Reduces blast radius if a refresh token
leaks.

- Token TTL: 7 days (was: never expires)
- Rotation: atomic via database transaction
- Old token blacklisted for 5 min grace period

Tests: 12 new in auth/refresh.test.ts (all pass)
```

```
fix(api): handle null response from external billing service

When Stripe returns 502 we were crashing. Now we retry with
exponential backoff (max 3 attempts) and fall back to "pending"
state for the user.

Closes #142
```

```
refactor(users): extract validation into UserValidator class

No behavior change. Pulls 200 lines of inline validation out of
the controller into a dedicated class. Makes the controller half
the size and validation testable in isolation.

Tests: existing tests still pass; added 8 new unit tests for
UserValidator class.
```

### Bad work-unit commits

```
update stuff                       ← what stuff? not a unit
fix bug                            ← which bug?
WIP                                ← not a unit, save in stash
final fix this time                ← bad sign
implemented entire auth system     ← too big, split it
```

## When the Commit is Too Big

If your commit has:
- More than ~200 lines changed
- More than 5 files
- Mixed concerns (feat + refactor + fix)

→ SPLIT it:

1. `git reset HEAD~1` (unstage but keep changes)
2. Add files in logical groups: `git add -p` (per-hunk)
3. Commit each group with its own message
4. If commits got out of order: `git rebase -i HEAD~N` to reorder

## Pre-Commit Checklist

Before `git commit`:

- [ ] All tests pass (`pnpm test` or detected)
- [ ] Typecheck clean (`pnpm typecheck`)
- [ ] No `console.log` left in production code
- [ ] No commented-out code blocks
- [ ] No secrets (.env, keys, tokens)
- [ ] Story-tellable in 1 sentence
- [ ] Self-contained (can revert without breaking others)

## Workflow

```
1. Stage related changes: git add <files>
2. Run pre-commit checklist (tests + typecheck)
3. Write conventional commit message
4. git commit (no -m for non-trivial commits — open editor for body)
5. Verify: git log -1 --stat
6. If diff > 200 lines: consider splitting before pushing
```

## Anti-Patterns (do NOT do)

- Squashing into one commit at PR time → loses the story
- "Save points" with `WIP` → use `git stash` instead
- Mixing feat + refactor in one commit → impossible to revert one without the other
- Empty commit messages → blocked by hook (if configured)
- 50-line commit messages → use the body, but keep summary <72 chars
- Reformatting + logic changes in same commit → impossible to review

## Connection to Other Skills

- **iron-law extension**: blocks `write`/`edit` if no failing test exists → commits enforce TDD
- **branch-pr**: PR body summarizes commits; well-structured commits = easy PR description
- **chained-pr**: when commits accumulate beyond 400 lines, chained-pr splits them into stacked PRs
- **rollback**: clean commits = clean reverts

## Neurox Integration

- **At start**: `neurox_recall(query="commit conventions <project>")` — load project-specific scopes
- **On new scope discovered**: `neurox_save(observation_type="pattern", tags=["commit-scope"])`
- **Cross-namespace**: conventional commits are universal, search globally

## Commands

```bash
# Stage hunks selectively
git add -p

# Inspect what would be committed
git diff --staged --stat

# Reset last commit but keep changes staged
git reset --soft HEAD~1

# Reorder/squash recent commits
git rebase -i HEAD~5

# Check commit message style after
git log -5 --oneline
```
