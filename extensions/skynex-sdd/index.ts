/**
 * SDD mode extension.
 * Registers hooks and commands for the /skynex:sdd mode.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildSddHint, formatSddNotification } from "./dispatcher.js";
import type { SddState } from "./types.js";
import { getTriage } from "../triage/index.js";

/**
 * Per-session state. Mirrors sessionExecutionStore pattern from skynex-execute.
 * Key: sessionFile path (or ephemeral-<pid> fallback).
 */
const sessionSddStore = new Map<string, SddState>();

export default function (pi: ExtensionAPI): void {
  // ── Lifecycle hooks ──────────────────────────────────────────────────────

  pi.on("session_start", (_event, ctx) => {
    const sessionId =
      ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    sessionSddStore.set(sessionId, {
      mode: "inactive",
      featureSlug: null,
      domain: null,
      phase: "idle",
      toggledAt: new Date().toISOString(),
    });
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const sessionId =
      ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    const state = sessionSddStore.get(sessionId) ?? {
      mode: "inactive" as const,
      featureSlug: null,
      domain: null,
      phase: "idle" as const,
      toggledAt: new Date().toISOString(),
    };

    const hint = buildSddHint(state);
    if (!hint) return undefined;

    // Respect triage: don't activate SDD mode for conversational/small turns
    const triageResult = getTriage(sessionId);
    if (triageResult?.path === "conversational" || triageResult?.path === "small") {
      return undefined;
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${hint}`,
    };
  });

  pi.on("session_shutdown", (_event, ctx) => {
    const sessionId =
      ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    sessionSddStore.delete(sessionId);
  });

  // ── Commands ─────────────────────────────────────────────────────────────

  /**
   * /skynex:sdd [FEATURE-SLUG]
   *
   * - Activates SDD mode (or deactivates if already active).
   * - If FEATURE-SLUG is provided as an argument, stores it immediately.
   * - If not provided AND mode becomes active, injected hint will ask user.
   *
   * Usage:
   *   /skynex:sdd                           → activate, ask for feature slug
   *   /skynex:sdd rebuild-auth-saml-sso    → activate with slug pre-set
   *   /skynex:sdd (again)                  → deactivate
   */
  pi.registerCommand("skynex:sdd", {
    description:
      "Activate (or deactivate) SDD mode. When active, follows discover → propose → specify → plan → build → validate → sync → archive flow. Optionally pass a feature slug: /skynex:sdd rebuild-auth-saml-sso",
    handler: async (_args, ctx) => {
      const sessionId =
        ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;

      const current = sessionSddStore.get(sessionId);
      const newMode = current?.mode === "active" ? "inactive" : "active";

      // Parse optional feature slug from args (first token, keep verbatim)
      const parts = (_args ?? "").trim().split(/\s+/);
      const slugFromArgs =
        parts[0] && parts[0].length > 0 ? parts[0] : null;

      // When deactivating, clear featureSlug and domain, reset phase
      const newSlug =
        newMode === "active"
          ? slugFromArgs ?? current?.featureSlug ?? null
          : null;

      const newDomain =
        newMode === "active"
          ? current?.domain ?? null
          : null;

      sessionSddStore.set(sessionId, {
        mode: newMode,
        featureSlug: newSlug,
        domain: newDomain,
        phase: "idle", // always reset phase on toggle
        toggledAt: new Date().toISOString(),
      });

      ctx.ui.notify(formatSddNotification(newMode, newSlug), "info");
    },
  });

  /**
   * /skynex:sdd:status — show current SDD mode state.
   */
  pi.registerCommand("skynex:sdd:status", {
    description: "Show the current SDD mode state for this session.",
    handler: async (_args, ctx) => {
      const sessionId =
        ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
      const state = sessionSddStore.get(sessionId);

      if (!state) {
        ctx.ui.notify(
          "No SDD mode state — send a message first.",
          "warning",
        );
        return;
      }

      ctx.ui.notify(
        [
          `SDD mode:      ${state.mode.toUpperCase()}`,
          `Feature slug:  ${state.featureSlug ?? "(not set)"}`,
          `Domain:        ${state.domain ?? "(not resolved)"}`,
          `Phase:         ${state.phase}`,
          `Toggled at:    ${state.toggledAt}`,
        ].join("\n"),
        "info",
      );
    },
  });
}

// ── Exported helpers (for tests + future phase extensions) ──────────────────

/**
 * Returns the SDD mode state for a session.
 * Exported for tests — mirrors getExecutionMode pattern.
 */
export function getSddMode(
  sessionFile: string | undefined,
): SddState | undefined {
  const sessionId = sessionFile ?? `ephemeral-${process.pid}`;
  return sessionSddStore.get(sessionId);
}

/**
 * Set mode directly — used in tests to seed state without going through commands.
 * @internal
 */
export function _setSddMode(
  sessionFile: string | undefined,
  state: SddState,
): void {
  const sessionId = sessionFile ?? `ephemeral-${process.pid}`;
  sessionSddStore.set(sessionId, state);
}
