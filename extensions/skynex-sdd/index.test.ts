import { test } from "node:test";
import assert from "node:assert/strict";
import { getSddMode, _setSddMode } from "./index.js";
import type { SddState } from "./types.js";

const SESSION_A = "/tmp/sdd-session-a.json";
const SESSION_B = "/tmp/sdd-session-b.json";

const makeState = (
  mode: SddState["mode"],
  phase: SddState["phase"] = "idle",
  featureSlug: string | null = null,
  domain: string | null = null,
): SddState => ({
  mode,
  phase,
  featureSlug,
  domain,
  toggledAt: new Date().toISOString(),
});

// ── State seeding and retrieval ───────────────────────────────────────────────

test("getSddMode: returns undefined for unknown session", () => {
  assert.equal(getSddMode("/tmp/never-seen-sdd.json"), undefined);
});

test("getSddMode: returns state after _setSddMode", () => {
  _setSddMode(SESSION_A, makeState("active", "discover", "my-feature"));
  const state = getSddMode(SESSION_A);
  assert.ok(state !== undefined);
  assert.equal(state.mode, "active");
  assert.equal(state.featureSlug, "my-feature");
  assert.equal(state.phase, "discover");
});

// ── Multi-session isolation ───────────────────────────────────────────────────

test("sessions are isolated: session A active does not affect session B", () => {
  _setSddMode(SESSION_A, makeState("active", "plan", "rebuild-auth", "auth"));
  _setSddMode(SESSION_B, makeState("inactive", "idle", null, null));

  assert.equal(getSddMode(SESSION_A)?.mode, "active");
  assert.equal(getSddMode(SESSION_A)?.featureSlug, "rebuild-auth");
  assert.equal(getSddMode(SESSION_A)?.domain, "auth");
  assert.equal(getSddMode(SESSION_A)?.phase, "plan");
  assert.equal(getSddMode(SESSION_B)?.mode, "inactive");
  assert.equal(getSddMode(SESSION_B)?.featureSlug, null);
});

// ── Toggle logic (simulated via _setSddMode) ──────────────────────────────────

test("toggle: inactive → active", () => {
  _setSddMode(SESSION_A, makeState("inactive"));
  const before = getSddMode(SESSION_A)!;
  const newMode = before.mode === "active" ? "inactive" : "active";
  _setSddMode(SESSION_A, { ...before, mode: newMode });
  assert.equal(getSddMode(SESSION_A)?.mode, "active");
});

test("toggle: active → inactive clears featureSlug, domain, and resets phase", () => {
  _setSddMode(SESSION_A, makeState("active", "validate", "my-feature", "auth"));
  const before = getSddMode(SESSION_A)!;
  const newMode = before.mode === "active" ? "inactive" : "active";
  _setSddMode(SESSION_A, {
    ...before,
    mode: newMode,
    featureSlug: null,
    domain: null,
    phase: "idle",
  });
  assert.equal(getSddMode(SESSION_A)?.mode, "inactive");
  assert.equal(getSddMode(SESSION_A)?.featureSlug, null);
  assert.equal(getSddMode(SESSION_A)?.domain, null);
  assert.equal(getSddMode(SESSION_A)?.phase, "idle");
});

// ── Feature slug and domain handling ──────────────────────────────────────────

test("featureSlug stored correctly when seeded", () => {
  _setSddMode(SESSION_A, makeState("active", "idle", "rebuild-auth-saml-sso"));
  assert.equal(getSddMode(SESSION_A)?.featureSlug, "rebuild-auth-saml-sso");
});

test("domain stored correctly when seeded", () => {
  _setSddMode(SESSION_A, makeState("active", "sync", "my-feature", "auth"));
  assert.equal(getSddMode(SESSION_A)?.domain, "auth");
});

test("phase stored and retrieved correctly for all values", () => {
  const phases: SddState["phase"][] = [
    "idle",
    "discover",
    "propose",
    "specify",
    "plan",
    "build",
    "validate",
    "sync",
    "archive",
    "complete",
  ];
  phases.forEach((phase) => {
    _setSddMode(SESSION_A, makeState("active", phase));
    assert.equal(getSddMode(SESSION_A)?.phase, phase);
  });
});

test("featureSlug is null when not provided", () => {
  _setSddMode(SESSION_A, makeState("active", "idle", null));
  assert.equal(getSddMode(SESSION_A)?.featureSlug, null);
});

test("domain is null when not resolved", () => {
  _setSddMode(SESSION_A, makeState("active", "discover", "my-feature", null));
  assert.equal(getSddMode(SESSION_A)?.domain, null);
});

// ── Ephemeral fallback ────────────────────────────────────────────────────────

test("undefined sessionFile uses ephemeral key and does not throw", () => {
  const result = getSddMode(undefined);
  assert.ok(result === undefined || typeof result?.mode === "string");
});
