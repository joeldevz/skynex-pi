/**
 * Research mode extension — activates sticky research mode via /skynex:research command.
 *
 * When active, injects instructions into the system prompt telling the main model to:
 * 1. Dispatch 3 parallel sub-agents (neurox, web, code)
 * 2. Read their envelopes
 * 3. Synthesize a final verdict with source attribution
 * 4. Save durable findings to Neurox
 *
 * Pattern mirrored from triage extension.
 */

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
