/**
 * Type definitions for task-creation mode.
 * Pure module with no imports from @earendil-works.
 */

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
