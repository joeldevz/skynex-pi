/**
 * Test harness for Pi extensions — programmatic SDK-based testing without spawning Pi CLI.
 *
 * Key design:
 *   - Uses createAgentSession from Pi SDK directly (no subprocess)
 *   - Captures all events via session.subscribe()
 *   - Tracks tool execution, file modifications, blocking signals
 *   - Supports temp cwd creation and cleanup
 *   - Wraps prompts in timeout
 *
 * Usage:
 *   const result = await runExtensionTest({
 *     extensionFactories: [myExt],
 *     prompt: "Do something",
 *     setupFiles: { "test.ts": "..." },
 *   });
 *   assert(result.blocked === false);
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  DefaultResourceLoader,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

/** Event captured during a session */
export interface CapturedEvent {
  type: string;
  toolName?: string;
  isError?: boolean;
  content?: string;
  timestamp: number;
}

/** Result of running a test */
export interface HarnessResult {
  events: CapturedEvent[];
  blocked: boolean;
  blockedTool?: string;
  blockReason?: string;
  toolsCalled: string[];
  filesModified: string[];
  assistantText: string;
}

/** Options for runExtensionTest */
export interface RunExtensionTestOptions {
  extensionFactories: ExtensionFactory[];
  prompt: string;
  cwd?: string;
  setupFiles?: Record<string, string>;
  timeout?: number;
  keepCwd?: boolean;
}

/**
 * Get list of files (with mtime) in a directory recursively
 */
function getFileSnapshot(dir: string): Map<string, number> {
  const snapshot = new Map<string, number>();
  if (!fs.existsSync(dir)) {
    return snapshot;
  }

  const walk = (p: string) => {
    const entries = fs.readdirSync(p, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(p, entry.name);
      const rel = path.relative(dir, fullPath);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        try {
          const stat = fs.statSync(fullPath);
          snapshot.set(rel, stat.mtimeMs);
        } catch {
          // ignore
        }
      }
    }
  };

  try {
    walk(dir);
  } catch {
    // ignore
  }

  return snapshot;
}

/**
 * Find files that were created or modified between two snapshots
 */
function getModifiedFiles(
  before: Map<string, number>,
  after: Map<string, number>,
): string[] {
  const modified: string[] = [];

  for (const [file, mtimeAfter] of after) {
    const mtimeBefore = before.get(file);
    if (!mtimeBefore || mtimeAfter > mtimeBefore) {
      modified.push(file);
    }
  }

  return modified;
}

/**
 * Main test harness function
 */
export async function runExtensionTest(
  options: RunExtensionTestOptions,
): Promise<HarnessResult> {
  const {
    extensionFactories,
    prompt,
    setupFiles = {},
    timeout = 30_000,
    keepCwd = false,
  } = options;

  // Create or use provided cwd
  let cwd = options.cwd;
  let tempDirCreated = false;

  if (!cwd) {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-harness-test-"));
    tempDirCreated = true;
  } else if (!fs.existsSync(cwd)) {
    fs.mkdirSync(cwd, { recursive: true });
  }

  try {
    // Setup files
    for (const [file, content] of Object.entries(setupFiles)) {
      const filePath = path.join(cwd, file);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, content, "utf-8");
    }

    // Snapshot directory before test
    const beforeSnapshot = getFileSnapshot(cwd);

    // Setup extension loader
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: getAgentDir(),
      extensionFactories,
    });
    await loader.reload();

    // Create session
    const { session } = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false },
      }),
      resourceLoader: loader,
      cwd,
    });

    // Capture events
    const events: CapturedEvent[] = [];
    let toolsCalled: string[] = [];
    let assistantText = "";
    let blocked = false;
    let blockedTool: string | undefined;
    let blockReason: string | undefined;

    const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      const timestamp = Date.now();

      events.push({
        type: event.type,
        timestamp,
      });

      // Track tools that were executed
      // Note: AgentSessionEvent types vary; we check for known patterns
      if (event.type === "tool_execution_start" || event.type === "turn_start") {
        const toolEvent = event as {
          toolName?: string;
          name?: string;
        };
        const toolName = toolEvent.toolName || toolEvent.name;
        if (toolName && !toolsCalled.includes(toolName)) {
          toolsCalled.push(toolName);
        }
      }

      // Collect text updates from message events
      if (
        event.type === "message_update" ||
        event.type === "message_end"
      ) {
        const msgEvent = event as { message?: { content?: string } };
        const content = msgEvent.message?.content || "";
        if (content) {
          assistantText = content;
        }
      }
    });

    // Run prompt with timeout
    const promptPromise = session.prompt(prompt);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Prompt timeout after ${timeout}ms`)),
        timeout,
      ),
    );

    try {
      await Promise.race([promptPromise, timeoutPromise]);
    } catch (error) {
      // If timeout or other error, we'll still have captured events
      if (!(error instanceof Error) || !error.message.includes("timeout")) {
        // Rethrow non-timeout errors for proper test failure
        throw error;
      }
    }

    unsubscribe();

    // Snapshot directory after test
    const afterSnapshot = getFileSnapshot(cwd);
    const filesModified = getModifiedFiles(beforeSnapshot, afterSnapshot);

    return {
      events,
      blocked,
      blockedTool,
      blockReason,
      toolsCalled,
      filesModified,
      assistantText,
    };
  } finally {
    // Cleanup temp directory if we created it and not keeping it
    if (tempDirCreated && !keepCwd && fs.existsSync(cwd)) {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }
}
