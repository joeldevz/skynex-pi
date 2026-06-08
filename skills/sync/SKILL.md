---
name: sync
description: Phase after validate. Translates feature SPEC.md into delta format and merges into canonical spec store (.skynex/specs/{domain}/spec.md). Requires validate to pass first. Handles domain collision detection, destructiveness analysis, and HITL gate for destructive operations.
---

# sync — Merge feature spec into canonical store

> Triage path: `substantial` · Trigger: after `/skill:validate` or explicit `/skill:sync` · Mutates files: **yes** (.skynex/specs/{domain}/spec.md, .gitignore)

## Compact Rules

1. Require `.skynex/<slug>/SPEC.md` exists and has passed `/skill:validate` phase (or `--force` flag to skip validation check).
2. Ask for domain name if not obvious (default: use feature-slug as domain if single domain, or reject with "domain ambiguous, please specify").
3. Check for active domain collisions using `detectActiveDomainCollisions` — if found, warn user ("another change is already modifying this domain") but do NOT block unless `--strict` flag.
4. Invoke `spec-syncer` agent (read-only) with feature-slug + domain + SPEC.md path + canonical path (if exists).
5. Check `analyzeDeltaDestructiveness` result — if destructive (removals or large modifications), pause and ask user to confirm before merging.
6. Apply the delta by writing spec-syncer's `delta_markdown` to `.skynex/<slug>/spec-delta.md`, then running the `/skynex:spec-merge <domain> <deltaFile>` command (preview with `--dry-run`; use `--force` only after the user confirms a destructive merge). NEVER hand-merge the canonical — the command runs the deterministic engine in `extensions/skynex-spec/`.
7. Write updated canonical to `.skynex/specs/{domain}/spec.md` (create directory if new domain).
8. Write `sync-report.md` to `.skynex/<slug>/sync-report.md` with summary of changes, canonical path, and next steps.
9. Update `.gitignore` if needed — ensure `.skynex/specs/` is NOT gitignored (it's the committed canonical store).
10. Return structured envelope with status, domain, canonical_path, changes (added/modified/removed counts), and next_action.

## Workflow

### a. Verify SPEC.md and Validate Phase

- Confirm `.skynex/<slug>/SPEC.md` exists and is readable.
- If no validate report found in `.skynex/<slug>/validate/`, either:
  - Skip check if user provides `--skip-validate` flag (developer override).
  - Assume validation passed (default, less restrictive).
  - Block if user provides `--strict-validate` flag (requires proof of validate phase).

### b. Resolve Domain

- If domain is not specified in the command or request:
  - If feature slug contains a clear domain hint (e.g. `rebuild-auth-saml-sso` → infer `auth`):
    - Extract domain from slug prefix before first hyphen or semantic keyword.
  - Otherwise:
    - Ask user: "Which domain? (e.g. 'auth', 'payment', 'user-management'): "
- Use domain exactly as provided; do not infer beyond the ask.

### c. Detect Collisions

- Call `detectActiveDomainCollisions(cwd, <slug>, <domain>)` from `extensions/skynex-spec/guardrails.ts`.
- If collisions found:
  - Report them: "⚠️ Warning: domain '{domain}' is already being modified by change: {change_names}. Parallel modifications may cause merge conflicts."
  - Continue (non-blocking by default, unless `--strict` flag given).
  - If `--strict`: block and ask user to resolve conflicts first.

### d. Invoke spec-syncer Agent

- Call `subagent` with:
  ```
  agent: "spec-syncer"
  task: "Translate feature SPEC.md to delta format"
    feature_slug: "<slug>"
    domain: "<domain>"
    spec_path: ".skynex/<slug>/SPEC.md"
    canonical_path: ".skynex/specs/<domain>/spec.md" OR null
  ```
- Wait for envelope. If `status != ready`:
  - Surface the error: "Spec syncer blocked: {status}. {risks}."
  - Return `status: blocked` with issue in `next_action: review-spec`.

### e. Check Destructiveness

- Parse delta_markdown from spec-syncer envelope.
- Call `analyzeDeltaDestructiveness(delta_markdown)` from `extensions/skynex-spec/guardrails.ts`.
- If result.destructive == true:
  - Show summary:
    ```
    ⚠️ DESTRUCTIVE SYNC DETECTED
    
    Removed requirements: {list of names}
    Large modifications (>20 lines): {list with line counts}
    
    This operation will modify the canonical spec irreversibly.
    ```
  - Ask user: "Confirm destructive merge? (yes/no)"
  - If user says "no": return `status: skipped` with `next_action: review-destructiveness`.
  - If user says "yes": continue to step (g).
- If result.destructive == false: proceed directly to step (g).

### f. Write the Delta to Disk

- Take `delta_markdown` from the spec-syncer envelope.
- Write it verbatim to `.skynex/<slug>/spec-delta.md` so the merge command can read it.

### g. Preview the Merge (dry run)

- Run the deterministic merge command in preview mode:
  ```
  /skynex:spec-merge <domain> .skynex/<slug>/spec-delta.md --dry-run
  ```
- The command reports added/modified/removed counts and whether the delta is destructive. It writes nothing.

### h. Apply the Merge

- If the dry run reported `Destructive: no`:
  ```
  /skynex:spec-merge <domain> .skynex/<slug>/spec-delta.md
  ```
- If the dry run reported a destructive merge (removals or large rewrites), the plain command will REFUSE and explain. Only after the user explicitly confirms in step (e), re-run with `--force`:
  ```
  /skynex:spec-merge <domain> .skynex/<slug>/spec-delta.md --force
  ```
- The command reads the current canonical (or creates an empty one for a new domain), applies the delta with the engine, and writes `.skynex/specs/{domain}/spec.md`. NEVER hand-merge or hand-write the canonical — always go through the command so the deterministic engine runs.
- If the command reports a merge error (e.g. duplicate/missing requirement name), return `status: blocked` and ask the user to review the delta and feature spec for conflicts.

### i. Write Sync Report

- Generate sync report from template (see below).
- Write to `.skynex/<slug>/sync-report.md`.

### j. Update .gitignore

- Ensure `.skynex/specs/` is NOT gitignored.
- Read `.gitignore`.
- If line `specs/` or `.skynex/specs/` is present, remove it.
- If line `*.md` is present under `.skynex/`, verify it doesn't accidentally ignore `specs/` (should be scoped to specific directories).
- Write updated `.gitignore`.

### k. Return Envelope

See "Output Envelope" section below.

## Empty Canonical Template

When creating a new domain spec for the first time:

```markdown
# {Domain} Specification

## Purpose

{Describe what this domain covers.}

## Requirements

```

The orchestrator replaces `{Domain}` with the actual domain name and optionally a brief purpose description. Requirements are then inserted after the `## Requirements` heading during delta application.

## Sync Report Template

Write to `.skynex/<slug>/sync-report.md`:

```markdown
# Sync Report: {feature-slug}

**Date:** {YYYY-MM-DD HH:MM:SS}
**Domain:** {domain}
**Status:** synced | skipped | blocked

## Changes Applied

- Added: {N} requirements
- Modified: {N} requirements  
- Removed: {N} requirements

## Canonical Spec

Path: `.skynex/specs/{domain}/spec.md`

Link to canonical: [{relative-path-hint}](.skynex/specs/{domain}/spec.md)

## Destructive Operations

{None | list of removed/large-modified requirements with confirmation note}

## Collision Report

{None | list of other active changes touching this domain}

## Next Step

Run `/skill:archive-spec` to finalize this feature and move it to the archive.
```

## Output Envelope

```yaml
status: ready | blocked | skipped
feature_slug: "<slug>"
domain: "<domain>"
canonical_path: ".skynex/specs/{domain}/spec.md"
sync_report: ".skynex/<slug>/sync-report.md"
is_new_domain: true | false
changes:
  added: N
  modified: N
  removed: N
destructive: true | false
next_action: archive | review-canonical | review-spec | blocked
```

**Envelope fields:**

- `status`:
  - `ready`: merge completed successfully; canonical updated.
  - `skipped`: user declined destructive merge or sync was skipped for other reason.
  - `blocked`: spec-syncer error, merge conflict, write failure, or other blocker.
- `feature_slug`: the slug passed in (e.g. `rebuild-auth-saml-sso`).
- `domain`: the domain resolved (e.g. `auth`).
- `canonical_path`: absolute or relative path to `.skynex/specs/{domain}/spec.md`.
- `sync_report`: path to sync report (`.skynex/<slug>/sync-report.md`).
- `is_new_domain`: `true` if this is the first time creating a canonical for this domain.
- `changes`: counts of added/modified/removed requirements in the delta.
- `destructive`: `true` if the merge included removals or large modifications.
- `next_action`:
  - `archive`: merge succeeded, recommend running `/skill:archive-spec` to finalize.
  - `review-canonical`: merge succeeded but user should review the canonical before archiving.
  - `review-spec`: spec-syncer flagged risks or collisions; user should review SPEC.md.
  - `blocked`: operation failed; user must fix issues before retry.

## Anti-Bypass Rules

- NEVER apply delta without reading current canonical first (even if empty template is used).
- NEVER skip destructiveness check — always analyze and ask user.
- NEVER sync if validate phase didn't pass (unless `--force` or `--skip-validate` flag is given explicitly).
- NEVER write to canonical without checking `.gitignore` rule — `.skynex/specs/` must be committed.
- NEVER combine deltas from multiple features in one canonical write — sync one feature at a time.

## Common Pitfalls

1. **"I'll apply the delta later"** — no. Apply delta immediately after spec-syncer returns. Deferring increases merge conflict risk.
2. **"Canonical is too big to review"** — sync report provides a summary. User can read the sync report and optionally review the canonical file.
3. **"Destructive is just a warning"** — no. Pause and ask user. If they say "no", return `skipped` and let orchestrator decide next action.
4. **"Domain inference is obvious"** — ask anyway if not explicitly provided. Misconfigured domain causes permanent spec fragmentation.
5. **"Gitignore doesn't matter for feature work"** — it does. If specs are gitignored, the canonical becomes invisible to the team. Always verify.

## Example Run

```
User: /skill:sync
Orchestrator: domain not specified. infer from rebuild-auth-saml-sso? (y/n): y

✓ Domain resolved to: auth
⚠️ Warning: domain 'auth' is already being modified by change: fix-jwt-expiry (but proceeding with --strict not set)
⏳ Invoking spec-syncer...
✓ spec-syncer ready. 10 ACs, 15 scenarios, delta: 5 added, 0 modified, 0 removed

⚠️ DESTRUCTIVE? No. Proceeding.

✓ Canonical found at .skynex/specs/auth/spec.md (existing domain, will merge)
✓ Applied delta. Result: 45 total requirements.
✓ Written .skynex/specs/auth/spec.md (5642 bytes)
✓ Written .skynex/rebuild-auth-saml-sso/sync-report.md

Return envelope:
  status: ready
  feature_slug: rebuild-auth-saml-sso
  domain: auth
  canonical_path: .skynex/specs/auth/spec.md
  is_new_domain: false
  changes: {added: 5, modified: 0, removed: 0}
  destructive: false
  next_action: archive
```
