/**
 * Unit tests for dispatcher functions (pure, no Pi runtime).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTaskHint, formatTaskNotification } from "./dispatcher.js";
import type { TaskCreationState } from "./types.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const makeState = (
  mode: TaskCreationState["mode"],
  projectKey: string | null = null,
): TaskCreationState => ({
  mode,
  toggledAt: "2026-01-01T00:00:00.000Z",
  projectKey,
  draft: null,
});

// ── buildTaskHint ─────────────────────────────────────────────────────────────

test("buildTaskHint: returns undefined when inactive", () => {
  assert.equal(buildTaskHint(makeState("inactive")), undefined);
});

test("buildTaskHint: returns string when active", () => {
  const hint = buildTaskHint(makeState("active"));
  assert.ok(typeof hint === "string" && hint.length > 0);
});

test("buildTaskHint: active with no projectKey asks for project", () => {
  const hint = buildTaskHint(makeState("active", null))!;
  assert.ok(hint.includes("¿En qué proyecto de Jira?"));
});

test("buildTaskHint: active with projectKey does not ask for project", () => {
  const hint = buildTaskHint(makeState("active", "MYPROJ"))!;
  assert.ok(!hint.includes("¿En qué proyecto de Jira?"));
  assert.ok(hint.includes("MYPROJ"));
});

test("buildTaskHint: active hint references TASK CREATION MODE header", () => {
  const hint = buildTaskHint(makeState("active"))!;
  assert.ok(hint.includes("## TASK CREATION MODE: active"));
});

test("buildTaskHint: active hint mentions all 4 steps", () => {
  const hint = buildTaskHint(makeState("active"))!;
  assert.ok(hint.includes("GRILL"));
  assert.ok(hint.includes("DECOMPOSE"));
  assert.ok(hint.includes("DRAFT REVIEW"));
  assert.ok(hint.includes("JIRA CREATION"));
});

test("buildTaskHint: active hint mentions mcp_Atlassian_createJiraIssue", () => {
  const hint = buildTaskHint(makeState("active"))!;
  assert.ok(hint.includes("mcp_Atlassian_createJiraIssue"));
});

test("buildTaskHint: active hint includes HITL approval keywords", () => {
  const hint = buildTaskHint(makeState("active"))!;
  assert.ok(hint.includes("dale"));
  assert.ok(hint.includes("cancel"));
});

// ── formatTaskNotification ────────────────────────────────────────────────────

test("formatTaskNotification: active with projectKey includes project key", () => {
  const msg = formatTaskNotification("active", "PROJ");
  assert.ok(msg.includes("PROJ"));
});

test("formatTaskNotification: active without projectKey still returns active string", () => {
  const msg = formatTaskNotification("active", null);
  assert.ok(msg.includes("active"));
});

test("formatTaskNotification: inactive signals return to normal", () => {
  const msg = formatTaskNotification("inactive", null);
  assert.ok(msg.includes("inactive") || msg.includes("normal"));
});

test("formatTaskNotification: both return non-empty strings", () => {
  assert.ok(formatTaskNotification("active", null).length > 0);
  assert.ok(formatTaskNotification("inactive", null).length > 0);
});
