/**
 * Production Gate types.
 *
 * Catches commands that affect production (kubectl mutations, DB migrations,
 * terraform/helm apply, git force/main pushes, npm publish, destructive fs,
 * cloud deletions) and requires typed confirmation before execution.
 *
 * Last line of defense before local execution. NOT a replacement for CI/CD,
 * branch protection, or cluster RBAC — those layers stay essential.
 */

// ── Modes ────────────────────────────────────────────────────────────────────

export type GateMode = "strict" | "warn" | "silent" | "off";

export interface PatternConfig {
  enabled: boolean;
  /** Verbs that trigger the gate (for tools like kubectl, terraform, helm). */
  block_verbs?: string[];
  /** Verbs that are always allowed (overrides block_verbs). */
  always_allow_verbs?: string[];
  /** Tool names matched as exact-prefix. */
  tools?: string[];
  /** Regex patterns matched against the command string. */
  regex_blockers?: string[];
  /** Plain string patterns (substring match). */
  patterns?: string[];
  /** Additional regex for verb extraction (e.g., cloud_delete). */
  verb_regex?: string;
  /** Branches considered protected (for git_main_push). */
  protected_branches?: string[];
}

export interface SafeContexts {
  /** kubectl contexts considered safe (won't trigger gate). */
  kubectl: string[];
  /** Git branches considered safe (wildcards supported via simple glob). */
  git_branches: string[];
  comment?: string;
}

export interface AuditLogConfig {
  path: string;
  auto_gitignore: boolean;
  rotate_at_mb: number;
  retention_days: number;
}

export interface ConfirmationConfig {
  require_typed: boolean;
  typed_phrase: string;
  /** What to do when AFK mode is active and no human can confirm. */
  afk_behavior: "always_abort" | "always_allow" | "warn_and_abort";
}

export interface CustomPattern {
  name: string;
  /** Regex string matched against the command. */
  regex: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
}

export interface GateConfig {
  mode: GateMode;
  audit_log: AuditLogConfig;
  confirmation: ConfirmationConfig;
  safe_contexts: SafeContexts;
  patterns: Record<string, PatternConfig>;
  custom_patterns: CustomPattern[];
}

// ── Pattern catalog defaults (paranoid: strict mode, empty safe_contexts) ───

export const DEFAULT_GATE_CONFIG: GateConfig = {
  mode: "strict",
  audit_log: {
    path: ".skynex/audit.log",
    auto_gitignore: true,
    rotate_at_mb: 50,
    retention_days: 365,
  },
  confirmation: {
    require_typed: true,
    typed_phrase: "yes apply",
    afk_behavior: "always_abort",
  },
  safe_contexts: {
    kubectl: [],
    git_branches: ["personal/*", "feat/*", "fix/*", "chore/*"],
    comment:
      "Empty kubectl list = treat ALL contexts as production. Add safe contexts to relax.",
  },
  patterns: {
    kubectl: {
      enabled: true,
      block_verbs: ["apply", "delete", "scale", "rollout", "drain", "exec", "edit", "patch", "replace"],
      always_allow_verbs: ["get", "describe", "logs", "top", "explain", "diff", "version"],
    },
    db_migrations: {
      enabled: true,
      tools: [
        "prisma migrate deploy",
        "rails db:migrate",
        "alembic upgrade",
        "knex migrate:latest",
        "sqlx migrate run",
        "flyway migrate",
        "drizzle-kit push",
        "atlas migrate apply",
      ],
    },
    db_direct: {
      enabled: true,
      // SQL-specific: require keyword + object-noun (FROM/TABLE/INDEX/SCHEMA)
      // to avoid matching 'kubectl delete' or 'docker delete-volume'.
      regex_blockers: [
        "(?i)\\bDELETE\\s+FROM\\b(?!.*\\bWHERE\\b)",
        "(?i)\\bDROP\\s+(TABLE|INDEX|DATABASE|SCHEMA|VIEW)\\b",
        "(?i)\\bTRUNCATE\\b",
        "(?i)\\bALTER\\s+TABLE\\b",
        "(?i)\\bUPDATE\\s+\\w+\\s+SET\\b(?!.*\\bWHERE\\b)",
        "(?i)\\bFLUSHALL\\b",
        "(?i)deleteMany\\(",
      ],
    },
    terraform: { enabled: true, block_verbs: ["apply", "destroy", "import"] },
    pulumi: { enabled: true, block_verbs: ["up", "destroy", "refresh"] },
    helm: { enabled: true, block_verbs: ["upgrade", "uninstall", "rollback", "install"] },
    git_force: { enabled: true },
    git_main_push: {
      enabled: true,
      protected_branches: ["main", "master", "production", "prod", "release/*"],
    },
    publishing: {
      enabled: true,
      tools: ["npm publish", "pnpm publish", "yarn publish", "cargo publish", "twine upload"],
    },
    destructive_fs: {
      enabled: true,
      patterns: ["rm -rf /", "rm -rf /*", "sudo rm", "chmod 777 /", "chown -R"],
    },
    cloud_delete: {
      enabled: true,
      tools: ["aws", "gcloud", "az"],
      verb_regex: "(?i)\\b(delete|remove|terminate|destroy)\\b",
    },
    container_destructive: {
      enabled: true,
      patterns: ["docker volume rm", "docker system prune", "kubectl delete pvc", "podman volume rm"],
    },
    service_control: {
      enabled: true,
      patterns: ["systemctl restart", "systemctl stop", "pm2 reload --update-env", "supervisorctl restart"],
    },
  },
  custom_patterns: [],
};

// ── Match result ─────────────────────────────────────────────────────────────

export interface GateMatch {
  /** Which pattern category fired (e.g., 'kubectl', 'db_migrations'). */
  category: string;
  /** Subtype identifier (e.g., 'kubectl-apply', 'db-migration'). */
  subtype: string;
  /** Why this command matched (the matched verb, pattern, etc.). */
  reason: string;
  /** Severity of the risk. */
  severity: "low" | "medium" | "high" | "critical";
  /** Context info (kubectl context, git branch, etc.) for the dialog. */
  context: Record<string, string>;
}

// ── Audit entry ──────────────────────────────────────────────────────────────

export interface AuditEntry {
  ts: string;
  cmd: string;
  category: string;
  subtype: string;
  severity: string;
  ctx: Record<string, string>;
  confirmed: boolean | null;
  response: string;
  outcome: "user-allowed" | "user-aborted" | "auto-allowed" | "auto-blocked" | "afk-aborted" | "afk-allowed";
  session: string;
  mode: GateMode;
  duration_ms?: number;
}

// ── Mode-change audit entry (separate shape) ─────────────────────────────────

export interface ModeChangeEntry {
  ts: string;
  mode_change: string; // "strict→warn"
  reason: string;
  actor: string;
  session: string;
}
