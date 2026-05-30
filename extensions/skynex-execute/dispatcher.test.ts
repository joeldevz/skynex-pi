import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExecutionHint, formatExecutionNotification } from "./dispatcher.js";
import type { ExecutionState } from "./types.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const makeState = (
  mode: ExecutionState["mode"],
  phase: ExecutionState["phase"] = "idle",
  taskKey: string | null = null,
): ExecutionState => ({
  mode,
  phase,
  taskKey,
  toggledAt: "2026-01-01T00:00:00.000Z",
});

// ── buildExecutionHint ───────────────────────────────────────────────────────

test("buildExecutionHint: returns undefined when inactive", () => {
  assert.equal(buildExecutionHint(makeState("inactive")), undefined);
});

test("buildExecutionHint: returns string when active", () => {
  const hint = buildExecutionHint(makeState("active"));
  assert.ok(typeof hint === "string" && hint.length > 0);
});

test("buildExecutionHint: active with no taskKey asks for task key", () => {
  const hint = buildExecutionHint(makeState("active", "idle", null))!;
  assert.ok(hint.includes("¿Cuál es la task key?"));
});

test("buildExecutionHint: active with taskKey does not ask for task key", () => {
  const hint = buildExecutionHint(makeState("active", "idle", "LMS-142"))!;
  assert.ok(!hint.includes("¿Cuál es la task key?"));
  assert.ok(hint.includes("LMS-142"));
});

test("buildExecutionHint: active hint includes task key in output", () => {
  const hint = buildExecutionHint(makeState("active", "idle", "LMS-999"))!;
  assert.ok(hint.includes("LMS-999"));
});

test("buildExecutionHint: active hint includes EXECUTION MODE header", () => {
  const hint = buildExecutionHint(makeState("active"))!;
  assert.ok(hint.includes("## EXECUTION MODE: active"));
});

test("buildExecutionHint: active hint includes current phase", () => {
  const hint = buildExecutionHint(makeState("active", "tdd-proposal"))!;
  assert.ok(hint.includes("Current phase: **tdd-proposal**"));
});

test("buildExecutionHint: idle phase mentions STEP 1", () => {
  const hint = buildExecutionHint(makeState("active", "idle"))!;
  assert.ok(hint.includes("STEP 1"));
});

test("buildExecutionHint: tdd-proposal phase mentions HITL GATE", () => {
  const hint = buildExecutionHint(makeState("active", "tdd-proposal"))!;
  assert.ok(hint.includes("HITL GATE"));
});

test("buildExecutionHint: discovery phase mentions STEP 2", () => {
  const hint = buildExecutionHint(makeState("active", "discovery"))!;
  assert.ok(hint.includes("STEP 2"));
});

test("buildExecutionHint: discovery phase enforces targeted scope (not full codebase)", () => {
  const hint = buildExecutionHint(makeState("active", "discovery"))!;
  // The fix: discovery must instruct scout to read ONLY task-referenced files
  assert.ok(/targeted/i.test(hint), "discovery hint must mention 'targeted'");
  assert.ok(
    /only/i.test(hint),
    "discovery hint must instruct reading ONLY referenced files",
  );
});

test("buildExecutionHint: discovery phase sets a hard file limit", () => {
  const hint = buildExecutionHint(makeState("active", "discovery"))!;
  // Must carry an explicit file cap so the model doesn't over-explore
  assert.ok(
    /8 files|HARD LIMIT|limit/i.test(hint),
    "discovery hint must set an explicit file limit",
  );
});

test("buildExecutionHint: discovery phase forbids exploring unrelated modules", () => {
  const hint = buildExecutionHint(makeState("active", "discovery"))!;
  assert.ok(
    /do NOT explore|unrelated|not.*whole codebase/i.test(hint),
    "discovery hint must forbid broad exploration",
  );
});

test("buildExecutionHint: generating-tests phase mentions coder and FAIL", () => {
  const hint = buildExecutionHint(makeState("active", "generating-tests"))!;
  assert.ok(hint.includes("coder"));
  assert.ok(hint.includes("FAIL"));
});

test("buildExecutionHint: complete phase mentions deactivate", () => {
  const hint = buildExecutionHint(makeState("active", "complete"))!;
  assert.ok(hint.includes("Deactivate"));
});

test("buildExecutionHint: hint includes HITL approval keywords", () => {
  const hint = buildExecutionHint(makeState("active"))!;
  assert.ok(hint.includes("approve"));
  assert.ok(hint.includes("dale"));
  assert.ok(hint.includes("cancel"));
});

// ── formatExecutionNotification ──────────────────────────────────────────────

test("formatExecutionNotification: active with taskKey includes task key", () => {
  const msg = formatExecutionNotification("active", "LMS-42");
  assert.ok(msg.includes("LMS-42"));
});

test("formatExecutionNotification: inactive signals return to normal", () => {
  const msg = formatExecutionNotification("inactive", null);
  assert.ok(msg.includes("inactive") || msg.includes("normal"));
});
