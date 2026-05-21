---
name: onboard
description: First-time project onboarding. Scans codebase, identifies stack/conventions/architecture, and saves knowledge to Neurox for all future sessions. Run once per project.
---

# Onboard — First-Time Project Setup

> Run this ONCE when you open a project for the first time. Pi will scan the
> codebase, identify the stack, find conventions, and save everything to
> Neurox so future sessions have full context without re-exploring.

## When to Use

Use `/skill:onboard` when:
- You just cloned a project you haven't worked on with Pi before
- You're starting work on an existing project after a long break
- Project conventions have changed significantly (re-onboard)
- You see "No skills loaded" or feel Pi lacks project context

DO NOT use for:
- Per-task exploration (`/skill:discover` does that)
- Trivial single-file edits
- Already-onboarded projects (check `neurox_recall(query="project onboarding <name>")`)

## Compact Rules

1. Run ONCE per project — check Neurox first to avoid redundant work
2. Invoke `scout` sub-agent for codebase exploration
3. Read: package.json, AGENTS.md, README.md, CONTRIBUTING.md, .gitignore, tsconfig.json/go.mod/Cargo.toml
4. Identify: stack, package manager, test runner, lint command, conventions
5. Find: entry points, main modules, test directories
6. Save EVERYTHING to Neurox with topic_key "onboarding/<project-name>"
7. Use project directory name as Neurox namespace for all future saves
8. Surface a 1-page summary to the user with key findings + suggested next steps
9. If project has its own `.pi/` config, document the customizations
10. HITL gate at end: confirm understanding with user before claiming done

## Workflow

```
1. neurox_recall(query="project onboarding") — check if already done
   - If found: surface saved knowledge, ask user if re-onboarding needed
2. Determine project name from cwd basename
3. Invoke scout sub-agent with onboarding-specific task:
   "Onboard project. Read: package.json, AGENTS.md, README, config files.
    Map: stack, conventions, entry points, modules, test setup.
    Return structured findings — NOT for a specific task."
4. Wait for scout envelope
5. Synthesize findings into onboarding report
6. Save each finding to Neurox:
   - project metadata → observation_type: "config"
   - architecture decisions → observation_type: "decision"
   - conventions discovered → observation_type: "pattern"
   - gotchas → observation_type: "gotcha"
7. Update AGENTS.md if recommendations exist (HITL gate first)
8. Surface summary + suggested next steps to user
```

## What to Capture

### Stack Detection

Identify and save:
- Language(s) and version(s)
- Framework(s) (NestJS, Next.js, Express, etc.)
- Package manager (npm, pnpm, yarn, bun)
- Build tool (tsc, vite, esbuild, webpack)
- Test runner (vitest, jest, node:test, pytest, go test)
- Linter (eslint, biome, ruff)
- Database (Prisma, TypeORM, raw SQL, MongoDB)
- Deployment (Vercel, AWS, k8s, etc.)

### Conventions

- File naming (kebab-case, camelCase, snake_case)
- Directory structure (`src/`, `apps/`, `packages/`, monorepo?)
- Import style (absolute vs relative, path aliases)
- Test colocation (`*.test.ts` next to source vs `tests/`)
- Commit conventions (conventional commits? custom?)
- Branch conventions

### Architecture

- Entry points (main files, CLI entries, API routes)
- Core modules and their responsibilities
- Dependency graph (which modules depend on which)
- External integrations (databases, APIs, queues)
- Auth strategy (JWT, OAuth, SAML, session)

### Gotchas

- Things that look weird but are intentional
- Known issues with workarounds
- Performance traps
- Deployment quirks

## Output: Onboarding Report

Surface this to the user:

```markdown
# 🎯 Project Onboarding: <name>

## Stack
- Language: <e.g., TypeScript 5.4>
- Framework: <e.g., NestJS 11>
- Package manager: <e.g., pnpm>
- Tests: <e.g., vitest>

## Architecture Overview
- Entry points: <list>
- Main modules: <list with 1-line description>
- External integrations: <list>

## Conventions
- File naming: <pattern>
- Test colocation: <where>
- Commit style: <convention>

## ⚠️ Gotchas Found
- <thing 1>
- <thing 2>

## ✅ What's Now in Neurox
- <N> observations saved under namespace "<project-name>"
- topic_key: "onboarding/<project-name>" — main onboarding doc
- topic_key: "stack/<project-name>" — stack details
- topic_key: "conventions/<project-name>" — convention rules

## 🚀 Suggested Next Steps
- Try: "<concrete first task>"
- Or: "<another suggestion>"
- See gotchas above before <risky-area>

Future Pi sessions in this project will auto-load this context.
```

## Neurox Integration

CRITICAL — this skill is heavy on Neurox writes:

```typescript
// At start
neurox_recall({
  query: "project onboarding",
  namespace: "<project-name>"
})

// Save main onboarding (one observation)
neurox_save({
  title: "Project onboarding: <name>",
  content: "What: <full report>\nWhy: First-time onboarding\nWhere: <cwd>\nLearned: <key insights>",
  observation_type: "discovery",
  kind: "semantic",
  namespace: "<project-name>",
  topic_key: "onboarding/<project-name>",
  tags: ["onboarding", "project-knowledge"],
  confidence: 0.9
})

// Save stack separately for easy recall
neurox_save({
  title: "Stack: <project-name>",
  content: "What: <stack details>",
  observation_type: "config",
  kind: "semantic",
  namespace: "<project-name>",
  topic_key: "stack/<project-name>",
  confidence: 0.8
})

// Save each convention as its own observation
for each convention:
  neurox_save({
    title: "Convention: <area> in <project-name>",
    content: "What: <rule>\nWhere: <files>\nWhy: <reason if known>",
    observation_type: "pattern",
    kind: "semantic",
    namespace: "<project-name>",
    topic_key: "convention/<project-name>/<area>",
    confidence: 0.7
  })

// Save gotchas as their own observations
for each gotcha:
  neurox_save({
    title: "Gotcha: <description>",
    content: "What: <description>\nWhy: <impact>\nWhere: <files>",
    observation_type: "gotcha",
    kind: "procedural",
    namespace: "<project-name>",
    topic_key: "gotcha/<project-name>/<id>",
    confidence: 0.8
  })
```

## HITL Gate

At the end, surface the onboarding report and ask:

```
Onboarding complete for "<project-name>".

I saved <N> observations to Neurox namespace "<project-name>".

Verify my understanding is correct:
- Stack: <stack summary>
- Architecture: <1-2 sentence summary>
- Main gotchas: <list>

Reply:
- approve/dale/ok    → I'll use this context for future sessions
- correct "<note>"   → I missed or got something wrong
- redo                → re-explore the codebase
```

## Connection to Other Skills

- **discover**: per-task exploration. Uses onboarding context if available.
- **plan**: reads project conventions from Neurox to make compatible plans.
- **build**: respects project conventions (test colocation, import style, etc.)
- **research**: uses stack info to find relevant docs

## Anti-Patterns

- Re-onboarding every session → check Neurox first
- Onboarding for a quick task → use `/skill:discover` instead
- Saving 50+ tiny observations → consolidate into ~10 meaningful ones
- Skipping the HITL gate → user verification catches misreadings
- Not using project name as namespace → loses memory isolation
