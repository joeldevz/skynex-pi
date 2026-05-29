/**
 * Type definitions for research mode.
 * Pure module with no imports from @earendil-works.
 */

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
