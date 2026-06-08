import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSddHint, formatSddNotification } from "./dispatcher.js";
import type { SddState } from "./types.js";

// ── helpers ──────────────────────────────────────────────────────────────────

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
  toggledAt: "2026-01-01T00:00:00.000Z",
});

// ── buildSddHint ─────────────────────────────────────────────────────────────

test("buildSddHint: returns undefined when inactive", () => {
  assert.equal(buildSddHint(makeState("inactive")), undefined);
});

test("buildSddHint: returns string when active", () => {
  const hint = buildSddHint(makeState("active"))!;
  assert.ok(typeof hint === "string" && hint.length > 0);
});

test("buildSddHint: active with no featureSlug asks for feature slug", () => {
  const hint = buildSddHint(makeState("active", "idle", null))!;
  assert.ok(hint.includes("¿Qué feature querés desarrollar?"));
});

test("buildSddHint: active with featureSlug does not ask for slug", () => {
  const hint = buildSddHint(makeState("active", "idle", "rebuild-auth"))!;
  assert.ok(!hint.includes("¿Qué feature querés desarrollar?"));
  assert.ok(hint.includes("rebuild-auth"));
});

test("buildSddHint: active hint includes feature slug in output", () => {
  const hint = buildSddHint(makeState("active", "idle", "my-feature"))!;
  assert.ok(hint.includes("my-feature"));
});

test("buildSddHint: active hint includes SDD MODE header", () => {
  const hint = buildSddHint(makeState("active"))!;
  assert.ok(hint.includes("## SDD MODE: active"));
});

test("buildSddHint: active hint includes current phase", () => {
  const hint = buildSddHint(makeState("active", "plan"))!;
  assert.ok(hint.includes("Current phase: **plan**"));
});

test("buildSddHint: idle phase does not mention specific skill", () => {
  const hint = buildSddHint(makeState("active", "idle"))!;
  assert.ok(hint.includes("ask the user for the feature name"));
});

test("buildSddHint: discover phase mentions /skill:discover", () => {
  const hint = buildSddHint(makeState("active", "discover"))!;
  assert.ok(hint.includes("/skill:discover"));
});

test("buildSddHint: propose phase mentions /skill:propose", () => {
  const hint = buildSddHint(makeState("active", "propose"))!;
  assert.ok(hint.includes("/skill:propose"));
});

test("buildSddHint: specify phase mentions /skill:specify", () => {
  const hint = buildSddHint(makeState("active", "specify"))!;
  assert.ok(hint.includes("/skill:specify"));
});

test("buildSddHint: plan phase mentions UNIFIED HITL GATE", () => {
  const hint = buildSddHint(makeState("active", "plan"))!;
  assert.ok(hint.includes("HITL GATE"));
  assert.ok(hint.includes("/skill:plan"));
});

test("buildSddHint: build phase mentions /skill:build", () => {
  const hint = buildSddHint(makeState("active", "build"))!;
  assert.ok(hint.includes("/skill:build"));
});

test("buildSddHint: validate phase mentions /skill:validate", () => {
  const hint = buildSddHint(makeState("active", "validate"))!;
  assert.ok(hint.includes("/skill:validate"));
});

test("buildSddHint: sync phase mentions /skill:sync", () => {
  const hint = buildSddHint(makeState("active", "sync"))!;
  assert.ok(hint.includes("/skill:sync"));
});

test("buildSddHint: archive phase mentions /skill:archive-spec", () => {
  const hint = buildSddHint(makeState("active", "archive"))!;
  assert.ok(hint.includes("/skill:archive-spec"));
});

test("buildSddHint: complete phase mentions deactivate", () => {
  const hint = buildSddHint(makeState("active", "complete"))!;
  assert.ok(hint.includes("Deactivate"));
});

test("buildSddHint: hint includes HITL approval keywords", () => {
  const hint = buildSddHint(makeState("active"))!;
  assert.ok(hint.includes("approve"));
  assert.ok(hint.includes("dale"));
  assert.ok(hint.includes("cancel"));
});

test("buildSddHint: plan phase says STOP and present documents", () => {
  const hint = buildSddHint(makeState("active", "plan"))!;
  assert.ok(
    hint.includes("STOP") && hint.includes("proposal.md") && hint.includes("SPEC.md") && hint.includes("PLAN.md"),
    "plan phase must mention STOP + document presentation",
  );
});

// ── formatSddNotification ────────────────────────────────────────────────────

test("formatSddNotification: active with featureSlug includes slug", () => {
  const msg = formatSddNotification("active", "my-feature");
  assert.ok(msg.includes("my-feature"));
});

test("formatSddNotification: active includes flow arrow", () => {
  const msg = formatSddNotification("active", "test-feature");
  assert.ok(msg.includes("discover") && msg.includes("build") && msg.includes("sync"));
});

test("formatSddNotification: inactive signals return to normal", () => {
  const msg = formatSddNotification("inactive", null);
  assert.ok(msg.includes("inactive") || msg.includes("normal"));
});

test("formatSddNotification: active without slug does not crash", () => {
  const msg = formatSddNotification("active", null);
  assert.ok(typeof msg === "string" && msg.length > 0);
});
