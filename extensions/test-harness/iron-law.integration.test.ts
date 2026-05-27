/**
 * Integration tests for Iron Law TDD enforcement using the test harness.
 *
 * These tests make REAL LLM calls to verify Iron Law behavior:
 *   1. Iron Law blocks write to production file without test file
 *   2. Iron Law allows write when .spec.ts exists
 *   3. Iron Law with test file present allows implementation
 *
 * NOTE: These tests require authenticated model access and are slow (~30-45s each).
 * Models used (in order of availability):
 *   1. opencode-go/deepseek-v4-flash (default, cheapest ~$0.14/M)
 *   2. vllm/qwen3.6-27b-nvfp4 (free local fallback)
 *   3. openai-codex/gpt-5.3-codex-spark (free)
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
import ironLawExtension from "../iron-law/index.js";

test("iron-law E2E: LLM with Iron Law extension auto-creates tests", {
  timeout: 45_000,
}, async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "iron-law-test-"));
  
  try {
    const result = await runExtensionTest({
      extensionFactories: [ironLawExtension],
      prompt: "Write src/calc.ts with: export const add = (a: number, b: number) => a + b;",
      cwd,
      timeout: 35_000,
    });

    // Iron Law will create a test file automatically when user asks for implementation
    const testFileCreated = result.filesModified.some((f) =>
      f.includes(".test.ts") || f.includes(".spec.ts")
    );

    assert.ok(
      testFileCreated,
      `Iron Law should create test file. Files modified: ${result.filesModified.join(", ")}, Blocked: ${result.blocked}`,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("iron-law E2E: LLM with existing test file allows implementation write", {
  timeout: 45_000,
}, async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "iron-law-test-"));

  try {
    const result = await runExtensionTest({
      extensionFactories: [ironLawExtension],
      prompt:
        "Write src/math.ts: export const add = (a: number, b: number) => a + b;",
      cwd,
      setupFiles: {
        "src/math.spec.ts": "it('test', () => { /* failing test */ throw new Error('pending'); });",
      },
      timeout: 35_000,
    });

    // When .spec.ts exists, Iron Law should allow writes (or create additional test files)
    // The key is that it should NOT block the user request
    const hasMathFiles = result.filesModified.some((f) => f.includes("math"));
    assert.ok(
      hasMathFiles && !result.blocked,
      `When .spec.ts exists, should be able to write. Files: ${result.filesModified.join(", ")}, Blocked: ${result.blocked}`,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("iron-law E2E: With test file present, Iron Law operates without blocking", {
  timeout: 45_000,
}, async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "iron-law-test-"));

  try {
    const result = await runExtensionTest({
      extensionFactories: [ironLawExtension],
      prompt: "Write src/util.ts: export const greet = (name: string) => `Hello ${name}`;",
      cwd,
      setupFiles: {
        "src/util.test.ts": "it('greet works', () => { /* test pending */ });",
      },
      timeout: 35_000,
    });

    // With test file present, Iron Law should not block writes
    // Either files are created/modified or write is allowed (not blocked)
    assert.ok(
      !result.blocked,
      `With .test.ts present, Iron Law should not block. Blocked: ${result.blocked}, Block reason: ${result.blockReason}`,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
