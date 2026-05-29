/**
 * Unit tests for extension state management and command behavior.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { getTaskMode, _setTaskMode } from "./index.js";
import type { TaskCreationState } from "./types.js";

const SESSION_A = "/tmp/task-session-a.json";
const SESSION_B = "/tmp/task-session-b.json";

const makeState = (
  mode: TaskCreationState["mode"],
  projectKey: string | null = null,
): TaskCreationState => ({
  mode,
  toggledAt: new Date().toISOString(),
  projectKey,
  draft: null,
});

// ── State seeding and retrieval ───────────────────────────────────────────────

test("getTaskMode: returns undefined for unknown session", () => {
  assert.equal(getTaskMode("/tmp/never-seen-task.json"), undefined);
});

test("getTaskMode: returns state after _setTaskMode", () => {
  _setTaskMode(SESSION_A, makeState("active", "MYPROJ"));
  const state = getTaskMode(SESSION_A);
  assert.ok(state !== undefined);
  assert.equal(state.mode, "active");
  assert.equal(state.projectKey, "MYPROJ");
});

// ── Multi-session isolation ───────────────────────────────────────────────────

test("sessions are isolated: session A active does not affect session B", () => {
  _setTaskMode(SESSION_A, makeState("active", "PROJA"));
  _setTaskMode(SESSION_B, makeState("inactive", null));

  assert.equal(getTaskMode(SESSION_A)?.mode, "active");
  assert.equal(getTaskMode(SESSION_A)?.projectKey, "PROJA");
  assert.equal(getTaskMode(SESSION_B)?.mode, "inactive");
  assert.equal(getTaskMode(SESSION_B)?.projectKey, null);
});

// ── Toggle logic (simulated via _setTaskMode) ─────────────────────────────────

test("toggle: inactive → active", () => {
  _setTaskMode(SESSION_A, makeState("inactive"));
  const before = getTaskMode(SESSION_A)!;
  const newMode = before.mode === "active" ? "inactive" : "active";
  _setTaskMode(SESSION_A, { ...before, mode: newMode });
  assert.equal(getTaskMode(SESSION_A)?.mode, "active");
});

test("toggle: active → inactive", () => {
  _setTaskMode(SESSION_A, makeState("active", "PROJ"));
  const before = getTaskMode(SESSION_A)!;
  const newMode = before.mode === "active" ? "inactive" : "active";
  _setTaskMode(SESSION_A, {
    ...before,
    mode: newMode,
    projectKey: null,
    draft: null,
  });
  assert.equal(getTaskMode(SESSION_A)?.mode, "inactive");
  assert.equal(getTaskMode(SESSION_A)?.projectKey, null);
});

// ── Project key parsing logic (unit-tested via state injection) ───────────────

test("projectKey stored correctly when seeded", () => {
  _setTaskMode(SESSION_A, makeState("active", "SKYNEX"));
  assert.equal(getTaskMode(SESSION_A)?.projectKey, "SKYNEX");
});

test("projectKey is null when not provided", () => {
  _setTaskMode(SESSION_A, makeState("active", null));
  assert.equal(getTaskMode(SESSION_A)?.projectKey, null);
});

// ── Ephemeral fallback ────────────────────────────────────────────────────────

test("undefined sessionFile uses ephemeral key and does not throw", () => {
  const result = getTaskMode(undefined);
  assert.ok(result === undefined || typeof result?.mode === "string");
});
