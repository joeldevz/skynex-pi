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
