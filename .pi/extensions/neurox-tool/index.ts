/**
 * Neurox tool extension.
 *
 * Registers 5 Pi tools that wrap the neurox binary:
 *   - neurox_recall
 *   - neurox_save
 *   - neurox_context
 *   - neurox_session_start
 *   - neurox_session_end
 *
 * The neurox CLI outputs JSON natively, so wrapping is cheap.
 *
 * Configuration: .skynex/neurox.json (overrides DEFAULT_NEUROX_CONFIG)
 *
 * If the neurox binary is not on PATH (or in `binary_path`), the extension
 * logs a warning at startup and refuses to register the tools (so the model
 * does not see them as available — better than registering and failing).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  buildRecallArgs,
  buildSaveArgs,
  buildContextArgs,
  buildSessionStartArgs,
  buildSessionEndArgs,
  parseStdout,
} from "./cli.js";
import {
  DEFAULT_NEUROX_CONFIG,
  type NeuroxToolConfig,
  type NeuroxCliResult,
  type RecallInput,
  type SaveInput,
  type ContextInput,
  type SessionStartInput,
  type SessionEndInput,
} from "./types.js";

const CONFIG_PATH = ".skynex/neurox.json";

function loadConfig(cwd: string): NeuroxToolConfig {
  const full = path.join(cwd, CONFIG_PATH);
  if (!fs.existsSync(full)) return DEFAULT_NEUROX_CONFIG;
  try {
    const parsed = JSON.parse(fs.readFileSync(full, "utf-8")) as Partial<NeuroxToolConfig>;
    return { ...DEFAULT_NEUROX_CONFIG, ...parsed };
  } catch {
    return DEFAULT_NEUROX_CONFIG;
  }
}

function findNeuroxBinary(configuredPath?: string): string | undefined {
  if (configuredPath && fs.existsSync(configuredPath)) return configuredPath;

  // Check common locations
  const candidates = [
    path.join(process.env.HOME ?? "", ".local", "bin", "neurox"),
    "/usr/local/bin/neurox",
    "/opt/homebrew/bin/neurox",
    "/usr/bin/neurox",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // Fallback: try `which neurox` (may be in PATH but not in standard locations)
  try {
    const result = execFileSync("which", ["neurox"], { stdio: ["ignore", "pipe", "ignore"] });
    const out = result.toString().trim();
    if (out && fs.existsSync(out)) return out;
  } catch {
    // not in PATH
  }
  return undefined;
}

function runNeurox(
  binary: string,
  args: string[],
  config: NeuroxToolConfig,
): NeuroxCliResult {
  try {
    const stdout = execFileSync(binary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: config.timeout_seconds * 1000,
      maxBuffer: 10 * 1024 * 1024, // 10 MB cap
    });
    return {
      ok: true,
      data: parseStdout(stdout.toString()),
      stderr: "",
      exitCode: 0,
    };
  } catch (err: unknown) {
    const e = err as {
      status?: number;
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      message?: string;
    };
    const stderr = e.stderr ? String(e.stderr) : (e.message ?? "");
    const stdout = e.stdout ? String(e.stdout) : "";
    return {
      ok: false,
      data: stdout ? parseStdout(stdout) : null,
      stderr,
      exitCode: e.status ?? 1,
    };
  }
}

function formatToolResult(result: NeuroxCliResult, label: string) {
  if (!result.ok) {
    return {
      content: [
        {
          type: "text" as const,
          text: `${label} failed (exit ${result.exitCode}):\n${result.stderr.slice(0, 500)}`,
        },
      ],
      details: { exitCode: result.exitCode, stderr: result.stderr },
      isError: true,
    };
  }
  const text = typeof result.data === "string"
    ? result.data
    : JSON.stringify(result.data, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    details: { data: result.data },
  };
}

/**
 * Build a "retry hint" message for the model when neurox_recall returns 0 results.
 * Tells the model how to retry with variations BEFORE concluding nothing exists.
 */
function buildRecallHint(query: string, namespaceUsed: string | undefined): string {
  return [
    "",
    "──────────────────────────────────────────────────────────────",
    "ZERO RESULTS — do NOT conclude 'nothing found' yet.",
    "",
    `Query attempted: "${query}"`,
    `Namespace used:  ${namespaceUsed ?? "(cross-namespace search)"}`,
    "",
    "Required next steps (per AGENTS.md search protocol):",
    "  1. If you searched with a namespace, RETRY without namespace (cross-project).",
    "  2. Try 2-3 SYNONYMS or related terms:",
    "     • auth → authentication, login, jwt, session, token",
    "     • payment → billing, checkout, invoice, subscription",
    "     • bug → fix, error, issue, regression",
    "     • api → endpoint, route, handler, controller",
    "  3. Only after 2-3 distinct queries return zero may you report",
    "     'no memories found' to the user. Tell them which queries you tried.",
    "──────────────────────────────────────────────────────────────",
  ].join("\n");
}

/**
 * Wrap recall result with retry hint when count is 0.
 */
function formatRecallResult(result: NeuroxCliResult, query: string, namespaceUsed: string | undefined) {
  const base = formatToolResult(result, "neurox_recall");
  if (!result.ok || base.isError) return base;

  const data = result.data;
  const count =
    data && typeof data === "object" && "count" in data
      ? (data as { count?: number }).count ?? 0
      : 0;

  if (count === 0) {
    const baseText = base.content[0].type === "text" ? base.content[0].text : "";
    return {
      ...base,
      content: [{ type: "text" as const, text: baseText + buildRecallHint(query, namespaceUsed) }],
    };
  }
  return base;
}

export default function (pi: ExtensionAPI) {
  // Detect binary at module load. If unavailable, log and skip registration.
  let binary: string | undefined;
  let activeConfig = DEFAULT_NEUROX_CONFIG;

  pi.on("session_start", async (_event, ctx) => {
    activeConfig = loadConfig(ctx.cwd);
    binary = findNeuroxBinary(activeConfig.binary_path);

    if (ctx.hasUI) {
      if (binary) {
        ctx.ui.notify(
          `🧠 Neurox tools available (binary: ${binary})\n` +
          `   default namespace: ${activeConfig.default_namespace}`,
          "info",
        );
      } else {
        ctx.ui.notify(
          `⚠️  Neurox binary not found. Install: https://github.com/...\n` +
          `   Or set binary_path in .skynex/neurox.json\n` +
          `   Neurox tools are NOT registered for this session.`,
          "warning",
        );
      }
    }
  });

  // ── neurox_recall ──────────────────────────────────────────────────────────
  pi.registerTool({
    name: "neurox_recall",
    label: "Neurox: Recall",
    description:
      "Search durable memory for past decisions, patterns, and discoveries. PROTOCOL: (1) ALWAYS try cross-project first (OMIT namespace). (2) If 0 results, RETRY with synonyms (auth→authentication/login/jwt/session/token). (3) Only after 2-3 distinct queries return zero, report 'not found'. NEVER give up after one search.",
    parameters: Type.Object({
      query: Type.String({ description: "Keywords to search for" }),
      namespace: Type.Optional(Type.String({ description: "Filter by namespace. OMIT for cross-project search (recommended first attempt)." })),
      limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
      kind: Type.Optional(Type.Union([
        Type.Literal("episodic"),
        Type.Literal("semantic"),
        Type.Literal("procedural"),
      ])),
      type: Type.Optional(Type.Union([
        Type.Literal("decision"),
        Type.Literal("bugfix"),
        Type.Literal("discovery"),
        Type.Literal("pattern"),
        Type.Literal("gotcha"),
        Type.Literal("config"),
        Type.Literal("preference"),
      ])),
      files: Type.Optional(Type.String({ description: "Comma-separated file paths to filter by" })),
      include_stale: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params) {
      if (!binary) {
        return {
          content: [{ type: "text", text: "Neurox binary not available." }],
          details: {},
          isError: true,
        };
      }
      const input = params as RecallInput;
      const args = buildRecallArgs(input, activeConfig.default_namespace);
      const result = runNeurox(binary, args, activeConfig);
      return formatRecallResult(result, input.query, input.namespace);
    },
  });

  // ── neurox_save ────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "neurox_save",
    label: "Neurox: Save",
    description:
      "Persist an observation to durable memory. Save IMMEDIATELY when: a decision is made, a bug is fixed, a pattern is discovered, or the user states a preference. Content format: 'What: / Why: / Where: / Learned:'.",
    parameters: Type.Object({
      title: Type.String({ description: "Short, searchable title" }),
      content: Type.String({ description: "Body in What/Why/Where/Learned format" }),
      namespace: Type.Optional(Type.String()),
      type: Type.Optional(Type.Union([
        Type.Literal("decision"),
        Type.Literal("bugfix"),
        Type.Literal("discovery"),
        Type.Literal("pattern"),
        Type.Literal("gotcha"),
        Type.Literal("config"),
        Type.Literal("preference"),
      ])),
      kind: Type.Optional(Type.Union([
        Type.Literal("episodic"),
        Type.Literal("semantic"),
        Type.Literal("procedural"),
      ])),
      tags: Type.Optional(Type.String({ description: "Comma-separated tags" })),
      files: Type.Optional(Type.String({ description: "Comma-separated file paths" })),
      topic_key: Type.Optional(Type.String({ description: "Unique key for upsert" })),
      confidence: Type.Optional(Type.Number({ description: "0.0-1.0, default 0.7" })),
      retention: Type.Optional(Type.Union([
        Type.Literal("durable"),
        Type.Literal("operational"),
      ])),
    }),
    async execute(_toolCallId, params) {
      if (!binary) {
        return {
          content: [{ type: "text", text: "Neurox binary not available." }],
          details: {},
          isError: true,
        };
      }
      const args = buildSaveArgs(params as SaveInput, activeConfig.default_namespace);
      const result = runNeurox(binary, args, activeConfig);
      return formatToolResult(result, "neurox_save");
    },
  });

  // ── neurox_context ─────────────────────────────────────────────────────────
  pi.registerTool({
    name: "neurox_context",
    label: "Neurox: Context",
    description:
      "Get the most relevant prior context for the current namespace. Call once at session start (after session_start) to load decisions, patterns, and gotchas from past sessions.",
    parameters: Type.Object({
      namespace: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Number({ description: "Max results (default 20)" })),
      files: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params) {
      if (!binary) {
        return {
          content: [{ type: "text", text: "Neurox binary not available." }],
          details: {},
          isError: true,
        };
      }
      const args = buildContextArgs(params as ContextInput, activeConfig.default_namespace);
      const result = runNeurox(binary, args, activeConfig);
      return formatToolResult(result, "neurox_context");
    },
  });

  // ── neurox_session_start ───────────────────────────────────────────────────
  pi.registerTool({
    name: "neurox_session_start",
    label: "Neurox: Session Start",
    description:
      "Begin a Neurox session. Returns a session_id that must be passed to neurox_session_end at the end of the work. Call EARLY in the conversation.",
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: "Session title (e.g., the user's task)" })),
      directory: Type.Optional(Type.String({ description: "Working directory (default: cwd)" })),
      branch: Type.Optional(Type.String({ description: "Git branch" })),
      namespace: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params) {
      if (!binary) {
        return {
          content: [{ type: "text", text: "Neurox binary not available." }],
          details: {},
          isError: true,
        };
      }
      const args = buildSessionStartArgs(params as SessionStartInput, activeConfig.default_namespace);
      const result = runNeurox(binary, args, activeConfig);
      return formatToolResult(result, "neurox_session_start");
    },
  });

  // ── neurox_session_end ─────────────────────────────────────────────────────
  pi.registerTool({
    name: "neurox_session_end",
    label: "Neurox: Session End",
    description:
      "End a Neurox session with a summary. Summary format: 'Goal: ... Discoveries: ... Accomplished: ... Next: ...'.",
    parameters: Type.Object({
      session_id: Type.String({ description: "session_id returned by neurox_session_start" }),
      summary: Type.String({ description: "Summary in Goal/Discoveries/Accomplished/Next format" }),
    }),
    async execute(_toolCallId, params) {
      if (!binary) {
        return {
          content: [{ type: "text", text: "Neurox binary not available." }],
          details: {},
          isError: true,
        };
      }
      const args = buildSessionEndArgs(params as SessionEndInput);
      const result = runNeurox(binary, args, activeConfig);
      return formatToolResult(result, "neurox_session_end");
    },
  });

  // ── /neurox:status command ─────────────────────────────────────────────────
  pi.registerCommand("neurox:status", {
    description: "Show neurox binary status and configuration",
    handler: async (_args, ctx) => {
      const lines = [
        `Neurox tools:        ${binary ? "active" : "DISABLED (binary not found)"}`,
        `Binary path:         ${binary ?? "(not found)"}`,
        `Default namespace:   ${activeConfig.default_namespace}`,
        `Timeout:             ${activeConfig.timeout_seconds}s`,
      ];
      if (binary) {
        // Run `neurox status` to get brain stats
        const result = runNeurox(binary, ["status"], activeConfig);
        lines.push(``, `Brain status:`);
        if (result.ok && typeof result.data === "string") {
          lines.push(result.data);
        } else if (result.ok) {
          lines.push(JSON.stringify(result.data, null, 2).slice(0, 500));
        } else {
          lines.push(`  (status command failed: ${result.stderr.slice(0, 200)})`);
        }
      }
      ctx.ui.notify(lines.join("\n"), binary ? "info" : "warning");
    },
  });
}
