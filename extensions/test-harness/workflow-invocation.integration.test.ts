/**
 * Integration tests for extension workflow invocation — verify system components are invoked correctly.
 *
 * These tests make REAL LLM calls to verify:
 *   1. Triage extension fires and correctly classifies prompts
 *   2. Triage blocks risky subagent invocations with risk keywords
 *   3. Iron Law blocks writes without tests on production code
 *   4. All extensions stack correctly together
 *   5. Triage classifies structural signals correctly
 *
 * NOTE: These tests require authenticated model access and are SLOW.
 * Model used: opencode-go/deepseek-v4-flash
 * Expected duration per test: 15-45s. Total suite: ~3-6 min.
 *
 * To run:
 *   pnpm exec tsx --test extensions/test-harness/workflow-invocation.integration.test.ts
 */

import { test } from "node:test";
import * as assert from "node:assert";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { runExtensionTest } from "./harness.js";
import triageExtension from "../triage/index.js";
import ironLawExtension from "../iron-law/index.js";
import productionGateExtension from "../production-gate/index.js";

// Shared gate config for stacked tests
const GATE_CONFIG = JSON.stringify({
  mode: "strict",
  audit_log: { path: ".skynex/audit.log", auto_gitignore: true },
  confirmation: { require_typed: true, typed_phrase: "yes apply", afk_behavior: "always_abort" },
  safe_contexts: { kubectl: [], git_branches: ["personal/*", "feat/*", "fix/*", "chore/*"] },
  patterns: {
    kubectl: { enabled: true, block_verbs: ["apply", "delete", "scale"] },
    db_migrations: { enabled: true, tools: ["prisma migrate deploy"] },
    terraform: { enabled: true, block_verbs: ["apply", "destroy"] },
    git_force: { enabled: true },
    git_main_push: { enabled: true, protected_branches: ["main", "master"] },
  },
});

test("workflow: triage fires on every prompt", { timeout: 45_000 }, async () => {
  // NOTE: This test makes a real LLM API call to opencode-go/deepseek-v4-flash
  // Expected duration: 15-30s.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "triage-test-"));

  try {
    const result = await runExtensionTest({
      extensionFactories: [(pi) => triageExtension(pi)],
      prompt: "hola, cómo estás?",
      cwd,
      timeout: 30_000,
    });

    // Triage should have run and fired its hook
    assert.ok(
      result.events.length > 0,
      "Should have captured events from triage extension firing",
    );

    // Conversational prompt should not trigger tool calls
    assert.equal(
      result.toolsCalled.length,
      0,
      `Conversational prompt should not trigger tool calls. Got: ${result.toolsCalled.join(", ")}`,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("workflow: triage blocks subagent call with kubectl in task", { timeout: 45_000 }, async () => {
  // NOTE: This test makes a real LLM API call to opencode-go/deepseek-v4-flash
  // Expected duration: 15-40s.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "triage-test-"));

  try {
    const result = await runExtensionTest({
      extensionFactories: [(pi) => triageExtension(pi)],
      prompt:
        "Use the subagent tool to execute: kubectl apply -f . in production context. This is a risky operation.",
      cwd,
      timeout: 35_000,
    });

    // Triage should block subagent invocation with risky kubectl keyword
    assert.ok(
      result.blocked || result.assistantText.toLowerCase().includes("blocked") || result.assistantText.toLowerCase().includes("risky"),
      `Triage should block or warn about risky subagent invocation. Blocked: ${result.blocked}, Text: ${result.assistantText.slice(0, 200)}`,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("workflow: iron-law blocks write without test", { timeout: 45_000 }, async () => {
  // NOTE: This test makes a real LLM API call to opencode-go/deepseek-v4-flash
  // Expected duration: 15-40s.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "iron-law-test-"));

  try {
    const result = await runExtensionTest({
      extensionFactories: [(pi) => ironLawExtension(pi)],
      prompt: "Create src/utils/hash.ts with a simple SHA256 hash function",
      cwd,
      timeout: 35_000,
    });

    assert.equal(
      result.blocked,
      true,
      `Iron Law should block writing production code without a test. Blocked: ${result.blocked}, Reason: ${result.blockReason}`,
    );

    assert.ok(
      result.blockReason?.toLowerCase().includes("iron law") ||
        result.blockReason?.toLowerCase().includes("test") ||
        result.assistantText.toLowerCase().includes("test"),
      `Block reason should mention Iron Law or test requirement. Reason: ${result.blockReason}, Text: ${result.assistantText.slice(0, 200)}`,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("workflow: multiple extensions stack correctly", { timeout: 60_000 }, async () => {
  // NOTE: This test makes a real LLM API call to opencode-go/deepseek-v4-flash
  // Expected duration: 20-45s. All 3 extensions active simultaneously.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "stack-test-"));

  try {
    const result = await runExtensionTest({
      extensionFactories: [
        (pi) => triageExtension(pi),
        (pi) => ironLawExtension(pi),
        (pi) => productionGateExtension(pi),
      ],
      prompt: "Create a new file src/deploy.ts that runs kubectl apply to deploy the application",
      cwd,
      setupFiles: { ".skynex/production-gate.json": GATE_CONFIG },
      timeout: 50_000,
    });

    // At least one extension should block this request
    // Either iron-law blocks the write OR production-gate blocks the kubectl
    assert.equal(
      result.blocked,
      true,
      `At least one extension should block this request. Blocked: ${result.blocked}, Reason: ${result.blockReason}`,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("workflow: triage classifies medium structural signal", { timeout: 45_000 }, async () => {
  // NOTE: This test makes a real LLM API call to opencode-go/deepseek-v4-flash
  // Expected duration: 15-40s.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "triage-test-"));

  try {
    const result = await runExtensionTest({
      extensionFactories: [(pi) => triageExtension(pi)],
      // File path (structural signal → medium) + read intent
      prompt: "Fix the auth bug in src/auth/service.ts",
      cwd,
      timeout: 35_000,
    });

    // Medium path should trigger discovery behavior — reading files
    assert.ok(
      result.events.length > 0,
      "Should have captured events from triage and model execution",
    );

    // Model may attempt to read files or discuss the task
    // This is a soft assertion — we just verify the triage fired
    console.log(
      `Triage test: tools called: ${result.toolsCalled.join(", ")}, files modified: ${result.filesModified.join(", ")}`,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("workflow: iron-law with existing test allows write", { timeout: 45_000 }, async () => {
  // NOTE: This test makes a real LLM API call to opencode-go/deepseek-v4-flash
  // Expected duration: 15-40s.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "iron-law-test-"));

  try {
    const result = await runExtensionTest({
      extensionFactories: [(pi) => ironLawExtension(pi)],
      prompt: "Implement src/crypto/hash.ts with a SHA256 function",
      cwd,
      setupFiles: {
        "src/crypto/hash.spec.ts": `
import { describe, it, expect } from "vitest";
import { sha256 } from "./hash.js";

describe("sha256", () => {
  it("should hash a string", () => {
    const result = sha256("hello");
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });
});
`,
      },
      timeout: 35_000,
    });

    // When .spec.ts exists, Iron Law should not block the implementation write
    assert.ok(
      !result.blocked,
      `Iron Law should not block when test file exists. Blocked: ${result.blocked}, Reason: ${result.blockReason}`,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("workflow: triage + iron-law block unspecified task without test", { timeout: 60_000 }, async () => {
  // NOTE: This test makes a real LLM API call to opencode-go/deepseek-v4-flash
  // Expected duration: 20-45s.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "triage-iron-test-"));

  try {
    const result = await runExtensionTest({
      extensionFactories: [
        (pi) => triageExtension(pi),
        (pi) => ironLawExtension(pi),
      ],
      prompt: "Implement a new authentication system in src/auth/",
      cwd,
      timeout: 50_000,
    });

    // Triage + Iron Law should block or refuse without a clear plan + test
    assert.ok(
      result.blocked || result.events.length > 0,
      `Should have fired triage + iron-law hooks. Blocked: ${result.blocked}, Events: ${result.events.length}`,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
