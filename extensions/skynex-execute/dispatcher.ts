/**
 * Dispatcher — pure functions for execution mode injection and notifications.
 */

import type { ExecutionMode, ExecutionPhase, ExecutionState } from "./types.js";

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
function buildPhaseInstructions(phase: ExecutionPhase): string {
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
