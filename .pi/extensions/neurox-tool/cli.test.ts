/**
 * Pure tests for neurox CLI arg builders + stdout parsing.
 *
 * Run: pnpm exec tsx --test extensions/core/neurox-tool/cli.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRecallArgs,
  buildSaveArgs,
  buildContextArgs,
  buildSessionStartArgs,
  buildSessionEndArgs,
  parseStdout,
} from "./cli.js";

const NS = "skynex-pi";

// ─── recall ──────────────────────────────────────────────────────────────────

test("recall: minimal query OMITS namespace (cross-project search)", () => {
  const args = buildRecallArgs({ query: "find this" }, NS);
  assert.deepEqual(args, ["recall", "find this"]);
  assert.ok(!args.includes("-namespace"));
});

test("recall: namespace included only when explicitly provided", () => {
  const args = buildRecallArgs({ query: "x", namespace: "other" }, NS);
  assert.ok(args.includes("-namespace"));
  assert.ok(args.includes("other"));
});

test("recall: default_namespace param is IGNORED for recall (cross-search default)", () => {
  // Even if default_namespace='skynex-pi', recall doesn't auto-apply it
  const args = buildRecallArgs({ query: "x" }, "skynex-pi");
  assert.ok(!args.includes("-namespace"));
  assert.ok(!args.includes("skynex-pi"));
});

test("recall: filters serialized correctly", () => {
  const args = buildRecallArgs(
    { query: "auth", limit: 5, kind: "semantic", type: "decision", files: "src/auth.ts" },
    NS,
  );
  assert.ok(args.includes("-limit"));
  assert.ok(args.includes("5"));
  assert.ok(args.includes("-kind"));
  assert.ok(args.includes("semantic"));
  assert.ok(args.includes("-type"));
  assert.ok(args.includes("decision"));
});

test("recall: boolean include_stale → bare flag", () => {
  const args = buildRecallArgs({ query: "x", include_stale: true }, NS);
  assert.ok(args.includes("-include-stale"));
  // No "true" string after it
  const idx = args.indexOf("-include-stale");
  assert.notEqual(args[idx + 1], "true");
});

test("recall: include_stale=false omits flag entirely", () => {
  const args = buildRecallArgs({ query: "x", include_stale: false }, NS);
  assert.ok(!args.includes("-include-stale"));
});

test("recall: query is last positional argument", () => {
  const args = buildRecallArgs({ query: "last word", limit: 3, kind: "semantic" }, NS);
  assert.equal(args[args.length - 1], "last word");
});

// ─── save ────────────────────────────────────────────────────────────────────

test("save: required fields present (title as positional, NOT a flag)", () => {
  const args = buildSaveArgs({ title: "T", content: "C" }, NS);
  // neurox v0.5.4: there is NO -title flag. Title is the last positional arg.
  assert.ok(!args.includes("-title"), "must NOT use -title flag");
  assert.ok(args.includes("-content"));
  assert.ok(args.includes("C"));
  assert.ok(args.includes("-namespace"));
  assert.ok(args.includes("skynex-pi"));
  // Title is the very last argument
  assert.equal(args[args.length - 1], "T", "title must be last positional argument");
});

test("save: title goes after all flags (Go flag parser stops at first non-flag)", () => {
  const args = buildSaveArgs(
    { title: "My Title", content: "body", tags: "a,b", confidence: 0.9 },
    NS,
  );
  const titleIdx = args.indexOf("My Title");
  // Every flag must appear before the title
  for (const flag of ["-content", "-namespace", "-tags", "-confidence"]) {
    const flagIdx = args.indexOf(flag);
    assert.ok(flagIdx >= 0, `${flag} missing`);
    assert.ok(flagIdx < titleIdx, `${flag} must come before title positional`);
  }
});

test("save: all optional fields serialized", () => {
  const args = buildSaveArgs(
    {
      title: "T",
      content: "C",
      tags: "a,b",
      files: "src/x.ts",
      topic_key: "topic/x",
      confidence: 0.9,
      retention: "durable",
      type: "decision",
      kind: "semantic",
    },
    NS,
  );
  assert.ok(args.includes("-tags") && args.includes("a,b"));
  assert.ok(args.includes("-files") && args.includes("src/x.ts"));
  assert.ok(args.includes("-topic-key") && args.includes("topic/x"));
  assert.ok(args.includes("-confidence") && args.includes("0.9"));
  assert.ok(args.includes("-retention") && args.includes("durable"));
});

// ─── context ─────────────────────────────────────────────────────────────────

test("context: default namespace + no limit", () => {
  const args = buildContextArgs({}, NS);
  assert.deepEqual(args, ["context", "-namespace", "skynex-pi"]);
});

test("context: with limit and files", () => {
  const args = buildContextArgs({ limit: 5, files: "a.ts,b.ts" }, NS);
  assert.ok(args.includes("-limit") && args.includes("5"));
  assert.ok(args.includes("-files") && args.includes("a.ts,b.ts"));
});

// ─── session-start / session-end ─────────────────────────────────────────────

test("session-start: builds args correctly", () => {
  const args = buildSessionStartArgs(
    { title: "My Session", directory: "/tmp/x", branch: "feat/foo" },
    NS,
  );
  assert.ok(args[0] === "session-start");
  assert.ok(args.includes("-title") && args.includes("My Session"));
  assert.ok(args.includes("-directory") && args.includes("/tmp/x"));
  assert.ok(args.includes("-branch") && args.includes("feat/foo"));
});

test("session-end: requires id and summary", () => {
  const args = buildSessionEndArgs({ session_id: "01ABC", summary: "Done" });
  assert.deepEqual(args, ["session-end", "-session-id", "01ABC", "-summary", "Done"]);
});

// ─── parseStdout ─────────────────────────────────────────────────────────────

test("parse: empty stdout → null", () => {
  assert.equal(parseStdout(""), null);
  assert.equal(parseStdout("   \n  "), null);
});

test("parse: pure JSON object", () => {
  const result = parseStdout('{"id": "abc", "count": 3}');
  assert.deepEqual(result, { id: "abc", count: 3 });
});

test("parse: pure JSON array", () => {
  const result = parseStdout('[{"a": 1}, {"b": 2}]');
  assert.deepEqual(result, [{ a: 1 }, { b: 2 }]);
});

test("parse: JSON preceded by log line (real neurox case)", () => {
  const stdout = `2026/05/20 11:48:53 remote embedding provider configured but test failed, falling back to disabled
{
  "count": 1,
  "query": "test"
}`;
  const result = parseStdout(stdout);
  assert.deepEqual(result, { count: 1, query: "test" });
});

test("parse: non-JSON falls back to trimmed string", () => {
  const result = parseStdout("plain text output\n");
  assert.equal(result, "plain text output");
});

test("parse: malformed JSON also falls back to string", () => {
  const result = parseStdout("{ not valid json");
  assert.equal(typeof result, "string");
});
