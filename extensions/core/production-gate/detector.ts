/**
 * Production gate pattern detector — pure logic, no I/O.
 *
 * Given a command string and config, returns a GateMatch if the command
 * triggers any pattern, undefined otherwise.
 *
 * Rule precedence:
 *   1. Always-allow verbs (kubectl get, etc.) → no match
 *   2. Safe context (kubectl context whitelisted) → no match
 *   3. First category match wins
 */

import { minimatch } from "minimatch";
import type { GateConfig, GateMatch, PatternConfig } from "./types.js";

/**
 * Extract context information from a command (kubectl context, git branch, etc).
 * Best-effort — returns whatever can be parsed from the command itself.
 *
 * Note: For accurate kubectl context detection in the gate, we'd need to
 * shell out to `kubectl config current-context`. That's done in index.ts
 * (impure). This function only parses the literal command string.
 */
export function extractContextFromCommand(cmd: string): Record<string, string> {
  const ctx: Record<string, string> = {};

  // --context=NAME or --context NAME
  const kctxMatch = cmd.match(/--context[= ]([^\s]+)/);
  if (kctxMatch) ctx.kubectl_context = kctxMatch[1];

  // --namespace=NAME or -n NAME
  const nsMatch = cmd.match(/(?:--namespace[= ]|-n\s+)([^\s]+)/);
  if (nsMatch) ctx.kubectl_namespace = nsMatch[1];

  // For git push: extract remote + branch
  const gitPushMatch = cmd.match(/git\s+push\s+(?:--?\S+\s+)*(\S+)?\s*(\S+)?/);
  if (gitPushMatch) {
    if (gitPushMatch[1]) ctx.git_remote = gitPushMatch[1];
    if (gitPushMatch[2]) ctx.git_branch = gitPushMatch[2];
  }

  // -f flag file (terraform/helm/kubectl)
  const fileMatch = cmd.match(/-f\s+([^\s]+)/);
  if (fileMatch) ctx.file = fileMatch[1];

  return ctx;
}

/**
 * Is the given kubectl context in the safe list?
 */
function isKubectlContextSafe(ctx: Record<string, string>, safe: readonly string[]): boolean {
  const kctx = ctx.kubectl_context;
  if (!kctx) return false;
  return safe.some((p) => minimatch(kctx, p, { dot: true }));
}

/**
 * Is the given git branch in the safe list?
 */
function isGitBranchSafe(branch: string | undefined, safe: readonly string[]): boolean {
  if (!branch) return false;
  return safe.some((p) => minimatch(branch, p, { dot: true }));
}

/**
 * Get first word (the tool name) from a command, ignoring leading sudo/env/etc.
 */
function firstWord(cmd: string): string {
  const trimmed = cmd.replace(/^(?:sudo\s+|nice\s+|env\s+\S+=\S+\s+)+/, "").trim();
  return trimmed.split(/\s+/)[0] ?? "";
}

/**
 * Extract the verb (second word, the action) for tools like `kubectl X`, `terraform Y`.
 */
function getVerb(cmd: string, tool: string): string | undefined {
  const re = new RegExp(`\\b${tool}\\s+(\\S+)`);
  const m = cmd.match(re);
  return m ? m[1] : undefined;
}

// ─── Category-specific matchers ──────────────────────────────────────────────

function matchKubectl(cmd: string, config: PatternConfig, safeCtx: Record<string, string>, safeKubectls: readonly string[]): GateMatch | undefined {
  if (!config.enabled) return undefined;
  if (firstWord(cmd) !== "kubectl") return undefined;

  const verb = getVerb(cmd, "kubectl");
  if (!verb) return undefined;

  // Always-allow verbs override everything
  if (config.always_allow_verbs?.includes(verb)) return undefined;
  if (!config.block_verbs?.includes(verb)) return undefined;

  // Check if context is safe
  if (isKubectlContextSafe(safeCtx, safeKubectls)) return undefined;

  return {
    category: "kubectl",
    subtype: `kubectl-${verb}`,
    reason: `kubectl ${verb} mutates cluster state`,
    severity: "high",
    context: safeCtx,
  };
}

function matchDbMigrations(cmd: string, config: PatternConfig): GateMatch | undefined {
  if (!config.enabled || !config.tools) return undefined;
  for (const tool of config.tools) {
    if (cmd.startsWith(tool) || cmd.includes(` ${tool} `) || cmd.includes(`${tool}`)) {
      // Verify it's not just substring inside another word
      const re = new RegExp(`(?:^|\\s|;|\\|)${escapeRegex(tool)}(?:\\s|$|;|\\|)`);
      if (re.test(cmd)) {
        return {
          category: "db_migrations",
          subtype: `db-migration-${tool.split(/\s+/)[0]}`,
          reason: `Database migration via ${tool}`,
          severity: "high",
          context: {},
        };
      }
    }
  }
  return undefined;
}

/**
 * Compile a regex pattern. Supports POSIX-style `(?i)` prefix by extracting it
 * into a JavaScript regex flag (since JS doesn't accept inline `(?i)`).
 */
function compileRegex(pattern: string): RegExp | undefined {
  let flags = "";
  let source = pattern;
  // Handle (?i), (?im), (?s), etc. at the start
  const inlineFlag = source.match(/^\(\?([ims]+)\)/);
  if (inlineFlag) {
    flags = inlineFlag[1];
    source = source.slice(inlineFlag[0].length);
  }
  try {
    return new RegExp(source, flags);
  } catch {
    return undefined;
  }
}

function matchDbDirect(cmd: string, config: PatternConfig): GateMatch | undefined {
  if (!config.enabled || !config.regex_blockers) return undefined;
  for (const pattern of config.regex_blockers) {
    const re = compileRegex(pattern);
    if (!re) continue;
    if (re.test(cmd)) {
      return {
        category: "db_direct",
        subtype: "db-bulk-write",
        reason: `Bulk SQL operation (matched: ${pattern.slice(0, 40)})`,
        severity: "high",
        context: {},
      };
    }
  }
  return undefined;
}

function matchVerbBased(cmd: string, tool: string, config: PatternConfig, category: string): GateMatch | undefined {
  if (!config.enabled) return undefined;
  if (firstWord(cmd) !== tool) return undefined;
  const verb = getVerb(cmd, tool);
  if (!verb || !config.block_verbs?.includes(verb)) return undefined;
  return {
    category,
    subtype: `${category}-${verb}`,
    reason: `${tool} ${verb} mutates infrastructure`,
    severity: "high",
    context: {},
  };
}

function matchGitForce(cmd: string, config: PatternConfig): GateMatch | undefined {
  if (!config.enabled) return undefined;
  // git push --force / --force-with-lease / -f / -fu (as separate args)
  if (!/\bgit\s+push\b/.test(cmd)) return undefined;
  // Look for any of the force flags as their own token (space-delimited)
  if (/(?:^|\s)(?:--force|--force-with-lease|-f|-fu)(?:\s|$)/.test(cmd)) {
    return {
      category: "git_force",
      subtype: "git-force-push",
      reason: "git force-push rewrites shared history",
      severity: "high",
      context: extractContextFromCommand(cmd),
    };
  }
  return undefined;
}

function matchGitMainPush(cmd: string, config: PatternConfig, safeBranches: readonly string[]): GateMatch | undefined {
  if (!config.enabled || !config.protected_branches) return undefined;
  const m = cmd.match(/git\s+push\s+(?:\S+\s+)?(\S+)/);
  if (!m) return undefined;
  const target = m[1];
  // The 2nd arg of `git push origin main` is the branch
  const fullMatch = cmd.match(/git\s+push\s+\S+\s+(\S+)/);
  const branch = fullMatch ? fullMatch[1] : target;
  // Safe branch exemption
  if (isGitBranchSafe(branch, safeBranches)) return undefined;
  for (const protectedBranch of config.protected_branches) {
    if (minimatch(branch, protectedBranch, { dot: true })) {
      return {
        category: "git_main_push",
        subtype: "git-protected-push",
        reason: `git push to protected branch '${branch}'`,
        severity: "high",
        context: { git_branch: branch },
      };
    }
  }
  return undefined;
}

function matchPublishing(cmd: string, config: PatternConfig): GateMatch | undefined {
  if (!config.enabled || !config.tools) return undefined;
  for (const tool of config.tools) {
    if (cmd.startsWith(tool) || new RegExp(`(?:^|\\s)${escapeRegex(tool)}(?:\\s|$)`).test(cmd)) {
      return {
        category: "publishing",
        subtype: "package-publish",
        reason: `Publishing via ${tool} is irreversible`,
        severity: "critical",
        context: {},
      };
    }
  }
  return undefined;
}

function matchDestructiveFs(cmd: string, config: PatternConfig): GateMatch | undefined {
  if (!config.enabled || !config.patterns) return undefined;
  for (const pattern of config.patterns) {
    if (cmd.includes(pattern)) {
      return {
        category: "destructive_fs",
        subtype: "fs-destructive",
        reason: `Destructive filesystem command (${pattern})`,
        severity: "critical",
        context: {},
      };
    }
  }
  return undefined;
}

function matchCloudDelete(cmd: string, config: PatternConfig): GateMatch | undefined {
  if (!config.enabled || !config.tools || !config.verb_regex) return undefined;
  const tool = firstWord(cmd);
  if (!config.tools.includes(tool)) return undefined;
  const re = compileRegex(config.verb_regex);
  if (!re) return undefined;
  if (re.test(cmd)) {
    return {
      category: "cloud_delete",
      subtype: `${tool}-destroy`,
      reason: `${tool} destructive operation`,
      severity: "high",
      context: {},
    };
  }
  return undefined;
}

function matchPatternList(cmd: string, config: PatternConfig, category: string, severity: GateMatch["severity"]): GateMatch | undefined {
  if (!config.enabled || !config.patterns) return undefined;
  for (const pattern of config.patterns) {
    if (cmd.includes(pattern)) {
      return {
        category,
        subtype: category.replace(/_/g, "-"),
        reason: `Matched pattern: ${pattern}`,
        severity,
        context: {},
      };
    }
  }
  return undefined;
}

function matchCustom(cmd: string, patterns: readonly { name: string; regex: string; category: string; severity: GateMatch["severity"] }[]): GateMatch | undefined {
  for (const p of patterns) {
    const re = compileRegex(p.regex);
    if (!re) continue;
    if (re.test(cmd)) {
      return {
        category: p.category,
        subtype: p.name,
        reason: `Custom pattern '${p.name}' matched`,
        severity: p.severity,
        context: {},
      };
    }
  }
  return undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Detect if a command triggers any production gate pattern.
 * Returns the first match (priority order: destructive > db > kubectl > infra > publish > others).
 */
export function detectRisk(cmd: string, config: GateConfig, kubectlContextOverride?: string): GateMatch | undefined {
  const safeCtx = extractContextFromCommand(cmd);
  // Override kubectl context if we resolved it externally (real `kubectl config current-context`)
  if (kubectlContextOverride && !safeCtx.kubectl_context) {
    safeCtx.kubectl_context = kubectlContextOverride;
  }

  // Custom patterns first (user-defined high-priority)
  const custom = matchCustom(cmd, config.custom_patterns);
  if (custom) return custom;

  // Destructive fs has top priority among built-ins (worst damage)
  const fs = matchDestructiveFs(cmd, config.patterns.destructive_fs);
  if (fs) return fs;

  // DB next (irreversible mostly)
  const db1 = matchDbDirect(cmd, config.patterns.db_direct);
  if (db1) return db1;
  const db2 = matchDbMigrations(cmd, config.patterns.db_migrations);
  if (db2) return db2;

  // Kubernetes
  const k = matchKubectl(cmd, config.patterns.kubectl, safeCtx, config.safe_contexts.kubectl);
  if (k) return k;

  // Infra
  const tf = matchVerbBased(cmd, "terraform", config.patterns.terraform, "terraform");
  if (tf) return tf;
  const pu = matchVerbBased(cmd, "pulumi", config.patterns.pulumi, "pulumi");
  if (pu) return pu;
  const hm = matchVerbBased(cmd, "helm", config.patterns.helm, "helm");
  if (hm) return hm;

  // Git
  const gf = matchGitForce(cmd, config.patterns.git_force);
  if (gf) return gf;
  const gm = matchGitMainPush(cmd, config.patterns.git_main_push, config.safe_contexts.git_branches);
  if (gm) return gm;

  // Publishing
  const pub = matchPublishing(cmd, config.patterns.publishing);
  if (pub) return pub;

  // Cloud
  const cd = matchCloudDelete(cmd, config.patterns.cloud_delete);
  if (cd) return cd;

  // Container + service (pattern-list based)
  const cont = matchPatternList(cmd, config.patterns.container_destructive, "container_destructive", "high");
  if (cont) return cont;
  const svc = matchPatternList(cmd, config.patterns.service_control, "service_control", "medium");
  if (svc) return svc;

  return undefined;
}
