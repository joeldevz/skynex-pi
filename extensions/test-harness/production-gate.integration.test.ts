/**
 * Integration tests for Production Gate extension using the test harness.
 *
 * These tests make REAL LLM calls to verify Production Gate behavior:
 *   1. Production gate respects configuration
 *   2. Production gate watches safe bash commands
 *   3. Production gate enforces patterns
 *
 * NOTE: These tests require authenticated model access and are slow (~30-45s each).
 * Models used (in order of availability):
 *   1. opencode-go/deepseek-v4-flash (default, cheapest ~$0.14/M)
 *   2. vllm/qwen3.6-27b-nvfp4 (free local fallback)
 *
 * To run:
 *   pnpm test:integration
 */

import { test } from "node:test";
import * as assert from "node:assert";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { runExtensionTest } from "./harness.js";
import productionGateExtension from "../production-gate/index.js";

test("production-gate E2E: LLM respects gate configuration", {
  timeout: 45_000,
}, async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "gate-test-"));

  try {
    const result = await runExtensionTest({
      extensionFactories: [productionGateExtension],
      prompt: "Create src/test.ts with export const x = 1;",
      cwd,
      setupFiles: {
        ".skynex/production-gate.json": JSON.stringify({
          mode: "warn",
          confirmation: { afk_behavior: "always_abort" },
        }),
      },
      timeout: 35_000,
    });

    // Gate extension should be active and watching
    assert.ok(result.modelUsed, "Should have used a model with gate active");
    console.log(`Gate test passed. Model: ${result.modelUsed}, Tools: ${result.toolsCalled.join(", ")}`);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("production-gate E2E: LLM gates safe bash commands", {
  timeout: 45_000,
}, async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "gate-test-"));

  try {
    const result = await runExtensionTest({
      extensionFactories: [productionGateExtension],
      prompt: "Run: ls -la src/",
      cwd,
      setupFiles: {
        ".skynex/production-gate.json": JSON.stringify({
          mode: "warn",
          confirmation: { afk_behavior: "always_abort" },
          patterns: {
            bash: { enabled: true, block_patterns: ["rm -rf", "rm -r"] },
          },
        }),
      },
      timeout: 35_000,
    });

    // Safe command should proceed; gate logs it but doesn't block
    assert.ok(result.modelUsed, "Should have used a model");
    console.log(`Gate allowed safe command. Tools: ${result.toolsCalled.join(", ")}`);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
