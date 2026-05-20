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

## How to search Neurox effectively (mandatory protocol)

Neurox stores observations across MANY projects in different namespaces (e.g. `default`, `clasing-api`, `skynex`, etc.). The current project is `skynex-pi` but the user often has relevant knowledge in other projects.

**Search protocol — follow in order, do NOT skip steps:**

1. **Cross-project search first (no namespace filter)** — gives the broadest results:
   ```
   neurox_recall(query: "auth decisions login")
   ```
   Most user knowledge lives in `default` or older project namespaces.

2. **If step 1 returns 0 OR few relevant results, try synonyms / variations** — at least 2-3 attempts:
   - User asked about `auth` → also try `authentication`, `login`, `jwt`, `session`, `token`
   - User asked about `payment` → also try `billing`, `checkout`, `invoice`, `subscription`
   - User asked about `bug` → also try `fix`, `error`, `issue`, `regression`
   Show variations to the user so they see what you tried.

3. **Project-namespace search** — only if you specifically need recent project-local decisions:
   ```
   neurox_recall(query: "...", namespace: "skynex-pi")
   ```

4. **If after 2-3 search variations you STILL have 0 results**, report exactly:
   - What queries you tried
   - Suggest the user phrase the question differently OR confirm the topic was never saved.

**Never report "no memories found" after a single search attempt.** That is a failure of your search strategy, not a Neurox limitation.

**When presenting results**, tell the user which namespace they came from (`default`, `clasing-api`, etc.) and link back with the observation `id`.

## Extensions active in this project

- `triage` — classifies your incoming request (conversational/small/medium/substantial). Use `/triage:status` to see the last decision.
- `iron-law` — enforces TDD when active; blocks `write`/`edit` if no test exists for production code.
- `skill-registry` — loads SKILL.md files, injects per-agent compact rules.
- `smart-zone` — monitors token budget; warning at 80K, auto-compact at 100K.
- `neurox-tool` — gives you `neurox_recall`, `neurox_save`, `neurox_context`, `neurox_session_start`, `neurox_session_end`.
- `production-gate` — blocks production-affecting commands (`kubectl apply`, `terraform apply`, `git push --force`, `npm publish`, `rm -rf /`, etc.) and requires typed confirmation.

## How to interact with the production-gate (important)

The `production-gate` extension is a `tool_call` hook. It intercepts dangerous commands at the moment you invoke `bash`. **The user already trusts this layer** — your job is NOT to pre-block production commands in your text response.

When the user asks for a production-affecting action (e.g. `kubectl apply`, `terraform apply`, `npm publish`):

- ✅ **DO**: call the `bash` tool with the actual command. The production-gate will intercept, show the user an arrow-key dialog (approve / cancel / show details), and either block or let it through. The user sees the dialog and decides.
- ❌ **DO NOT**: refuse to call the tool and reply with a text envelope asking for typed confirmation. That defeats the gate's UX (the dialog is much better than typed text). The gate is the source of truth, not your prompt.
- ⚠️ Exception: if the user's request is ambiguous (e.g. "deploy this" without specifying what), ask the clarifying question FIRST, then call the tool.

If the user manually configured the gate to mode `off` or `warn`, you'll see commands execute without a dialog — that's their explicit decision.

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
