/**
 * Unit tests for mode state management (without a live Pi runtime).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { getResearchMode, _setResearchMode } from "./index.js";

const SESSION_A = "/tmp/session-a.json";
const SESSION_B = "/tmp/session-b.json";

// ─── State seeding and retrieval ─────────────────────────────────────────────

test("getResearchMode: returns undefined for unknown session", () => {
  assert.equal(getResearchMode("/tmp/never-seen.json"), undefined);
});

test("getResearchMode: returns state after _setResearchMode", () => {
  _setResearchMode(SESSION_A, { mode: "active", toggledAt: "2026-01-01T00:00:00.000Z" });
  const state = getResearchMode(SESSION_A);
  assert.ok(state !== undefined);
  assert.equal(state.mode, "active");
});

// ─── Multi-session isolation ──────────────────────────────────────────────────

test("sessions are isolated: session A active does not affect session B", () => {
  _setResearchMode(SESSION_A, { mode: "active", toggledAt: new Date().toISOString() });
  _setResearchMode(SESSION_B, { mode: "inactive", toggledAt: new Date().toISOString() });

  assert.equal(getResearchMode(SESSION_A)?.mode, "active");
  assert.equal(getResearchMode(SESSION_B)?.mode, "inactive");
});

// ─── Toggle logic (simulated via _setResearchMode) ────────────────────────────

test("toggle: inactive → active", () => {
  _setResearchMode(SESSION_A, { mode: "inactive", toggledAt: new Date().toISOString() });
  const before = getResearchMode(SESSION_A)!;
  const newMode = before.mode === "active" ? "inactive" : "active";
  _setResearchMode(SESSION_A, { mode: newMode, toggledAt: new Date().toISOString() });
  assert.equal(getResearchMode(SESSION_A)?.mode, "active");
});

test("toggle: active → inactive", () => {
  _setResearchMode(SESSION_A, { mode: "active", toggledAt: new Date().toISOString() });
  const before = getResearchMode(SESSION_A)!;
  const newMode = before.mode === "active" ? "inactive" : "active";
  _setResearchMode(SESSION_A, { mode: newMode, toggledAt: new Date().toISOString() });
  assert.equal(getResearchMode(SESSION_A)?.mode, "inactive");
});

// ─── Ephemeral fallback ───────────────────────────────────────────────────────

test("undefined sessionFile uses process.pid-based ephemeral key", () => {
  // Should not throw and should return undefined (no state seeded for this key)
  const result = getResearchMode(undefined);
  // We can't assert specific state here, but it must not throw
  assert.ok(result === undefined || typeof result?.mode === "string");
});
