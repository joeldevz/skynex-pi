/**
 * Unit tests for triage rules.
 *
 * Pure functions — no Pi runtime, no I/O. Runs with `node --test`.
 *
 * Run: pnpm exec tsx --test extensions/core/triage/rules.test.ts
 *      OR
 *      pnpm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { triage } from "./rules.js";
import { DEFAULT_TRIAGE_CONFIG } from "./types.js";
import { buildWorkflowHint } from "./index.js";

const cfg = DEFAULT_TRIAGE_CONFIG;

function tri(prompt: string) {
  return triage({ prompt, cwd: "/tmp" }, cfg);
}

// ─── SMALL PATH ──────────────────────────────────────────────────────────────

test("small: rename in one file (non-risk module)", () => {
  // Using src/users/ not src/auth/ — auth is a risk keyword and would promote.
  // This is intentional design: anything touching auth deserves substantial scrutiny.
  const r = tri("rename getUser to getCurrentUser in src/users/service.ts");
  assert.equal(r.path, "small");
  assert.match(r.reason, /trivial|short concrete/);
});

test("small: fix typo", () => {
  const r = tri("fix typo in line 42");
  assert.equal(r.path, "small");
});

test("small: format file", () => {
  const r = tri("format src/utils/date.ts");
  assert.equal(r.path, "small");
});

test("small: short request with one file", () => {
  const r = tri("update the import in src/index.ts");
  assert.equal(r.path, "small");
});

// ─── MEDIUM PATH ─────────────────────────────────────────────────────────────

test("medium: add pagination (clear, single module)", () => {
  const r = tri("add pagination to the GET /orders endpoint in the orders module");
  assert.equal(r.path, "medium");
});

test("medium: fix bug with no risk keywords", () => {
  const r = tri("fix the bug where users with no avatar see undefined in the profile screen");
  assert.equal(r.path, "medium");
});

test("medium: default for unrecognized requests", () => {
  const r = tri("implement an email validator");
  assert.equal(r.path, "medium");
});

// ─── TDD INTENT → MEDIUM (Rule 3.5) ──────────────────────────────────────────

test("medium: explicit 'TDD' keyword promotes from small to medium", () => {
  // Without 'TDD' this would match Rule 5 (short + single file) → small.
  // With 'TDD' it must promote to medium.
  const r = tri("add isValidEmail in src/utils/email.ts with TDD");
  assert.equal(r.path, "medium");
  assert.match(r.reason, /TDD intent/i);
});

test("medium: 'con tests' (Spanish) promotes to medium", () => {
  const r = tri("agrega isValidEmail en src/utils/email.ts con tests");
  assert.equal(r.path, "medium");
});

test("medium: 'with tests' promotes to medium", () => {
  const r = tri("write a CSV parser in src/csv.ts with tests");
  assert.equal(r.path, "medium");
});

test("medium: 'tests primero' (red-green) promotes to medium", () => {
  const r = tri("create a parser, tests primero");
  assert.equal(r.path, "medium");
});

test("tdd_signals: are recorded in signals list", () => {
  const r = tri("add foo in src/x.ts with TDD");
  const hit = r.signals.find((s) => s.startsWith("tdd_signals:"));
  assert.ok(hit, `expected tdd_signals signal, got: ${r.signals.join(" | ")}`);
});

// ─── CREATE INTENT BLOCKS SMALL (Rule 5 exception) ───────────────────────────

test("medium: 'create' verb + new file path is medium, NOT small", () => {
  // Short prompt, single file, but the verb 'create' means new-module work.
  const r = tri("create src/utils/email.ts");
  assert.equal(r.path, "medium");
});

test("medium: 'agrega' verb + new file path is medium", () => {
  const r = tri("agrega isValidEmail en src/utils/email.ts");
  assert.equal(r.path, "medium");
});

test("small: 'fix' verb + existing file stays small", () => {
  // 'fix' is editing intent, NOT create intent.
  const r = tri("fix the import in src/index.ts");
  assert.equal(r.path, "small");
});

test("small: 'update' verb + existing file stays small", () => {
  // 'update' is editing intent, NOT create intent (regression guard).
  const r = tri("update the import in src/index.ts");
  assert.equal(r.path, "small");
});

test("medium: 'debug' verb + single file promotes to medium (investigation)", () => {
  // Debug is investigative work, scope may expand as we learn the bug.
  const r = tri("debug the failing test in user.service.test.ts");
  assert.equal(r.path, "medium");
});

test("medium: 'refactor' verb + single file promotes to medium", () => {
  // Refactor is design work, not a touch-up.
  const r = tri("refactor the order logic in src/order.ts");
  assert.equal(r.path, "medium");
});

test("medium: 'investigate' verb + single file promotes to medium", () => {
  const r = tri("investigate the slow query in src/db.ts");
  assert.equal(r.path, "medium");
});

// ─── UNICODE NORMALIZATION (accents) ─────────────────────────────────────────

test("conv: 'buenos días' (with accent) matches 'buenos dias' pattern", () => {
  const r = tri("buenos días");
  assert.equal(r.path, "conversational");
});

test("conv: 'añade' (with tilde) matches 'añade' pattern", () => {
  // This already worked because 'añade' literally has the tilde in config,
  // but the test guarantees NFD normalization does not break it either.
  const r = tri("añade foo");
  // Not conversational because of task signal, but not crashing either.
  assert.notEqual(r.path, "conversational");
});

test("medium: 'cómo' (Spanish accented) does not break tokenization", () => {
  const r = tri("cómo implemento una validación de email en src/utils/email.ts con tests TDD");
  // Should still detect TDD intent.
  assert.equal(r.path, "medium");
});

// ─── SUBSTANTIAL PATH ────────────────────────────────────────────────────────

test("substantial: auth keyword promotes to substantial", () => {
  const r = tri("rename a function in src/auth/service.ts");
  assert.equal(r.path, "substantial");
  assert.ok(r.has_risk_keywords);
});

test("substantial: payment keyword", () => {
  const r = tri("update the payment status field");
  assert.equal(r.path, "substantial");
});

test("substantial: migration keyword", () => {
  const r = tri("add a migration for the new column");
  assert.equal(r.path, "substantial");
});

test("substantial: cross-cutting language", () => {
  const r = tri("update the logging across all services");
  assert.equal(r.path, "substantial");
});

test("substantial: ambiguous request with 3+ vague terms", () => {
  const r = tri("we should ideally refactor the architecture and clean up the code to make it better");
  assert.equal(r.path, "substantial");
  assert.match(r.reason, /ambiguous/);
});

test("substantial: SSO / SAML triggers risk keyword", () => {
  const r = tri("add SAML SSO support");
  assert.equal(r.path, "substantial");
});

// ─── TDD FLAG ────────────────────────────────────────────────────────────────

test("tdd: true for medium path", () => {
  const r = tri("add pagination to GET /orders");
  assert.equal(r.tdd, true);
});

test("tdd: true for substantial path", () => {
  const r = tri("rebuild auth with SAML");
  assert.equal(r.tdd, true);
});

test("tdd: false for small path with no risk keywords", () => {
  const r = tri("fix typo in README.md");
  assert.equal(r.tdd, false);
});

test("tdd: true for small path that touches auth (risk override)", () => {
  // small path normally would mean tdd=false, but risk keyword forces tdd=true
  const r = tri("rename getUser to getCurrentUser in src/auth/service.ts");
  // This actually becomes substantial because of "auth", but the tdd flag is true regardless
  assert.equal(r.tdd, true);
});

// ─── SIGNALS ─────────────────────────────────────────────────────────────────

test("signals: file mentions are extracted", () => {
  const r = tri("update src/foo/bar.ts and src/foo/baz.ts");
  const fileSignal = r.signals.find((s) => s.startsWith("file_mentions:"));
  assert.ok(fileSignal);
  assert.equal(fileSignal, "file_mentions:2");
});

test("signals: module hints are extracted", () => {
  const r = tri("touch src/auth and src/billing and src/notifications");
  const moduleSignal = r.signals.find((s) => s.startsWith("module_hints:"));
  assert.ok(moduleSignal);
  assert.equal(moduleSignal, "module_hints:3");
});

test("signals: prompt length always recorded", () => {
  const r = tri("hello");
  assert.ok(r.signals.some((s) => s.startsWith("prompt_length:")));
});

// ─── CONVERSATIONAL PATH (greetings, small talk) ─────────────────────────────

test("conv: 'hola' is conversational", () => {
  const r = tri("hola");
  assert.equal(r.path, "conversational");
  assert.equal(r.tdd, false);
  assert.equal(r.should_load_neurox, false);
});

test("conv: 'hello there' is conversational", () => {
  const r = tri("hello there");
  assert.equal(r.path, "conversational");
});

test("conv: 'gracias!' is conversational", () => {
  const r = tri("gracias!");
  assert.equal(r.path, "conversational");
});

test("conv: 'buenas tardes' is conversational", () => {
  const r = tri("buenas tardes");
  assert.equal(r.path, "conversational");
});

test("conv: 'ok' is conversational", () => {
  const r = tri("ok");
  assert.equal(r.path, "conversational");
});

test("conv: greeting + task word stays as task (not conversational)", () => {
  const r = tri("hola, implementa el endpoint /users");
  // task signals override conversational
  assert.notEqual(r.path, "conversational");
});

test("conv: greeting + file mention stays as task", () => {
  const r = tri("hola, mira src/auth/service.ts");
  // auth is risk keyword → substantial
  assert.equal(r.path, "substantial");
});

test("conv: long prompt without task signals still NOT conversational (no match)", () => {
  // long greeting-like text but exceeds conversational_max_chars
  const longGreeting = "hola hola hola hola hola hola hola hola hola hola hola hola hola hola";
  const r = tri(longGreeting);
  assert.notEqual(r.path, "conversational");
});

// ─── should_load_neurox flag ─────────────────────────────────────────────────

test("neurox: should_load_neurox true for medium", () => {
  const r = tri("add pagination to GET /orders");
  assert.equal(r.should_load_neurox, true);
});

test("neurox: should_load_neurox true for substantial", () => {
  const r = tri("rebuild auth with SAML");
  assert.equal(r.should_load_neurox, true);
});

test("neurox: should_load_neurox false for conversational", () => {
  const r = tri("hola");
  assert.equal(r.should_load_neurox, false);
});

test("neurox: explicit search intent forces should_load_neurox=true even for short prompt", () => {
  // "busca" should trigger search_intent. Note: "busca" alone (5 chars) is short
  // but search_intent forces it out of conversational.
  const r = tri("busca decisiones de arquitectura");
  assert.equal(r.should_load_neurox, true);
  // Should also exit conversational because search_intent matched
  assert.notEqual(r.path, "conversational");
});

// ─── EDGE CASES ──────────────────────────────────────────────────────────────

test("edge: empty prompt defaults to medium", () => {
  const r = tri("");
  assert.equal(r.path, "medium");
});

test("edge: very long ambiguous prompt promotes to substantial", () => {
  const r = tri(
    "we should improve the codebase by refactoring everything and making it better and somehow optimize it ideally",
  );
  assert.equal(r.path, "substantial");
});

test("edge: ambiguity_threshold of 3 is enforced (2 vague terms not enough alone)", () => {
  // "improve" + "better" = 2 ambiguity hits, below threshold
  const r = tri("improve the email validator to be better");
  // Should NOT be substantial just from these 2 alone
  assert.notEqual(r.path, "substantial");
});

test("edge: result is deterministic for same input", () => {
  const r1 = tri("add pagination to GET /orders");
  const r2 = tri("add pagination to GET /orders");
  assert.equal(r1.path, r2.path);
  assert.equal(r1.reason, r2.reason);
  // ts will differ, that's fine
});

// ─── STRUCTURE ───────────────────────────────────────────────────────────────

test("structure: result has all required fields", () => {
  const r = tri("test");
  assert.ok(typeof r.path === "string");
  assert.ok(typeof r.reason === "string");
  assert.ok(typeof r.tdd === "boolean");
  assert.ok(typeof r.should_load_neurox === "boolean");
  assert.ok(typeof r.estimated_files === "number");
  assert.ok(typeof r.estimated_modules === "number");
  assert.ok(typeof r.has_risk_keywords === "boolean");
  assert.ok(Array.isArray(r.signals));
  assert.ok(typeof r.ts === "string");
  // ts must be ISO 8601
  assert.ok(!isNaN(Date.parse(r.ts)));
});

// ─── WORKFLOW HINT TESTS (Sprint 3 substantial path) ─────────────────────────

test("substantial hint: includes /skill:propose", () => {
  const r = tri("rebuild auth to support SAML SSO");
  const hint = buildWorkflowHint(r);
  assert.ok(hint);
  assert.match(hint, /\/skill:propose/);
});

test("substantial hint: includes /skill:specify", () => {
  const r = tri("rebuild auth to support SAML SSO");
  const hint = buildWorkflowHint(r);
  assert.ok(hint);
  assert.match(hint, /\/skill:specify/);
});

test("substantial hint: mentions HITL gates at steps 2, 3, 4", () => {
  const r = tri("rebuild auth to support SAML SSO");
  const hint = buildWorkflowHint(r);
  assert.ok(hint);
  assert.match(hint, /HITL gates/);
  assert.match(hint, /steps 2, 3, and 4/);
  assert.match(hint, /MANDATORY/);
});

test("substantial hint: mentions archive extension and archivist", () => {
  const r = tri("rebuild auth to support SAML SSO");
  const hint = buildWorkflowHint(r);
  assert.ok(hint);
  assert.match(hint, /archive extension/);
  assert.match(hint, /archivist/);
});

test("medium hint: unchanged (no /skill:propose or /skill:specify)", () => {
  const r = tri("add pagination to GET /orders");
  const hint = buildWorkflowHint(r);
  assert.ok(hint);
  assert.match(hint, /medium-path/);
  assert.doesNotMatch(hint, /\/skill:propose/);
  assert.doesNotMatch(hint, /\/skill:specify/);
});

test("small hint: unchanged (no new propose/specify mentioned)", () => {
  const r = tri("fix typo in README.md");
  const hint = buildWorkflowHint(r);
  assert.ok(hint);
  assert.match(hint, /TRIAGE: small/);
  assert.doesNotMatch(hint, /\/skill:propose/);
  assert.doesNotMatch(hint, /\/skill:specify/);
});

test("conversational hint: unchanged (no workflow phases)", () => {
  const r = tri("hola");
  const hint = buildWorkflowHint(r);
  assert.ok(hint);
  assert.match(hint, /conversational/);
  assert.doesNotMatch(hint, /\/skill:propose/);
  assert.doesNotMatch(hint, /\/skill:specify/);
});
