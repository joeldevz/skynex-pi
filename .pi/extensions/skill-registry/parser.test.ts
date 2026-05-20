/**
 * Unit tests for the compact-rules parser. Pure functions, no I/O.
 *
 * Run: pnpm exec tsx --test extensions/core/skill-registry/parser.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCompactRules, estimateTokens, sha256, formatRulesForPrompt } from "./parser.js";

// ─── extractCompactRules ──────────────────────────────────────────────────────

test("extract: simple numbered rules", () => {
  const body = `
# Some Skill

Some description.

## Compact Rules

1. Always X
2. Never Y
3. When Z, do W

## Other Section
`;
  const rules = extractCompactRules(body, "Compact Rules");
  assert.deepEqual(rules, ["Always X", "Never Y", "When Z, do W"]);
});

test("extract: bulleted rules", () => {
  const body = `
## Compact Rules

- Rule one
- Rule two
* Rule three
+ Rule four
`;
  const rules = extractCompactRules(body, "Compact Rules");
  assert.deepEqual(rules, ["Rule one", "Rule two", "Rule three", "Rule four"]);
});

test("extract: multi-line rule (continuation)", () => {
  const body = `
## Compact Rules

1. First rule that
   continues on next line
2. Second rule
`;
  const rules = extractCompactRules(body, "Compact Rules");
  assert.deepEqual(rules, ["First rule that continues on next line", "Second rule"]);
});

test("extract: missing section returns empty array", () => {
  const body = `
# Skill

No compact rules here.

## Workflow

Do stuff.
`;
  const rules = extractCompactRules(body, "Compact Rules");
  assert.deepEqual(rules, []);
});

test("extract: empty section returns empty array", () => {
  const body = `
## Compact Rules

## Other
`;
  const rules = extractCompactRules(body, "Compact Rules");
  assert.deepEqual(rules, []);
});

test("extract: heading is case-insensitive", () => {
  const body = `
## COMPACT RULES

1. Rule one
`;
  const rules = extractCompactRules(body, "Compact Rules");
  assert.deepEqual(rules, ["Rule one"]);
});

test("extract: configurable heading name", () => {
  const body = `
## Rules

1. Custom heading match
`;
  const rules = extractCompactRules(body, "Rules");
  assert.deepEqual(rules, ["Custom heading match"]);
});

test("extract: section ends at next same-level heading", () => {
  const body = `
## Compact Rules

1. Inside section

## Next Section

2. Outside section
`;
  const rules = extractCompactRules(body, "Compact Rules");
  assert.deepEqual(rules, ["Inside section"]);
});

test("extract: deeper headings within section do NOT close it", () => {
  const body = `
## Compact Rules

1. First rule

### Subsection

2. Second rule

## After
`;
  const rules = extractCompactRules(body, "Compact Rules");
  // Subsection (###) does NOT close the ## section
  assert.deepEqual(rules, ["First rule", "Second rule"]);
});

test("extract: section runs to end of file if no next heading", () => {
  const body = `
## Compact Rules

1. Rule A
2. Rule B
`;
  const rules = extractCompactRules(body, "Compact Rules");
  assert.deepEqual(rules, ["Rule A", "Rule B"]);
});

test("extract: handles \\r\\n line endings", () => {
  const body = "## Compact Rules\r\n\r\n1. Rule one\r\n2. Rule two\r\n";
  const rules = extractCompactRules(body, "Compact Rules");
  assert.deepEqual(rules, ["Rule one", "Rule two"]);
});

test("extract: stray prose before first rule is ignored", () => {
  const body = `
## Compact Rules

Some intro text that should be ignored.

1. First real rule
`;
  const rules = extractCompactRules(body, "Compact Rules");
  assert.deepEqual(rules, ["First real rule"]);
});

// ─── estimateTokens ───────────────────────────────────────────────────────────

test("estimate: empty string is 0 tokens", () => {
  assert.equal(estimateTokens(""), 0);
});

test("estimate: chars/4 rounding up", () => {
  assert.equal(estimateTokens("test"), 1);          // 4 chars / 4 = 1
  assert.equal(estimateTokens("hello"), 2);         // 5 chars / 4 = 1.25 → 2
  assert.equal(estimateTokens("a".repeat(40)), 10); // 40 / 4 = 10
});

// ─── sha256 ──────────────────────────────────────────────────────────────────

test("sha256: deterministic", () => {
  const a = sha256("hello world");
  const b = sha256("hello world");
  assert.equal(a, b);
});

test("sha256: different inputs produce different hashes", () => {
  const a = sha256("hello world");
  const b = sha256("hello world!");
  assert.notEqual(a, b);
});

test("sha256: returns 64-char hex string", () => {
  const h = sha256("anything");
  assert.match(h, /^[a-f0-9]{64}$/);
});

// ─── formatRulesForPrompt ────────────────────────────────────────────────────

test("format: empty input returns empty string", () => {
  assert.equal(formatRulesForPrompt([]), "");
});

test("format: single skill with rules", () => {
  const out = formatRulesForPrompt([
    { name: "grill-me", compactRules: ["One question at a time", "Provide recommended answer"] },
  ]);
  assert.match(out, /## Project Standards/);
  assert.match(out, /\*\*grill-me\*\*/);
  assert.match(out, /1\. One question at a time/);
  assert.match(out, /2\. Provide recommended answer/);
});

test("format: multiple skills separated", () => {
  const out = formatRulesForPrompt([
    { name: "tdd-discipline", compactRules: ["Write failing test first"] },
    { name: "verification-before-completion", compactRules: ["Check acceptance criteria"] },
  ]);
  assert.match(out, /\*\*tdd-discipline\*\*/);
  assert.match(out, /\*\*verification-before-completion\*\*/);
});

test("format: skills with no rules are skipped", () => {
  const out = formatRulesForPrompt([
    { name: "skill-a", compactRules: ["Rule a"] },
    { name: "skill-b", compactRules: [] },
    { name: "skill-c", compactRules: ["Rule c"] },
  ]);
  assert.match(out, /\*\*skill-a\*\*/);
  assert.doesNotMatch(out, /\*\*skill-b\*\*/);
  assert.match(out, /\*\*skill-c\*\*/);
});
