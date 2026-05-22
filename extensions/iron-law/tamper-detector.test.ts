/**
 * Unit tests for tamper-detector.
 *
 * Run: pnpm exec tsx --test extensions/iron-law/tamper-detector.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectTestFileTampering } from "./tamper-detector.js";

// ─── MV rename patterns (should match) ──────────────────────────────────────

test("tamper: mv foo.spec.ts foo.test.ts → matched", () => {
  const result = detectTestFileTampering("mv foo.spec.ts foo.test.ts");
  assert.ok(result.matched, "should detect spec→test rename");
  assert.ok(result.pattern.includes("mv rename"), "pattern should mention mv rename");
});

test("tamper: mv with quotes and paths → matched", () => {
  const result = detectTestFileTampering('mv "src/foo.spec.ts" "src/foo.test.ts"');
  assert.ok(result.matched, "should detect spec→test with quotes and paths");
});

test("tamper: mv foo.test.ts foo.spec.ts (reverse) → matched", () => {
  const result = detectTestFileTampering("mv foo.test.ts foo.spec.ts");
  assert.ok(result.matched, "should detect test→spec rename");
});

test("tamper: mv with tsx extension → matched", () => {
  const result = detectTestFileTampering("mv Button.spec.tsx Button.test.tsx");
  assert.ok(result.matched, "should detect .tsx patterns");
});

// ─── RM delete patterns (should match) ──────────────────────────────────────

test("tamper: rm foo.test.ts → matched", () => {
  const result = detectTestFileTampering("rm foo.test.ts");
  assert.ok(result.matched, "should detect test file deletion");
  assert.ok(result.pattern.includes("rm delete"), "pattern should mention rm delete");
});

test("tamper: rm -rf foo.spec.ts → matched", () => {
  const result = detectTestFileTampering("rm -rf foo.spec.ts");
  assert.ok(result.matched, "should detect spec file deletion with -rf");
});

test("tamper: rm with quoted path → matched", () => {
  const result = detectTestFileTampering('rm "src/foo.test.ts"');
  assert.ok(result.matched, "should detect quoted path deletion");
});

// ─── CP copy patterns (should match) ───────────────────────────────────────

test("tamper: cp src/a.spec.ts src/a.test.ts → matched", () => {
  const result = detectTestFileTampering("cp src/a.spec.ts src/a.test.ts");
  assert.ok(result.matched, "should detect copy with rename");
  assert.ok(result.pattern.includes("cp copy"), "pattern should mention cp copy");
});

// ─── Legitimate patterns (should NOT match) ────────────────────────────────

test("legitimate: mv foo.ts bar.ts → NOT matched", () => {
  const result = detectTestFileTampering("mv foo.ts bar.ts");
  assert.ok(!result.matched, "should not match non-test file rename");
});

test("legitimate: echo hello → NOT matched", () => {
  const result = detectTestFileTampering('echo "hello"');
  assert.ok(!result.matched, "should not match echo");
});

test("legitimate: rm foo.ts (non-test) → NOT matched", () => {
  const result = detectTestFileTampering("rm src/service.ts");
  assert.ok(!result.matched, "should not match non-test file deletion");
});

test("legitimate: cp src/foo.ts src/bar.ts → NOT matched", () => {
  const result = detectTestFileTampering("cp src/foo.ts src/bar.ts");
  assert.ok(!result.matched, "should not match non-test file copy");
});

test("legitimate: npm test → NOT matched", () => {
  const result = detectTestFileTampering("npm test");
  assert.ok(!result.matched, "should not match npm commands");
});

test("legitimate: whitespace variations → NOT matched", () => {
  const result = detectTestFileTampering("   rm   src/util.ts   ");
  assert.ok(!result.matched, "should not match non-test patterns even with whitespace");
});
