/**
 * Triage extension — routes user requests to small/medium/substantial path.
 *
 * Hook: `before_agent_start`
 * Side effects:
 *   - Notifies user with a one-line summary of the routing decision
 *   - Stores result in session state for downstream extensions to read
 *
 * Reads optional config from `.skynex/triage.json`. Falls back to defaults if missing.
 *
 * NOTE: This extension does NOT modify the agent loop directly. Phase extensions
 * (discover, plan, etc. in Sprint 2-3) read `session.triage` to decide what to do.
 * Until those exist, this extension only adds an informational notification.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { triage } from "./rules.js";
import {
  DEFAULT_TRIAGE_CONFIG,
  type TriageConfig,
  type TriageResult,
} from "./types.js";

const CONFIG_PATH = ".skynex/triage.json";
const STATE_KEY = "skynex.triage";

function loadConfig(cwd: string): TriageConfig {
  const full = path.join(cwd, CONFIG_PATH);
  if (!fs.existsSync(full)) return DEFAULT_TRIAGE_CONFIG;
  try {
    const raw = fs.readFileSync(full, "utf-8");
    const parsed = JSON.parse(raw) as Partial<TriageConfig>;
    return { ...DEFAULT_TRIAGE_CONFIG, ...parsed };
  } catch (err) {
    console.warn(`[skynex-triage] Failed to load ${CONFIG_PATH}, using defaults:`, err);
    return DEFAULT_TRIAGE_CONFIG;
  }
}

/**
 * Build the system-prompt addendum that reminds the model which workflow path
 * to follow. Without this, models tend to skip the discover→plan phases for
 * mid-sized tasks (observed empirically in real sessions). The hint is
 * idempotent — re-running triage just replaces the appended block.
 */
export function buildWorkflowHint(result: TriageResult): string | undefined {
  if (result.path === "gate_response") {
    // Don't inject any workflow hint — the user is responding to an active gate
    return undefined;
  }

  if (result.path === "conversational") {
    return [
      "## TRIAGE: conversational",
      "Respond briefly. Do NOT call neurox_* tools. Do NOT invoke any /skill:* phase.",
    ].join("\n");
  }

  if (result.path === "small") {
    return [
      "## TRIAGE: small",
      "Handle this directly. TDD is enforced by the iron-law hook if you write to production code.",
      "Do NOT invoke /skill:discover or any phase skill — small tasks bypass the workflow.",
    ].join("\n");
  }

  if (result.path === "medium") {
    return [
      "## TRIAGE: medium",
      "Follow the medium-path workflow:",
      "  1. Invoke /skill:discover first (scout sub-agent + neurox_recall).",
      "  2. If the scout envelope returns prior decisions or open_questions → continue to /skill:plan.",
      "  3. Otherwise (no relevant context AND ≤2 files AND no risk keywords) → you MAY skip to direct TDD build.",
      "  4. If you proceeded to plan → continue /skill:build → /skill:validate.",
      "Do NOT skip /skill:discover without seeing the scout envelope first.",
      "",
      "Track each phase with the `todo` tool (call directly, not via sub-agent):",
      "  Before /skill:discover: todo({action:'create', subject:'discover', activeForm:'Exploring codebase'})",
      "  Before /skill:plan:     todo({action:'create', subject:'plan', activeForm:'Producing PLAN.md'})",
      "  Before /skill:build:    todo({action:'create', subject:'build', activeForm:'Implementing slices'})",
      "  Before /skill:validate: todo({action:'create', subject:'validate', activeForm:'Reviewing quality'})",
      "  After each skill returns ready/approved: todo({action:'update', id:<N>, status:'completed'})",
      "  Use blockedBy to link dependent phases: plan blockedBy discover, build blockedBy plan.",
    ].join("\n");
  }

  // substantial
  const hitlMode = process.env.SKYNEX_HITL ?? "single";
  const gateDescription =
    hitlMode === "strict"
      ? "HITL gates at steps 2, 3, 4 (SKYNEX_HITL=strict mode)"
      : hitlMode === "none"
        ? "NO HITL gates (SKYNEX_HITL=none — escape hatch, use with caution)"
        : "SINGLE HITL gate at step 4 only (SKYNEX_HITL=single, default)";

  return [
    `## TRIAGE: substantial (${gateDescription})`,
    "Risk keyword detected OR cross-module / ambiguous task. Required steps:",
    "  1. /skill:discover  → scout exploration (read scout envelope before proceeding)",
    "  2. /skill:propose   → product-planner writes 1-page proposal.md → auto-continue (or gate if SKYNEX_HITL=strict)",
    "  3. /skill:specify   → product-planner + architect IN PARALLEL → SPEC.md → auto-continue (or gate if SKYNEX_HITL=strict)",
    "  4. /skill:plan      → tech-planner reads SPEC.md → PLAN.md → 🚦 UNIFIED GATE (always, unless SKYNEX_HITL=none)",
    "  5. /skill:build     → coder + verifier per slice (chain or parallel for disjoint slices)",
    "  6. /skill:validate  → test-reviewer + security ×2 + skill-validator (parallel)",
    "",
    "Track each phase with the `todo` tool (call directly, not via sub-agent):",
    "  Create todos for all 6 phases at session start with blockedBy chain:",
    "    todo({action:'create', subject:'discover'})           → id 1",
    "    todo({action:'create', subject:'propose', blockedBy:[1]})  → id 2",
    "    todo({action:'create', subject:'specify', blockedBy:[2]})  → id 3",
    "    todo({action:'create', subject:'plan', blockedBy:[3]})     → id 4",
    "    todo({action:'create', subject:'build', blockedBy:[4]})    → id 5",
    "    todo({action:'create', subject:'validate', blockedBy:[5]}) → id 6",
    "  Mark in_progress BEFORE invoking each skill.",
    "  Mark completed IMMEDIATELY after the skill returns a ready/approved envelope.",
    "  NEVER call todo from inside a sub-agent — todos only persist in the main session.",
    "",
    "HITL gate behavior (env var SKYNEX_HITL):",
    "  • default/'single' → ONE gate at /skill:plan after PLAN.md is written",
    "  • 'strict'         → THREE gates: after proposal, after SPEC, after PLAN",
    "  • 'none'           → NO gates, full auto execution (escape hatch)",
    "",
    "When stopping at a gate, accept natural-language responses:",
    "  • approve | dale | ok | sí | go | proceed → continue to next phase",
    "  • edit \"<note>\"                          → re-invoke planner with the note",
    "  • cancel | no | stop | abortar             → abort workflow",
    "  • Ambiguous? Ask ONE clarifying question, do not assume.",
    "",
    "After /skill:validate APPROVED, the archive extension auto-runs archivist on session_shutdown.",
    "NEVER write code before /skill:plan gate is passed (or SKYNEX_HITL=none).",
  ].join("\n");
}

function formatNotification(result: TriageResult): string {
  const icons = {
    conversational: "💬",
    small: "▪",
    medium: "◆",
    substantial: "★",
    gate_response: "🚦",
  } as const;
  // Quiet UX for small talk and gate responses: no banner, no TDD line.
  if (result.path === "conversational" || result.path === "gate_response") {
    return `💬 TRIAGE: ${result.path}`;
  }
  const lines = [
    `${icons[result.path]} TRIAGE: ${result.path.toUpperCase()}`,
    `   Reason: ${result.reason}`,
  ];
  if (result.has_risk_keywords) lines.push("   ⚠ Risk keywords detected — extra caution");
  if (result.tdd) lines.push("   ✓ TDD enforced (Iron Law L4 active)");
  if (result.should_load_neurox) lines.push("   🧠 Neurox: consult prior context for this task");
  return lines.join("\n");
}

// In-memory state for the current session (used by phase extensions later).
// Pi does not yet have a first-class "session state" API for extensions, so we
// use a module-level Map keyed by session id. When the session ends, the entry
// is dropped (see session_shutdown handler below).
const sessionTriageStore = new Map<string, TriageResult>();

export default function (pi: ExtensionAPI) {
  // Recompute config per session in case user edits .skynex/triage.json
  let cachedConfig: TriageConfig | undefined;

  pi.on("session_start", async (_event, ctx) => {
    cachedConfig = loadConfig(ctx.cwd);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const config = cachedConfig ?? loadConfig(ctx.cwd);
    cachedConfig = config;

    const result = triage(
      { prompt: event.prompt, cwd: ctx.cwd },
      config,
    );

    // Store result keyed by current session file (best-effort identifier)
    const sessionId =
      ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    sessionTriageStore.set(sessionId, result);

    // Gate responses: preserve current workflow state, don't inject hint or notify
    if (result.path === "gate_response") {
      return undefined;
    }

    // Notify user (only when interactive — silent in print/RPC mode)
    if (ctx.hasUI) {
      ctx.ui.notify(formatNotification(result), "info");
    }

    // Inject a phase-specific workflow hint into the system prompt.
    // This is what makes the model actually follow the discover→plan→build→validate
    // flow instead of jumping straight to coding (which we observed in real sessions).
    const hint = buildWorkflowHint(result);
    if (hint) {
      return {
        systemPrompt: `${event.systemPrompt}\n\n${hint}`,
      };
    }
    return undefined;
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const sessionId =
      ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    sessionTriageStore.delete(sessionId);
  });

  // ── Commands ─────────────────────────────────────────────────────────────

  pi.registerCommand("triage:status", {
    description: "Show the triage result for the most recent request in this session",
    handler: async (_args, ctx) => {
      const sessionId =
        ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
      const result = sessionTriageStore.get(sessionId);

      if (!result) {
        ctx.ui.notify("No triage result yet — send a request first.", "warning");
        return;
      }

      const lines = [
        `Path:                ${result.path.toUpperCase()}`,
        `Reason:              ${result.reason}`,
        `TDD enforced:        ${result.tdd ? "yes" : "no"}`,
        `Estimated files:     ${result.estimated_files}`,
        `Estimated modules:   ${result.estimated_modules}`,
        `Risk keywords:       ${result.has_risk_keywords ? "yes" : "no"}`,
        `Computed at:         ${result.ts}`,
        ``,
        `Signals:`,
        ...result.signals.map((s) => `  • ${s}`),
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("triage:test", {
    description:
      "Run triage against a hypothetical prompt without executing the agent. Usage: /triage:test <prompt>",
    handler: async (args, ctx) => {
      const prompt = (args ?? "").trim();
      if (!prompt) {
        ctx.ui.notify(
          "Usage: /triage:test <prompt>\nExample: /triage:test add pagination to GET /orders",
          "warning",
        );
        return;
      }
      const config = cachedConfig ?? loadConfig(ctx.cwd);
      const result = triage({ prompt, cwd: ctx.cwd }, config);
      const lines = [
        `Hypothetical triage for: "${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}"`,
        ``,
        formatNotification(result),
        ``,
        `Signals:`,
        ...result.signals.map((s) => `  • ${s}`),
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}

// ── Helpers exported for downstream phase extensions (Sprint 2-3) ──────────

/**
 * Returns the triage result computed for the most recent request in this
 * session, or undefined if triage has not run yet.
 *
 * Phase extensions (discover, plan, etc.) should call this at the start of
 * their handler to decide branching behavior.
 */
export function getTriage(sessionFile: string | undefined): TriageResult | undefined {
  const sessionId = sessionFile ?? `ephemeral-${process.pid}`;
  return sessionTriageStore.get(sessionId);
}
