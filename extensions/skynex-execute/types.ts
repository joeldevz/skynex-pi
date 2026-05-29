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
  | "tdd-proposal" // HITL gate — model waits for user approval
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
