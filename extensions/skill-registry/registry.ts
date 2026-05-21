/**
 * Registry builder — discovers skills via Pi's loader, then enriches each
 * with compact rules + hash + budget check.
 *
 * Caches result in `.skynex/skill-registry.json` for fast restart.
 * Re-reads if any source file's hash has changed.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseFrontmatter, loadSkills, type Skill } from "@earendil-works/pi-coding-agent";
import {
  extractCompactRules,
  estimateTokens,
  sha256,
  formatRulesForPrompt,
} from "./parser.js";
import {
  DEFAULT_REGISTRY_CONFIG,
  type RegistryConfig,
  type SkillEntry,
  type SkillRegistry,
} from "./types.js";

const AGENT_DIR_GLOBAL_DEFAULT = path.join(
  process.env.HOME ?? "",
  ".pi",
  "agent",
);

/**
 * Pure function to determine if a file change should trigger a registry refresh.
 * Returns true if the filename ends with "SKILL.md".
 * Handles null/undefined safely.
 */
export function shouldRefreshOnFile(filename: string | null | undefined): boolean {
  if (!filename) return false;
  return filename.endsWith("SKILL.md");
}

function getScopeFromSkill(skill: Skill, cwd: string): "user" | "project" | "unknown" {
  const abs = path.resolve(skill.filePath);
  if (abs.startsWith(path.resolve(cwd))) return "project";
  if (abs.startsWith(path.resolve(process.env.HOME ?? "", ".pi"))) return "user";
  if (abs.startsWith(path.resolve(process.env.HOME ?? "", ".agents"))) return "user";
  return "unknown";
}

/**
 * Build a registry by:
 *   1. Discovering skills via Pi's loadSkills()
 *   2. Reading each SKILL.md
 *   3. Parsing frontmatter + extracting compact rules
 *   4. Computing hash + token estimate
 */
export function buildRegistry(
  cwd: string,
  config: RegistryConfig = DEFAULT_REGISTRY_CONFIG,
  agentDir: string = AGENT_DIR_GLOBAL_DEFAULT,
  skillPaths?: string[],
): SkillRegistry {
  const diagnostics: string[] = [];
  const skills: Record<string, SkillEntry> = {};

  let discovered: Skill[];
  try {
    // Build skill paths: explicit paths + project's skills directory + defaults
    const paths = skillPaths ?? [path.join(cwd, "skills")];
    const result = loadSkills({
      cwd,
      agentDir,
      skillPaths: paths,
      includeDefaults: true,
    });
    discovered = result.skills;
    for (const diag of result.diagnostics) {
      diagnostics.push(`pi-loader: ${diag.message ?? JSON.stringify(diag)}`);
    }
  } catch (err: unknown) {
    diagnostics.push(`pi loadSkills failed: ${(err as Error).message}`);
    discovered = [];
  }

  for (const skill of discovered) {
    try {
      const raw = fs.readFileSync(skill.filePath, "utf-8");
      const hash = sha256(raw);
      const { body } = parseFrontmatter<Record<string, unknown>>(raw);
      const compactRules = extractCompactRules(body, config.compact_rules_heading);
      const rulesText = compactRules.join("\n");
      const tokensApprox = estimateTokens(rulesText);
      const exceedsBudget = tokensApprox > config.max_tokens_per_skill;

      if (exceedsBudget) {
        diagnostics.push(
          `${skill.name}: compact rules exceed budget (${tokensApprox} tokens > ${config.max_tokens_per_skill})`,
        );
      }

      skills[skill.name] = {
        name: skill.name,
        description: skill.description,
        filePath: skill.filePath,
        baseDir: skill.baseDir,
        scope: getScopeFromSkill(skill, cwd),
        hash,
        compactRules,
        tokensApprox,
        exceedsBudget,
      };
    } catch (err: unknown) {
      diagnostics.push(`${skill.name}: ${(err as Error).message}`);
    }
  }

  return {
    version: 1,
    lastBuilt: new Date().toISOString(),
    skills,
    diagnostics,
  };
}

export function loadCache(cachePath: string, cwd: string): SkillRegistry | undefined {
  const full = path.isAbsolute(cachePath) ? cachePath : path.join(cwd, cachePath);
  if (!fs.existsSync(full)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(full, "utf-8")) as SkillRegistry;
    if (parsed.version !== 1) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function saveCache(cachePath: string, cwd: string, registry: SkillRegistry): void {
  const full = path.isAbsolute(cachePath) ? cachePath : path.join(cwd, cachePath);
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(full, JSON.stringify(registry, null, 2));
}

/**
 * Verify cache is still valid by re-hashing every source file.
 * If ANY file's hash changed (or file was deleted), cache is stale.
 */
export function isCacheValid(registry: SkillRegistry): boolean {
  for (const skill of Object.values(registry.skills)) {
    try {
      if (!fs.existsSync(skill.filePath)) return false;
      const raw = fs.readFileSync(skill.filePath, "utf-8");
      if (sha256(raw) !== skill.hash) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Returns the subset of skills assigned to a given agent, per the
 * agent_skill_map config. Returns ALL skills if the agent has no mapping
 * (conservative default).
 */
export function getSkillsForAgent(
  registry: SkillRegistry,
  agent: string,
  config: RegistryConfig = DEFAULT_REGISTRY_CONFIG,
): SkillEntry[] {
  const names = config.agent_skill_map[agent];
  if (!names || names.length === 0) {
    // No mapping → return all (conservative)
    return Object.values(registry.skills);
  }
  return names
    .map((name) => registry.skills[name])
    .filter((s): s is SkillEntry => s !== undefined);
}

/**
 * Build a compact-rules markdown block ready to inject into a sub-agent prompt.
 */
export function buildPromptInjection(
  registry: SkillRegistry,
  agent: string,
  config: RegistryConfig = DEFAULT_REGISTRY_CONFIG,
): string {
  const skills = getSkillsForAgent(registry, agent, config);
  return formatRulesForPrompt(
    skills.map((s) => ({ name: s.name, compactRules: s.compactRules })),
  );
}
