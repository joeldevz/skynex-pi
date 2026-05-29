# Plan: Research Mode (skynex-pi — Mode 1 of 3)

## Goal

Add a `/skynex:research` slash command that activates a sticky **research mode** for the session. When active, every user message triggers 3 specialized sub-agents in parallel (neurox, web, codebase) that each return a structured findings envelope; the main model synthesizes a final verdict and saves relevant conclusions to Neurox.

This is Mode 1 of 3 planned modes. Task-creation and execution modes are **explicitly out of scope** for this plan.

---

## Business Context

- **User**: Engineers who want validated, multi-source answers before acting (prior decisions + web + code simultaneously).
- **Activation**: `/skynex:research` → mode stays sticky until another mode command is issued or session ends.
- **Per-message flow**: 3 parallel sub-agents → structured envelopes → main model synthesis → Neurox save.
- **Default state**: no mode = normal conversation (zero overhead, zero agents launched).
- **Mode state**: per-session Map, mirrors triage's `sessionTriageStore` pattern exactly.
- **Synthesis**: the main model (the one the user is talking to) reads all 3 defenses and synthesizes directly. No 4th synthesizer agent.

---

## Technical Context

### Patterns to mirror

| Pattern | Source | How we reuse it |
|---|---|---|
| `Map<sessionId, State>` | `extensions/triage/index.ts:162` | `sessionResearchStore` tracks active/inactive per session |
| `before_agent_start` system-prompt injection | `extensions/triage/index.ts:172-206` | Inject research mode workflow hint when mode is active |
| `pi.registerCommand(name, {handler})` | `extensions/triage/index.ts:277` | `/skynex:research` and `/skynex:research:status` |
| `session_shutdown` cleanup | `extensions/triage/index.ts:269-273` | Delete session from Map on shutdown |
| `subagent({ tasks: [...] })` parallel | `skills/specify/SKILL.md:26-42` | 3 parallel tasks in one `subagent` call |
| Tool-restricted agent frontmatter | `assets/agents/scout.md:4` | Each agent's `tools:` line is restricted to its source |

### Pi extension registration

New extension must be added to `package.json` → `pi.extensions` array (currently has 8 entries; this adds a 9th).

### Sub-agent restriction rationale

- `research-neurox`: `tools: neurox_recall` only → pure memory retrieval, no web, no fs
- `research-web`: `tools: web_search, fetch_content` only → pure external retrieval
- `research-code`: `tools: read, grep, glob` only → pure codebase scan

Tool restriction enforces separation and makes each agent cheaper. Scout is **not** reused because scout has all 6 tools and is purpose-built for discovery (not debate/defense mode).

### Model selection

All 3 research agents use `opencode-go/deepseek-v4-flash` (cheap, sufficient for retrieval + formatting). The main model (user's session model) does the synthesis.

### Skill vs. hook injection

The research workflow is injected via `before_agent_start` hook (same as triage) because:
- It must be invisible to the user — no command to type after `/skynex:research`
- Injection is conditional on mode state (only when active)
- This mirrors the exact pattern already working in production for triage

The `skills/skynex-research/SKILL.md` is a **supplementary skill** the injected prompt tells the main model to follow — it documents the synthesis protocol, not the invocation. The hook injects the instructions; the skill is the contract.

### Files to create (NEW)

| File | Type |
|---|---|
| `extensions/skynex-research/index.ts` | Pi extension entry point |
| `extensions/skynex-research/types.ts` | ResearchMode state types |
| `extensions/skynex-research/dispatcher.ts` | Pure-function: build system-prompt hint |
| `extensions/skynex-research/dispatcher.test.ts` | Unit tests (pure functions) |
| `extensions/skynex-research/index.test.ts` | Command registration + state tests |
| `assets/agents/research-neurox.md` | Neurox-only search agent |
| `assets/agents/research-web.md` | Web-only search agent |
| `assets/agents/research-code.md` | Codebase-only search agent |
| `skills/skynex-research/SKILL.md` | Synthesis protocol for the main model |

### Files to modify (MODIFIED)

| File | Change |
|---|---|
| `package.json` | Add `"./extensions/skynex-research"` to `pi.extensions` array |
| `tsconfig.json` | Confirm `extensions/**/*.ts` glob includes new extension (likely already covered) |

---

## Implementation Steps

### Step 1: Types — `extensions/skynex-research/types.ts`

- **What**: Define `ResearchMode`, `ResearchSessionState`, and `ResearchEnvelope` types.
- **Why**: Shared type contract between `index.ts`, `dispatcher.ts`, and tests. Pure module with no imports from `@earendil-works`.
- **Where**: `extensions/skynex-research/types.ts` (NEW)
- **How**:

```typescript
// extensions/skynex-research/types.ts

/**
 * Whether research mode is active for this session.
 */
export type ResearchMode = "active" | "inactive";

/**
 * Per-session state stored in the module-level Map.
 */
export interface ResearchSessionState {
  /** Whether the user has activated research mode. */
  mode: ResearchMode;
  /** ISO timestamp when mode was last toggled. */
  toggledAt: string;
}

/**
 * Structured envelope returned by each research sub-agent.
 * The main model reads all 3 and synthesizes a verdict.
 */
export interface ResearchEnvelope {
  /** Concise list of findings from this agent's source domain. */
  findings: string[];
  /** One sentence: why these findings are relevant to the user's question. */
  defense: string;
  /** Origin references: Neurox IDs, URLs, or file paths. */
  sources: string[];
}
```

- **Acceptance**: `pnpm typecheck` passes with this file. No imports from `@earendil-works/pi-coding-agent` (pure types).
- **Status**: [ ] pending

---

### Step 2: Dispatcher — `extensions/skynex-research/dispatcher.ts`

- **What**: Pure functions that (a) build the `before_agent_start` system prompt injection when research mode is active, and (b) format the user-facing notification.
- **Why**: Pure functions are directly unit-testable without a Pi mock. Mirrors the `buildWorkflowHint` pattern in triage.
- **Where**: `extensions/skynex-research/dispatcher.ts` (NEW)
- **How**:

```typescript
// extensions/skynex-research/dispatcher.ts

import type { ResearchMode } from "./types.js";

/**
 * Returns the system-prompt block to inject when research mode is active.
 * Returns undefined when mode is inactive (no injection).
 */
export function buildResearchHint(mode: ResearchMode): string | undefined {
  if (mode !== "active") return undefined;

  return [
    "## RESEARCH MODE: active",
    "The user has activated research mode. For EVERY message, you MUST:",
    "",
    "1. Invoke 3 research sub-agents IN PARALLEL via a single subagent({tasks: [...]}) call:",
    "   - research-neurox: searches Neurox memory for prior decisions and context",
    "   - research-web:    searches the web for external information",
    "   - research-code:   searches the codebase for relevant patterns and files",
    "",
    "2. Each agent returns a YAML envelope with: findings, defense, sources.",
    "   Read ALL 3 envelopes before responding.",
    "",
    "3. Synthesize a final verdict: combine findings from all 3 sources, resolve",
    "   contradictions, and give the user a clear answer with source attribution.",
    "",
    "4. If findings are relevant and durable, save to Neurox:",
    "   neurox_save({ title, content, observation_type: 'discovery', kind: 'semantic',",
    "     tags: ['research-mode'], namespace: <project> })",
    "",
    "IMPORTANT: Do NOT skip the subagent call. Even for short questions, all 3 agents",
    "must run. This is the user's explicit contract for research mode.",
    "",
    "Invoke the /skill:skynex-research synthesis protocol after agents return.",
  ].join("\n");
}

/**
 * One-line notification shown to the user when mode changes.
 */
export function formatResearchNotification(mode: ResearchMode): string {
  if (mode === "active") {
    return "🔬 RESEARCH MODE: active — next messages will dispatch 3 parallel agents (neurox + web + code)";
  }
  return "🔬 RESEARCH MODE: inactive — back to normal conversation";
}
```

- **Acceptance**: Both functions are exported. `buildResearchHint("inactive")` returns `undefined`. `buildResearchHint("active")` returns a non-empty string containing `"research-neurox"`, `"research-web"`, `"research-code"`.
- **Status**: [ ] pending

---

### Step 3: Tests — `extensions/skynex-research/dispatcher.test.ts`

- **What**: Unit tests for both dispatcher functions (pure, no Pi runtime).
- **Why**: TDD discipline + regression protection. Pattern: `node:test` + `node:assert/strict`, no mocks needed.
- **Where**: `extensions/skynex-research/dispatcher.test.ts` (NEW)
- **How**:

```typescript
// extensions/skynex-research/dispatcher.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResearchHint, formatResearchNotification } from "./dispatcher.js";

// ─── buildResearchHint ───────────────────────────────────────────────────────

test("buildResearchHint: returns undefined when inactive", () => {
  assert.equal(buildResearchHint("inactive"), undefined);
});

test("buildResearchHint: returns string when active", () => {
  const hint = buildResearchHint("active");
  assert.ok(typeof hint === "string" && hint.length > 0);
});

test("buildResearchHint: active hint references all 3 agent names", () => {
  const hint = buildResearchHint("active")!;
  assert.ok(hint.includes("research-neurox"));
  assert.ok(hint.includes("research-web"));
  assert.ok(hint.includes("research-code"));
});

test("buildResearchHint: active hint mentions subagent tasks pattern", () => {
  const hint = buildResearchHint("active")!;
  assert.ok(hint.includes("tasks:"));
});

test("buildResearchHint: active hint mentions neurox_save", () => {
  const hint = buildResearchHint("active")!;
  assert.ok(hint.includes("neurox_save"));
});

test("buildResearchHint: active hint mentions RESEARCH MODE header", () => {
  const hint = buildResearchHint("active")!;
  assert.ok(hint.includes("## RESEARCH MODE: active"));
});

// ─── formatResearchNotification ─────────────────────────────────────────────

test("formatResearchNotification: active includes agent list", () => {
  const msg = formatResearchNotification("active");
  assert.ok(msg.includes("neurox"));
  assert.ok(msg.includes("web"));
  assert.ok(msg.includes("code"));
});

test("formatResearchNotification: inactive signals return to normal", () => {
  const msg = formatResearchNotification("inactive");
  assert.ok(msg.includes("inactive") || msg.includes("normal"));
});

test("formatResearchNotification: both return non-empty strings", () => {
  assert.ok(formatResearchNotification("active").length > 0);
  assert.ok(formatResearchNotification("inactive").length > 0);
});
```

- **Acceptance**: `pnpm exec tsx --test extensions/skynex-research/dispatcher.test.ts` → all 9 tests pass.
- **Status**: [ ] pending

---

### Step 4: Extension entry — `extensions/skynex-research/index.ts`

- **What**: The Pi extension that registers hooks and commands. State tracked in `sessionResearchStore`.
- **Why**: This is the runtime wiring that makes the mode sticky, injects the system prompt, and registers `/skynex:research` and `/skynex:research:status`.
- **Where**: `extensions/skynex-research/index.ts` (NEW)
- **How**:

```typescript
// extensions/skynex-research/index.ts

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildResearchHint, formatResearchNotification } from "./dispatcher.js";
import type { ResearchSessionState } from "./types.js";

/**
 * Per-session state. Mirrors triage's sessionTriageStore pattern.
 * Key: sessionFile path (or ephemeral fallback).
 * Value: current mode state for this session.
 */
const sessionResearchStore = new Map<string, ResearchSessionState>();

export default function (pi: ExtensionAPI): void {
  // Initialize state on session start (mode starts inactive)
  pi.on("session_start", (_event, ctx) => {
    const sessionId =
      ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    sessionResearchStore.set(sessionId, {
      mode: "inactive",
      toggledAt: new Date().toISOString(),
    });
  });

  // Inject research mode hint into system prompt when mode is active
  pi.on("before_agent_start", async (event, _ctx) => {
    // We derive sessionId inside the event handler at call time
    // because session_start may not have fired for all Pi invocations
    const sessionId = _ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    const state = sessionResearchStore.get(sessionId);
    const mode = state?.mode ?? "inactive";

    const hint = buildResearchHint(mode);
    if (!hint) return undefined;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${hint}`,
    };
  });

  // Clean up on session end
  pi.on("session_shutdown", (_event, ctx) => {
    const sessionId =
      ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    sessionResearchStore.delete(sessionId);
  });

  // ── Commands ───────────────────────────────────────────────────────────────

  /**
   * /skynex:research — toggle research mode on/off for this session.
   *
   * - First call (or when inactive): activates research mode
   * - Call when already active: deactivates (returns to normal)
   * Usage: /skynex:research
   */
  pi.registerCommand("skynex:research", {
    description:
      "Activate (or deactivate) research mode. When active, every message dispatches 3 parallel sub-agents (neurox + web + code). Mode is sticky until toggled off or session ends.",
    handler: async (_args, ctx) => {
      const sessionId =
        ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;

      const current = sessionResearchStore.get(sessionId);
      const newMode = current?.mode === "active" ? "inactive" : "active";

      sessionResearchStore.set(sessionId, {
        mode: newMode,
        toggledAt: new Date().toISOString(),
      });

      ctx.ui.notify(formatResearchNotification(newMode), "info");
    },
  });

  /**
   * /skynex:research:status — show current research mode state.
   */
  pi.registerCommand("skynex:research:status", {
    description: "Show the current research mode state for this session.",
    handler: async (_args, ctx) => {
      const sessionId =
        ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
      const state = sessionResearchStore.get(sessionId);

      if (!state) {
        ctx.ui.notify("No research mode state — send a message first.", "warning");
        return;
      }

      ctx.ui.notify(
        [
          `Research mode: ${state.mode.toUpperCase()}`,
          `Toggled at:    ${state.toggledAt}`,
        ].join("\n"),
        "info",
      );
    },
  });
}

// ── Exported helpers (for tests + future phase extensions) ──────────────────

/**
 * Returns the research mode state for a session, or undefined if not tracked.
 * Exported for use in tests and future integrations.
 */
export function getResearchMode(
  sessionFile: string | undefined,
): ResearchSessionState | undefined {
  const sessionId = sessionFile ?? `ephemeral-${process.pid}`;
  return sessionResearchStore.get(sessionId);
}

/**
 * Set mode directly — used in tests to seed state without going through commands.
 * @internal
 */
export function _setResearchMode(
  sessionFile: string | undefined,
  state: ResearchSessionState,
): void {
  const sessionId = sessionFile ?? `ephemeral-${process.pid}`;
  sessionResearchStore.set(sessionId, state);
}
```

- **Acceptance**: `pnpm typecheck` passes. Extension exports `default`, `getResearchMode`, `_setResearchMode`.
- **Status**: [ ] pending

---

### Step 5: Extension index tests — `extensions/skynex-research/index.test.ts`

- **What**: Unit tests for mode state management and command behavior (without a live Pi runtime).
- **Why**: Verifies the Map logic, toggle behavior, and state cleanup without needing an E2E session.
- **Where**: `extensions/skynex-research/index.test.ts` (NEW)
- **How**:

```typescript
// extensions/skynex-research/index.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { getResearchMode, _setResearchMode } from "./index.js";

const SESSION_A = "/tmp/session-a.json";
const SESSION_B = "/tmp/session-b.json";

// ─── State seeding and retrieval ─────────────────────────────────────────────

test("getResearchMode: returns undefined for unknown session", () => {
  assert.equal(getResearchMode("/tmp/never-seen.json"), undefined);
});

test("getResearchMode: returns state after _setResearchMode", () => {
  _setResearchMode(SESSION_A, { mode: "active", toggledAt: "2026-01-01T00:00:00.000Z" });
  const state = getResearchMode(SESSION_A);
  assert.ok(state !== undefined);
  assert.equal(state.mode, "active");
});

// ─── Multi-session isolation ──────────────────────────────────────────────────

test("sessions are isolated: session A active does not affect session B", () => {
  _setResearchMode(SESSION_A, { mode: "active", toggledAt: new Date().toISOString() });
  _setResearchMode(SESSION_B, { mode: "inactive", toggledAt: new Date().toISOString() });

  assert.equal(getResearchMode(SESSION_A)?.mode, "active");
  assert.equal(getResearchMode(SESSION_B)?.mode, "inactive");
});

// ─── Toggle logic (simulated via _setResearchMode) ────────────────────────────

test("toggle: inactive → active", () => {
  _setResearchMode(SESSION_A, { mode: "inactive", toggledAt: new Date().toISOString() });
  const before = getResearchMode(SESSION_A)!;
  const newMode = before.mode === "active" ? "inactive" : "active";
  _setResearchMode(SESSION_A, { mode: newMode, toggledAt: new Date().toISOString() });
  assert.equal(getResearchMode(SESSION_A)?.mode, "active");
});

test("toggle: active → inactive", () => {
  _setResearchMode(SESSION_A, { mode: "active", toggledAt: new Date().toISOString() });
  const before = getResearchMode(SESSION_A)!;
  const newMode = before.mode === "active" ? "inactive" : "active";
  _setResearchMode(SESSION_A, { mode: newMode, toggledAt: new Date().toISOString() });
  assert.equal(getResearchMode(SESSION_A)?.mode, "inactive");
});

// ─── Ephemeral fallback ───────────────────────────────────────────────────────

test("undefined sessionFile uses process.pid-based ephemeral key", () => {
  // Should not throw and should return undefined (no state seeded for this key)
  const result = getResearchMode(undefined);
  // We can't assert specific state here, but it must not throw
  assert.ok(result === undefined || typeof result?.mode === "string");
});
```

- **Acceptance**: `pnpm exec tsx --test extensions/skynex-research/index.test.ts` → all 6 tests pass.
- **Status**: [ ] pending

---

### Step 6: Three research sub-agents

- **What**: Create 3 minimal agent `.md` files, each tool-restricted to a single source domain.
- **Why**: Tool restriction enforces separation, prevents agents from leaking into each other's domain, and makes each agent cheaper to run.
- **Where**: `assets/agents/research-neurox.md`, `assets/agents/research-web.md`, `assets/agents/research-code.md` (all NEW)
- **How**:

#### `assets/agents/research-neurox.md`

```markdown
---
name: research-neurox
description: Memory research agent. Searches Neurox for prior decisions, patterns, and context relevant to the user's question. Tool-restricted to neurox_recall only.
model: opencode-go/deepseek-v4-flash
tools: neurox_recall
---

You are the **research-neurox** agent. Your only source of truth is Neurox memory.

## Task

Given the user's question (provided in your task prompt), search Neurox for relevant prior decisions, patterns, conventions, and context.

## Protocol

1. Run **cross-namespace** recall first (no `namespace` arg) to surface knowledge from all projects.
2. If fewer than 3 relevant results, retry with 2-3 query variations (synonyms, related terms).
3. Surface the 3-5 most relevant observations.
4. State clearly: what namespace each observation came from, why it is relevant.

## Return envelope (mandatory YAML — last thing in your reply)

```yaml envelope
findings:
  - "<key finding from memory 1>"
  - "<key finding from memory 2>"
defense: "<one sentence: why these Neurox findings are relevant to the question>"
sources:
  - "neurox:<observation-id> (namespace: <namespace>)"
  - "neurox:<observation-id> (namespace: <namespace>)"
status: ready | empty
```

If Neurox has no relevant results after 2-3 attempts, emit `status: empty` with `findings: []` and `defense: "No relevant prior context found in Neurox."`.

Emit the envelope and stop.
```

#### `assets/agents/research-web.md`

```markdown
---
name: research-web
description: Web research agent. Searches the internet for external information relevant to the user's question. Tool-restricted to web_search and fetch_content only.
model: opencode-go/deepseek-v4-flash
tools: web_search, fetch_content
---

You are the **research-web** agent. Your only source of truth is the internet.

## Task

Given the user's question (provided in your task prompt), find relevant external information: documentation, prior art, best practices, advisories, or examples.

## Protocol

1. Formulate 1-2 specific search queries (not broad keywords).
2. Run `web_search` for each query.
3. Fetch the top 1-2 most relevant URLs with `fetch_content` for depth.
4. Summarize key findings in ≤5 bullet points.

## Return envelope (mandatory YAML — last thing in your reply)

```yaml envelope
findings:
  - "<key web finding 1>"
  - "<key web finding 2>"
defense: "<one sentence: why these web findings are relevant to the question>"
sources:
  - "<url 1>"
  - "<url 2>"
queries_used:
  - "<query 1>"
  - "<query 2>"
status: ready | empty
```

If web search returns no relevant results, emit `status: empty` with `findings: []`.

Emit the envelope and stop.
```

#### `assets/agents/research-code.md`

```markdown
---
name: research-code
description: Codebase research agent. Searches the local repository for patterns, files, and implementations relevant to the user's question. Tool-restricted to read, grep, glob only.
model: opencode-go/deepseek-v4-flash
tools: read, grep, glob
---

You are the **research-code** agent. Your only source of truth is the local codebase.

## Task

Given the user's question (provided in your task prompt), find relevant files, patterns, existing implementations, tests, or conventions in the codebase.

## Protocol

1. Use `glob` to find files that might be relevant (by name pattern or directory).
2. Use `grep` to find specific patterns, function names, or keywords.
3. Read the 1-3 most relevant files (entry points, public APIs, tests).
4. Note conventions, naming patterns, and existing solutions.

## Return envelope (mandatory YAML — last thing in your reply)

```yaml envelope
findings:
  - "<key codebase finding 1>"
  - "<key codebase finding 2>"
defense: "<one sentence: why these code findings are relevant to the question>"
sources:
  - "<file-path>:<line-number or function>"
  - "<file-path>:<line-number or function>"
status: ready | empty
```

If no relevant code found, emit `status: empty` with `findings: []`.

Emit the envelope and stop.
```

- **Acceptance**: All 3 `.md` files exist under `assets/agents/`. Each has a valid YAML frontmatter with `name`, `description`, `model`, and `tools`. `pnpm run verify-package` passes (the script checks for valid frontmatter in all agent files).
- **Status**: [ ] pending

---

### Step 7: Research synthesis skill — `skills/skynex-research/SKILL.md`

- **What**: A skill file that documents the synthesis protocol the main model follows after all 3 agents return. This is referenced in the injected system prompt; it provides the structured contract.
- **Why**: The `before_agent_start` hook tells the model to follow this skill. The skill encodes the synthesis pattern (how to read 3 envelopes, how to resolve contradictions, when to save to Neurox).
- **Where**: `skills/skynex-research/SKILL.md` (NEW)
- **How**:

```markdown
---
name: skynex-research
description: Research mode synthesis protocol. Called by the main model after 3 parallel research agents (neurox, web, code) return their envelopes. Synthesizes a final verdict with source attribution.
---

# skynex-research — Research Mode Synthesis

> Use ONLY when research mode is active and you have received envelopes from
> research-neurox, research-web, and research-code.

## Compact Rules

1. Read ALL 3 envelopes before writing anything — do not synthesize from 1 or 2
2. Cite sources for every claim: `[Neurox: <id>]`, `[Web: <url>]`, `[Code: <path>]`
3. Resolve contradictions explicitly — if Neurox says X and web says Y, surface the conflict
4. Prioritize Neurox findings for project-internal decisions (they are ground truth for THIS repo)
5. Prioritize web findings for external library/API questions
6. Prioritize code findings for "what does the current codebase do?" questions
7. If all 3 sources return empty, say so — do NOT hallucinate findings
8. If any finding is reusable and durable, save to Neurox after synthesis
9. Keep synthesis ≤10 bullet points — no walls of text
10. Surface the `defense` from each agent (not just findings) — it tells the user WHY each source was relevant

## Parallel invocation pattern

```
subagent({
  agentScope: "project",
  confirmProjectAgents: false,
  tasks: [
    {
      agent: "research-neurox",
      task: "Research: <user question verbatim>. Return findings envelope."
    },
    {
      agent: "research-web",
      task: "Research: <user question verbatim>. Return findings envelope."
    },
    {
      agent: "research-code",
      task: "Research: <user question verbatim>. Return findings envelope."
    }
  ]
})
```

The `subagent` tool returns an array of 3 results in submission order. Wait for ALL 3 before synthesizing.

## Synthesis format

```
## Research: <user question (≤80 chars)>

**From memory (Neurox):**
- <finding> [Neurox: <id>]
- <finding> [Neurox: <id>]

**From web:**
- <finding> [Web: <url>]
- <finding> [Web: <url>]

**From codebase:**
- <finding> [Code: <path>]
- <finding> [Code: <path>]

**Verdict:**
<2-3 sentences synthesizing the answer. Resolve contradictions. State confidence level.>

**Saved to Neurox:** yes | no (and why if not saved)
```

## When to save to Neurox

Save if the synthesized finding is:
- A new decision or pattern not previously recorded
- Relevant beyond this session (future sessions would benefit)
- Factual (not a one-off exploration answer)

Do NOT save if:
- All 3 sources were empty
- The answer is already in Neurox (no duplicate saves)
- The finding is ephemeral/debugging only

## Anti-patterns

- ❌ Synthesizing before ALL 3 envelopes are ready
- ❌ Ignoring a source because it returned empty (report it as empty, don't skip)
- ❌ Mixing findings and hallucinations (if you don't know, say you don't know)
- ❌ Skipping source attribution (every claim needs a `[Source: ...]` tag)
- ❌ Calling the 3 agents sequentially instead of in a single parallel `subagent({tasks:[...]})` call
```

- **Acceptance**: File exists. Contains `---` frontmatter with `name: skynex-research`. Contains `## Compact Rules` section with 10 rules. Contains the `subagent({tasks:[...]})` parallel invocation pattern. File ≤ 120 lines.
- **Status**: [ ] pending

---

### Step 8: Register extension in `package.json`

- **What**: Add `"./extensions/skynex-research"` to the `pi.extensions` array in `package.json`.
- **Why**: Pi reads `package.json → pi.extensions` at startup to know which extensions to load. Without this, the extension file exists but Pi never activates it.
- **Where**: `package.json` line 43–52 (MODIFIED)
- **How**:

Edit the `pi.extensions` array from:
```json
"pi": {
  "extensions": [
    "./extensions/triage",
    "./extensions/iron-law",
    "./extensions/skill-registry",
    "./extensions/smart-zone",
    "./extensions/neurox-tool",
    "./extensions/production-gate",
    "./extensions/archive",
    "./extensions/skynex-installer"
  ]
}
```

To:
```json
"pi": {
  "extensions": [
    "./extensions/triage",
    "./extensions/iron-law",
    "./extensions/skill-registry",
    "./extensions/smart-zone",
    "./extensions/neurox-tool",
    "./extensions/production-gate",
    "./extensions/archive",
    "./extensions/skynex-installer",
    "./extensions/skynex-research"
  ]
}
```

Also update `description` field (optional but good hygiene):
```json
"description": "Multi-agent coding harness for Pi — triage + 17 skills + 11 sub-agents + 8 extensions. Full medium/substantial-path workflow with HITL gates, TDD enforcement, adversarial review, and research mode.",
```

- **Acceptance**: `node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.pi.extensions.includes('./extensions/skynex-research'))"` prints `true`. `pnpm typecheck` still passes.
- **Status**: [ ] pending

---

### Step 9: Full test suite verification

- **What**: Run the full test suite and typecheck to confirm no regressions.
- **Why**: New files must not break existing 307+ tests. Type correctness must be clean.
- **Where**: Repo root
- **How**:

```bash
# 1. Typecheck
pnpm typecheck

# 2. Run all tests (includes new skynex-research tests)
pnpm test

# Expected: existing tests + 9 new dispatcher tests + 6 new index tests = 322+ tests passing
# Zero failures

# 3. Verify package files (checks agent frontmatter)
pnpm run verify-package

# 4. Smoke-check the 3 agent files exist with correct frontmatter
node -e "
  const fs = require('fs');
  ['research-neurox','research-web','research-code'].forEach(name => {
    const content = fs.readFileSync(\`assets/agents/\${name}.md\`, 'utf8');
    console.assert(content.includes('model: opencode-go/deepseek-v4-flash'), \`\${name}: missing model\`);
    console.assert(content.includes('tools:'), \`\${name}: missing tools\`);
    console.log(\`✓ \${name}.md valid\`);
  });
"

# 5. Verify skill file exists
node -e "require('fs').accessSync('skills/skynex-research/SKILL.md'); console.log('✓ skynex-research SKILL.md exists')"
```

- **Acceptance**: `pnpm typecheck` exits 0. `pnpm test` exits 0 with ≥ 322 tests passing. `pnpm run verify-package` exits 0 with 0 warnings (or 1 existing known warning about tdd-discipline).
- **Status**: [ ] pending

---

## Verification

```bash
# Full test + type check
pnpm typecheck && pnpm test

# Individual dispatcher tests
pnpm exec tsx --test extensions/skynex-research/dispatcher.test.ts

# Individual index tests
pnpm exec tsx --test extensions/skynex-research/index.test.ts

# Verify package manifest
pnpm run verify-package

# Check extension is registered
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.pi.extensions)"

# Manual E2E: start Pi, type /skynex:research, confirm notification shows
# Then ask a question and confirm 3 parallel agent calls appear in the tool trace
```

---

## Out of Scope (Modes 2 and 3)

The following are explicitly deferred to future planning sessions:

- **Task-creation mode** (`/skynex:task`): grill-me workflow, Jira integration, task template generation
- **Execution mode** (`/skynex:execute`): TDD enforcement, discover/plan/build/validate pipeline, PR review
- Combining research mode with task-creation (research-first before creating tasks)
- Any UI for browsing research history
- Rate-limiting or cost-capping the 3 parallel agents
- Making research mode a triage path (it's opt-in only, not auto-detected)
- Research agent output persistence beyond Neurox save
- `/skynex:research:history` command

---

## Risks / Notes

1. **`opencode-go/deepseek-v4-flash` model ID** — verify this model ID is valid in the Pi model registry before the coder uses it in agent frontmatter. If invalid, fall back to the same model used by the main session or another cheap model. Check `pi config` or existing agents for the canonical ID format.

2. **`before_agent_start` called on every message** — the injection only adds tokens when `mode === "active"`. When inactive, `buildResearchHint` returns `undefined` and zero overhead is added. This is identical to the triage pattern.

3. **Toggle semantics** — `/skynex:research` is a toggle. If the user types it twice, they deactivate research mode. This is intentional (matches the request: "stays until another mode command is issued"). Future task-creation and execution modes should deactivate research mode when their command is issued; this cross-mode coordination is out of scope for now but the `sessionResearchStore` Map makes it easy to extend.

4. **`verify-package-files.mjs` agent validation** — the pre-publish script checks every `.md` file under `assets/agents/` for valid frontmatter. The 3 new agent files must have `---` delimiters and include `name`, `description`, `model`, `tools` fields or the script will error on `pnpm run verify-package`. Check the exact validation rules in `scripts/verify-package-files.mjs` before finalizing frontmatter.

5. **`pi install` not needed** — since `skynex-research` is a local extension in the same package (not a separate npm package), adding it to `package.json → pi.extensions` is sufficient. No `pi install` step required.

6. **Test count baseline** — currently 307 tests pass. The plan adds 9 dispatcher + 6 index = 15 new tests, bringing the expected total to ≥ 322. Verify the baseline count with `pnpm test` before starting.

---

## Mode 2: Task Creation (/skynex:task)

### Goal

Add a `/skynex:task [PROJ-KEY]` slash command that activates a sticky **task-creation mode** for the session. When active, the main model follows a sequential 4-step flow — grill → decompose → HITL gate → Jira creation — driven by the `skills/skynex-task/SKILL.md` skill injected via `before_agent_start`. No sub-agents are used; the main model executes the full flow, calling Atlassian MCP tools directly to create Jira issues.

This is Mode 2 of 3. Execution mode is explicitly out of scope.

---

### Business Context

- **User**: Engineers who want well-decomposed Jira tasks before starting implementation.
- **Activation**: `/skynex:task` (asks for project key) or `/skynex:task PROJ` (project key parsed from args).
- **State**: sticky per session — once active the mode persists until toggled off or session ends.
- **Flow order is strict**: grill → decompose → HITL gate → Jira. No step is skipped.
- **HITL gate**: user must explicitly approve the draft before any Jira issues are created.
- **Cancel = no side effects**: if the user cancels at the gate, nothing is written to Jira.
- **Language**: prompts and notifications are in Spanish (¿En qué proyecto de Jira?, ¿Aprobás este desglose?, etc.) to match the user's language preference established in this repo.

---

### Technical Context

#### Patterns inherited from research mode (mirror exactly)

| Pattern | Source file | How we reuse it |
|---|---|---|
| `Map<sessionId, State>` store | `extensions/skynex-research/index.ts:22` | `sessionTaskStore` tracks mode + projectKey + draft per session |
| `before_agent_start` injection | `extensions/skynex-research/index.ts:36-49` | Injects task-mode hint when mode is `"active"` |
| `session_start` initialization | `extensions/skynex-research/index.ts:26-33` | Initialize state as inactive at session start |
| `session_shutdown` cleanup | `extensions/skynex-research/index.ts:52-56` | Delete session entry on shutdown |
| `pi.registerCommand(name, {handler})` | `extensions/skynex-research/index.ts:67` | `/skynex:task` and `/skynex:task:status` commands |
| `getResearchMode` + `_setResearchMode` exports | `extensions/skynex-research/index.ts:118-135` | `getTaskMode` + `_setTaskMode` exported for tests |
| Pure dispatcher functions | `extensions/skynex-research/dispatcher.ts` | `buildTaskHint()` + `formatTaskNotification()` |
| `node:test` unit test pattern | `extensions/skynex-research/dispatcher.test.ts` | Same import style, same assert/strict pattern |

#### New state shape (extends research pattern with project key and draft)

```typescript
// TaskCreationState adds projectKey + draft on top of research's mode/toggledAt
export interface TaskCreationState {
  mode: "active" | "inactive";
  toggledAt: string;
  projectKey: string | null;   // set on activation; null until known
  draft: TaskDraft | null;     // null until decompose phase completes
}
```

#### Command argument parsing

`/skynex:task PROJ-KEY` — the handler receives `_args` as a string. Parse the first whitespace-separated token as the project key:

```typescript
const parts = (_args ?? "").trim().split(/\s+/);
const projectKeyFromArgs = parts[0]?.toUpperCase() || null;
```

#### Skill injection vs. agent delegation

The skill (`skills/skynex-task/SKILL.md`) is injected via `before_agent_start` into the main model's system prompt. The main model IS the executor of the flow — it grills the user, decomposes, shows the gate, and calls Atlassian MCP tools directly. No sub-agents are spawned.

#### Jira MCP tools (available in-session via neurox-tool/MCP adapter)

- `mcp_Atlassian_getVisibleJiraProjects` — verify project key exists; get project info
- `mcp_Atlassian_getJiraProjectIssueTypesMetadata` — get valid issue type names for the project
- `mcp_Atlassian_createJiraIssue` — create parent task then subtasks

#### package.json — extension already registered?

Research mode is the 9th entry: `"./extensions/skynex-research"`. Task mode will be added as the 10th entry: `"./extensions/skynex-task"`.

**Current `pi.extensions` array** (verified from `package.json`):
```json
[
  "./extensions/triage",
  "./extensions/iron-law",
  "./extensions/skill-registry",
  "./extensions/smart-zone",
  "./extensions/neurox-tool",
  "./extensions/production-gate",
  "./extensions/archive",
  "./extensions/skynex-installer",
  "./extensions/skynex-research"
]
```

#### Test baseline

`pnpm test` currently passes **356 tests**. This plan adds 10 dispatcher tests + 7 index tests = **17 new tests**, bringing the expected total to ≥ **373**.

---

### Implementation Steps

#### Step M2-1: Types — `extensions/skynex-task/types.ts`

- **What**: Define `TaskCreationMode`, `TaskCreationState`, `SubTask`, and `TaskDraft` types.
- **Why**: Shared contract between `index.ts`, `dispatcher.ts`, and tests. Must be a pure module with no `@earendil-works` imports (mirrors `extensions/skynex-research/types.ts`).
- **Where**: `extensions/skynex-task/types.ts` (NEW)
- **How**:

```typescript
// extensions/skynex-task/types.ts

/**
 * Whether task-creation mode is active for this session.
 */
export type TaskCreationMode = "active" | "inactive";

/**
 * Estimated complexity of a task or subtask.
 */
export type Complexity = "S" | "M" | "L";

/**
 * A single subtask in the decomposed draft.
 */
export interface SubTask {
  /** Short imperative title (e.g. "Add UserService.findByEmail"). */
  title: string;
  /** 2-3 sentence description of what this subtask covers. */
  description: string;
  /** Observable acceptance criteria (1 per bullet). */
  acceptance_criteria: string[];
  /** Estimated implementation complexity. */
  estimated_complexity: Complexity;
}

/**
 * Full draft produced after decompose phase.
 * Contains a parent task + 2-6 subtasks.
 */
export interface TaskDraft {
  /** Jira project key (e.g. "PROJ"). */
  projectKey: string;
  /** Parent task (Story or Task type in Jira). */
  parent: {
    title: string;
    description: string;
    acceptance_criteria: string[];
    estimated_complexity: Complexity;
  };
  /** 2-6 implementation subtasks. */
  subtasks: SubTask[];
}

/**
 * Per-session state stored in the module-level Map.
 * Extends the research mode pattern with projectKey and draft.
 */
export interface TaskCreationState {
  /** Whether task-creation mode is active. */
  mode: TaskCreationMode;
  /** ISO timestamp when mode was last toggled. */
  toggledAt: string;
  /**
   * Jira project key for this session.
   * null = not yet set (user will be asked on first message).
   */
  projectKey: string | null;
  /**
   * Task draft after decompose phase.
   * null = not yet produced (grill phase still in progress or not started).
   */
  draft: TaskDraft | null;
}
```

- **Acceptance**: `pnpm typecheck` passes. No imports from `@earendil-works/pi-coding-agent`. All 4 types exported.
- **Status**: [ ] pending

---

#### Step M2-2: Dispatcher — `extensions/skynex-task/dispatcher.ts`

- **What**: Pure functions: `buildTaskHint(state)` (injects task-mode instructions into system prompt) and `formatTaskNotification(mode, projectKey)` (user-facing notification text).
- **Why**: Separating pure functions from the Pi runtime mirrors the research mode pattern and makes unit testing trivial without a Pi mock.
- **Where**: `extensions/skynex-task/dispatcher.ts` (NEW)
- **How**:

```typescript
// extensions/skynex-task/dispatcher.ts

import type { TaskCreationMode, TaskCreationState } from "./types.js";

/**
 * Builds the system-prompt injection block when task-creation mode is active.
 * Returns undefined when mode is inactive (zero overhead).
 *
 * @param state - Current task creation state (mode + projectKey).
 */
export function buildTaskHint(state: TaskCreationState): string | undefined {
  if (state.mode !== "active") return undefined;

  const projectLine = state.projectKey
    ? `Jira project: **${state.projectKey}** (already confirmed — do NOT ask again).`
    : "Jira project: **not yet set** — your FIRST action must be to ask: \"¿En qué proyecto de Jira?\"";

  return [
    "## TASK CREATION MODE: active",
    `${projectLine}`,
    "",
    "You are in task-creation mode. Follow /skill:skynex-task EXACTLY and in sequence:",
    "",
    "STEP 1 — GRILL: Use /skill:grill-me. Ask ONE question at a time until the feature",
    "is clear (≥3 questions answered, acceptance criteria clear, scope defined).",
    "After each answer, save the decision to Neurox immediately.",
    "",
    "STEP 2 — DECOMPOSE: Produce a structured TaskDraft:",
    "  - 1 parent task (feature summary, Story or Task type)",
    "  - 2-6 subtasks (implementation pieces)",
    "  Each task has: title, description, acceptance_criteria[], estimated_complexity (S/M/L)",
    "",
    "STEP 3 — DRAFT REVIEW (HITL GATE): Show the draft as a formatted table.",
    "Ask: \"¿Aprobás este desglose? Podés editar, agregar o eliminar tasks.\"",
    "  • approve / dale / ok / sí → proceed to Step 4",
    "  • user edits inline → update draft → show again",
    "  • cancel → abort, nothing goes to Jira",
    "",
    "STEP 4 — JIRA CREATION (only after explicit approval):",
    "  1. Call mcp_Atlassian_getVisibleJiraProjects to confirm project exists",
    "  2. Call mcp_Atlassian_getJiraProjectIssueTypesMetadata to get valid issue types",
    "  3. Create parent task with mcp_Atlassian_createJiraIssue (use Story or Task type)",
    "  4. Create each subtask with mcp_Atlassian_createJiraIssue (use Sub-task or Task type,",
    "     with parent field set to the parent issue key returned in step 3)",
    "  5. Return all created Jira issue links to the user",
    "",
    "CRITICAL RULES:",
    "  • Do NOT create any Jira issues before Step 3 approval",
    "  • Do NOT skip grilling — even if the user seems clear, ask at least 3 questions",
    "  • Do NOT bundle multiple grill questions in one message",
    "  • If project key is not set and user provides it in conversation, store it and continue",
  ].join("\n");
}

/**
 * One-line notification shown to the user when mode changes.
 */
export function formatTaskNotification(
  mode: TaskCreationMode,
  projectKey: string | null,
): string {
  if (mode === "active") {
    const proj = projectKey ? ` [${projectKey}]` : "";
    return `📋 TASK CREATION MODE: active${proj} — iniciando flujo grill → desglose → revisión → Jira`;
  }
  return "📋 TASK CREATION MODE: inactive — volviendo a conversación normal";
}
```

- **Acceptance**:
  - `buildTaskHint({ mode: "inactive", ... })` returns `undefined`
  - `buildTaskHint({ mode: "active", projectKey: null, ... })` returns a string containing `"¿En qué proyecto de Jira?"`
  - `buildTaskHint({ mode: "active", projectKey: "PROJ", ... })` returns a string containing `"PROJ"` and `"TASK CREATION MODE: active"` and `"Jira"` and `"mcp_Atlassian_createJiraIssue"`
  - `formatTaskNotification("active", "PROJ")` returns a string containing `"PROJ"`
  - `formatTaskNotification("inactive", null)` returns a string containing `"inactive"` or `"normal"`
- **Status**: [ ] pending

---

#### Step M2-3: Dispatcher tests — `extensions/skynex-task/dispatcher.test.ts`

- **What**: Unit tests for `buildTaskHint` and `formatTaskNotification` (pure, no Pi runtime, no LLM, no MCP).
- **Why**: TDD discipline. Mirrors `extensions/skynex-research/dispatcher.test.ts` pattern exactly.
- **Where**: `extensions/skynex-task/dispatcher.test.ts` (NEW)
- **How**:

```typescript
// extensions/skynex-task/dispatcher.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTaskHint, formatTaskNotification } from "./dispatcher.js";
import type { TaskCreationState } from "./types.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const makeState = (
  mode: TaskCreationState["mode"],
  projectKey: string | null = null,
): TaskCreationState => ({
  mode,
  toggledAt: "2026-01-01T00:00:00.000Z",
  projectKey,
  draft: null,
});

// ── buildTaskHint ─────────────────────────────────────────────────────────────

test("buildTaskHint: returns undefined when inactive", () => {
  assert.equal(buildTaskHint(makeState("inactive")), undefined);
});

test("buildTaskHint: returns string when active", () => {
  const hint = buildTaskHint(makeState("active"));
  assert.ok(typeof hint === "string" && hint.length > 0);
});

test("buildTaskHint: active with no projectKey asks for project", () => {
  const hint = buildTaskHint(makeState("active", null))!;
  assert.ok(hint.includes("¿En qué proyecto de Jira?"));
});

test("buildTaskHint: active with projectKey does not ask for project", () => {
  const hint = buildTaskHint(makeState("active", "MYPROJ"))!;
  assert.ok(!hint.includes("¿En qué proyecto de Jira?"));
  assert.ok(hint.includes("MYPROJ"));
});

test("buildTaskHint: active hint references TASK CREATION MODE header", () => {
  const hint = buildTaskHint(makeState("active"))!;
  assert.ok(hint.includes("## TASK CREATION MODE: active"));
});

test("buildTaskHint: active hint mentions all 4 steps", () => {
  const hint = buildTaskHint(makeState("active"))!;
  assert.ok(hint.includes("GRILL"));
  assert.ok(hint.includes("DECOMPOSE"));
  assert.ok(hint.includes("DRAFT REVIEW"));
  assert.ok(hint.includes("JIRA CREATION"));
});

test("buildTaskHint: active hint mentions mcp_Atlassian_createJiraIssue", () => {
  const hint = buildTaskHint(makeState("active"))!;
  assert.ok(hint.includes("mcp_Atlassian_createJiraIssue"));
});

test("buildTaskHint: active hint includes HITL approval keywords", () => {
  const hint = buildTaskHint(makeState("active"))!;
  assert.ok(hint.includes("dale"));
  assert.ok(hint.includes("cancel"));
});

// ── formatTaskNotification ────────────────────────────────────────────────────

test("formatTaskNotification: active with projectKey includes project key", () => {
  const msg = formatTaskNotification("active", "PROJ");
  assert.ok(msg.includes("PROJ"));
});

test("formatTaskNotification: active without projectKey still returns active string", () => {
  const msg = formatTaskNotification("active", null);
  assert.ok(msg.includes("active"));
});

test("formatTaskNotification: inactive signals return to normal", () => {
  const msg = formatTaskNotification("inactive", null);
  assert.ok(msg.includes("inactive") || msg.includes("normal"));
});

test("formatTaskNotification: both return non-empty strings", () => {
  assert.ok(formatTaskNotification("active", null).length > 0);
  assert.ok(formatTaskNotification("inactive", null).length > 0);
});
```

- **Acceptance**: `pnpm exec tsx --test extensions/skynex-task/dispatcher.test.ts` → all 12 tests pass. Zero Pi mocks or MCP calls.
- **Status**: [ ] pending

---

#### Step M2-4: Extension entry — `extensions/skynex-task/index.ts`

- **What**: Pi extension that registers hooks and commands. State tracked in `sessionTaskStore`. Mirrors `extensions/skynex-research/index.ts` exactly — same hook names, same session-ID derivation, same exports pattern.
- **Why**: Runtime wiring that makes mode sticky, injects the system prompt, and registers `/skynex:task` and `/skynex:task:status`.
- **Where**: `extensions/skynex-task/index.ts` (NEW)
- **How**:

```typescript
// extensions/skynex-task/index.ts

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildTaskHint, formatTaskNotification } from "./dispatcher.js";
import type { TaskCreationState } from "./types.js";

/**
 * Per-session state. Mirrors sessionResearchStore pattern from skynex-research.
 * Key: sessionFile path (or ephemeral-<pid> fallback).
 */
const sessionTaskStore = new Map<string, TaskCreationState>();

export default function (pi: ExtensionAPI): void {
  // ── Lifecycle hooks ──────────────────────────────────────────────────────

  pi.on("session_start", (_event, ctx) => {
    const sessionId =
      ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    sessionTaskStore.set(sessionId, {
      mode: "inactive",
      toggledAt: new Date().toISOString(),
      projectKey: null,
      draft: null,
    });
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const sessionId =
      ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    const state = sessionTaskStore.get(sessionId) ?? {
      mode: "inactive" as const,
      toggledAt: new Date().toISOString(),
      projectKey: null,
      draft: null,
    };

    const hint = buildTaskHint(state);
    if (!hint) return undefined;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${hint}`,
    };
  });

  pi.on("session_shutdown", (_event, ctx) => {
    const sessionId =
      ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    sessionTaskStore.delete(sessionId);
  });

  // ── Commands ─────────────────────────────────────────────────────────────

  /**
   * /skynex:task [PROJ-KEY]
   *
   * - Activates task-creation mode (or deactivates if already active).
   * - If PROJ-KEY is provided as an argument, stores it immediately.
   * - If not provided AND mode becomes active, the injected hint will ask the
   *   user for the project key on the next message.
   *
   * Usage:
   *   /skynex:task            → activate, ask for project key
   *   /skynex:task PROJ       → activate with project key pre-set
   *   /skynex:task (again)    → deactivate
   */
  pi.registerCommand("skynex:task", {
    description:
      "Activate (or deactivate) task-creation mode. When active, follows grill → decompose → review → Jira flow. Optionally pass a Jira project key: /skynex:task PROJ",
    handler: async (_args, ctx) => {
      const sessionId =
        ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;

      const current = sessionTaskStore.get(sessionId);
      const newMode = current?.mode === "active" ? "inactive" : "active";

      // Parse optional project key from args (first token, uppercased)
      const parts = (_args ?? "").trim().split(/\s+/);
      const projectKeyFromArgs =
        parts[0] && parts[0].length > 0 ? parts[0].toUpperCase() : null;

      // When deactivating, clear project key and draft
      const newProjectKey =
        newMode === "active"
          ? projectKeyFromArgs ?? current?.projectKey ?? null
          : null;

      sessionTaskStore.set(sessionId, {
        mode: newMode,
        toggledAt: new Date().toISOString(),
        projectKey: newProjectKey,
        draft: null, // reset draft on every toggle
      });

      ctx.ui.notify(formatTaskNotification(newMode, newProjectKey), "info");
    },
  });

  /**
   * /skynex:task:status — show current task-creation mode state.
   */
  pi.registerCommand("skynex:task:status", {
    description: "Show the current task-creation mode state for this session.",
    handler: async (_args, ctx) => {
      const sessionId =
        ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
      const state = sessionTaskStore.get(sessionId);

      if (!state) {
        ctx.ui.notify(
          "No task-creation mode state — send a message first.",
          "warning",
        );
        return;
      }

      ctx.ui.notify(
        [
          `Task mode:   ${state.mode.toUpperCase()}`,
          `Project key: ${state.projectKey ?? "(not set)"}`,
          `Draft:       ${state.draft ? "ready" : "(not yet produced)"}`,
          `Toggled at:  ${state.toggledAt}`,
        ].join("\n"),
        "info",
      );
    },
  });
}

// ── Exported helpers (for tests + future phase extensions) ───────────────────

/**
 * Returns the task-creation mode state for a session.
 * Exported for tests — mirrors getResearchMode pattern.
 */
export function getTaskMode(
  sessionFile: string | undefined,
): TaskCreationState | undefined {
  const sessionId = sessionFile ?? `ephemeral-${process.pid}`;
  return sessionTaskStore.get(sessionId);
}

/**
 * Set mode directly — used in tests to seed state without going through commands.
 * @internal
 */
export function _setTaskMode(
  sessionFile: string | undefined,
  state: TaskCreationState,
): void {
  const sessionId = sessionFile ?? `ephemeral-${process.pid}`;
  sessionTaskStore.set(sessionId, state);
}
```

- **Acceptance**: `pnpm typecheck` passes. Extension exports `default`, `getTaskMode`, `_setTaskMode`. `buildTaskHint` is called with full `TaskCreationState` object (not just mode string — this differs from research mode which passes only `ResearchMode`).
- **Status**: [ ] pending

---

#### Step M2-5: Extension tests — `extensions/skynex-task/index.test.ts`

- **What**: Unit tests for state management, command arg parsing logic, and toggle behavior. No Pi runtime, no LLM, no MCP.
- **Why**: Regression protection for the Map logic, project-key parsing, and state isolation. Mirrors `extensions/skynex-research/index.test.ts`.
- **Where**: `extensions/skynex-task/index.test.ts` (NEW)
- **How**:

```typescript
// extensions/skynex-task/index.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { getTaskMode, _setTaskMode } from "./index.js";
import type { TaskCreationState } from "./types.js";

const SESSION_A = "/tmp/task-session-a.json";
const SESSION_B = "/tmp/task-session-b.json";

const makeState = (
  mode: TaskCreationState["mode"],
  projectKey: string | null = null,
): TaskCreationState => ({
  mode,
  toggledAt: new Date().toISOString(),
  projectKey,
  draft: null,
});

// ── State seeding and retrieval ───────────────────────────────────────────────

test("getTaskMode: returns undefined for unknown session", () => {
  assert.equal(getTaskMode("/tmp/never-seen-task.json"), undefined);
});

test("getTaskMode: returns state after _setTaskMode", () => {
  _setTaskMode(SESSION_A, makeState("active", "MYPROJ"));
  const state = getTaskMode(SESSION_A);
  assert.ok(state !== undefined);
  assert.equal(state.mode, "active");
  assert.equal(state.projectKey, "MYPROJ");
});

// ── Multi-session isolation ───────────────────────────────────────────────────

test("sessions are isolated: session A active does not affect session B", () => {
  _setTaskMode(SESSION_A, makeState("active", "PROJA"));
  _setTaskMode(SESSION_B, makeState("inactive", null));

  assert.equal(getTaskMode(SESSION_A)?.mode, "active");
  assert.equal(getTaskMode(SESSION_A)?.projectKey, "PROJA");
  assert.equal(getTaskMode(SESSION_B)?.mode, "inactive");
  assert.equal(getTaskMode(SESSION_B)?.projectKey, null);
});

// ── Toggle logic (simulated via _setTaskMode) ─────────────────────────────────

test("toggle: inactive → active", () => {
  _setTaskMode(SESSION_A, makeState("inactive"));
  const before = getTaskMode(SESSION_A)!;
  const newMode = before.mode === "active" ? "inactive" : "active";
  _setTaskMode(SESSION_A, { ...before, mode: newMode });
  assert.equal(getTaskMode(SESSION_A)?.mode, "active");
});

test("toggle: active → inactive", () => {
  _setTaskMode(SESSION_A, makeState("active", "PROJ"));
  const before = getTaskMode(SESSION_A)!;
  const newMode = before.mode === "active" ? "inactive" : "active";
  _setTaskMode(SESSION_A, { ...before, mode: newMode, projectKey: null, draft: null });
  assert.equal(getTaskMode(SESSION_A)?.mode, "inactive");
  assert.equal(getTaskMode(SESSION_A)?.projectKey, null);
});

// ── Project key parsing logic (unit-tested via state injection) ───────────────

test("projectKey stored correctly when seeded", () => {
  _setTaskMode(SESSION_A, makeState("active", "SKYNEX"));
  assert.equal(getTaskMode(SESSION_A)?.projectKey, "SKYNEX");
});

test("projectKey is null when not provided", () => {
  _setTaskMode(SESSION_A, makeState("active", null));
  assert.equal(getTaskMode(SESSION_A)?.projectKey, null);
});

// ── Ephemeral fallback ────────────────────────────────────────────────────────

test("undefined sessionFile uses ephemeral key and does not throw", () => {
  const result = getTaskMode(undefined);
  assert.ok(result === undefined || typeof result?.mode === "string");
});
```

- **Acceptance**: `pnpm exec tsx --test extensions/skynex-task/index.test.ts` → all 8 tests pass. Zero Pi mocks or MCP calls.
- **Status**: [ ] pending

---

#### Step M2-6: Skill file — `skills/skynex-task/SKILL.md`

- **What**: The full 4-step flow skill (grill → decompose → gate → Jira creation). Injected via `buildTaskHint` into the main model's system prompt; this file is the authoritative contract that governs behavior.
- **Why**: All mode behavior lives in the SKILL.md — the extension only activates the mode and injects a reference to this skill. Keeping the flow here means it can be iterated without touching TypeScript.
- **Where**: `skills/skynex-task/SKILL.md` (NEW)
- **How**:

Create the file at exactly `skills/skynex-task/SKILL.md`. Full content (≤ 150 lines):

```markdown
---
name: skynex-task
description: Task-creation mode flow. Sequential 4 steps — grill, decompose, HITL gate, Jira creation. Activated by /skynex:task. Main model is the executor; no sub-agents.
---

# skynex-task — Task Creation Flow

> Use ONLY when task-creation mode is active.
> The main model executes ALL steps — no sub-agents, no delegation.

## Compact Rules

1. SEQUENTIAL — never skip or reorder: GRILL → DECOMPOSE → GATE → JIRA
2. ONE grill question at a time — invoke /skill:grill-me discipline exactly
3. Save every grill answer to Neurox immediately (observation_type: decision)
4. Detect grill completion: ≥3 answers + acceptance criteria clear + scope defined
5. Decompose produces exactly 1 parent + 2-6 subtasks; no more, no less
6. Show draft as a formatted table before asking for approval
7. NEVER create Jira issues before explicit gate approval
8. Approval keywords: approve / dale / ok / sí / go — anything else = clarify
9. Cancel = abort immediately, nothing written to Jira, notify user
10. After Jira creation, return all issue links in a summary block

## Step 1 — GRILL

Use `/skill:grill-me` discipline:
- Ask ONE question at a time following the question format in grill-me
- Cover: Purpose → Scope → Constraints → Tradeoffs → Validation
- Stop when ALL true: can describe in 3 sentences, 3-5 acceptance criteria clear, 2-3 risks named, out-of-scope stated
- Save each answer: `neurox_save({ observation_type: "decision", kind: "semantic" })`

Minimum questions before decompose: **3**. Maximum: 10.

## Step 2 — DECOMPOSE

After grill completes, produce a `TaskDraft`:

```
Parent task:
  title: <imperative summary, ≤80 chars>
  description: <2-3 sentences: what + why>
  acceptance_criteria:
    - <observable criterion 1>
    - <observable criterion 2>
  estimated_complexity: S | M | L

Subtasks (2-6):
  - title: <imperative, ≤60 chars>
    description: <1-2 sentences>
    acceptance_criteria:
      - <observable criterion>
    estimated_complexity: S | M | L
```

Rules:
- Parent = feature-level summary (Story or Task in Jira)
- Subtasks = implementation pieces (each independently reviewable)
- Each subtask title must start with an imperative verb (Add, Create, Update, Remove, Fix)
- complexity S = <4h, M = 4h-2d, L = >2d

## Step 3 — DRAFT REVIEW (HITL Gate)

Show the draft as a **formatted table** then ask:

```
| # | Type | Title | Complexity |
|---|------|-------|-----------|
| 0 | Parent | <title> | <S/M/L> |
| 1 | Subtask | <title> | <S/M/L> |
...

¿Aprobás este desglose? Podés editar, agregar o eliminar tasks.
(approve / dale / ok → crear en Jira | edit inline → actualizar | cancel → abortar)
```

Handling responses:
- **approve / dale / ok / sí / go**: proceed to Step 4
- **edit "..."**: apply the edit, re-show the table, ask again
- **cancel / no / stop / abortar**: notify "Cancelado — nada fue enviado a Jira." and stop
- **anything else**: ask "¿Aprobás o querés hacer cambios?" (one clarifying question)

## Step 4 — JIRA CREATION

Only execute after explicit gate approval. In order:

1. **Verify project** — call `mcp_Atlassian_getVisibleJiraProjects` to confirm the project key exists and get its ID
2. **Get issue types** — call `mcp_Atlassian_getJiraProjectIssueTypesMetadata(cloudId, projectKey)` to find valid type names
3. **Create parent** — `mcp_Atlassian_createJiraIssue`:
   ```
   cloudId: <from step 1>
   projectKey: <stored project key>
   issueTypeName: "Story" (prefer) or "Task" if Story not available
   summary: <parent.title>
   description: <parent.description + acceptance_criteria formatted as bullet list>
   ```
4. **Create each subtask** — `mcp_Atlassian_createJiraIssue` for each subtask:
   ```
   cloudId: <from step 1>
   projectKey: <stored project key>
   issueTypeName: "Sub-task" (prefer) or "Task" if Sub-task not available
   summary: <subtask.title>
   description: <subtask.description + acceptance_criteria>
   parent: <parent issue key returned in step 3>
   ```
5. **Return summary**:
   ```
   ✅ Creado en Jira:
   [PROJ-123] Parent: <title> → <url>
   [PROJ-124] Subtask 1: <title> → <url>
   [PROJ-125] Subtask 2: <title> → <url>
   ...
   ```

## Anti-Patterns

- ❌ Creating Jira issues before gate approval
- ❌ Bundling multiple grill questions in one message
- ❌ Skipping grill and going straight to decompose
- ❌ Producing more than 6 subtasks (breaks review UX)
- ❌ Using "Task" as parent when "Story" is available
- ❌ Proceeding on ambiguous approval ("sure", "yeah maybe") — clarify first
```

- **Acceptance**:
  - File exists at `skills/skynex-task/SKILL.md`
  - YAML frontmatter has `name: skynex-task` and `description:`
  - Contains `## Compact Rules` with ≥ 10 rules
  - Contains all 4 step sections (GRILL, DECOMPOSE, DRAFT REVIEW, JIRA CREATION)
  - Mentions `mcp_Atlassian_createJiraIssue`, `mcp_Atlassian_getVisibleJiraProjects`, `mcp_Atlassian_getJiraProjectIssueTypesMetadata`
  - Mentions `approve / dale / ok / sí` approval keywords
  - Mentions `cancel` abort behavior
  - File ≤ 150 lines
  - `pnpm run verify-package` passes (0 new warnings)
- **Status**: [ ] pending

---

#### Step M2-7: Register extension in `package.json`

- **What**: Add `"./extensions/skynex-task"` to the `pi.extensions` array.
- **Why**: Pi reads `package.json → pi.extensions` at startup. Without this entry the extension file is never loaded by the runtime.
- **Where**: `package.json` lines 43–53 (MODIFIED)
- **How**:

Edit the `pi.extensions` array from:
```json
"pi": {
  "extensions": [
    "./extensions/triage",
    "./extensions/iron-law",
    "./extensions/skill-registry",
    "./extensions/smart-zone",
    "./extensions/neurox-tool",
    "./extensions/production-gate",
    "./extensions/archive",
    "./extensions/skynex-installer",
    "./extensions/skynex-research"
  ]
}
```

To:
```json
"pi": {
  "extensions": [
    "./extensions/triage",
    "./extensions/iron-law",
    "./extensions/skill-registry",
    "./extensions/smart-zone",
    "./extensions/neurox-tool",
    "./extensions/production-gate",
    "./extensions/archive",
    "./extensions/skynex-installer",
    "./extensions/skynex-research",
    "./extensions/skynex-task"
  ]
}
```

Also update `description` field:
```json
"description": "Multi-agent coding harness for Pi — triage + 17 skills + 11 sub-agents + 8 extensions. Full medium/substantial-path workflow with HITL gates, TDD enforcement, adversarial review, research mode, and task-creation mode."
```

- **Acceptance**: `node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.pi.extensions.includes('./extensions/skynex-task'))"` prints `true`. `pnpm typecheck` passes.
- **Status**: [ ] pending

---

#### Step M2-8: Full test suite verification

- **What**: Run complete test suite + typecheck to confirm no regressions.
- **Why**: All 356 existing tests must still pass. New tests must all pass. Type correctness must be clean.
- **Where**: Repo root
- **How**:

```bash
# 1. Typecheck — must exit 0
pnpm typecheck

# 2. Run all tests — must exit 0
pnpm test
# Expected: 356 baseline + 12 dispatcher tests + 8 index tests = ≥374 pass, 0 fail

# 3. Verify dispatcher tests individually
pnpm exec tsx --test extensions/skynex-task/dispatcher.test.ts
# Expected: 12 pass

# 4. Verify index tests individually
pnpm exec tsx --test extensions/skynex-task/index.test.ts
# Expected: 8 pass

# 5. Verify package files (skill frontmatter check)
pnpm run verify-package
# Expected: 0 errors, 0 warnings (or 1 existing known warning if tdd-discipline not yet migrated)

# 6. Verify SKILL.md exists and is ≤150 lines
wc -l skills/skynex-task/SKILL.md
# Expected: ≤150

# 7. Verify extension is registered
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.pi.extensions)"
# Expected: array includes "./extensions/skynex-task"
```

- **Acceptance**: `pnpm typecheck` exits 0. `pnpm test` exits 0 with ≥ 374 tests passing, 0 failing. `pnpm run verify-package` exits 0.
- **Status**: [ ] pending

---

### Mode 2 Verification

```bash
# Typecheck + full test suite
pnpm typecheck && pnpm test

# Individual extension tests
pnpm exec tsx --test extensions/skynex-task/dispatcher.test.ts
pnpm exec tsx --test extensions/skynex-task/index.test.ts

# Package validation
pnpm run verify-package

# File existence checks
node -e "
  const fs = require('fs');
  [
    'extensions/skynex-task/types.ts',
    'extensions/skynex-task/dispatcher.ts',
    'extensions/skynex-task/dispatcher.test.ts',
    'extensions/skynex-task/index.ts',
    'extensions/skynex-task/index.test.ts',
    'skills/skynex-task/SKILL.md',
  ].forEach(f => {
    fs.accessSync(f);
    console.log('✓ ' + f);
  });
"

# Manual E2E smoke test:
# 1. Start Pi session
# 2. /skynex:task MYPROJ — verify notification shows [MYPROJ]
# 3. /skynex:task:status — verify mode=ACTIVE, project=MYPROJ
# 4. Type a feature request — verify grill question appears (ONE at a time)
# 5. Answer 3+ questions — verify decompose table appears
# 6. Reply "cancel" — verify "Cancelado" message and no Jira calls
# 7. Repeat steps 4-5 and reply "dale" — verify Jira MCP calls fire in order:
#    getVisibleJiraProjects → getJiraProjectIssueTypesMetadata → createJiraIssue (parent) → createJiraIssue (subtasks)
# 8. /skynex:task — verify mode deactivates
```

---

### Out of Scope (Mode 2)

- Execution mode (`/skynex:execute`) — Mode 3, separate plan
- Cross-mode coordination (e.g. `/skynex:research` deactivating when `/skynex:task` activates)
- Linking created Jira issues to existing epics or sprints
- Pre-filling task templates from existing codebase discovery (no scout agent in this mode)
- `/skynex:task:history` — browsing previously created task sets
- Editing tasks directly in Jira after creation (in-session edit is only at the gate, pre-creation)
- Support for multiple Jira projects in a single task session
- Jira field customization (priority, labels, story points) — these use Atlassian MCP `additional_fields` parameter and are deferred
- Validation that created issues were actually saved in Jira (Jira MCP returns the key on success; no extra GET call needed)

---

### Mode 2 Risks / Notes

1. **`buildTaskHint` receives full `TaskCreationState`** — unlike `buildResearchHint` which receives only `ResearchMode` string, `buildTaskHint` takes the full state so it can branch on `projectKey`. This is intentional and consistent with the richer state shape. The dispatcher test helper `makeState()` must construct a valid `TaskCreationState` object.

2. **Project key argument parsing** — `_args` in Pi command handlers is a raw string (not an array). The first whitespace-separated token is the project key. Uppercase it unconditionally. If the token is empty after trim, fall back to `null`. Do NOT validate the project key format at the TypeScript layer — let the Jira MCP call fail if the key is invalid (better UX than a regex gate).

3. **Sub-task vs. Task issue type** — not all Jira projects support the `"Sub-task"` issue type (some use only `"Task"` with a parent link). The SKILL.md instructs the model to call `getJiraProjectIssueTypesMetadata` first and prefer `"Sub-task"` but fall back to `"Task"`. The parent relationship is set via the `parent` field in `createJiraIssue`.

4. **Grill minimum** — the skill enforces ≥3 questions before decompose. The main model can detect completion earlier if the user provides a very detailed initial description, but must always ask at least 3 questions. This prevents rushing to decompose on vague requests.

5. **HITL gate re-show** — after an inline edit, the draft table is shown again and the user must approve again. This could loop indefinitely if the user keeps editing; the skill has no max-loop guard (acceptable for v1 — cancel always exits).

6. **`pi install` not needed** — skynex-task is a local extension in the same package. Adding it to `package.json → pi.extensions` is sufficient for Pi to load it. No `pi install` step.

7. **Test count** — baseline is **356 tests** (verified May 29 2026). Mode 2 adds 12 dispatcher + 8 index = **20 new tests**, expected total ≥ **376**. (Note: Step M2-8 says ≥374 as a conservative floor; actual count depends on exact test implementations.)

---

## Mode 3: Execution (/skynex:execute)

### Goal

Implement the execution mode extension (`/skynex:execute`) — Mode 3 of 3 for skynex-pi. When active, the mode fetches a Jira task, runs structured TDD-driven development via existing sub-agents and skills, validates output with four parallel reviewers, and opens a PR. Phase tracking in state enables session resume after `/compact` or reconnect.

### Business Context

- **Users**: engineers who want to execute a Jira task end-to-end with enforced TDD, discovery, and validation.
- **Activation**: `/skynex:execute` (prompts for task key) or `/skynex:execute LMS-142` (skips prompt).
- **HITL gates**: one mandatory gate before tests are generated (TDD proposal review); one before PR push (branch-pr gate). All other phases auto-advance.
- **Phase persistence**: the injected hint always includes `phase` so the model knows exactly where it is after `/compact` or session resume.
- **TDD compliance**: Step 5 (tests only) MUST complete — all tests red — before Step 6 (implementation). The iron-law extension enforces this naturally since tests are written first and implementation files don't exist yet.
- **No new sub-agents**: all sub-agents (scout, coder, verifier, test-reviewer, security, skill-validator) already exist in `assets/agents/`. The SKILL.md references them by name.

### Technical Context

- **Mirror target**: `extensions/skynex-task/` — identical pattern: `Map<sessionId, State>`, `before_agent_start` injection, `session_start` seed, `session_shutdown` cleanup, exported `get*Mode` + `_set*Mode` for tests.
- **Key difference from skynex-task**: state has a `phase: ExecutionPhase` field (8 values) + `taskKey: string | null`. `buildExecutionHint` must branch on both `mode` and `phase`.
- **Jira MCP tools used**: `mcp_Atlassian_getJiraIssue` (Step 1) and `mcp_Atlassian_transitionJiraIssue` (Step 8). Both are already in the Atlassian MCP server.
- **Dispatcher**: `buildExecutionHint(state)` returns `undefined` when inactive; returns a multi-section hint when active, with the current phase prominently labeled so the model never misidentifies its position.
- **Skill structure**: `skills/skynex-execute/SKILL.md` ≤ 180 lines, references sub-skills by `/skill:*` name, does NOT duplicate their content.
- **Baseline**: 376 tests (May 29 2026, post–Mode 2). Mode 3 adds ~14 dispatcher + ~9 index = ≥ **23 new tests**, expected total ≥ **399**.
- **package.json**: add `"./extensions/skynex-execute"` as the 11th entry in `pi.extensions`.

---

### Step M3-1: Create `extensions/skynex-execute/types.ts`

- **What**: Define `ExecutionPhase`, `ExecutionMode`, and `ExecutionState` — the complete type surface for the extension.
- **Why**: Types are the contract between dispatcher, index, tests, and the skill. Must be stable before any other file is written.
- **Where**: `extensions/skynex-execute/types.ts` (new file)
- **How**:

  Create the file with exactly this content:

  ```typescript
  /**
   * Type definitions for execution mode.
   * Pure module with no imports from @earendil-works.
   */

  /**
   * Whether execution mode is active for this session.
   */
  export type ExecutionMode = "active" | "inactive";

  /**
   * The current phase within an active execution session.
   * Persisted in state so the model can resume after /compact.
   */
  export type ExecutionPhase =
    | "idle"
    | "discovery"
    | "test-audit"
    | "tdd-proposal"      // HITL gate — model waits for user approval
    | "generating-tests"
    | "implementing"
    | "validating"
    | "pr-review"
    | "complete";

  /**
   * Per-session state stored in the module-level Map.
   * Mirrors TaskCreationState pattern from skynex-task.
   */
  export interface ExecutionState {
    /** Whether execution mode is active. */
    mode: ExecutionMode;
    /**
     * Jira task key being executed (e.g. "LMS-142").
     * null = not yet set (user will be asked on activation).
     */
    taskKey: string | null;
    /** Current execution phase. Enables resume after /compact. */
    phase: ExecutionPhase;
    /** ISO timestamp when mode was last toggled. */
    toggledAt: string;
  }
  ```

- **Acceptance**:
  - `pnpm typecheck` passes with the new file.
  - `ExecutionPhase` has exactly 9 values as listed above.
  - `ExecutionState` has `mode`, `taskKey`, `phase`, `toggledAt` fields — no extras.
- **Status**: [ ] pending

---

### Step M3-2: Create `extensions/skynex-execute/dispatcher.ts`

- **What**: Pure functions `buildExecutionHint` and `formatExecutionNotification` — no Pi imports, fully unit-testable.
- **Why**: Mirrors `dispatcher.ts` in skynex-task. Keeping side-effect-free logic here allows the test suite to verify hint correctness without a Pi runtime.
- **Where**: `extensions/skynex-execute/dispatcher.ts` (new file)
- **How**:

  ```typescript
  /**
   * Dispatcher — pure functions for execution mode injection and notifications.
   */

  import type { ExecutionMode, ExecutionState } from "./types.js";

  /**
   * Builds the system-prompt injection block when execution mode is active.
   * Returns undefined when mode is inactive (zero overhead).
   * Always includes the current phase so the model can resume correctly.
   *
   * @param state - Current execution state.
   */
  export function buildExecutionHint(state: ExecutionState): string | undefined {
    if (state.mode !== "active") return undefined;

    const taskLine = state.taskKey
      ? `Jira task: **${state.taskKey}** (loaded — do NOT ask again).`
      : "Jira task: **not yet set** — your FIRST action must be to ask: \"¿Cuál es la task key? (ej: LMS-142)\"";

    const phaseLabel = `Current phase: **${state.phase}** — resume here after /compact.`;

    const phaseInstructions = buildPhaseInstructions(state.phase);

    return [
      "## EXECUTION MODE: active",
      taskLine,
      phaseLabel,
      "",
      "You are in execution mode. Follow /skill:skynex-execute EXACTLY.",
      "The full 8-step flow is documented in that skill.",
      "Proceed with the CURRENT PHASE only — do not jump ahead.",
      "",
      phaseInstructions,
      "",
      "CRITICAL RULES:",
      "  • Do NOT write implementation code before ALL tests from Step 5 are failing",
      "  • Do NOT skip the TDD proposal gate (Step 4) — wait for explicit user approval",
      "  • Do NOT create the PR (Step 8) before validate (Step 7) returns APPROVED",
      "  • Approval keywords: approve / dale / ok / sí / go / proceed / ejecuta",
      "  • Cancel keywords: cancel / no / stop / para / abortar",
    ].join("\n");
  }

  /**
   * Returns phase-specific instruction block for the current phase.
   * Keeps the main hint readable while still being prescriptive per-phase.
   */
  function buildPhaseInstructions(phase: ExecutionState["phase"]): string {
    switch (phase) {
      case "idle":
        return "Next: STEP 1 — call mcp_Atlassian_getJiraIssue(taskKey) and show task summary to user.";
      case "discovery":
        return "Next: STEP 2 — invoke /skill:discover with the Jira task context. Show scout envelope when done.";
      case "test-audit":
        return "Next: STEP 3 — list existing integration tests and unit tests. Show counts to user.";
      case "tdd-proposal":
        return [
          "Next: STEP 4 (HITL GATE) — propose tests as a table:",
          "  | Test | Type | Criterion covered |",
          "  Ask: \"¿Aprobás estos tests? Podés editar antes de generarlos.\"",
          "  Wait for: approve → Step 5 | edit → update table | cancel → abort",
        ].join("\n");
      case "generating-tests":
        return "Next: STEP 5 — invoke coder sub-agent to write ONLY tests (no implementation). Then verifier must confirm ALL tests FAIL.";
      case "implementing":
        return "Next: STEP 6 — invoke /skill:build. Coder writes implementation to make failing tests pass. Verifier confirms ALL tests pass.";
      case "validating":
        return "Next: STEP 7 — invoke /skill:validate (test-reviewer + security×2 + skill-validator in parallel). Show verdict.";
      case "pr-review":
        return "Next: STEP 8 — invoke /skill:branch-pr. After PR created, call mcp_Atlassian_transitionJiraIssue(taskKey, 'In Review').";
      case "complete":
        return "Execution complete. Task transitioned to In Review. Deactivate mode with /skynex:execute.";
    }
  }

  /**
   * One-line notification shown to the user when mode changes.
   */
  export function formatExecutionNotification(
    mode: ExecutionMode,
    taskKey: string | null,
  ): string {
    if (mode === "active") {
      const task = taskKey ? ` [${taskKey}]` : "";
      return `⚡ EXECUTION MODE: active${task} — iniciando flujo fetch → discover → TDD → build → validate → PR`;
    }
    return "⚡ EXECUTION MODE: inactive — volviendo a conversación normal";
  }
  ```

- **Acceptance**:
  - `buildExecutionHint` returns `undefined` when `mode === "inactive"`.
  - `buildExecutionHint` with `mode === "active"` and `taskKey === null` includes `"¿Cuál es la task key?"`.
  - `buildExecutionHint` with `taskKey === "LMS-142"` includes `"LMS-142"` and does NOT include the question.
  - Each phase value produces a non-empty `phaseInstructions` block.
  - `formatExecutionNotification("active", "LMS-42")` includes `"LMS-42"`.
  - `pnpm typecheck` passes.
- **Status**: [ ] pending

---

### Step M3-3: Create `extensions/skynex-execute/dispatcher.test.ts`

- **What**: Unit tests for all pure dispatcher functions — no Pi runtime mocks needed.
- **Why**: Mirrors `dispatcher.test.ts` in skynex-task. Tests run fast, catch regressions in hint content, and verify all 9 phase-instruction branches.
- **Where**: `extensions/skynex-execute/dispatcher.test.ts` (new file)
- **How**:

  Use `node:test` + `node:assert/strict` (same as all other test files in this repo). Define a `makeState` helper:

  ```typescript
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { buildExecutionHint, formatExecutionNotification } from "./dispatcher.js";
  import type { ExecutionState } from "./types.js";

  const makeState = (
    mode: ExecutionState["mode"],
    phase: ExecutionState["phase"] = "idle",
    taskKey: string | null = null,
  ): ExecutionState => ({
    mode,
    phase,
    taskKey,
    toggledAt: "2026-01-01T00:00:00.000Z",
  });
  ```

  Write these **14 tests** (names are the contract):

  | # | Test name |
  |---|-----------|
  | 1 | `buildExecutionHint: returns undefined when inactive` |
  | 2 | `buildExecutionHint: returns string when active` |
  | 3 | `buildExecutionHint: active with no taskKey asks for task key` |
  | 4 | `buildExecutionHint: active with taskKey does not ask for task key` |
  | 5 | `buildExecutionHint: active hint includes task key in output` |
  | 6 | `buildExecutionHint: active hint includes EXECUTION MODE header` |
  | 7 | `buildExecutionHint: active hint includes current phase` |
  | 8 | `buildExecutionHint: idle phase mentions STEP 1` |
  | 9 | `buildExecutionHint: tdd-proposal phase mentions HITL GATE` |
  | 10 | `buildExecutionHint: generating-tests phase mentions coder and FAIL` |
  | 11 | `buildExecutionHint: complete phase mentions deactivate` |
  | 12 | `buildExecutionHint: hint includes HITL approval keywords` |
  | 13 | `formatExecutionNotification: active with taskKey includes task key` |
  | 14 | `formatExecutionNotification: inactive signals return to normal` |

  Assert exact string includes for content that the model relies on. No process.exit or external I/O.

- **Acceptance**:
  - All 14 tests pass (`pnpm test`).
  - Zero failing tests, zero imports from `@earendil-works/pi-coding-agent`.
- **Status**: [ ] pending

---

### Step M3-4: Create `extensions/skynex-execute/index.ts`

- **What**: Pi extension entry point — registers hooks (`session_start`, `before_agent_start`, `session_shutdown`) and commands (`skynex:execute`, `skynex:execute:status`).
- **Why**: Mirrors `extensions/skynex-task/index.ts` exactly. The hooks ensure state is seeded per-session, the hint is injected into every agent turn when active, and state is cleaned up on shutdown.
- **Where**: `extensions/skynex-execute/index.ts` (new file)
- **How**:

  ```typescript
  /**
   * Execution mode extension.
   * Registers hooks and commands for the /skynex:execute mode.
   */

  import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
  import { buildExecutionHint, formatExecutionNotification } from "./dispatcher.js";
  import type { ExecutionState } from "./types.js";

  /**
   * Per-session state. Mirrors sessionTaskStore pattern from skynex-task.
   * Key: sessionFile path (or ephemeral-<pid> fallback).
   */
  const sessionExecutionStore = new Map<string, ExecutionState>();

  export default function (pi: ExtensionAPI): void {
    // ── Lifecycle hooks ──────────────────────────────────────────────────────

    pi.on("session_start", (_event, ctx) => {
      const sessionId =
        ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
      sessionExecutionStore.set(sessionId, {
        mode: "inactive",
        taskKey: null,
        phase: "idle",
        toggledAt: new Date().toISOString(),
      });
    });

    pi.on("before_agent_start", async (event, ctx) => {
      const sessionId =
        ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
      const state = sessionExecutionStore.get(sessionId) ?? {
        mode: "inactive" as const,
        taskKey: null,
        phase: "idle" as const,
        toggledAt: new Date().toISOString(),
      };

      const hint = buildExecutionHint(state);
      if (!hint) return undefined;

      return {
        systemPrompt: `${event.systemPrompt}\n\n${hint}`,
      };
    });

    pi.on("session_shutdown", (_event, ctx) => {
      const sessionId =
        ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
      sessionExecutionStore.delete(sessionId);
    });

    // ── Commands ─────────────────────────────────────────────────────────────

    /**
     * /skynex:execute [TASK-KEY]
     *
     * - Activates execution mode (or deactivates if already active).
     * - If TASK-KEY is provided as an argument, stores it immediately.
     * - If not provided AND mode becomes active, injected hint will ask user.
     *
     * Usage:
     *   /skynex:execute            → activate, ask for task key
     *   /skynex:execute LMS-142    → activate with task key pre-set
     *   /skynex:execute (again)    → deactivate
     */
    pi.registerCommand("skynex:execute", {
      description:
        "Activate (or deactivate) execution mode. When active, follows fetch → discover → TDD → build → validate → PR flow. Optionally pass a Jira task key: /skynex:execute LMS-142",
      handler: async (_args, ctx) => {
        const sessionId =
          ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;

        const current = sessionExecutionStore.get(sessionId);
        const newMode = current?.mode === "active" ? "inactive" : "active";

        // Parse optional task key from args (first token, uppercased)
        const parts = (_args ?? "").trim().split(/\s+/);
        const taskKeyFromArgs =
          parts[0] && parts[0].length > 0 ? parts[0].toUpperCase() : null;

        // When deactivating, clear task key and reset phase
        const newTaskKey =
          newMode === "active"
            ? taskKeyFromArgs ?? current?.taskKey ?? null
            : null;

        sessionExecutionStore.set(sessionId, {
          mode: newMode,
          taskKey: newTaskKey,
          phase: "idle", // always reset phase on toggle
          toggledAt: new Date().toISOString(),
        });

        ctx.ui.notify(formatExecutionNotification(newMode, newTaskKey), "info");
      },
    });

    /**
     * /skynex:execute:status — show current execution mode state.
     */
    pi.registerCommand("skynex:execute:status", {
      description: "Show the current execution mode state for this session.",
      handler: async (_args, ctx) => {
        const sessionId =
          ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
        const state = sessionExecutionStore.get(sessionId);

        if (!state) {
          ctx.ui.notify(
            "No execution mode state — send a message first.",
            "warning",
          );
          return;
        }

        ctx.ui.notify(
          [
            `Execution mode: ${state.mode.toUpperCase()}`,
            `Task key:       ${state.taskKey ?? "(not set)"}`,
            `Phase:          ${state.phase}`,
            `Toggled at:     ${state.toggledAt}`,
          ].join("\n"),
          "info",
        );
      },
    });
  }

  // ── Exported helpers (for tests + future phase extensions) ──────────────────

  /**
   * Returns the execution mode state for a session.
   * Exported for tests — mirrors getTaskMode pattern.
   */
  export function getExecutionMode(
    sessionFile: string | undefined,
  ): ExecutionState | undefined {
    const sessionId = sessionFile ?? `ephemeral-${process.pid}`;
    return sessionExecutionStore.get(sessionId);
  }

  /**
   * Set mode directly — used in tests to seed state without going through commands.
   * @internal
   */
  export function _setExecutionMode(
    sessionFile: string | undefined,
    state: ExecutionState,
  ): void {
    const sessionId = sessionFile ?? `ephemeral-${process.pid}`;
    sessionExecutionStore.set(sessionId, state);
  }
  ```

- **Acceptance**:
  - `pnpm typecheck` passes with no new errors.
  - Commands `skynex:execute` and `skynex:execute:status` are registered.
  - `getExecutionMode` and `_setExecutionMode` are exported.
  - `before_agent_start` injects hint only when `mode === "active"`.
- **Status**: [ ] pending

---

### Step M3-5: Create `extensions/skynex-execute/index.test.ts`

- **What**: Unit tests for extension state management — toggle behavior, session isolation, phase handling, ephemeral fallback.
- **Why**: Mirrors `extensions/skynex-task/index.test.ts`. These tests cover the Map-level behavior that dispatcher tests don't reach.
- **Where**: `extensions/skynex-execute/index.test.ts` (new file)
- **How**:

  ```typescript
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { getExecutionMode, _setExecutionMode } from "./index.js";
  import type { ExecutionState } from "./types.js";

  const SESSION_A = "/tmp/exec-session-a.json";
  const SESSION_B = "/tmp/exec-session-b.json";

  const makeState = (
    mode: ExecutionState["mode"],
    phase: ExecutionState["phase"] = "idle",
    taskKey: string | null = null,
  ): ExecutionState => ({
    mode,
    phase,
    taskKey,
    toggledAt: new Date().toISOString(),
  });
  ```

  Write these **9 tests**:

  | # | Test name |
  |---|-----------|
  | 1 | `getExecutionMode: returns undefined for unknown session` |
  | 2 | `getExecutionMode: returns state after _setExecutionMode` |
  | 3 | `sessions are isolated: session A active does not affect session B` |
  | 4 | `toggle: inactive → active` |
  | 5 | `toggle: active → inactive clears taskKey and resets phase` |
  | 6 | `taskKey stored correctly when seeded` |
  | 7 | `phase stored and retrieved correctly for all values` — loop over all 9 `ExecutionPhase` values |
  | 8 | `taskKey is null when not provided` |
  | 9 | `undefined sessionFile uses ephemeral key and does not throw` |

  For test 7, iterate: `["idle", "discovery", "test-audit", "tdd-proposal", "generating-tests", "implementing", "validating", "pr-review", "complete"]` and assert `getExecutionMode(SESSION_A)?.phase === phase` for each.

- **Acceptance**:
  - All 9 tests pass.
  - Zero imports from `@earendil-works/pi-coding-agent`.
  - `pnpm test` shows ≥ 399 total passing (376 baseline + 14 dispatcher + 9 index).
- **Status**: [ ] pending

---

### Step M3-6: Create `skills/skynex-execute/SKILL.md`

- **What**: The SKILL.md that the model reads when execution mode is active. Documents the 8-step flow, HITL gates, phase transitions, and sub-agent delegation — references existing skills by `/skill:*` name instead of duplicating their content.
- **Why**: This is the behavioral contract the main model executes. The hint injected by `buildExecutionHint` tells the model WHERE it is; this skill tells the model WHAT TO DO at each step.
- **Where**: `skills/skynex-execute/SKILL.md` (new file) — matches `skills/skynex-task/SKILL.md` location pattern.
- **How**:

  Write the file. Target ≤ 180 lines. Required structure:

  ```markdown
  ---
  name: skynex-execute
  description: Execution mode flow. Sequential 8 steps — fetch, discover, test-audit, TDD-proposal (HITL), generate-tests, implement, validate, PR. Activated by /skynex:execute. Delegates discovery, build, validate, and PR phases to existing sub-skills.
  ---

  # skynex-execute — Execution Flow

  > Use ONLY when execution mode is active.
  > Each step transitions the phase in state — essential for /compact resume.

  ## Compact Rules

  1. SEQUENTIAL — never skip or reorder the 8 steps
  2. After each step completes, announce the phase transition to the user: "Phase: <name> ✓ → next: <name>"
  3. HITL gate at Step 4 — do NOT proceed to Step 5 without explicit approval
  4. Step 5 MUST produce ALL-FAILING tests before Step 6 starts
  5. If any test PASSES in Step 5, warn user and ask: continue or abort?
  6. /skill:build in Step 6 owns coder + verifier chain — do NOT orchestrate directly
  7. /skill:validate in Step 7 runs 4 agents in parallel — do NOT serialize them
  8. PR transition (Step 8) calls mcp_Atlassian_transitionJiraIssue AFTER PR URL confirmed
  9. Approval keywords: approve / dale / ok / sí / go / proceed / ejecuta
  10. Cancel keywords: cancel / no / stop / para / abortar
  ```

  Then write Step 1 through Step 8 sections. Each section:
  - Has a `### Step N — TITLE (phase: <phase-value>)` header
  - Shows the exact tool call or skill invocation
  - Shows what to display to the user
  - Shows the phase transition announcement

  Key sections to include verbatim:

  **Step 1 — FETCH TASK (phase: idle → discovery)**
  ```
  Call: mcp_Atlassian_getJiraIssue(taskKey)
  Extract: title, description, acceptance_criteria
  Show: "Ejecutando: <taskKey> — <title>"
  Show: acceptance_criteria as bullet list
  Transition: phase → "discovery"
  ```

  **Step 2 — DISCOVERY (phase: discovery → test-audit)**
  ```
  Invoke: /skill:discover
  Pass: Jira task context (title + description + acceptance_criteria)
  Show: scout envelope summary (files found, prior Neurox context)
  If envelope.status !== "ready" → STOP, surface to user
  Transition: phase → "test-audit"
  ```

  **Step 3 — TEST AUDIT (phase: test-audit → tdd-proposal)**
  ```
  Review files from scout envelope (entry_points, related_tests)
  List: integration tests (most important) — count and paths
  List: unit tests — count and paths
  Show: "Tests existentes: X integración, Y unitarios"
  Transition: phase → "tdd-proposal"
  ```

  **Step 4 — TDD PROPOSAL (phase: tdd-proposal) — HITL GATE**
  ```
  For each acceptance_criterion → propose 1-2 test cases
  Present as table:
    | Test description | Type (integration/unit) | Criterion covered |
  Ask: "¿Aprobás estos tests? Podés editar antes de generarlos."
  Wait:
    approve/dale/ok → proceed to Step 5, phase → "generating-tests"
    edit "<note>" → update table, show again (loop)
    cancel → abort, notify "Cancelado — execution mode remains active"
  DO NOT proceed without explicit approval keyword.
  ```

  **Step 5 — GENERATE TESTS / RED PHASE (phase: generating-tests → implementing)**
  ```
  Invoke: /skill:build (coder ONLY writes tests, no implementation)
  Pass coder: "Write ONLY the approved tests. Do not write any implementation."
  After coder: invoke verifier to run tests
  Check: ALL approved tests MUST FAIL
  If all fail → show "Tests generados: X/X fallan ✅" → phase → "implementing"
  If any pass → show "⚠️ Y tests pasan (no deberían)" → ask user: continue or abort?
  ```

  **Step 6 — IMPLEMENT / GREEN PHASE (phase: implementing → validating)**
  ```
  Invoke: /skill:build
  Pass: full context from PLAN/tests — coder writes implementation only
  Verifier confirms all tests pass after each slice
  Goal: 0 failing tests
  Transition: phase → "validating"
  ```

  **Step 7 — VALIDATE (phase: validating → pr-review)**
  ```
  Invoke: /skill:validate
  Input: changed_files from build envelope (union of all coder slices)
  4 agents run in parallel: test-reviewer + security(judge1) + security(judge2) + skill-validator
  Show synthesized verdict
  If APPROVED or APPROVED with warnings → phase → "pr-review"
  If NEEDS_FIX → return to /skill:build with blocker list; reset phase → "implementing"
  If ESCALATED → surface to user for decision; do NOT auto-advance
  ```

  **Step 8 — PR REVIEW (phase: pr-review → complete)**
  ```
  Invoke: /skill:branch-pr
  PR description MUST include:
    - Task key: <taskKey>
    - Acceptance criteria: bullet list from Step 1
    - Test coverage: list of tests added from Step 5
  After PR URL confirmed:
    Call: mcp_Atlassian_transitionJiraIssue(taskKey, "In Review")
  Transition: phase → "complete"
  Show: PR URL + "Task <taskKey> transitioned to In Review ✅"
  ```

  Close with:
  ```markdown
  ## Phase Transition Map

  idle → discovery → test-audit → tdd-proposal → generating-tests → implementing → validating → pr-review → complete

  On /compact or session resume: execution mode hint shows current phase.
  Resume from that phase — do NOT restart from Step 1.
  ```

- **Acceptance**:
  - File exists at `skills/skynex-execute/SKILL.md`.
  - Line count ≤ 180.
  - All 8 steps are documented with phase transitions.
  - HITL gate at Step 4 is explicit with approval/cancel keywords.
  - File references `/skill:discover`, `/skill:build`, `/skill:validate`, `/skill:branch-pr` — does NOT inline their content.
  - `scripts/verify-package-files.mjs` reports 0 warnings for this file (requires frontmatter with `name` and `description`).
- **Status**: [ ] pending

---

### Step M3-7: Register extension in `package.json`

- **What**: Add `"./extensions/skynex-execute"` as the 11th entry in `pi.extensions`.
- **Why**: Without this entry Pi will not load the extension. No `pi install` is needed — local extensions are loaded directly from `pi.extensions`.
- **Where**: `package.json` — `pi.extensions` array
- **How**:

  Current array (10 entries, last entry is `"./extensions/skynex-task"`):
  ```json
  "pi": {
    "extensions": [
      "./extensions/triage",
      "./extensions/iron-law",
      "./extensions/skill-registry",
      "./extensions/smart-zone",
      "./extensions/neurox-tool",
      "./extensions/production-gate",
      "./extensions/archive",
      "./extensions/skynex-installer",
      "./extensions/skynex-research",
      "./extensions/skynex-task"
    ]
  }
  ```

  Add `"./extensions/skynex-execute"` immediately after `"./extensions/skynex-task"`:
  ```json
      "./extensions/skynex-task",
      "./extensions/skynex-execute"
  ```

- **Acceptance**:
  - `package.json` has exactly 11 entries in `pi.extensions`.
  - `pnpm typecheck` still passes.
  - `node -e "require('./package.json').pi.extensions.find(e => e.includes('skynex-execute'))"` outputs the entry.
  - `scripts/verify-package-files.mjs` reports 0 warnings (extension file and skill file are present).
- **Status**: [ ] pending

---

### Mode 3 Verification

```bash
# 1. TypeScript typecheck — must be clean
pnpm typecheck

# 2. Full test suite — must be ≥399 passing, 0 failing
pnpm test

# 3. File existence check
node -e "
  const fs = require('fs');
  [
    'extensions/skynex-execute/types.ts',
    'extensions/skynex-execute/dispatcher.ts',
    'extensions/skynex-execute/dispatcher.test.ts',
    'extensions/skynex-execute/index.ts',
    'extensions/skynex-execute/index.test.ts',
    'skills/skynex-execute/SKILL.md',
  ].forEach(f => {
    fs.accessSync(f);
    console.log('✓ ' + f);
  });
"

# 4. Extension registered in package.json
node -e "
  const d = require('./package.json');
  const entry = d.pi.extensions.find(e => e.includes('skynex-execute'));
  console.assert(entry, 'MISSING skynex-execute in pi.extensions');
  console.log('✓ pi.extensions entry:', entry);
  console.assert(d.pi.extensions.length === 11, 'Expected 11 extensions, got ' + d.pi.extensions.length);
  console.log('✓ extension count:', d.pi.extensions.length);
"

# 5. SKILL.md line count (must be ≤180)
wc -l skills/skynex-execute/SKILL.md

# 6. Package publish validation (0 warnings)
node scripts/verify-package-files.mjs

# 7. Manual E2E smoke test:
# a. Start Pi session
# b. /skynex:execute LMS-999 — verify notification shows [LMS-999]
# c. /skynex:execute:status — verify mode=ACTIVE, task=LMS-999, phase=idle
# d. Type a message — verify EXECUTION MODE header appears in system context
# e. Verify hint includes "STEP 1" instructions (idle phase)
# f. /skynex:execute (again) — verify mode deactivates and phase resets
```

---

### Out of Scope (Mode 3)

- Cross-mode coordination (e.g. auto-deactivating research or task mode when execute activates)
- Phase advancement from within the extension (phase is updated by the model via skill instructions, not by TypeScript hooks)
- Persisting phase to disk (in-memory Map is sufficient; reconnect starts fresh — this is acceptable for v1 since `/compact` within the same session is handled by the hint injection)
- Jira status field lookup before transition (the skill passes `"In Review"` as a string; if the Jira project uses a different transition name, the MCP call fails gracefully with an error message)
- Parallel execution of multiple task keys in one session
- `/skynex:execute:phase <phase>` command for manual phase override (useful debug tool — deferred to v1.1)
- Resume-from-phase on session reconnect (the model is told the phase in the hint, but it must still re-read context; full persistence across process restarts is out of scope)

---

### Mode 3 Risks / Notes

1. **`buildExecutionHint` takes full `ExecutionState`** — same pattern as `buildTaskHint` (not `buildResearchHint`). The hint branches on both `mode` and `phase`. The dispatcher test helper `makeState` must accept a `phase` argument (unlike skynex-task which has no phase).

2. **Phase is set by the model, not by TypeScript** — the Pi extension does not know when the model advances from `test-audit` to `tdd-proposal`. This is intentional: the hint informs the model of the current phase on each turn; the model then invokes the next step per the SKILL.md contract. If needed in a future sprint, a `/skynex:execute:advance` command can allow manual phase progression.

3. **Step 5 all-fail assertion** — the skill instructs the model to warn if any test passes unexpectedly in the red phase. This is a behavioral check via verifier, not a TypeScript enforcement. The iron-law extension ensures tests are written BEFORE implementation (it blocks writes to implementation files when no test file is present), which naturally produces the all-fail state.

4. **Task key argument parsing** — identical to project key parsing in skynex-task: `_args` is a raw string, first whitespace-separated token is the key, uppercased unconditionally. No format validation at the TS layer — let Jira MCP fail for invalid keys.

5. **Jira transition string** — `mcp_Atlassian_transitionJiraIssue` is called with the transition NAME string `"In Review"`. If the user's Jira project has a different column name, this call will fail. The SKILL.md documents this as a known limitation. A future improvement would call `mcp_Atlassian_getTransitionsForJiraIssue` first and match by name.

6. **Test count** — baseline is **376 tests** (post–Mode 2, verified May 29 2026). Mode 3 adds 14 dispatcher + 9 index = **23 new tests**, expected total ≥ **399**. The `phase` coverage test in index.test.ts iterates all 9 `ExecutionPhase` values as sub-assertions within a single `test()` call; this counts as 1 test in the runner totals.

7. **SKILL.md line budget** — target is ≤ 180 lines. Given the 8-step flow, this requires disciplined brevity: each step gets 5-7 lines max. Reference `/skill:*` names rather than inlining their content. The phase-transition map at the end takes ~5 lines.
