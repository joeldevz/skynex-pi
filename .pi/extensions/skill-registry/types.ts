/**
 * Skill registry types.
 *
 * The registry layer extends Pi's built-in skill loading with:
 *   - "Compact Rules" extraction (a skynex-pi convention, not standard)
 *   - Per-agent subset assignment
 *   - Token budget enforcement
 *   - Cached metadata keyed by file hash
 *
 * Pi's skill loading is reused as-is for discovery. We add value on top.
 */

export interface SkillEntry {
  /** Skill name (from frontmatter `name:` or directory name). */
  name: string;
  /** One-line description (from frontmatter). Used in Pi's startup display. */
  description: string;
  /** Absolute path to SKILL.md (or .md file in flat skill directories). */
  filePath: string;
  /** Base directory the skill was discovered in. */
  baseDir: string;
  /** Source classification: "user" (global ~/.pi) or "project" (.pi). */
  scope: "user" | "project" | "unknown";
  /** SHA-256 hex of the SKILL.md content (for cache invalidation). */
  hash: string;
  /**
   * Compact rules extracted from `## Compact Rules` section.
   * Empty array if the section is missing.
   */
  compactRules: string[];
  /** Estimated token count of the compact rules block (chars / 4). */
  tokensApprox: number;
  /** True if compact rules exceed the configured per-skill budget. */
  exceedsBudget: boolean;
}

export interface SkillRegistry {
  /** Schema version of the cache file. */
  version: 1;
  /** ISO timestamp when registry was last built. */
  lastBuilt: string;
  /** All discovered skills, keyed by name. */
  skills: Record<string, SkillEntry>;
  /** Diagnostics from the last build (warnings, errors). */
  diagnostics: string[];
}

export interface RegistryConfig {
  /**
   * Per-skill compact-rules token budget. Warn if exceeded.
   * Default: 1000 tokens (~250 lines of rules).
   */
  max_tokens_per_skill: number;
  /**
   * Heading text that marks the start of compact rules.
   * Case-insensitive match. Default: "Compact Rules".
   */
  compact_rules_heading: string;
  /**
   * Cache file path (relative to cwd). Defaults to .skynex/skill-registry.json
   */
  cache_path: string;
  /**
   * Per-agent skill assignments. If empty, all skills go to all agents.
   * Sprint 2 phase extensions read this map to inject only relevant skills
   * to the corresponding sub-agent.
   */
  agent_skill_map: Record<string, string[]>;
}

export const DEFAULT_REGISTRY_CONFIG: RegistryConfig = {
  max_tokens_per_skill: 1000,
  compact_rules_heading: "Compact Rules",
  cache_path: ".skynex/skill-registry.json",
  agent_skill_map: {
    orchestrator: [],
    coder: [],
    verifier: [],
    security: [],
    "test-reviewer": [],
    "skill-validator": [],
    "tech-planner": [],
    "product-planner": ["propose", "specify"],
    architect: ["specify"],
    archivist: [],
  },
};
