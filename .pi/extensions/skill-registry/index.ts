/**
 * Skill Registry extension.
 *
 * Hooks:
 *   session_start → builds (or loads cached) registry, notifies how many skills loaded
 *
 * Commands:
 *   /skills:list      — list all skills with usage info
 *   /skills:refresh   — force rebuild (drops cache)
 *   /skills:audit     — show skills exceeding token budget or with no compact rules
 *   /skills:budget    — show token consumption per skill
 *   /skills:show      — show full entry for one skill
 *
 * Exports (for downstream phase extensions in Sprint 2-3):
 *   getCurrentRegistry()     — get the active registry
 *   getSkillsForAgent(agent) — get per-agent subset
 *   buildPromptInjection()   — format for sub-agent prompt
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  buildRegistry,
  loadCache,
  saveCache,
  isCacheValid,
  getSkillsForAgent as _getSkillsForAgent,
  buildPromptInjection as _buildPromptInjection,
} from "./registry.js";
import {
  DEFAULT_REGISTRY_CONFIG,
  type RegistryConfig,
  type SkillRegistry,
} from "./types.js";

const CONFIG_PATH = ".skynex/skill-registry-config.json";

function loadConfig(cwd: string): RegistryConfig {
  const full = path.join(cwd, CONFIG_PATH);
  if (!fs.existsSync(full)) return DEFAULT_REGISTRY_CONFIG;
  try {
    const parsed = JSON.parse(fs.readFileSync(full, "utf-8")) as Partial<RegistryConfig>;
    return {
      ...DEFAULT_REGISTRY_CONFIG,
      ...parsed,
      agent_skill_map: {
        ...DEFAULT_REGISTRY_CONFIG.agent_skill_map,
        ...(parsed.agent_skill_map ?? {}),
      },
    };
  } catch {
    return DEFAULT_REGISTRY_CONFIG;
  }
}

// Active registry per session (most sessions share the same cwd, but be safe)
let activeRegistry: SkillRegistry | undefined;
let activeConfig: RegistryConfig = DEFAULT_REGISTRY_CONFIG;
let activeCwd: string | undefined;

function ensureRegistry(cwd: string, forceRebuild = false): SkillRegistry {
  activeConfig = loadConfig(cwd);
  activeCwd = cwd;

  if (!forceRebuild) {
    const cached = loadCache(activeConfig.cache_path, cwd);
    if (cached && isCacheValid(cached)) {
      activeRegistry = cached;
      return cached;
    }
  }

  const built = buildRegistry(cwd, activeConfig);
  saveCache(activeConfig.cache_path, cwd, built);
  activeRegistry = built;
  return built;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const registry = ensureRegistry(ctx.cwd);
    const count = Object.keys(registry.skills).length;
    const exceeded = Object.values(registry.skills).filter((s) => s.exceedsBudget).length;

    if (ctx.hasUI) {
      const lines = [`📚 Skill Registry: ${count} skill${count === 1 ? "" : "s"} loaded`];
      if (exceeded > 0) {
        lines.push(`   ⚠ ${exceeded} skill${exceeded === 1 ? "" : "s"} exceed token budget — run /skills:audit`);
      }
      if (registry.diagnostics.length > 0) {
        lines.push(`   ${registry.diagnostics.length} diagnostic${registry.diagnostics.length === 1 ? "" : "s"} — run /skills:audit`);
      }
      ctx.ui.notify(lines.join("\n"), exceeded > 0 ? "warning" : "info");
    }
  });

  // ── /skills:list ───────────────────────────────────────────────────────────
  pi.registerCommand("skills:list", {
    description: "List all skills loaded in the registry",
    handler: async (_args, ctx) => {
      const registry = activeRegistry ?? ensureRegistry(ctx.cwd);
      const skills = Object.values(registry.skills).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      if (skills.length === 0) {
        ctx.ui.notify("No skills loaded. Place SKILL.md files in .pi/skills/ or ~/.pi/agent/skills/", "warning");
        return;
      }
      const lines = [`Skill Registry (${skills.length} skills)`, ""];
      for (const s of skills) {
        const flag = s.exceedsBudget ? " ⚠" : "";
        const rulesInfo = s.compactRules.length === 0
          ? "(no compact rules)"
          : `${s.compactRules.length} rules, ~${s.tokensApprox}t`;
        lines.push(`  [${s.scope}] ${s.name}${flag} — ${rulesInfo}`);
      }
      lines.push("");
      lines.push("Use /skills:show <name> for details.");
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ── /skills:refresh ────────────────────────────────────────────────────────
  pi.registerCommand("skills:refresh", {
    description: "Force rebuild of the skill registry (re-scan all locations)",
    handler: async (_args, ctx) => {
      const registry = ensureRegistry(ctx.cwd, true);
      const count = Object.keys(registry.skills).length;
      ctx.ui.notify(
        `Registry rebuilt: ${count} skill${count === 1 ? "" : "s"} loaded\n` +
        `Cache: ${activeConfig.cache_path}`,
        "info",
      );
    },
  });

  // ── /skills:audit ──────────────────────────────────────────────────────────
  pi.registerCommand("skills:audit", {
    description: "Show skills with issues: missing compact rules, exceeding budget, diagnostics",
    handler: async (_args, ctx) => {
      const registry = activeRegistry ?? ensureRegistry(ctx.cwd);
      const skills = Object.values(registry.skills);
      const missing = skills.filter((s) => s.compactRules.length === 0);
      const overBudget = skills.filter((s) => s.exceedsBudget);

      const lines = [`Skill Audit (${skills.length} skills total)`, ""];

      lines.push(`Without compact rules (${missing.length}):`);
      for (const s of missing) lines.push(`  • ${s.name}  ${s.filePath}`);
      if (missing.length === 0) lines.push("  ✓ all skills have compact rules");
      lines.push("");

      lines.push(`Over budget (${overBudget.length}):`);
      for (const s of overBudget) {
        lines.push(`  ⚠ ${s.name}  ${s.tokensApprox} tokens (max ${activeConfig.max_tokens_per_skill})`);
      }
      if (overBudget.length === 0) lines.push("  ✓ all skills under budget");
      lines.push("");

      lines.push(`Diagnostics (${registry.diagnostics.length}):`);
      for (const d of registry.diagnostics.slice(0, 10)) lines.push(`  ! ${d}`);
      if (registry.diagnostics.length > 10) {
        lines.push(`  ... (${registry.diagnostics.length - 10} more)`);
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ── /skills:budget ─────────────────────────────────────────────────────────
  pi.registerCommand("skills:budget", {
    description: "Show token consumption per skill (sorted)",
    handler: async (_args, ctx) => {
      const registry = activeRegistry ?? ensureRegistry(ctx.cwd);
      const skills = Object.values(registry.skills).sort(
        (a, b) => b.tokensApprox - a.tokensApprox,
      );
      const total = skills.reduce((sum, s) => sum + s.tokensApprox, 0);

      const lines = [
        `Skill Token Budget (${skills.length} skills, ~${total} tokens total)`,
        "",
        `Max per skill: ${activeConfig.max_tokens_per_skill}`,
        "",
      ];
      for (const s of skills.slice(0, 20)) {
        const flag = s.exceedsBudget ? " ⚠" : "";
        lines.push(`  ${String(s.tokensApprox).padStart(5)}t  ${s.name}${flag}`);
      }
      if (skills.length > 20) {
        lines.push(`  ... (${skills.length - 20} more, use /skills:list)`);
      }
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ── /skills:show ───────────────────────────────────────────────────────────
  pi.registerCommand("skills:show", {
    description: "Show full registry entry for one skill. Usage: /skills:show <name>",
    handler: async (args, ctx) => {
      const name = (args ?? "").trim();
      if (!name) {
        ctx.ui.notify("Usage: /skills:show <skill-name>", "warning");
        return;
      }
      const registry = activeRegistry ?? ensureRegistry(ctx.cwd);
      const skill = registry.skills[name];
      if (!skill) {
        ctx.ui.notify(`Skill not found: "${name}". Use /skills:list to see available.`, "warning");
        return;
      }
      const lines = [
        `Skill: ${skill.name}`,
        ``,
        `Description:    ${skill.description}`,
        `File:           ${skill.filePath}`,
        `Scope:          ${skill.scope}`,
        `Hash:           ${skill.hash.slice(0, 12)}...`,
        `Tokens (rules): ${skill.tokensApprox}${skill.exceedsBudget ? " ⚠ OVER BUDGET" : ""}`,
        ``,
        `Compact Rules (${skill.compactRules.length}):`,
        ...skill.compactRules.map((r, i) => `  ${i + 1}. ${r}`),
        ...(skill.compactRules.length === 0 ? ["  (none — add ## Compact Rules section to SKILL.md)"] : []),
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}

// ── Exports for downstream phase extensions ───────────────────────────────────

export function getCurrentRegistry(): SkillRegistry | undefined {
  return activeRegistry;
}

export function getActiveConfig(): RegistryConfig {
  return activeConfig;
}

export function getActiveCwd(): string | undefined {
  return activeCwd;
}

export function getSkillsForAgent(agent: string) {
  if (!activeRegistry) return [];
  return _getSkillsForAgent(activeRegistry, agent, activeConfig);
}

export function buildPromptInjection(agent: string): string {
  if (!activeRegistry) return "";
  return _buildPromptInjection(activeRegistry, agent, activeConfig);
}
