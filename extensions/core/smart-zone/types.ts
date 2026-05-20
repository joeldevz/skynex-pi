/**
 * Smart Zone — token budget enforcement for the LLM context window.
 *
 * Philosophy (inherited from skynex):
 *   The "smart zone" of an LLM is the first ~80-100K tokens. Beyond that,
 *   attention degrades quadratically (validated by Chroma research 2025).
 *   The actual context window (200K, 1M) is mostly "dumb zone" — useful for
 *   retrieval, harmful for coding.
 *
 * Strategy:
 *   - Warn at 80K (user has time to plan a compact or break out a fresh slice)
 *   - Hard cap at 100K (auto-trigger compaction)
 *   - Threshold is in ABSOLUTE TOKENS, not percent of context window.
 *     A 200K window does NOT mean we can use 160K — the smart zone is 100K
 *     regardless of the model's nominal capacity.
 */

export interface SmartZoneConfig {
  /** Token count at which to warn the user. Default 80_000. */
  warning_threshold: number;
  /** Token count at which to auto-trigger compaction. Default 100_000. */
  hard_cap: number;
  /**
   * Custom instructions passed to ctx.compact() when the hard cap fires.
   * Default emphasizes preserving recent decisions and current plan.
   */
  compact_instructions: string;
  /**
   * If true, status bar shows live token bar. Default true.
   */
  show_status_bar: boolean;
  /**
   * Increment in tokens between repeated warnings.
   * Once warned at 80K, no new warning until tokens >= 80K + this.
   * Default 5_000. Prevents notification spam every turn.
   */
  warning_step: number;
}

export const DEFAULT_SMART_ZONE_CONFIG: SmartZoneConfig = {
  warning_threshold: 80_000,
  hard_cap: 100_000,
  compact_instructions:
    "Summarize the conversation, focusing on: " +
    "(1) decisions made and their rationale; " +
    "(2) the current plan / open work; " +
    "(3) files modified and their purpose; " +
    "(4) any open questions or risks. " +
    "Drop verbose tool outputs, exploratory grep/find, and resolved sub-conversations.",
  show_status_bar: true,
  warning_step: 5_000,
};

export type ZoneAction = "ok" | "warn" | "compact";

export interface ZoneDecision {
  action: ZoneAction;
  tokens: number;
  threshold_crossed?: number; // the warning threshold tokens crossed (if action !== ok)
  percent_of_cap: number; // percentage of hard_cap, not context window
}
