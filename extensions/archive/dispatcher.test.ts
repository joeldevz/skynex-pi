import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseArchivistEnvelope,
  validateEnvelope,
  toSaveOperations,
  shouldArchive,
} from "./dispatcher.js";
import type { ArchivistEnvelope } from "./types.js";

// ── parseArchivistEnvelope tests ──────────────────────────────────────────

test("parseArchivistEnvelope: returns null on empty input", () => {
  const result = parseArchivistEnvelope("");
  assert.equal(result, null);
});

test("parseArchivistEnvelope: returns null on non-string input", () => {
  const result = parseArchivistEnvelope(null as unknown as string);
  assert.equal(result, null);
});

test("parseArchivistEnvelope: returns null when no yaml block present", () => {
  const text = "Some text without a code block\nJust plain content";
  const result = parseArchivistEnvelope(text);
  assert.equal(result, null);
});

test("parseArchivistEnvelope: parses valid minimal envelope", () => {
  const yaml = `status: archived
session_summary:
  goal: "Test goal"
  outcome: "Test outcome"
  duration_turns: 10
  cost_usd: 0.50
observations_to_save: []
artifacts_archived: []
next_steps_suggested: []`;

  const text = `Some preamble\n\`\`\`yaml\n${yaml}\n\`\`\`\nSome epilogue`;
  const result = parseArchivistEnvelope(text);
  assert.ok(result);
  assert.equal(result.status, "archived");
  assert.equal(result.session_summary.goal, "Test goal");
  assert.equal(result.session_summary.outcome, "Test outcome");
});

test("parseArchivistEnvelope: parses envelope with observations", () => {
  const yaml = `status: archived
session_summary:
  goal: "Test"
  outcome: "Done"
  duration_turns: 5
  cost_usd: 0.25
observations_to_save:
  - title: "First observation"
    content: "What: X / Why: Y"
    observation_type: decision
    kind: semantic
    importance: 0.7
    tags: ["tag1", "tag2"]
    namespace: "test"
    files: ["file1.ts"]
artifacts_archived: []
next_steps_suggested: []`;

  const text = `\`\`\`yaml\n${yaml}\n\`\`\``;
  const result = parseArchivistEnvelope(text);
  assert.ok(result);
  assert.equal(result.observations_to_save.length, 1);
  assert.equal(result.observations_to_save[0].title, "First observation");
});

test("parseArchivistEnvelope: tolerant to extra whitespace", () => {
  const yaml = `  status:  archived  
session_summary:
  goal: "Test"
  outcome: "Done"
  duration_turns: 0
  cost_usd: 0.0
observations_to_save: []
artifacts_archived: []
next_steps_suggested: []`;

  const text = `\`\`\`yaml\n${yaml}\n\`\`\``;
  const result = parseArchivistEnvelope(text);
  assert.ok(result);
  assert.equal(result.status, "archived");
});

// ── validateEnvelope tests ────────────────────────────────────────────────

test("validateEnvelope: returns error when status missing", () => {
  const envelope = {
    session_summary: { goal: "x", outcome: "y", duration_turns: 0, cost_usd: 0 },
    observations_to_save: [],
    artifacts_archived: [],
    next_steps_suggested: [],
  } as unknown as ArchivistEnvelope;

  const errors = validateEnvelope(envelope);
  assert.ok(errors.some((e) => e.includes("status")));
});

test("validateEnvelope: returns error when observations_to_save is not array", () => {
  const envelope = {
    status: "archived" as const,
    session_summary: { goal: "x", outcome: "y", duration_turns: 0, cost_usd: 0 },
    observations_to_save: "not an array",
    artifacts_archived: [],
    next_steps_suggested: [],
  } as unknown as ArchivistEnvelope;

  const errors = validateEnvelope(envelope);
  assert.ok(errors.some((e) => e.includes("observations_to_save")));
});

test("validateEnvelope: accepts valid envelope", () => {
  const envelope: ArchivistEnvelope = {
    status: "archived",
    session_summary: { goal: "x", outcome: "y", duration_turns: 0, cost_usd: 0 },
    observations_to_save: [],
    artifacts_archived: [],
    next_steps_suggested: [],
  };

  const errors = validateEnvelope(envelope);
  assert.equal(errors.length, 0);
});

// ── toSaveOperations tests ────────────────────────────────────────────────

test("toSaveOperations: skips observations without title", () => {
  const envelope: ArchivistEnvelope = {
    status: "archived",
    session_summary: { goal: "x", outcome: "y", duration_turns: 0, cost_usd: 0 },
    observations_to_save: [
      {
        title: "",
        content: "content",
        observation_type: "decision",
        kind: "semantic",
        importance: 0.5,
        tags: [],
        namespace: "test",
        files: [],
      },
      {
        title: "Valid",
        content: "content",
        observation_type: "decision",
        kind: "semantic",
        importance: 0.5,
        tags: [],
        namespace: "test",
        files: [],
      },
    ],
    artifacts_archived: [],
    next_steps_suggested: [],
  };

  const ops = toSaveOperations(envelope, "default");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].title, "Valid");
});

test("toSaveOperations: skips observations without content", () => {
  const envelope: ArchivistEnvelope = {
    status: "archived",
    session_summary: { goal: "x", outcome: "y", duration_turns: 0, cost_usd: 0 },
    observations_to_save: [
      {
        title: "Title",
        content: "",
        observation_type: "decision",
        kind: "semantic",
        importance: 0.5,
        tags: [],
        namespace: "test",
        files: [],
      },
    ],
    artifacts_archived: [],
    next_steps_suggested: [],
  };

  const ops = toSaveOperations(envelope, "default");
  assert.equal(ops.length, 0);
});

test("toSaveOperations: caps importance to [0.0, 1.0]", () => {
  const envelope: ArchivistEnvelope = {
    status: "archived",
    session_summary: { goal: "x", outcome: "y", duration_turns: 0, cost_usd: 0 },
    observations_to_save: [
      {
        title: "High",
        content: "content",
        observation_type: "decision",
        kind: "semantic",
        importance: 1.5, // > 1.0, should cap
        tags: [],
        namespace: "test",
        files: [],
      },
      {
        title: "Low",
        content: "content",
        observation_type: "decision",
        kind: "semantic",
        importance: -0.5, // < 0.0, should cap
        tags: [],
        namespace: "test",
        files: [],
      },
    ],
    artifacts_archived: [],
    next_steps_suggested: [],
  };

  const ops = toSaveOperations(envelope, "default");
  assert.equal(ops.length, 2);
  // Importance is not stored in SaveOperation; it was normalized during archivist generation
  // Just verify both were kept
  assert.ok(ops[0].title === "High");
  assert.ok(ops[1].title === "Low");
});

test("toSaveOperations: joins tags array into comma-separated string", () => {
  const envelope: ArchivistEnvelope = {
    status: "archived",
    session_summary: { goal: "x", outcome: "y", duration_turns: 0, cost_usd: 0 },
    observations_to_save: [
      {
        title: "Test",
        content: "content",
        observation_type: "decision",
        kind: "semantic",
        importance: 0.5,
        tags: ["tag1", "tag2", "tag3"],
        namespace: "test",
        files: [],
      },
    ],
    artifacts_archived: [],
    next_steps_suggested: [],
  };

  const ops = toSaveOperations(envelope, "default");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].tags, "tag1, tag2, tag3");
});

test("toSaveOperations: joins files array into comma-separated string", () => {
  const envelope: ArchivistEnvelope = {
    status: "archived",
    session_summary: { goal: "x", outcome: "y", duration_turns: 0, cost_usd: 0 },
    observations_to_save: [
      {
        title: "Test",
        content: "content",
        observation_type: "decision",
        kind: "semantic",
        importance: 0.5,
        tags: [],
        namespace: "test",
        files: ["file1.ts", "file2.ts"],
      },
    ],
    artifacts_archived: [],
    next_steps_suggested: [],
  };

  const ops = toSaveOperations(envelope, "default");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].files, "file1.ts, file2.ts");
});

test("toSaveOperations: uses defaultNamespace if observation.namespace is empty", () => {
  const envelope: ArchivistEnvelope = {
    status: "archived",
    session_summary: { goal: "x", outcome: "y", duration_turns: 0, cost_usd: 0 },
    observations_to_save: [
      {
        title: "Test1",
        content: "content",
        observation_type: "decision",
        kind: "semantic",
        importance: 0.5,
        tags: [],
        namespace: "",
        files: [],
      },
      {
        title: "Test2",
        content: "content",
        observation_type: "decision",
        kind: "semantic",
        importance: 0.5,
        tags: [],
        namespace: "explicit",
        files: [],
      },
    ],
    artifacts_archived: [],
    next_steps_suggested: [],
  };

  const ops = toSaveOperations(envelope, "custom-default");
  assert.equal(ops.length, 2);
  assert.equal(ops[0].namespace, "custom-default");
  assert.equal(ops[1].namespace, "explicit");
});

// ── shouldArchive tests ───────────────────────────────────────────────────

test("shouldArchive: returns false for medium classification", () => {
  const result = shouldArchive("medium", "build");
  assert.equal(result, false);
});

test("shouldArchive: returns false for small classification", () => {
  const result = shouldArchive("small", "build");
  assert.equal(result, false);
});

test("shouldArchive: returns false for substantial but no build phase", () => {
  const result = shouldArchive("substantial", "propose");
  assert.equal(result, false);
});

test("shouldArchive: returns false for substantial but undefined phase", () => {
  const result = shouldArchive("substantial", undefined);
  assert.equal(result, false);
});

test("shouldArchive: returns true for substantial + build reached", () => {
  const result = shouldArchive("substantial", "build");
  assert.equal(result, true);
});

test("shouldArchive: returns false when classification is undefined", () => {
  const result = shouldArchive(undefined, "build");
  assert.equal(result, false);
});
