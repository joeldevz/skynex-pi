---
name: archive-spec
description: "Trigger: archive-spec, archive feature spec, spec archive. Archives a completed feature change folder to .skynex/archive/YYYY-MM-DD-<slug>/ after sync is confirmed. Immutable audit trail."
---

# Archive Spec — Feature Lifecycle Closure

> After `/skill:sync` merges the feature delta into the canonical spec, archive the completed feature change folder to `.skynex/archive/YYYY-MM-DD-<slug>/` for immutable audit trail. This folder is committed to git.

## When to Use

Use `/skill:archive-spec` when:
- `/skill:sync` has just completed and confirmed merge (`Status: synced`)
- Feature change folder `.skynex/<slug>/` is ready to be archived
- You want an immutable audit trail of the feature lifecycle

DO NOT use for:
- Incomplete or unsynced features (run `/skill:sync` first)
- Temporary cleanup (archive is permanent once committed)
- Archiving without sync confirmation

## Compact Rules

1. Require `.skynex/<slug>/sync-report.md` to exist with `Status: synced` before archiving
2. If sync-report is missing or not synced, stop and tell user to run `/skill:sync` first
3. Archive destination: `.skynex/archive/YYYY-MM-DD-<slug>/` where date = today's date
4. Copy (do NOT move yet) the entire `.skynex/<slug>/` folder to archive destination
5. After copy is verified (all files present in destination), delete the source folder
6. Update `.gitignore` if needed — `.skynex/archive/` must NOT be gitignored (it's the committed audit trail)
7. Write a one-line entry to `.skynex/archive/index.md` (create if not exists): `| YYYY-MM-DD | <slug> | <domain> | <N added> | <N modified> | <N removed> |`
8. Return structured envelope with status, archive path, files archived, next action

## Workflow

```
a. Resolve feature-slug
   - From user input (e.g., /skill:archive-spec add-auth-saml)
   - OR from context if working in existing feature dir
   
b. Check .skynex/<slug>/sync-report.md exists and Status is "synced"
   - If file missing: output error "sync-report.md not found. Run /skill:sync first."
   - If status != synced: output error "Sync not confirmed. Check sync-report.md."
   - STOP if either condition fails

c. Compute archive path: .skynex/archive/YYYY-MM-DD-<slug>/
   where date = ISO 8601 date (e.g., 2026-06-05)

d. Check archive path doesn't already exist
   - If exists: STOP with error "Archive already exists at <path>. Cannot overwrite."

e. Create .skynex/archive/ directory if missing

f. Copy .skynex/<slug>/ → .skynex/archive/YYYY-MM-DD-<slug>/ (all files recursively)
   Use: cp -r .skynex/<slug>/ .skynex/archive/YYYY-MM-DD-<slug>/

g. Verify copy: list files in destination, compare count to source
   Command: find .skynex/<slug>/ -type f | wc -l
   Command: find .skynex/archive/YYYY-MM-DD-<slug>/ -type f | wc -l
   If counts differ: STOP with error "Copy incomplete. Aborting deletion."

h. Delete source folder: rm -rf .skynex/<slug>/

i. Read .skynex/archive/YYYY-MM-DD-<slug>/sync-report.md to extract:
   - Domain (from Feature → Domain)
   - Added count (from ADDED section, count items)
   - Modified count (from MODIFIED section, count items)
   - Removed count (from REMOVED section, count items)

j. Upsert .skynex/archive/index.md:
   - If file doesn't exist: create with header (see format below)
   - If exists: append new row
   - Format: | YYYY-MM-DD | <slug> | <domain> | <N added> | <N modified> | <N removed> |
   - Sort by date descending (newest first) before committing

k. Return envelope (see Output Format below)
```

## Archive Index Format

File: `.skynex/archive/index.md`

```markdown
# Spec Archive Index

| Date | Feature Slug | Domain | Added | Modified | Removed |
|------|-------------|--------|-------|----------|---------|
| 2026-06-05 | add-auth-saml | auth | 3 | 1 | 0 |
| 2026-05-20 | rebuild-auth-sso | auth | 5 | 2 | 1 |
```

Rules:
- Create file with header if it doesn't exist
- Append new rows
- Keep sorted by date (descending = newest first)
- Use pipes `|` with spaces for readability

## Output Format

Return a structured YAML envelope:

```yaml
status: ready | blocked | error
feature_slug: "<slug>"
archive_path: ".skynex/archive/YYYY-MM-DD-<slug>/"
files_archived: N
index_updated: true | false
domain: "<domain from sync-report>"
added_count: N
modified_count: N
removed_count: N
next_action: "done" | "git-commit" | "manual-review"
```

### Envelope Field Guide

- `status`: `ready` (success), `blocked` (missing sync-report), or `error` (copy failed, path exists, etc.)
- `feature_slug`: resolved slug (e.g., `add-auth-saml`)
- `archive_path`: absolute or relative path to created archive folder
- `files_archived`: count of files in the archive (from find command)
- `index_updated`: true if `.skynex/archive/index.md` was created or appended
- `domain`: extracted from sync-report Feature domain field
- `added_count`, `modified_count`, `removed_count`: extracted from sync-report sections
- `next_action`: 
  - `"done"` if archive complete and ready for git commit
  - `"git-commit"` if user should run `git add .skynex/archive/` + `git commit`
  - `"manual-review"` if files need inspection before committing

## Anti-Bypass Rules

- ❌ NEVER archive without confirmed sync-report (`Status: synced`)
- ❌ NEVER delete source before verifying copy is complete (file counts must match)
- ❌ NEVER overwrite an existing archive folder (fail with error immediately)
- ❌ NEVER gitignore `.skynex/archive/` — it IS the committed audit trail
- ✅ DO check `.skynex/archive/` is not in `.gitignore` before finishing

## Important: .gitignore Policy

The `.skynex/` directory has selective gitignore rules:
- `.skynex/*.json` — excluded (e.g., production-gate.json, project.json)
- `.skynex/**/*.log` — excluded (audit.log)
- `.skynex/archive/` — **NOT excluded** (committed audit trail)

Verify before finishing:
```bash
grep -n "archive" .skynex/.gitignore || echo "No ignore rule for archive (correct)"
```

If archive is accidentally in gitignore, remove the rule and commit.

## Common Issues

### sync-report.md not found

**Error**: "sync-report.md not found. Run /skill:sync first."

**Fix**: The feature has not been synced. Run `/skill:sync <slug>` to generate sync-report.md.

### Status not "synced"

**Error**: "Sync not confirmed. Check sync-report.md."

**Fix**: Open `.skynex/<slug>/sync-report.md` and check the Status field. May be "pending", "in-progress", or "failed". Run `/skill:sync` again if needed.

### Archive path already exists

**Error**: "Archive already exists at .skynex/archive/YYYY-MM-DD-<slug>/. Cannot overwrite."

**Fix**: The archive was already created (perhaps on a prior run). Check if the source folder is still present. If yes, delete the source manually or use a different slug variant.

### Copy verification failed

**Error**: "Copy incomplete. Aborting deletion."

**Fix**: The file counts in source and destination don't match. Investigate the `.skynex/archive/YYYY-MM-DD-<slug>/` folder for missing or corrupted files. Delete the partial archive and retry.

## Examples

### Successful Archive

```yaml
status: ready
feature_slug: add-auth-saml
archive_path: .skynex/archive/2026-06-05-add-auth-saml/
files_archived: 8
index_updated: true
domain: auth
added_count: 3
modified_count: 1
removed_count: 0
next_action: "git-commit"
```

After this, user should run:
```bash
git add .skynex/archive/
git commit -m "archive: add-auth-saml feature [2026-06-05]"
```

### Blocked (Missing Sync)

```yaml
status: blocked
feature_slug: add-auth-saml
archive_path: null
files_archived: 0
index_updated: false
domain: null
added_count: null
modified_count: null
removed_count: null
next_action: "run-sync"
```

Message to user: "sync-report.md not found. Run `/skill:sync add-auth-saml` first."

## Related Skills

- `/skill:sync` — Merges feature delta into canonical spec (run before archive)
- `/skill:propose` — Initiates feature change workflow
- `/skill:validate` — Validates feature quality before sync

