/**
 * Unit tests for dispatcher functions (pure, no Pi runtime).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResearchHint, formatResearchNotification } from "./dispatcher.js";

// ─── buildResearchHint ───────────────────────────────────────────────────────

test("buildResearchHint: returns undefined when inactive", () => {
  assert.equal(buildResearchHint("inactive"), undefined);
});

test("buildResearchHint: returns string when active", () => {
  const hint = buildResearchHint("active");
  assert.ok(typeof hint === "string" && hint.length > 0);
});

test("buildResearchHint: active hint references all 3 agent names", () => {
  const hint = buildResearchHint("active")!;
  assert.ok(hint.includes("research-neurox"));
  assert.ok(hint.includes("research-web"));
  assert.ok(hint.includes("research-code"));
});

test("buildResearchHint: active hint mentions subagent tasks pattern", () => {
  const hint = buildResearchHint("active")!;
  assert.ok(hint.includes("tasks:"));
});

test("buildResearchHint: active hint mentions neurox_save", () => {
  const hint = buildResearchHint("active")!;
  assert.ok(hint.includes("neurox_save"));
});

test("buildResearchHint: active hint mentions RESEARCH MODE header", () => {
  const hint = buildResearchHint("active")!;
  assert.ok(hint.includes("## RESEARCH MODE: active"));
});

// ─── formatResearchNotification ─────────────────────────────────────────────

test("formatResearchNotification: active includes agent list", () => {
  const msg = formatResearchNotification("active");
  assert.ok(msg.includes("neurox"));
  assert.ok(msg.includes("web"));
  assert.ok(msg.includes("code"));
});

test("formatResearchNotification: inactive signals return to normal", () => {
  const msg = formatResearchNotification("inactive");
  assert.ok(msg.includes("inactive") || msg.includes("normal"));
});

test("formatResearchNotification: both return non-empty strings", () => {
  assert.ok(formatResearchNotification("active").length > 0);
  assert.ok(formatResearchNotification("inactive").length > 0);
});
