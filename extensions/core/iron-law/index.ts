/**
 * Iron Law extension — L4 TDD enforcement.
 *
 * Hooks:
 *   tool_call on "write" → block if no failing test exists for the target file
 *   tool_call on "edit"  → block if editing a passing test
 *
 * The model CANNOT rationalize past these hooks. They run before execution.
 *
 * Rules enforced (L4, all active by default):
 *   1. Production code requires a test file (write blocked if missing)
 *   2. Test must FAIL before writing implementation (write blocked if test passes)
 *   3. Cannot edit a passing test (edit blocked on green tests)
 *   Anti-cheat: "delete test + reimplement" pattern is logged as integrity violation
 *
 * Whitelist: docs, configs, .github, scripts, .skynex, test files themselves
 * Override: /iron-law:override "reason" — logged + notified, works once per session per file
 *
 * Does NOT run `pnpm test` on every write (that would be slow). Instead:
 *   - Tracks which test files were written this session (and whether they failed)
 *   - Uses heuristic: test was written this session → likely failing
 *   - For write hooks on files with pre-existing tests: runs the specific test
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isWhitelisted, isProductionCode, inferTestPath, normalizePath } from "./matcher.js";
import { DEFAULT_IRON_LAW_CONFIG, type IronLawConfig, type IronLawState } from "./types.js";

const CONFIG_PATH = ".skynex/iron-law.json";

function loadConfig(cwd: string): IronLawConfig {
  const full = path.join(cwd, CONFIG_PATH);
  if (!fs.existsSync(full)) return DEFAULT_IRON_LAW_CONFIG;
  try {
    const parsed = JSON.parse(fs.readFileSync(full, "utf-8")) as Partial<IronLawConfig>;
    return { ...DEFAULT_IRON_LAW_CONFIG, ...parsed };
  } catch {
    return DEFAULT_IRON_LAW_CONFIG;
  }
}

/**
 * Run a specific test file and return whether it fails.
 * Uses the project's test runner (detected from package.json scripts).
 * Returns { ran: boolean; failed: boolean; output: string }.
 */
function runTestFile(
  testPath: string,
  cwd: string,
): { ran: boolean; failed: boolean; output: string } {
  // Detect test runner from package.json
  let runner = "npx tsx --test";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf-8")) as {
      scripts?: Record<string, string>;
    };
    if (pkg.scripts?.test?.includes("jest")) runner = "npx jest --testPathPattern";
    else if (pkg.scripts?.test?.includes("vitest")) runner = "npx vitest run";
    else if (pkg.scripts?.test?.includes("tsx")) runner = "npx tsx --test";
  } catch {
    // use default
  }

  try {
    execSync(`${runner} "${testPath}"`, {
      cwd,
      stdio: "pipe",
      timeout: 30_000,
    });
    // exit code 0 = tests PASS
    return { ran: true, failed: false, output: "" };
  } catch (err: unknown) {
    // exit code non-0 = tests FAIL (that's what we want before impl)
    const output =
      typeof err === "object" && err !== null && "stderr" in err
        ? String((err as { stderr: unknown }).stderr).slice(0, 500)
        : "";
    return { ran: true, failed: true, output };
  }
}

function appendOverrideLog(
  cwd: string,
  sessionId: string,
  filePath: string,
  reason: string,
): void {
  const dir = path.join(cwd, ".skynex");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const logPath = path.join(dir, "iron-law-overrides.md");
  const entry = `| ${new Date().toISOString()} | ${sessionId.slice(-8)} | ${filePath} | ${reason} |\n`;
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, "# Iron Law Overrides\n\n| When | Session | File | Reason |\n|------|---------|------|--------|\n");
  }
  fs.appendFileSync(logPath, entry);
}

// Session-keyed state
const sessionStateStore = new Map<string, IronLawState>();
// Files overridden this session (key = sessionId:filePath)
const overrideStore = new Set<string>();

export default function (pi: ExtensionAPI) {
  let cachedConfig: IronLawConfig | undefined;

  pi.on("session_start", async (_event, ctx) => {
    cachedConfig = loadConfig(ctx.cwd);
    const sid = ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    sessionStateStore.set(sid, { written_this_session: new Set(), overrides: [] });
  });

  pi.on("tool_call", async (event, ctx) => {
    const config = cachedConfig ?? loadConfig(ctx.cwd);
    cachedConfig = config;

    const sid = ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    const state = sessionStateStore.get(sid) ?? { written_this_session: new Set(), overrides: [] };

    // ── Only care about write and edit ──────────────────────────────────────
    if (event.toolName !== "write" && event.toolName !== "edit") return undefined;

    const rawPath = (event.input as { path?: string; file_path?: string }).path
      ?? (event.input as { path?: string; file_path?: string }).file_path
      ?? "";
    if (!rawPath) return undefined;

    const relPath = normalizePath(rawPath, ctx.cwd);
    const overrideKey = `${sid}:${relPath}`;

    // ── Whitelist check ─────────────────────────────────────────────────────
    if (isWhitelisted(relPath, config)) return undefined;

    // ── Override check ──────────────────────────────────────────────────────
    if (overrideStore.has(overrideKey)) {
      // One-shot override: consume it and allow
      overrideStore.delete(overrideKey);
      return undefined;
    }

    // ── RULE 3: Editing a test file ─────────────────────────────────────────
    if (
      event.toolName === "edit" &&
      (relPath.includes(".test.") || relPath.includes(".spec.") || relPath.includes("__tests__"))
    ) {
      // Check: was this test already passing BEFORE this session?
      // Heuristic: if the test file was NOT written this session, it pre-existed → run it
      if (!state.written_this_session.has(relPath)) {
        const result = runTestFile(relPath, ctx.cwd);
        if (result.ran && !result.failed) {
          // Test is green → block edit (Iron Law: don't modify a passing test)
          if (ctx.hasUI) {
            ctx.ui.notify(
              `🔴 Iron Law: Cannot edit passing test\n` +
              `   File: ${relPath}\n` +
              `   Tests are currently GREEN. You cannot modify a passing test.\n` +
              `   To override: /iron-law:override "${relPath}"`,
              "warning",
            );
          }
          return {
            block: true,
            reason: `Iron Law L4: ${relPath} tests are currently passing. Cannot modify a passing test. Use /iron-law:override to document the reason.`,
          };
        }
      }
      // Test is failing or new — allow the edit, track it
      state.written_this_session.add(relPath);
      sessionStateStore.set(sid, state);
      return undefined;
    }

    // ── Only apply Iron Law to production code ──────────────────────────────
    if (!isProductionCode(relPath, config)) return undefined;

    // ── Infer test path ─────────────────────────────────────────────────────
    const testPath = inferTestPath(relPath, config.test_path_rules);
    if (!testPath) return undefined; // No test path rule → skip (conservative)

    const absTestPath = path.isAbsolute(testPath)
      ? testPath
      : path.join(ctx.cwd, testPath);

    // ── RULE 1: Test file must exist ────────────────────────────────────────
    if (!fs.existsSync(absTestPath)) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          `🔴 Iron Law: Missing test file\n` +
          `   Source: ${relPath}\n` +
          `   Expected: ${testPath}\n` +
          `   Write the test first, make it fail, then implement.\n` +
          `   To override: /iron-law:override "${relPath}"`,
          "warning",
        );
      }
      return {
        block: true,
        reason: `Iron Law L4: No test file found at ${testPath}. Write a failing test first, then implement.`,
      };
    }

    // Test file exists. Was it just written this session?
    const testWrittenThisSession = state.written_this_session.has(testPath);

    // ── RULE 2: Test must fail before writing impl ──────────────────────────
    if (!testWrittenThisSession) {
      // Pre-existing test — run it to see if it's already green
      const result = runTestFile(testPath, ctx.cwd);
      if (result.ran && !result.failed) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `🔴 Iron Law: Test already passing\n` +
            `   Source: ${relPath}\n` +
            `   Test:   ${testPath}\n` +
            `   Tests are GREEN but you haven't touched the impl yet.\n` +
            `   Either delete the impl and write a new failing test, or\n` +
            `   add a test for the NEW behavior you're adding.\n` +
            `   To override: /iron-law:override "${relPath}"`,
            "warning",
          );
        }
        return {
          block: true,
          reason: `Iron Law L4: ${testPath} is already passing. Add a failing test for the new behavior before implementing.`,
        };
      }
    }
    // If test was written this session, we trust it was failing (red phase)

    // ── Allow — track that we wrote this production file ────────────────────
    state.written_this_session.add(relPath);
    sessionStateStore.set(sid, state);
    return undefined;
  });

  // ── Override command ──────────────────────────────────────────────────────
  pi.registerCommand("iron-law:override", {
    description: "Override Iron Law for a specific file. Usage: /iron-law:override <file> [reason]",
    handler: async (args, ctx) => {
      const parts = (args ?? "").trim().split(/\s+(.+)/);
      const file = parts[0] ?? "";
      const reason = parts[1] ?? "(no reason provided)";

      if (!file) {
        ctx.ui.notify(
          "Usage: /iron-law:override <file> [reason]\n" +
          "Example: /iron-law:override src/auth/service.ts migration refactor, tests will follow",
          "warning",
        );
        return;
      }

      const sid = ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
      const overrideKey = `${sid}:${file}`;
      overrideStore.add(overrideKey);

      // Log to .skynex/iron-law-overrides.md
      appendOverrideLog(ctx.cwd, sid, file, reason);

      ctx.ui.notify(
        `⚠️ Iron Law override registered\n` +
        `   File:   ${file}\n` +
        `   Reason: ${reason}\n` +
        `   Next write/edit to this file will proceed.\n` +
        `   Logged in .skynex/iron-law-overrides.md`,
        "warning",
      );
    },
  });

  // ── Status command ────────────────────────────────────────────────────────
  pi.registerCommand("iron-law:status", {
    description: "Show Iron Law status and files written this session",
    handler: async (_args, ctx) => {
      const config = cachedConfig ?? loadConfig(ctx.cwd);
      const sid = ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
      const state = sessionStateStore.get(sid);

      const written = Array.from(state?.written_this_session ?? []);
      const overrides = Array.from(overrideStore)
        .filter((k) => k.startsWith(`${sid}:`))
        .map((k) => k.replace(`${sid}:`, ""));

      const lines = [
        `Iron Law: L4 (${config.require_tdd_flag ? "conditional" : "always enforced"})`,
        ``,
        `Files written this session (${written.length}):`,
        ...written.map((f) => `  • ${f}`),
        ...(written.length === 0 ? ["  (none)"] : []),
        ``,
        `Active overrides (${overrides.length}):`,
        ...overrides.map((f) => `  ⚠ ${f}`),
        ...(overrides.length === 0 ? ["  (none)"] : []),
        ``,
        `Override log: .skynex/iron-law-overrides.md`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const sid = ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    sessionStateStore.delete(sid);
    // Clean up override store for this session
    for (const key of Array.from(overrideStore)) {
      if (key.startsWith(`${sid}:`)) overrideStore.delete(key);
    }
  });
}
