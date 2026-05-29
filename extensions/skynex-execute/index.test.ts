import { test } from "node:test";
import assert from "node:assert/strict";
import { getExecutionMode, _setExecutionMode } from "./index.js";
import type { ExecutionState } from "./types.js";

const SESSION_A = "/tmp/exec-session-a.json";
const SESSION_B = "/tmp/exec-session-b.json";

const makeState = (
  mode: ExecutionState["mode"],
  phase: ExecutionState["phase"] = "idle",
  taskKey: string | null = null,
): ExecutionState => ({
  mode,
  phase,
  taskKey,
  toggledAt: new Date().toISOString(),
});

// ── State seeding and retrieval ───────────────────────────────────────────────

test("getExecutionMode: returns undefined for unknown session", () => {
  assert.equal(getExecutionMode("/tmp/never-seen-exec.json"), undefined);
});

test("getExecutionMode: returns state after _setExecutionMode", () => {
  _setExecutionMode(SESSION_A, makeState("active", "discovery", "LMS-142"));
  const state = getExecutionMode(SESSION_A);
  assert.ok(state !== undefined);
  assert.equal(state.mode, "active");
  assert.equal(state.taskKey, "LMS-142");
  assert.equal(state.phase, "discovery");
});

// ── Multi-session isolation ───────────────────────────────────────────────────

test("sessions are isolated: session A active does not affect session B", () => {
  _setExecutionMode(SESSION_A, makeState("active", "test-audit", "PROJA-1"));
  _setExecutionMode(SESSION_B, makeState("inactive", "idle", null));

  assert.equal(getExecutionMode(SESSION_A)?.mode, "active");
  assert.equal(getExecutionMode(SESSION_A)?.taskKey, "PROJA-1");
  assert.equal(getExecutionMode(SESSION_A)?.phase, "test-audit");
  assert.equal(getExecutionMode(SESSION_B)?.mode, "inactive");
  assert.equal(getExecutionMode(SESSION_B)?.taskKey, null);
});

// ── Toggle logic (simulated via _setExecutionMode) ──────────────────────────────

test("toggle: inactive → active", () => {
  _setExecutionMode(SESSION_A, makeState("inactive"));
  const before = getExecutionMode(SESSION_A)!;
  const newMode = before.mode === "active" ? "inactive" : "active";
  _setExecutionMode(SESSION_A, { ...before, mode: newMode });
  assert.equal(getExecutionMode(SESSION_A)?.mode, "active");
});

test("toggle: active → inactive clears taskKey and resets phase", () => {
  _setExecutionMode(SESSION_A, makeState("active", "validating", "LMS-999"));
  const before = getExecutionMode(SESSION_A)!;
  const newMode = before.mode === "active" ? "inactive" : "active";
  _setExecutionMode(SESSION_A, {
    ...before,
    mode: newMode,
    taskKey: null,
    phase: "idle",
  });
  assert.equal(getExecutionMode(SESSION_A)?.mode, "inactive");
  assert.equal(getExecutionMode(SESSION_A)?.taskKey, null);
  assert.equal(getExecutionMode(SESSION_A)?.phase, "idle");
});

// ── Project key and phase handling ────────────────────────────────────────────

test("taskKey stored correctly when seeded", () => {
  _setExecutionMode(SESSION_A, makeState("active", "idle", "SKYNEX-42"));
  assert.equal(getExecutionMode(SESSION_A)?.taskKey, "SKYNEX-42");
});

test("phase stored and retrieved correctly for all values", () => {
  const phases: ExecutionState["phase"][] = [
    "idle",
    "discovery",
    "test-audit",
    "tdd-proposal",
    "generating-tests",
    "implementing",
    "validating",
    "pr-review",
    "complete",
  ];
  phases.forEach((phase) => {
    _setExecutionMode(SESSION_A, makeState("active", phase));
    assert.equal(getExecutionMode(SESSION_A)?.phase, phase);
  });
});

test("taskKey is null when not provided", () => {
  _setExecutionMode(SESSION_A, makeState("active", "idle", null));
  assert.equal(getExecutionMode(SESSION_A)?.taskKey, null);
});

// ── Ephemeral fallback ────────────────────────────────────────────────────────

test("undefined sessionFile uses ephemeral key and does not throw", () => {
  const result = getExecutionMode(undefined);
  assert.ok(result === undefined || typeof result?.mode === "string");
});
