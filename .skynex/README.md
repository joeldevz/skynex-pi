# .skynex/

Workspace for skynex-pi runtime artifacts.

## Committed files

- `production-gate.example.json` — template config for the production gate (copy to `production-gate.json` and customize)
- `README.md` — this file

## Gitignored (per-developer / per-environment)

- `production-gate.json` — your team's actual gate config (contains real cluster contexts)
- `audit.log` — append-only audit trail of production-affecting commands
- `project.json` — output of `calibrate` phase (stack, conventions, paths)
- `{slice}/*.md` — per-slice workflow artifacts (discovery, plan, validation, etc.)

## First-time setup

When skynex-pi runs and finds no `production-gate.json`:
1. It creates one automatically from defaults (strict mode, empty safe_contexts)
2. It adds itself + audit.log to `.gitignore`
3. It notifies you with `/production-gate:status` instructions

You can also copy the example manually:
```bash
cp .skynex/production-gate.example.json .skynex/production-gate.json
# Edit .skynex/production-gate.json to add your team's contexts
```
