/**
 * Production Gate extension — blocks production-affecting commands until
 * the human confirms with a typed phrase.
 *
 * Hooks: tool_call on bash, write, edit.
 *
 * First-run UX: creates .skynex/production-gate.json with strict defaults
 * and auto-adds it to .gitignore.
 *
 * Modes (.mode in config):
 *   strict  — block + require typed confirmation
 *   warn    — show warning, log, allow execution
 *   silent  — log only, no UI interruption
 *   off     — disabled entirely
 *
 * Commands:
 *   /production-gate:status      — show mode + recent audit entries
 *   /production-gate:test "<cmd>" — dry-run: what would the gate do?
 *   /production-gate:add-safe <ctx-or-branch>     — add to safe_contexts
 *   /production-gate:remove-safe <ctx-or-branch>  — remove from safe_contexts
 *   /production-gate:audit [--since=7d]           — query audit log
 *   /production-gate:mode <strict|warn|silent|off> — change mode (logged)
 *   /production-gate:reload-config                — re-read config file
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { detectRisk } from "./detector.js";
import { appendAuditEntry, readAuditEntries } from "./audit.js";
import {
  DEFAULT_GATE_CONFIG,
  type GateConfig,
  type GateMatch,
  type AuditEntry,
  type GateMode,
} from "./types.js";

const CONFIG_PATH = ".skynex/production-gate.json";
const CONFIG_EXAMPLE_PATH = ".skynex/production-gate.example.json";

function loadConfig(cwd: string): GateConfig {
  const full = path.join(cwd, CONFIG_PATH);
  if (!fs.existsSync(full)) return DEFAULT_GATE_CONFIG;
  try {
    const parsed = JSON.parse(fs.readFileSync(full, "utf-8")) as Partial<GateConfig>;
    // Deep-merge patterns and safe_contexts so user can override partial config
    return {
      ...DEFAULT_GATE_CONFIG,
      ...parsed,
      patterns: { ...DEFAULT_GATE_CONFIG.patterns, ...(parsed.patterns ?? {}) },
      safe_contexts: { ...DEFAULT_GATE_CONFIG.safe_contexts, ...(parsed.safe_contexts ?? {}) },
      audit_log: { ...DEFAULT_GATE_CONFIG.audit_log, ...(parsed.audit_log ?? {}) },
      confirmation: { ...DEFAULT_GATE_CONFIG.confirmation, ...(parsed.confirmation ?? {}) },
    };
  } catch {
    return DEFAULT_GATE_CONFIG;
  }
}

function saveConfig(cwd: string, config: GateConfig): void {
  const full = path.join(cwd, CONFIG_PATH);
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(full, JSON.stringify(config, null, 2));
}

/**
 * First-run setup: create config + example + auto-gitignore.
 * No-op if config already exists.
 */
function firstRunSetup(cwd: string): boolean {
  const full = path.join(cwd, CONFIG_PATH);
  if (fs.existsSync(full)) return false;

  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Write the (paranoid) real config
  fs.writeFileSync(full, JSON.stringify(DEFAULT_GATE_CONFIG, null, 2));

  // Write a committable example (without sensitive bits)
  const examplePath = path.join(cwd, CONFIG_EXAMPLE_PATH);
  const example = {
    ...DEFAULT_GATE_CONFIG,
    _comment: "Copy to .skynex/production-gate.json and customize. Real file is gitignored.",
    safe_contexts: {
      ...DEFAULT_GATE_CONFIG.safe_contexts,
      kubectl: ["minikube", "kind-local", "docker-desktop"],
      comment: "Add YOUR staging/local contexts here.",
    },
  };
  if (!fs.existsSync(examplePath)) {
    fs.writeFileSync(examplePath, JSON.stringify(example, null, 2));
  }

  // gitignore both the config and audit log
  const gitignorePath = path.join(cwd, ".gitignore");
  const toAdd = [CONFIG_PATH, ".skynex/audit.log"];
  let current = "";
  if (fs.existsSync(gitignorePath)) current = fs.readFileSync(gitignorePath, "utf-8");
  const existing = new Set(current.split(/\r?\n/).map((l) => l.trim()));
  const missing = toAdd.filter((p) => !existing.has(p));
  if (missing.length > 0) {
    const prefix = current && !current.endsWith("\n") ? "\n" : "";
    fs.appendFileSync(gitignorePath, prefix + missing.join("\n") + "\n");
  }
  return true;
}

/**
 * Best-effort: resolve current kubectl context from environment.
 * Returns undefined if kubectl is not available or command fails.
 */
function getKubectlContext(): string | undefined {
  try {
    const out = execFileSync("kubectl", ["config", "current-context"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    });
    return out.toString().trim();
  } catch {
    return undefined;
  }
}

function severityEmoji(s: GateMatch["severity"]): string {
  return { critical: "🔥", high: "🔴", medium: "🟡", low: "🟢" }[s];
}

function renderDialog(cmd: string, match: GateMatch, config: GateConfig): string {
  const lines = [
    `${severityEmoji(match.severity)} PRODUCTION GATE — ${match.category.toUpperCase()}`,
    ``,
    `Command:   ${cmd.length > 200 ? cmd.slice(0, 200) + "..." : cmd}`,
    `Risk:      ${match.reason}`,
    `Severity:  ${match.severity}`,
  ];
  if (Object.keys(match.context).length > 0) {
    lines.push(``, `Context:`);
    for (const [k, v] of Object.entries(match.context)) {
      lines.push(`  ${k}: ${v}`);
    }
  }
  lines.push(``);
  lines.push(`This command MUTATES production state.`);
  if (config.confirmation.require_typed) {
    lines.push(`Type "${config.confirmation.typed_phrase}" to proceed.`);
  } else {
    lines.push("Press Y to proceed.");
  }
  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  let cachedConfig: GateConfig = DEFAULT_GATE_CONFIG;
  let cachedCwd: string | undefined;

  pi.on("session_start", async (_event, ctx) => {
    cachedCwd = ctx.cwd;
    const created = firstRunSetup(ctx.cwd);
    cachedConfig = loadConfig(ctx.cwd);

    if (ctx.hasUI) {
      const lines = [
        `🛡️  Production Gate active (mode: ${cachedConfig.mode})`,
      ];
      if (created) {
        lines.push(
          `   First-run setup completed.`,
          `   Config: ${CONFIG_PATH} (gitignored)`,
          `   Audit:  .skynex/audit.log (gitignored, append-only)`,
          `   Add safe contexts: /production-gate:add-safe <name>`,
        );
      } else if (cachedConfig.mode !== "strict") {
        lines.push(`   ⚠️  Non-strict mode — gate may auto-allow risky commands.`);
      }
      ctx.ui.notify(lines.join("\n"), cachedConfig.mode === "strict" ? "info" : "warning");
    }
  });

  // ── tool_call hook ─────────────────────────────────────────────────────────
  pi.on("tool_call", async (event, ctx) => {
    if (cachedConfig.mode === "off") return undefined;
    if (event.toolName !== "bash") return undefined;
    const cmd = (event.input as { command?: string }).command;
    if (!cmd || typeof cmd !== "string") return undefined;

    // Resolve real kubectl context if not specified in the command itself
    const kctx = cmd.includes("kubectl") && !cmd.includes("--context") ? getKubectlContext() : undefined;

    const match = detectRisk(cmd, cachedConfig, kctx);
    if (!match) return undefined;

    const baseAudit: Omit<AuditEntry, "confirmed" | "response" | "outcome"> = {
      ts: new Date().toISOString(),
      cmd,
      category: match.category,
      subtype: match.subtype,
      severity: match.severity,
      ctx: match.context,
      session: ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`,
      mode: cachedConfig.mode,
    };

    // SILENT mode: just log
    if (cachedConfig.mode === "silent") {
      appendAuditEntry(ctx.cwd, cachedConfig.audit_log, {
        ...baseAudit,
        confirmed: null,
        response: "",
        outcome: "auto-allowed",
      });
      return undefined;
    }

    // WARN mode: log + show warning, allow execution
    if (cachedConfig.mode === "warn") {
      if (ctx.hasUI) {
        ctx.ui.notify(`⚠ ${match.category} (${match.subtype}): ${match.reason}\n  ${cmd.slice(0, 200)}`, "warning");
      }
      appendAuditEntry(ctx.cwd, cachedConfig.audit_log, {
        ...baseAudit,
        confirmed: null,
        response: "",
        outcome: "auto-allowed",
      });
      return undefined;
    }

    // STRICT mode: require confirmation
    if (!ctx.hasUI) {
      // AFK / non-interactive — apply afk_behavior
      const afk = cachedConfig.confirmation.afk_behavior;
      const outcome: AuditEntry["outcome"] = afk === "always_allow" ? "afk-allowed" : "afk-aborted";
      appendAuditEntry(ctx.cwd, cachedConfig.audit_log, {
        ...baseAudit,
        confirmed: afk === "always_allow",
        response: `afk:${afk}`,
        outcome,
      });
      if (afk === "always_allow") return undefined;
      return {
        block: true,
        reason: `Production gate aborted in AFK mode (afk_behavior=${afk})`,
      };
    }

    const dialog = renderDialog(cmd, match, cachedConfig);
    const startedAt = Date.now();
    let confirmed = false;
    let responseText = "";

    if (cachedConfig.confirmation.require_typed) {
      // Use select with the typed phrase and an abort option
      const choices = [cachedConfig.confirmation.typed_phrase, "abort"];
      const choice = await ctx.ui.select(dialog, choices);
      responseText = choice ?? "abort";
      confirmed = responseText === cachedConfig.confirmation.typed_phrase;
    } else {
      const ok = await ctx.ui.confirm("Production Gate", dialog);
      confirmed = ok === true;
      responseText = confirmed ? "yes" : "no";
    }

    const duration_ms = Date.now() - startedAt;
    appendAuditEntry(ctx.cwd, cachedConfig.audit_log, {
      ...baseAudit,
      confirmed,
      response: responseText,
      outcome: confirmed ? "user-allowed" : "user-aborted",
      duration_ms,
    });

    if (!confirmed) {
      return { block: true, reason: `Aborted at production gate (${match.category})` };
    }
    return undefined;
  });

  // ── Commands ───────────────────────────────────────────────────────────────

  pi.registerCommand("production-gate:status", {
    description: "Show production gate mode + last 10 audit entries",
    handler: async (_args, ctx) => {
      const cfg = cachedConfig;
      const recent = readAuditEntries(ctx.cwd, cfg.audit_log, { limit: 10 });
      const lines = [
        `Production Gate Status`,
        ``,
        `Mode:                  ${cfg.mode}`,
        `Audit log:             ${cfg.audit_log.path}`,
        `Typed confirmation:    ${cfg.confirmation.require_typed ? "yes (" + cfg.confirmation.typed_phrase + ")" : "no"}`,
        `AFK behavior:          ${cfg.confirmation.afk_behavior}`,
        `Safe kubectl contexts: ${cfg.safe_contexts.kubectl.join(", ") || "(none — all production)"}`,
        `Safe git branches:     ${cfg.safe_contexts.git_branches.join(", ")}`,
        ``,
        `Last ${recent.total} audit entries:`,
      ];
      for (const e of recent.entries.slice(-10)) {
        if ("mode_change" in e) {
          lines.push(`  ${e.ts}  MODE ${e.mode_change}  (${e.reason})`);
        } else {
          lines.push(`  ${e.ts}  ${e.category}/${e.subtype}  ${e.outcome}`);
        }
      }
      if (recent.total === 0) lines.push("  (no entries yet)");
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("production-gate:test", {
    description: 'Dry-run: show what the gate would do for a hypothetical command. Usage: /production-gate:test "<cmd>"',
    handler: async (args, ctx) => {
      const cmd = (args ?? "").trim().replace(/^["']|["']$/g, "");
      if (!cmd) {
        ctx.ui.notify('Usage: /production-gate:test "<command>"', "warning");
        return;
      }
      const match = detectRisk(cmd, cachedConfig);
      if (!match) {
        ctx.ui.notify(`✅ Would NOT trigger gate: ${cmd}`, "info");
        return;
      }
      ctx.ui.notify(
        `${severityEmoji(match.severity)} Would trigger gate:\n` +
        `  Command:  ${cmd}\n` +
        `  Category: ${match.category} / ${match.subtype}\n` +
        `  Reason:   ${match.reason}\n` +
        `  Severity: ${match.severity}\n` +
        `  Mode:     ${cachedConfig.mode} → ` +
        (cachedConfig.mode === "strict" ? "BLOCK + CONFIRM" :
         cachedConfig.mode === "warn" ? "WARN + ALLOW" :
         cachedConfig.mode === "silent" ? "LOG ONLY" : "OFF"),
        "warning",
      );
    },
  });

  pi.registerCommand("production-gate:add-safe", {
    description: "Add a kubectl context or git branch pattern to safe_contexts. Usage: /production-gate:add-safe <name>",
    handler: async (args, ctx) => {
      const name = (args ?? "").trim();
      if (!name) {
        ctx.ui.notify("Usage: /production-gate:add-safe <context-or-branch-pattern>", "warning");
        return;
      }
      // Heuristic: contains '*' or '/' → git branch pattern, else kubectl context
      const isBranch = name.includes("*") || name.includes("/");
      const list = isBranch ? cachedConfig.safe_contexts.git_branches : cachedConfig.safe_contexts.kubectl;
      if (list.includes(name)) {
        ctx.ui.notify(`"${name}" is already in safe ${isBranch ? "branches" : "kubectl contexts"}.`, "info");
        return;
      }
      list.push(name);
      saveConfig(ctx.cwd, cachedConfig);
      ctx.ui.notify(`✅ Added "${name}" to safe ${isBranch ? "branches" : "kubectl contexts"}.`, "info");
    },
  });

  pi.registerCommand("production-gate:remove-safe", {
    description: "Remove from safe_contexts. Usage: /production-gate:remove-safe <name>",
    handler: async (args, ctx) => {
      const name = (args ?? "").trim();
      if (!name) {
        ctx.ui.notify("Usage: /production-gate:remove-safe <name>", "warning");
        return;
      }
      let removed = false;
      const lists: string[][] = [
        cachedConfig.safe_contexts.kubectl,
        cachedConfig.safe_contexts.git_branches,
      ];
      for (const arr of lists) {
        const idx = arr.indexOf(name);
        if (idx !== -1) {
          arr.splice(idx, 1);
          removed = true;
        }
      }
      if (removed) {
        saveConfig(ctx.cwd, cachedConfig);
        ctx.ui.notify(`✅ Removed "${name}" from safe_contexts.`, "info");
      } else {
        ctx.ui.notify(`"${name}" not found in safe_contexts.`, "warning");
      }
    },
  });

  pi.registerCommand("production-gate:audit", {
    description: "Query the audit log. Usage: /production-gate:audit [--category=X]",
    handler: async (args, ctx) => {
      const argStr = args ?? "";
      const categoryMatch = argStr.match(/--category=(\S+)/);
      const result = readAuditEntries(ctx.cwd, cachedConfig.audit_log, {
        category: categoryMatch ? categoryMatch[1] : undefined,
        limit: 50,
      });
      const lines = [
        `Audit Log (${result.total} entries${categoryMatch ? ` filtered by category=${categoryMatch[1]}` : ""})`,
        ``,
      ];
      for (const e of result.entries.slice(-50)) {
        if ("mode_change" in e) {
          lines.push(`  ${e.ts}  MODE ${e.mode_change}`);
        } else {
          lines.push(`  ${e.ts}  ${e.outcome.padEnd(14)} ${e.category}/${e.subtype}  ${e.cmd.slice(0, 80)}`);
        }
      }
      if (result.total === 0) lines.push("  (no matching entries)");
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("production-gate:mode", {
    description: "Change gate mode. Usage: /production-gate:mode <strict|warn|silent|off>",
    handler: async (args, ctx) => {
      const newMode = (args ?? "").trim() as GateMode;
      if (!["strict", "warn", "silent", "off"].includes(newMode)) {
        ctx.ui.notify("Usage: /production-gate:mode <strict|warn|silent|off>", "warning");
        return;
      }
      const oldMode = cachedConfig.mode;
      if (oldMode === newMode) {
        ctx.ui.notify(`Already in ${newMode} mode.`, "info");
        return;
      }
      cachedConfig.mode = newMode;
      saveConfig(ctx.cwd, cachedConfig);
      appendAuditEntry(ctx.cwd, cachedConfig.audit_log, {
        ts: new Date().toISOString(),
        mode_change: `${oldMode}→${newMode}`,
        reason: "user_command",
        actor: os.userInfo().username,
        session: ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`,
      });
      ctx.ui.notify(
        `Mode changed: ${oldMode} → ${newMode} (logged in audit)`,
        newMode === "off" || newMode === "silent" ? "warning" : "info",
      );
    },
  });

  pi.registerCommand("production-gate:reload-config", {
    description: "Re-read .skynex/production-gate.json",
    handler: async (_args, ctx) => {
      cachedConfig = loadConfig(ctx.cwd);
      ctx.ui.notify(`Config reloaded. Mode: ${cachedConfig.mode}.`, "info");
    },
  });
}
