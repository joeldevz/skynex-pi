---
name: branch-pr
description: Create a pull request for the current branch following project conventions. Validates branch name, runs pre-push checks, gates before push, and produces a structured PR body.
---

# Branch PR — Structured Pull Request Workflow

> A PR is a proposal for conversation, not just a diff dump.
> Every PR must be self-explanatory to a reviewer with zero prior context.

## When to Use

- Creating a pull request for any change
- Preparing a branch for submission or review
- Checking whether a branch is ready to be pushed

## Compact Rules

1. Verify no uncommitted changes exist before proceeding
2. Auto-detect base branch; default to main/master if ambiguous
3. Warn (do not block) if branch name doesn't match `type/description` format
4. Run project's pre-push check: auto-detect from package.json/Makefile/go.mod
5. HITL gate before push: confirm branch, base, title, and draft status
6. PR title must follow conventional commits: `type(scope): description`
7. PR body must include: summary, changes table, test plan, linked issue if exists
8. Add one type label if repo uses labels (optional, never mandatory)
9. Open as draft if work is exploratory or not ready for review
10. Return the PR URL when done

## HITL Gate (mandatory before push)

Stop and confirm with your human partner:

```
About to push `<branch>` to `<remote>` and open PR to `<base>`.
Title: `<proposed title>`
Base:  `<base branch>`
Draft: yes / no

Proceed? (approve / dale / ok / edit "<note>" / cancel)
```

Do NOT push until explicitly confirmed.

## Workflow

```
1. git status — verify clean working tree
2. Auto-detect base branch
3. git log base..HEAD — check commits ahead
4. Validate branch name (warn, not block)
5. Run pre-push quality check
6. HITL gate — confirm title, base, draft status
7. git push -u origin <branch>
8. gh pr create with structured body
9. Add label if repo uses labels (optional)
10. Return PR URL
```

## Branch Naming Convention

SHOULD follow: `type/description` (lowercase, hyphens, no spaces)

| Type | Example |
|------|---------|
| `feat` | `feat/user-login` |
| `fix` | `fix/null-pointer-crash` |
| `chore` | `chore/update-deps` |
| `docs` | `docs/api-reference` |
| `refactor` | `refactor/extract-auth-module` |
| `test` | `test/add-handler-coverage` |

If name doesn't match, warn and ask to confirm or rename — never block.

## PR Title: Conventional Commits

```
type(scope): description
```

Examples:
```
feat(auth): add JWT refresh token rotation
fix(api): handle null response from external service
docs(readme): update local development setup
chore(deps): upgrade nestjs to v11
```

## PR Body Template

```markdown
## Summary

- <what this PR does and why>

## Changes

| File | Change |
|------|--------|
| `path/to/file` | What changed and why |

## Linked Issue

Closes #<N>
<!-- or: "No linked issue — standalone change" -->

## Test Plan

- [ ] Existing tests pass: `<test command>`
- [ ] New tests added for new behavior
- [ ] Manually tested: <what was tested>

## Notes

<!-- Breaking changes, migration steps, follow-up work -->
```

## Pre-Push Quality Check

Auto-detect in this order:
1. `package.json` → `scripts.lint`, `scripts.type-check`, `scripts.test`
2. `Makefile` → `lint`, `check`, `test` targets
3. `go.mod` → `go build ./...`
4. None found → warn and ask whether to proceed without check

If the check fails, block and report. Do NOT push with a failing check.

## Label Mapping (optional)

Only apply if repo uses labels. Check with `gh label list` first.

| Commit type | Label |
|-------------|-------|
| `feat` | `type:feature` |
| `fix` | `type:bug` |
| `docs` | `type:docs` |
| `refactor` | `type:refactor` |
| `chore`/`ci`/`test` | `type:chore` |

## Edge Cases

| Situation | Handling |
|-----------|----------|
| No commits ahead of base | Block: "Branch has no commits ahead of `<base>`." |
| Uncommitted changes | Warn: "Commit or stash before creating PR." |
| Branch already has open PR | Show existing PR URL; ask to update or abort |
| No remote set | Run `git remote -v`; if empty, ask for remote URL |
| main vs master | Auto-detect via `git symbolic-ref refs/remotes/origin/HEAD` |
| First push of branch | Use `git push -u origin <branch>` |
| Draft vs ready | Ask if output is exploratory or WIP |

## Neurox Integration

- **At start**: `neurox_recall(query="pr conventions branch workflow")` — load saved preferences
- **Cross-namespace**: search without namespace for global PR preferences
- **On new label/branch convention discovered**: `neurox_save(observation_type="pattern", ...)`

## Commands

```bash
# Auto-detect base branch
git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'

# Commits ahead of base
git log main..HEAD --oneline

# Push branch (first time)
git push -u origin <branch>

# Create PR
gh pr create --title "type(scope): description" --body-file /tmp/pr-body.md

# Create as draft
gh pr create --draft --title "..." --body "..."

# Check if PR already exists
gh pr list --head <branch> --json url,state

# Add label
gh pr edit <number> --add-label "type:feature"
```
