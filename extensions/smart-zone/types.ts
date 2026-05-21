/**
 * Smart Zone — token budget enforcement for the LLM context window.
 *
 * Strategy (v2 — auto-detect):
 *   - Reads the model's actual contextWindow at runtime via ctx.getContextUsage()
 *   - Calculates thresholds as percentages by default:
 *     - warning_percent: 0.55 (e.g., 150K of 272K Opus, 110K of 200K Sonnet)
 *     - hard_cap_percent: 0.75 (e.g., 204K of 272K Opus, 150K of 200K Sonnet)
 *   - Falls back to absolute thresholds if user sets them explicitly
 *
 * Philosophy note:
 *   The original "smart zone" idea was that quality degrades beyond ~80K
 *   regardless of context window. This is true for SOME models but newer
 *   models (Opus 4+) maintain quality much further. Auto-detect respects
 *   the model's actual usable range; absolute mode preserves the strict
 *   smart-zone philosophy if user wants it.
 */

export interface SmartZoneConfig {
  /**
   * If true, calculate thresholds as percentages of the model's contextWindow.
   * Default true. Set to false to use absolute warning_threshold + hard_cap.
   */
  auto_detect: boolean;
  /**
   * When auto_detect=true: percentage of contextWindow at which to warn.
   * Default 0.55 (55%).
   */
  warning_percent: number;
  /**
   * When auto_detect=true: percentage of contextWindow at which to auto-compact.
   * Default 0.75 (75%). Leaves 25% headroom for the next response.
   */
  hard_cap_percent: number;
  /**
   * Absolute warning threshold (used only when auto_detect=false).
   * Default 60_000.
   */
  warning_threshold: number;
  /**
   * Absolute hard cap (used only when auto_detect=false).
   * Default 80_000.
   */
  hard_cap: number;
  /**
   * Custom instructions for ctx.compact() when hard cap fires.
   */
  compact_instructions: string;
  /**
   * If true, status bar shows live token bar. Default true.
   */
  show_status_bar: boolean;
  /**
   * Increment in tokens between repeated warnings.
   * Default 5_000. Prevents notification spam.
   */
  warning_step: number;
}

export const DEFAULT_SMART_ZONE_CONFIG: SmartZoneConfig = {
  auto_detect: true,
  warning_percent: 0.55,
  hard_cap_percent: 0.75,
  warning_threshold: 60_000,
  hard_cap: 80_000,
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
  threshold_crossed?: number;
  percent_of_cap: number;
}

/**
 * Calculate effective thresholds given config + model's contextWindow.
 * If auto_detect=true, returns proportional values; else returns absolute.
 */
export function calculateEffectiveThresholds(
  config: SmartZoneConfig,
  contextWindow: number,
): { warning_threshold: number; hard_cap: number } {
  if (!config.auto_detect) {
    return {
      warning_threshold: config.warning_threshold,
      hard_cap: config.hard_cap,
    };
  }
  return {
    warning_threshold: Math.floor(contextWindow * config.warning_percent),
    hard_cap: Math.floor(contextWindow * config.hard_cap_percent),
  };
}
