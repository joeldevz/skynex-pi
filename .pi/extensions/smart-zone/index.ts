/**
 * Smart Zone extension.
 *
 * Hooks:
 *   turn_end → reads ctx.getContextUsage(), decides ok/warn/compact
 *
 * Side effects:
 *   - Notifies once when crossing each warning step (no spam)
 *   - Triggers ctx.compact() with custom instructions at hard cap
 *   - Updates status bar with live token bar
 *
 * Commands:
 *   /smart-zone:status — show current usage + thresholds
 *   /smart-zone:config — show effective config
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { decideAction, formatStatusLine, formatTokens, formatBar, buildCheckpointContent } from "./calc.js";
import { DEFAULT_SMART_ZONE_CONFIG, type SmartZoneConfig } from "./types.js";
import { getTriage } from "../triage/index.js";

const CONFIG_PATH = ".skynex/smart-zone.json";
const STATUS_KEY = "smart-zone";

function loadConfig(cwd: string): SmartZoneConfig {
  const full = path.join(cwd, CONFIG_PATH);
  if (!fs.existsSync(full)) return DEFAULT_SMART_ZONE_CONFIG;
  try {
    const parsed = JSON.parse(fs.readFileSync(full, "utf-8")) as Partial<SmartZoneConfig>;
    return { ...DEFAULT_SMART_ZONE_CONFIG, ...parsed };
  } catch {
    return DEFAULT_SMART_ZONE_CONFIG;
  }
}

// Per-session state
interface SessionZoneState {
  lastWarnedAt: number;
  compactionInFlight: boolean;
}

const sessionState = new Map<string, SessionZoneState>();

function getState(sessionFile: string | undefined): SessionZoneState {
  const key = sessionFile ?? `ephemeral-${process.pid}`;
  let state = sessionState.get(key);
  if (!state) {
    state = { lastWarnedAt: 0, compactionInFlight: false };
    sessionState.set(key, state);
  }
  return state;
}

export default function (pi: ExtensionAPI) {
  let cachedConfig: SmartZoneConfig | undefined;

  pi.on("session_start", async (_event, ctx) => {
    cachedConfig = loadConfig(ctx.cwd);
    const sid = ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    sessionState.set(sid, { lastWarnedAt: 0, compactionInFlight: false });

    if (ctx.hasUI) {
      ctx.ui.notify(
        `🔋 Smart Zone active — warn at ${formatTokens(cachedConfig.warning_threshold)}, ` +
        `auto-compact at ${formatTokens(cachedConfig.hard_cap)}`,
        "info",
      );
    }
  });

  pi.on("turn_end", async (_event, ctx) => {
    const config = cachedConfig ?? loadConfig(ctx.cwd);
    cachedConfig = config;

    const usage = ctx.getContextUsage();
    if (!usage || usage.tokens === null) return; // unknown (e.g. right after compaction)

    const sid = ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    const state = getState(sid);

    // Update status bar regardless of action
    if (config.show_status_bar) {
      ctx.ui.setStatus(STATUS_KEY, formatStatusLine(usage.tokens, config));
    }

    // Skip decisions while compaction is in flight (would loop)
    if (state.compactionInFlight) return;

    const decision = decideAction(usage.tokens, state.lastWarnedAt, config);

    if (decision.action === "warn") {
      state.lastWarnedAt = decision.threshold_crossed ?? usage.tokens;
      sessionState.set(sid, state);

       if (ctx.hasUI) {
         ctx.ui.notify(
           `⚠️  Smart Zone warning: ${formatTokens(usage.tokens)} tokens ` +
           `(${decision.percent_of_cap}% of ${formatTokens(80_000)} cap)\n` +
           `   Consider /compact soon. Save key decisions to Neurox first. ` +
           `If you're mid-workflow, note your current phase and step — ` +
           `auto-compact at ${formatTokens(config.hard_cap)} will save a checkpoint to .skynex/workflow-checkpoint.md.`,
           "warning",
         );
       }
    } else if (decision.action === "compact") {
      state.compactionInFlight = true;
      sessionState.set(sid, state);

      // Before auto-compact, save a workflow checkpoint
      const sessionFile = ctx.sessionManager.getSessionFile();
      const triage = getTriage(sessionFile);
      const triageClassification = triage?.path;
      const checkpointPath = path.join(ctx.cwd, ".skynex", "workflow-checkpoint.md");
      const checkpoint = buildCheckpointContent(usage.tokens, sessionFile, triageClassification);

      try {
        fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
        fs.writeFileSync(checkpointPath, checkpoint, "utf8");
      } catch {
        // Best-effort — don't block compact if write fails
      }

      if (ctx.hasUI) {
        ctx.ui.notify(
          `🔴 Smart Zone HARD CAP reached: ${formatTokens(usage.tokens)} tokens\n` +
          `   Auto-compacting now. Save your work; the agent may pause briefly.`,
          "error",
        );
      }

      ctx.compact({
        customInstructions: config.compact_instructions,
        onComplete: () => {
          state.compactionInFlight = false;
          state.lastWarnedAt = 0; // reset; we're at fresh context now
          sessionState.set(sid, state);
          if (ctx.hasUI) {
            ctx.ui.notify("✓ Compaction complete. Continuing in the smart zone.", "info");
          }
        },
        onError: (err) => {
          state.compactionInFlight = false;
          sessionState.set(sid, state);
          if (ctx.hasUI) {
            ctx.ui.notify(`✗ Compaction failed: ${err.message}`, "error");
          }
        },
      });
    }
  });

  // ── /smart-zone:status ─────────────────────────────────────────────────────
  pi.registerCommand("smart-zone:status", {
    description: "Show current token usage and Smart Zone thresholds",
    handler: async (_args, ctx) => {
      const config = cachedConfig ?? loadConfig(ctx.cwd);
      const usage = ctx.getContextUsage();

      if (!usage) {
        ctx.ui.notify("Token usage unavailable (no active model or session).", "warning");
        return;
      }

      const tokens = usage.tokens;
      if (tokens === null) {
        ctx.ui.notify("Token usage unknown right now (likely right after compaction).", "info");
        return;
      }

      const pct = Math.round((tokens / config.hard_cap) * 100);
      const bar = formatBar(pct, 20);
      let status = "🟢 OK";
      if (tokens >= config.hard_cap) status = "🔴 AT HARD CAP";
      else if (tokens >= config.warning_threshold) status = "🟡 WARNING";

      const lines = [
        `Smart Zone — ${status}`,
        ``,
        bar,
        ``,
        `Tokens used:       ${formatTokens(tokens)} (${tokens.toLocaleString()})`,
        `Hard cap:          ${formatTokens(config.hard_cap)}`,
        `Warning threshold: ${formatTokens(config.warning_threshold)}`,
        `Context window:    ${formatTokens(usage.contextWindow)} (model's nominal)`,
        ``,
        `Note: Smart Zone limits to ~100K regardless of nominal context window.`,
        `      Beyond that, attention degrades quadratically.`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ── /smart-zone:config ─────────────────────────────────────────────────────
  pi.registerCommand("smart-zone:config", {
    description: "Show effective Smart Zone configuration",
    handler: async (_args, ctx) => {
      const config = cachedConfig ?? loadConfig(ctx.cwd);
      const lines = [
        `Smart Zone Config`,
        ``,
        `warning_threshold: ${config.warning_threshold.toLocaleString()}`,
        `hard_cap:          ${config.hard_cap.toLocaleString()}`,
        `warning_step:      ${config.warning_step.toLocaleString()}`,
        `show_status_bar:   ${config.show_status_bar}`,
        ``,
        `compact_instructions:`,
        `  "${config.compact_instructions.slice(0, 100)}..."`,
        ``,
        `Override via .skynex/smart-zone.json`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const sid = ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    sessionState.delete(sid);
  });
}
