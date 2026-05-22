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
  // OPTION D: file path now triggers medium (Rule 6), not small.
  // This is intentional: file paths are structural signals.
  const r = tri("rename getUser to getCurrentUser in src/users/service.ts");
  assert.equal(r.path, "medium");
  assert.match(r.reason, /file path detected/);
});

test("small: fix typo", () => {
  const r = tri("fix typo in line 42");
  assert.equal(r.path, "small");
});

test("small: format file", () => {
  // OPTION D: file path triggers medium now
  const r = tri("format src/utils/date.ts");
  assert.equal(r.path, "medium");
});

test("small: short request with one file", () => {
  // OPTION D: file path triggers medium
  const r = tri("update the import in src/index.ts");
  assert.equal(r.path, "medium");
});

// ─── MEDIUM PATH ─────────────────────────────────────────────────────────────

test("medium: add pagination (clear, single module)", () => {
  // OPTION D: no structural signals → default small. Model sees the task intent.
  const r = tri("add pagination to the GET /orders endpoint in the orders module");
  assert.equal(r.path, "small");
});

test("medium: fix bug with no risk keywords", () => {
  // OPTION D: no structural signals → default small
  const r = tri("fix the bug where users with no avatar see undefined in the profile screen");
  assert.equal(r.path, "small");
});

test("medium: default for unrecognized requests", () => {
  // OPTION D: no structural signals → default small (Rule 10)
  const r = tri("implement an email validator");
  assert.equal(r.path, "small");
});

// ─── TDD INTENT → MEDIUM (Rule 3.5) ──────────────────────────────────────────

test("medium: explicit 'TDD' keyword promotes from small to medium", () => {
  // File path is detected first (Rule 6), so reason will be "file path detected" not "TDD intent".
  // But path is still medium due to file path + TDD combo.
  const r = tri("add isValidEmail in src/utils/email.ts with TDD");
  assert.equal(r.path, "medium");
  // Either file path or TDD is acceptable; file path is checked first
  assert.ok(r.reason.match(/file path|TDD intent/i));
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
  // OPTION D: file path triggers medium (Rule 6)
  const r = tri("fix the import in src/index.ts");
  assert.equal(r.path, "medium");
});

test("small: 'update' verb + existing file stays small", () => {
  // OPTION D: file path triggers medium (Rule 6)
  const r = tri("update the import in src/index.ts");
  assert.equal(r.path, "medium");
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
  // OPTION D: risk keywords no longer promote path. File path triggers medium (Rule 6).
  // But has_risk_keywords is still true.
  const r = tri("rename a function in src/auth/service.ts");
  assert.equal(r.path, "medium");
  assert.ok(r.has_risk_keywords);
});

test("substantial: payment keyword", () => {
  // OPTION D: risk keywords no longer promote. No structural signals → small.
  const r = tri("update the payment status field");
  assert.equal(r.path, "small");
  assert.ok(r.has_risk_keywords);
});

test("substantial: migration keyword", () => {
  // OPTION D: risk keywords no longer promote → small. has_risk_keywords still set.
  const r = tri("add a migration for the new column");
  assert.equal(r.path, "small");
  assert.ok(r.has_risk_keywords);
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
  // OPTION D: risk keywords no longer promote → small. But has_risk_keywords=true is visible.
  const r = tri("add SAML SSO support");
  assert.equal(r.path, "small");
  assert.ok(r.has_risk_keywords);
});

// ─── TDD FLAG ────────────────────────────────────────────────────────────────

test("tdd: true for medium path", () => {
  // OPTION D: "add pagination" is now small (no structural signals).
  // tdd is still true for medium paths. Let's check a medium-path example.
  const r = tri("add pagination to GET /orders with tests TDD");
  assert.equal(r.path, "medium");
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
  // OPTION D: file path + greeting. File path is NOT conversational (Rule 1 checks !hasFilePath).
  // So it's not conversational. Risk keywords no longer promote, so it's medium (file path).
  const r = tri("hola, mira src/auth/service.ts");
  assert.equal(r.path, "medium");
});

test("conv: long prompt without task signals still NOT conversational (no match)", () => {
  // long greeting-like text but exceeds conversational_max_chars
  const longGreeting = "hola hola hola hola hola hola hola hola hola hola hola hola hola hola";
  const r = tri(longGreeting);
  assert.notEqual(r.path, "conversational");
});

// ─── should_load_neurox flag ─────────────────────────────────────────────────

test("neurox: should_load_neurox true for medium", () => {
  // OPTION D: "add pagination" is now small, so neurox=false.
  // Use a medium-path prompt instead.
  const r = tri("add pagination to GET /orders with tests");
  assert.equal(r.path, "medium");
  assert.equal(r.should_load_neurox, true);
});

test("neurox: should_load_neurox true for substantial", () => {
  // OPTION D: risk keywords no longer promote. Use cross-cutting pattern for substantial.
  const r = tri("rebuild auth across all modules with SAML");
  assert.equal(r.path, "substantial");
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

test("edge: empty prompt defaults to small", () => {
  // OPTION D: default changed to small (Rule 10)
  const r = tri("");
  assert.equal(r.path, "small");
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
  // OPTION D: use cross-cutting pattern to trigger substantial
  const r = tri("rebuild auth to support SAML SSO across all modules");
  assert.equal(r.path, "substantial");
  const hint = buildWorkflowHint(r);
  assert.ok(hint);
  assert.match(hint, /\/skill:propose/);
});

test("substantial hint: includes /skill:specify", () => {
  // OPTION D: use cross-cutting pattern
  const r = tri("rebuild auth to support SAML SSO across all modules");
  assert.equal(r.path, "substantial");
  const hint = buildWorkflowHint(r);
  assert.ok(hint);
  assert.match(hint, /\/skill:specify/);
});

test("substantial hint: mentions UNIFIED GATE at step 4 in default mode", () => {
  const prior = process.env.SKYNEX_HITL;
  delete process.env.SKYNEX_HITL;
  try {
    // OPTION D: use cross-cutting pattern for substantial
    const r = tri("rebuild auth to support SAML SSO across all modules");
    assert.equal(r.path, "substantial");
    const hint = buildWorkflowHint(r);
    assert.ok(hint);
    assert.match(hint, /UNIFIED GATE/);
    assert.match(hint, /step 4/);
    // Default mode should mention "default/'single'"
    assert.match(hint, /single.*default/i);
  } finally {
    if (prior !== undefined) process.env.SKYNEX_HITL = prior;
  }
});

test("substantial hint: mentions archive extension and archivist", () => {
  // OPTION D: use cross-cutting pattern
  const r = tri("rebuild auth to support SAML SSO across all modules");
  assert.equal(r.path, "substantial");
  const hint = buildWorkflowHint(r);
  assert.ok(hint);
  assert.match(hint, /archive extension/);
  assert.match(hint, /archivist/);
});

test("substantial hint: default mode mentions 'single' gate", () => {
  const prior = process.env.SKYNEX_HITL;
  delete process.env.SKYNEX_HITL;
  try {
    // OPTION D: use cross-cutting pattern
    const r = tri("rebuild auth to support SAML SSO across all modules");
    assert.equal(r.path, "substantial");
    const hint = buildWorkflowHint(r);
    assert.ok(hint);
    assert.match(hint, /SINGLE HITL gate/);
  } finally {
    if (prior !== undefined) process.env.SKYNEX_HITL = prior;
    else delete process.env.SKYNEX_HITL;
  }
});

test("substantial hint: strict mode mentions 3 gates", () => {
  const prior = process.env.SKYNEX_HITL;
  process.env.SKYNEX_HITL = "strict";
  try {
    // OPTION D: use cross-cutting pattern
    const r = tri("rebuild auth to support SAML SSO across all modules");
    assert.equal(r.path, "substantial");
    const hint = buildWorkflowHint(r);
    assert.ok(hint);
    assert.match(hint, /steps 2, 3, 4.*strict/i);
  } finally {
    if (prior !== undefined) process.env.SKYNEX_HITL = prior;
    else delete process.env.SKYNEX_HITL;
  }
});

test("substantial hint: none mode mentions escape hatch", () => {
  const prior = process.env.SKYNEX_HITL;
  process.env.SKYNEX_HITL = "none";
  try {
    // OPTION D: use cross-cutting pattern
    const r = tri("rebuild auth to support SAML SSO across all modules");
    assert.equal(r.path, "substantial");
    const hint = buildWorkflowHint(r);
    assert.ok(hint);
    assert.match(hint, /escape hatch/);
    assert.match(hint, /none/);
  } finally {
    if (prior !== undefined) process.env.SKYNEX_HITL = prior;
    else delete process.env.SKYNEX_HITL;
  }
});

test("substantial hint: mentions natural-language responses", () => {
  // OPTION D: use cross-cutting pattern
  const r = tri("rebuild auth to support SAML SSO across all modules");
  assert.equal(r.path, "substantial");
  const hint = buildWorkflowHint(r);
  assert.ok(hint);
  // Check for keywords from the natural-language section
  assert.match(hint, /dale|approve/i);
  assert.match(hint, /edit/i);
  assert.match(hint, /cancel|abortar/i);
});

test("medium hint: unchanged (no /skill:propose or /skill:specify)", () => {
  // OPTION D: "add pagination" is now small. Use a medium example.
  const r = tri("add pagination to GET /orders with tests");
  assert.equal(r.path, "medium");
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

// ─── GATE RESPONSE DETECTION ─────────────────────────────────────────────────

test("gate response: 'dale' classifies as gate_response", () => {
  const result = triage({ prompt: "dale", cwd: "/tmp" }, cfg);
  assert.equal(result.path, "gate_response");
});

test("gate response: 'approve' classifies as gate_response", () => {
  const result = triage({ prompt: "approve", cwd: "/tmp" }, cfg);
  assert.equal(result.path, "gate_response");
});

test("gate response: 'cancel' classifies as gate_response", () => {
  const result = triage({ prompt: "cancel", cwd: "/tmp" }, cfg);
  assert.equal(result.path, "gate_response");
});

test("gate response: 'edit \"add OIDC\"' classifies as gate_response", () => {
  const result = triage({ prompt: 'edit "add OIDC"', cwd: "/tmp" }, cfg);
  assert.equal(result.path, "gate_response");
});

test("gate response: 'proceed' classifies as gate_response", () => {
  const result = triage({ prompt: "proceed", cwd: "/tmp" }, cfg);
  assert.equal(result.path, "gate_response");
});

test("gate response: 'sí' classifies as gate_response", () => {
  const result = triage({ prompt: "sí", cwd: "/tmp" }, cfg);
  assert.equal(result.path, "gate_response");
});

test("gate response: 'si' (no accent) classifies as gate_response", () => {
  const result = triage({ prompt: "si", cwd: "/tmp" }, cfg);
  assert.equal(result.path, "gate_response");
});

test("gate response: regular text is NOT gate_response", () => {
  const result = triage({ prompt: "agrega función isValidEmail", cwd: "/tmp" }, cfg);
  assert.notEqual(result.path, "gate_response");
});

test("gate response: 'ok' stays conversational (not gate_response)", () => {
  const result = triage({ prompt: "ok", cwd: "/tmp" }, cfg);
  assert.equal(result.path, "conversational");
});

test("gate response: buildWorkflowHint returns undefined for gate_response", () => {
  const result = triage({ prompt: "dale", cwd: "/tmp" }, cfg);
  const hint = buildWorkflowHint(result);
  assert.equal(hint, undefined);
});

test("medium hint includes todo tool instructions", () => {
  const prior = process.env.SKYNEX_HITL;
  delete process.env.SKYNEX_HITL;
  try {
    // OPTION D: "agrega isValidEmail" is now small. Use a medium example.
    const result = triage({ prompt: "agrega isValidEmail with tests", cwd: "/tmp" }, cfg);
    assert.equal(result.path, "medium");
    const hint = buildWorkflowHint(result);
    assert.ok(hint, "hint should exist for medium path");
    assert.match(hint, /todo.*action.*create/i);
    assert.match(hint, /NEVER call todo from inside a sub-agent|not via sub-agent/i);
  } finally {
    if (prior !== undefined) process.env.SKYNEX_HITL = prior; else delete process.env.SKYNEX_HITL;
  }
});

test("substantial hint includes todo tool with blockedBy chain", () => {
  const prior = process.env.SKYNEX_HITL;
  delete process.env.SKYNEX_HITL;
  try {
    // OPTION D: use cross-cutting pattern
    const result = triage({ prompt: "rebuild auth para soportar SAML SSO across all modules", cwd: "/tmp" }, cfg);
    assert.equal(result.path, "substantial");
    const hint = buildWorkflowHint(result);
    assert.ok(hint, "hint should exist for substantial path");
    assert.match(hint, /blockedBy/);
    assert.match(hint, /NEVER call todo from inside a sub-agent/i);
  } finally {
    if (prior !== undefined) process.env.SKYNEX_HITL = prior; else delete process.env.SKYNEX_HITL;
  }
});

test("conversational hint does NOT include todo instructions", () => {
  const result = triage({ prompt: "hola", cwd: "/tmp" }, cfg);
  const hint = buildWorkflowHint(result);
  assert.ok(!hint || !hint.includes("todo({action"), "conversational should not include todo instructions");
});

test("small hint does NOT include todo instructions", () => {
  const result = triage({ prompt: "fix typo in README", cwd: "/tmp" }, cfg);
  const hint = buildWorkflowHint(result);
  assert.ok(!hint || !hint.includes("todo({action"), "small should not include todo instructions");
});

// ── Option D regression: capability questions must NOT promote path ──────────

test("capability question 'puedes usar jira?' is NOT medium/substantial", () => {
  const result = triage({ prompt: "puedes usar jira?", cwd: "/tmp" }, cfg);
  assert.ok(
    result.path === "conversational" || result.path === "small",
    `expected conversational or small, got ${result.path}`,
  );
});

test("capability question 'puedes usar jira?' has_risk_keywords false", () => {
  const result = triage({ prompt: "puedes usar jira?", cwd: "/tmp" }, cfg);
  assert.equal(result.has_risk_keywords, false, "jira alone should not set risk flag");
});

test("risk keyword alone does not promote path (Option D)", () => {
  const result = triage({ prompt: "rebuild auth para SAML SSO", cwd: "/tmp" }, cfg);
  assert.ok(
    result.path === "small" || result.path === "medium",
    `risk keyword alone must not force substantial, got ${result.path}`,
  );
});

test("file path promotes to medium (Option D)", () => {
  const result = triage({ prompt: "fix auth bug in src/auth.ts", cwd: "/tmp" }, cfg);
  assert.equal(result.path, "medium", "file path in prompt should promote to medium");
  assert.equal(result.has_risk_keywords, true, "auth keyword should still flag risk");
});

test("cross-cutting pattern still reaches substantial (Option D)", () => {
  const result = triage({ prompt: "refactor everything across all modules and services", cwd: "/tmp" }, cfg);
  assert.equal(result.path, "substantial", "cross-cutting pattern must still be substantial");
});
