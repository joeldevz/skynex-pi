/**
 * smart-zone.ts — Token budget watcher with hard cap enforcement
 *
 * Monitors token usage and enforces the 100K hard cap.
 * Warning at 80K (yellow), auto-compact at 100K (red).
 *
 * Replaces: _shared/smart-zone-budget.md (prompt asking model to count tokens).
 * Pi gives us actual token counts. No more "please remember to /compact".
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const WARNING_THRESHOLD = 80_000;  // tokens
const HARD_CAP = 100_000;          // tokens
const CHECK_INTERVAL_MS = 5_000;   // check every 5 seconds

export default function (pi: ExtensionAPI) {
  let warningShown = false;
  let compacting = false;

  pi.on("session_start", async (_event, ctx) => {
    warningShown = false;
    compacting = false;
    ctx.ui.notify(
      `Smart Zone active — warning at ${WARNING_THRESHOLD / 1000}K tokens, auto-compact at ${HARD_CAP / 1000}K`,
      "info"
    );
  });

  // Check tokens after each assistant message
  pi.on("message", async (event, ctx) => {
    if (compacting) return;

    // Get token count from session
    const tokens = ctx.session?.tokens?.total ?? 0;
    if (tokens === 0) return;

    const percent = Math.round((tokens / HARD_CAP) * 100);

    if (tokens >= HARD_CAP) {
      // Hard cap — auto compact
      compacting = true;
      ctx.ui.notify(
        `🔴 HARD CAP REACHED (${tokens.toLocaleString()}/${HARD_CAP.toLocaleString()} tokens)\n` +
        `Auto-compacting now. Save your work if needed.`,
        "error"
      );
      // Trigger compact
      await ctx.runCommand("/compact");
      compacting = false;
      warningShown = false;
    } else if (tokens >= WARNING_THRESHOLD && !warningShown) {
      // Warning threshold
      warningShown = true;
      ctx.ui.notify(
        `⚠️  SMART ZONE WARNING: ${tokens.toLocaleString()} tokens (${percent}%)\n` +
        `Approaching 100K cap. Consider /compact soon.\n` +
        `Save key decisions to Neurox before compacting.`,
        "warn"
      );
    }
  });

  // Manual status command
  pi.registerCommand("zone", {
    description: "Show current token budget status",
    handler: async (_args, ctx) => {
      const tokens = ctx.session?.tokens?.total ?? 0;
      const percent = Math.round((tokens / HARD_CAP) * 100);
      const bar = "█".repeat(Math.round(percent / 5)) + "░".repeat(20 - Math.round(percent / 5));

      let status = "🟢 OK";
      if (tokens >= HARD_CAP) status = "🔴 AT CAP";
      else if (tokens >= WARNING_THRESHOLD) status = "🟡 WARNING";

      ctx.ui.notify(
        `Token Budget ${status}\n` +
        `${bar} ${percent}%\n` +
        `${tokens.toLocaleString()} / ${HARD_CAP.toLocaleString()} tokens\n` +
        `Warning at: ${WARNING_THRESHOLD.toLocaleString()} | Cap at: ${HARD_CAP.toLocaleString()}`,
        "info"
      );
    },
  });
}
