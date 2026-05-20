/**
 * Smart Zone pure logic — no Pi runtime, no I/O.
 *
 * Decides what action to take based on current token count, with hysteresis
 * to prevent warning spam (only re-warn after `warning_step` more tokens).
 */

import type { SmartZoneConfig, ZoneDecision } from "./types.js";

/**
 * Decide whether to warn, compact, or do nothing.
 *
 * @param tokens         current token count (from ctx.getContextUsage().tokens)
 * @param lastWarnedAt   highest token count at which we already warned this session
 *                       (pass 0 if never warned)
 * @param config         smart zone config
 */
export function decideAction(
  tokens: number,
  lastWarnedAt: number,
  config: SmartZoneConfig,
): ZoneDecision {
  const percent_of_cap = Math.min(100, Math.round((tokens / config.hard_cap) * 100));

  // Hard cap: always compact (compaction itself resets tokens, so we don't loop)
  if (tokens >= config.hard_cap) {
    return {
      action: "compact",
      tokens,
      threshold_crossed: config.hard_cap,
      percent_of_cap,
    };
  }

  // Warning zone with hysteresis: only re-warn if we crossed another `warning_step`
  if (tokens >= config.warning_threshold) {
    const nextWarn = Math.max(config.warning_threshold, lastWarnedAt + config.warning_step);
    if (tokens >= nextWarn) {
      return {
        action: "warn",
        tokens,
        threshold_crossed: nextWarn,
        percent_of_cap,
      };
    }
  }

  return { action: "ok", tokens, percent_of_cap };
}

/**
 * Render a 20-block progress bar for the given percentage (0-100).
 * Returns: "████████░░░░░░░░░░░░ 40%" (filled + empty + label)
 */
export function formatBar(percent: number, width = 20): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty) + ` ${clamped}%`;
}

/**
 * Human-readable token count: 45000 → "45.0K", 123 → "123", 1234567 → "1.2M".
 */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/**
 * Build a short one-line status string for the footer/status-bar.
 * Example: "tokens 45K/100K ████░░░░░░ 45%"
 */
export function formatStatusLine(tokens: number, config: SmartZoneConfig): string {
  const pct = Math.min(100, Math.round((tokens / config.hard_cap) * 100));
  const bar = formatBar(pct, 10);
  return `tokens ${formatTokens(tokens)}/${formatTokens(config.hard_cap)} ${bar}`;
}

/**
 * Build workflow checkpoint content to preserve state before auto-compact.
 * @param tokenUsage current token count
 * @param sessionFile path to the session file
 * @param triageClassification triage classification (e.g. "medium", "substantial", or undefined)
 * @returns checkpoint markdown content
 */
export function buildCheckpointContent(
  tokenUsage: number,
  sessionFile: string | undefined,
  triageClassification: string | undefined,
): string {
  const classification = triageClassification ?? "unknown";
  return [
    `# Workflow Checkpoint (auto-saved by smart-zone at ${new Date().toISOString()})`,
    ``,
    `## Context`,
    `- Token usage: ${formatTokens(tokenUsage)} / ${formatTokens(100_000)}`,
    `- Session file: ${sessionFile ?? "(ephemeral)"}`,
    ``,
    `## IMPORTANT`,
    `Auto-compact fired. You may have lost conversation context.`,
    `Check these files to recover your workflow state:`,
    `- .skynex/*/PLAN.md — current plan being executed`,
    `- .skynex/*/proposal.md — proposal if in propose phase`,
    `- .skynex/*/SPEC.md — spec if in specify phase`,
    ``,
    `## Recovery steps`,
    `1. Read .skynex/ directory to find the active feature`,
    `2. Read the PLAN.md to find which slice/step you were on`,
    `3. Check git diff to see what files have been modified`,
    `4. Continue from where you left off`,
    ``,
    `## Triage classification: ${classification}`,
  ].join("\n");
}
