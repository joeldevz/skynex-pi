/**
 * Dispatcher — pure functions for task-creation mode injection and notifications.
 */

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
