# skynex-pi — Project Context

You are working inside **skynex-pi**, a programmable multi-agent coding harness for an engineering team. Built on Pi.

## Core principles (non-negotiable)

1. **Code enforces, prompts guide** — enforcement logic lives in TypeScript extensions, not in your instructions.
2. **100K token hard cap** — smart-zone extension manages this; when you see a warning, take it seriously.
3. **TDD Iron Law** — when `tdd=true` is active, the iron-law extension blocks writes before tests; do not try to bypass it.
4. **HITL default** — always confirm significant changes with the user unless AFK mode is explicitly active.
5. **Return envelope** — when completing a task, structure your response as: status / summary / artifacts / risks / next.

## When to call Neurox (important — do NOT call it for greetings)

The Triage extension classifies every user message into one of four paths:

- `conversational` — greeting, small talk, ack ("hola", "thanks", "ok") → **DO NOT call any neurox_* tool**. Just respond conversationally and briefly.
- `small` — trivial mechanical change → only call `neurox_save` if a meaningful decision was made.
- `medium` — clear technical task → call `neurox_recall` at the start to fetch relevant prior context for the area being touched.
- `substantial` — risky / cross-module / ambiguous → call `neurox_recall` AND `neurox_context` at the start; save decisions as they happen.

**Explicit search intent** ("recuerda...", "busca en memoria...", "qué decisión tomamos sobre X") → call `neurox_recall` regardless of path.

**Do NOT call `neurox_session_start` on every prompt.** Call it only once at the beginning of a real work session, not for "hola" or "gracias".

## Extensions active in this project

- `triage` — classifies your incoming request (conversational/small/medium/substantial). Use `/triage:status` to see the last decision.
- `iron-law` — enforces TDD when active; blocks `write`/`edit` if no test exists for production code.
- `skill-registry` — loads SKILL.md files, injects per-agent compact rules.
- `smart-zone` — monitors token budget; warning at 80K, auto-compact at 100K.
- `neurox-tool` — gives you `neurox_recall`, `neurox_save`, `neurox_context`, `neurox_session_start`, `neurox_session_end`.
- `production-gate` — blocks production-affecting commands (`kubectl apply`, `terraform apply`, `git push --force`, `npm publish`, `rm -rf /`, etc.) and requires typed confirmation.

## Skills available (load on-demand with `/skill:name`)

- `grill-me` — discovery questioning (one question at a time)
- `tdd-discipline` — TDD workflow (red → green → refactor)
- `verification-before-completion` — pre-completion checklist
- `adversarial-review` — dual-judge adversarial review
- `prd` — product requirements document
- `security` — security review

## Response format

Keep responses concise. Match the tone to the triage path:

- `conversational`: 1-2 lines max. No envelope, no checklists, no Neurox dumps.
- `small`: brief. Show what changed and what's next. Envelope optional.
- `medium`/`substantial`: full return envelope (status / summary / artifacts / risks / next).

Do NOT repeat instructions back. Do NOT apologize unnecessarily.
