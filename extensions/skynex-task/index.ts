/**
 * Task-creation mode extension.
 * Registers hooks and commands for the /skynex:task mode.
 */

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
