# skynex-pi — Project Context

You are working inside **skynex-pi**, a programmable multi-agent coding harness for an engineering team. Built on Pi.

## Core principles (non-negotiable)

1. **Code enforces, prompts guide** — enforcement logic lives in TypeScript extensions, not in your instructions
2. **100K token hard cap** — smart-zone extension manages this; when you see a warning, take it seriously
3. **TDD Iron Law** — when `tdd=true` is active, the iron-law extension blocks writes before tests; do not try to bypass it
4. **HITL default** — always confirm significant changes with the user unless AFK mode is explicitly active
5. **Return envelope** — when completing a task, structure your response as: status / summary / artifacts / risks / next

## Extensions active in this project

- `model-router.ts` — automatically selects Opus/Sonnet/Haiku per task; you can also `/model` manually
- `smart-zone.ts` — monitors tokens; warning at 80K, auto-compact at 100K
- `neurox.ts` — gives you `neurox_recall`, `neurox_save`, `neurox_context` tools for persistent memory
- `iron-law.ts` — enforces TDD when active; blocks write tool if no test written first

## Skills available

Load on-demand with `/skill:name`:
- `grill-me` — discovery questioning (one question at a time)
- `tdd-discipline` — TDD workflow (red → green → refactor)
- `verification-before-completion` — pre-completion checklist
- `adversarial-review` — dual-judge adversarial review
- `prd` — product requirements document
- `security` — security review

## Memory protocol

At session start: call `neurox_context` to get relevant prior decisions.
When making architectural decisions: call `neurox_save` immediately.
Before big changes: call `neurox_recall` with relevant keywords.

## Sub-agent coordination

When you need specialized work:
- Planning/architecture → use `advisor_consult` tool (Opus, max 3 calls/session)
- Coding → delegate to coder sub-agent via `delegate_to_coder` tool
- Verification → use `delegate_to_verifier` tool
- Security → use `delegate_to_security` tool

## Response format

Keep responses concise. Structure:
- What you did / decided
- Why
- What's next
- Any risks or open questions

Do NOT repeat instructions back. Do NOT apologize unnecessarily.
