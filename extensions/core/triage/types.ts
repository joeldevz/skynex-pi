/**
 * Triage types — internal to the triage extension.
 * Imported by index.ts (the Pi extension entry) and rules.ts (the matchers).
 */

export type TriagePath = "small" | "medium" | "substantial";

export interface TriageResult {
  /** The path the request is routed to. */
  path: TriagePath;
  /** Human-readable reason that selected this path. */
  reason: string;
  /** True if TDD discipline should be enforced for this request. */
  tdd: boolean;
  /** Estimated number of files this request will touch (heuristic, not exact). */
  estimated_files: number;
  /** Estimated number of modules / top-level directories affected. */
  estimated_modules: number;
  /** True if the request mentions risk keywords (auth, payment, migration, etc.). */
  has_risk_keywords: boolean;
  /** Which specific signals fired (for debugging / audit). */
  signals: string[];
  /** Timestamp when triage was computed. */
  ts: string;
}

export interface TriageInput {
  /** The raw user prompt text. */
  prompt: string;
  /** Current working directory (read from ctx.cwd). */
  cwd: string;
}

/**
 * Configuration for triage rules.
 * Loaded from .skynex/triage.json if present, defaults otherwise.
 */
export interface TriageConfig {
  /** Keywords that ALWAYS promote to substantial path. */
  risk_keywords: string[];
  /** Patterns ("across", "all", "everywhere", etc.) that signal cross-cutting work. */
  cross_cutting_patterns: string[];
  /** Vague terms that signal ambiguity. */
  ambiguity_terms: string[];
  /** Patterns that signal a trivial mechanical change. */
  trivial_patterns: string[];
  /** Minimum number of vague terms to consider request ambiguous. */
  ambiguity_threshold: number;
}

export const DEFAULT_TRIAGE_CONFIG: TriageConfig = {
  risk_keywords: [
    "auth",
    "authentication",
    "authorization",
    "login",
    "logout",
    "password",
    "session",
    "token",
    "jwt",
    "oauth",
    "saml",
    "sso",
    "payment",
    "billing",
    "checkout",
    "stripe",
    "paypal",
    "invoice",
    "migration",
    "migrate",
    "schema",
    "database schema",
    "alter table",
    "security",
    "vulnerability",
    "cve",
    "exploit",
    "crypto",
    "encryption",
    "decrypt",
    "hash",
    "secret",
    "credential",
    "rbac",
    "permission system",
    "production",
    "deploy to prod",
  ],
  cross_cutting_patterns: [
    "across",
    "all modules",
    "all services",
    "everywhere",
    "every file",
    "whole codebase",
    "entire project",
    "system-wide",
    "global refactor",
  ],
  ambiguity_terms: [
    "improve",
    "better",
    "refactor",
    "clean up",
    "modernize",
    "optimize",
    "fix the architecture",
    "make it nice",
    "ideally",
    "maybe",
    "i think",
    "somehow",
    "should be",
    "would be good",
  ],
  trivial_patterns: [
    "rename",
    "typo",
    "fix typo",
    "fix the typo",
    "add comment",
    "format",
    "prettier",
    "lint fix",
    "remove unused",
    "rename variable",
    "rename function",
    "change name",
  ],
  ambiguity_threshold: 3,
};
