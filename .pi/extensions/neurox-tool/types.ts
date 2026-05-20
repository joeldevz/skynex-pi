/**
 * Neurox tool types.
 *
 * skynex-pi wraps the neurox CLI as Pi tools instead of relying on the MCP
 * server. Reasons:
 *   1. No MCP overhead in tool definitions (~200 tokens saved per session
 *      since each MCP tool burns ~30-50 tokens of schema)
 *   2. Direct integration with skynex-pi return envelope conventions
 *   3. Lazy invocation — tools only run when the model calls them
 *
 * The neurox binary already outputs JSON to stdout, so parsing is trivial.
 */

export interface NeuroxToolConfig {
  /** Absolute path to the neurox binary. Default: auto-detect via `which`. */
  binary_path?: string;
  /** Default namespace to use when the tool input omits it. */
  default_namespace: string;
  /** Maximum seconds to wait for a neurox call. */
  timeout_seconds: number;
  /** If true, log noisy neurox stderr to the extension log file (for debug). */
  log_stderr: boolean;
}

export const DEFAULT_NEUROX_CONFIG: NeuroxToolConfig = {
  default_namespace: "default",
  timeout_seconds: 15,
  log_stderr: false,
};

// ── Tool input/output shapes (mirrors CLI flags) ────────────────────────────

export interface RecallInput {
  query: string;
  namespace?: string;
  limit?: number;
  kind?: "episodic" | "semantic" | "procedural";
  type?: "decision" | "bugfix" | "discovery" | "pattern" | "gotcha" | "config" | "preference";
  files?: string;
  include_stale?: boolean;
}

export interface SaveInput {
  title: string;
  content: string;
  namespace?: string;
  type?: "decision" | "bugfix" | "discovery" | "pattern" | "gotcha" | "config" | "preference";
  kind?: "episodic" | "semantic" | "procedural";
  tags?: string;
  files?: string;
  topic_key?: string;
  confidence?: number;
  retention?: "durable" | "operational";
}

export interface ContextInput {
  namespace?: string;
  limit?: number;
  files?: string;
}

export interface SessionStartInput {
  title?: string;
  directory?: string;
  branch?: string;
  namespace?: string;
}

export interface SessionEndInput {
  session_id: string;
  summary: string;
}

// ── CLI command result ───────────────────────────────────────────────────────

export interface NeuroxCliResult {
  ok: boolean;
  /** Parsed JSON from stdout, or null if not JSON. */
  data: unknown;
  /** Raw stderr (often noisy logs from neurox itself). */
  stderr: string;
  /** Exit code from the neurox process. */
  exitCode: number;
}
