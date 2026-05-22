import { test } from "node:test";
import assert from "node:assert/strict";
import { triage } from "./rules.js";
import { DEFAULT_TRIAGE_CONFIG } from "./types.js";
import { buildWorkflowHint } from "./index.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

// ─────────────────────────────────────────────────────────────────
// Suite 1: Medium-path full wiring (4 tests)
// ─────────────────────────────────────────────────────────────────

test("golden medium: 'agrega isValidEmail con TDD' classifies as medium", () => {
  const result = triage(
    { prompt: "agrega función isValidEmail en src/utils/email.ts con tests TDD", cwd: "/tmp" },
    DEFAULT_TRIAGE_CONFIG
  );
  assert.equal(result.path, "medium");
});

test("golden medium: hint includes all 4 phases in order", () => {
  const result = triage(
    { prompt: "agrega función isValidEmail en src/utils/email.ts con tests TDD", cwd: "/tmp" },
    DEFAULT_TRIAGE_CONFIG
  );
  const hint = buildWorkflowHint(result);
  assert.ok(hint, "hint must not be undefined for medium path");
  const phases = ["/skill:discover", "/skill:plan", "/skill:build", "/skill:validate"];
  let lastIdx = -1;
  for (const phase of phases) {
    const idx = hint!.indexOf(phase);
    assert.ok(idx > lastIdx, `Phase ${phase} missing or out of order in medium hint`);
    lastIdx = idx;
  }
});

test("golden medium: all 4 phases mentioned with workflow guidance", () => {
  const result = triage(
    { prompt: "agrega función isValidEmail en src/utils/email.ts con tests TDD", cwd: "/tmp" },
    DEFAULT_TRIAGE_CONFIG
  );
  const hint = buildWorkflowHint(result);
  assert.ok(hint, "hint must not be undefined");
  assert.match(hint!, /medium-path workflow/i);
  assert.match(hint!, /discover/i);
  assert.match(hint!, /plan/i);
  assert.match(hint!, /build/i);
  assert.match(hint!, /validate/i);
});

test("golden medium: medium path sets TDD enforced", () => {
  const result = triage(
    { prompt: "agrega función isValidEmail con tests TDD", cwd: "/tmp" },
    DEFAULT_TRIAGE_CONFIG
  );
  assert.equal(result.tdd, true, "TDD must be enforced for medium path with TDD signals");
});

// ─────────────────────────────────────────────────────────────────
// Suite 2: Substantial-path wiring (3 tests — complementing archive/golden.test.ts)
// ─────────────────────────────────────────────────────────────────

test("golden substantial: 'rebuild auth para soportar SAML SSO' classifies as substantial", () => {
  // OPTION D: risk keywords alone don't promote. Use cross-cutting pattern.
  const result = triage(
    { prompt: "rebuild auth para soportar SAML SSO across all modules", cwd: "/tmp" },
    DEFAULT_TRIAGE_CONFIG
  );
  assert.equal(result.path, "substantial");
  assert.equal(result.has_risk_keywords, true, "must detect risk keywords");
});

test("golden substantial: hint includes all 6 phases in order", () => {
  const prior = process.env.SKYNEX_HITL;
  delete process.env.SKYNEX_HITL; // unset to test default mode
  try {
    // OPTION D: use cross-cutting pattern
    const result = triage(
      { prompt: "rebuild auth para soportar SAML SSO across all modules", cwd: "/tmp" },
      DEFAULT_TRIAGE_CONFIG
    );
    assert.equal(result.path, "substantial");
    const hint = buildWorkflowHint(result);
    assert.ok(hint, "hint must not be undefined for substantial");
    const phases = [
      "/skill:discover",
      "/skill:propose",
      "/skill:specify",
      "/skill:plan",
      "/skill:build",
      "/skill:validate",
    ];
    let lastIdx = -1;
    for (const phase of phases) {
      const idx = hint!.indexOf(phase);
      assert.ok(idx > lastIdx, `Phase ${phase} missing or out of order in substantial hint`);
      lastIdx = idx;
    }
  } finally {
    if (prior !== undefined) process.env.SKYNEX_HITL = prior;
    else delete process.env.SKYNEX_HITL;
  }
});

test("golden substantial: product-planner, architect, archivist agents exist", () => {
  const agents = [
    { name: "product-planner", file: "assets/agents/product-planner.md" },
    { name: "architect", file: "assets/agents/architect.md" },
    { name: "archivist", file: "assets/agents/archivist.md" },
  ];
  for (const agent of agents) {
    const p = resolve(REPO_ROOT, agent.file);
    assert.ok(existsSync(p), `${agent.name} agent not found at ${p}`);
    const content = readFileSync(p, "utf8");
    assert.match(content, /```yaml/, `missing envelope block in ${agent.name}.md`);
    assert.match(content, /Emit the envelope and stop/i, `missing kill-switch in ${agent.name}.md`);
  }
});

// ─────────────────────────────────────────────────────────────────
// Suite 3: Conversational + small paths (3 tests)
// ─────────────────────────────────────────────────────────────────

test("golden conversational: 'hola, cómo estás?' classifies as conversational", () => {
  const result = triage(
    { prompt: "hola, cómo estás?", cwd: "/tmp" },
    DEFAULT_TRIAGE_CONFIG
  );
  assert.equal(result.path, "conversational");
});

test("golden conversational: no workflow hint injected", () => {
  const result = triage(
    { prompt: "hola, cómo estás?", cwd: "/tmp" },
    DEFAULT_TRIAGE_CONFIG
  );
  const hint = buildWorkflowHint(result);
  assert.ok(hint, "conversational path hint should exist (quiet UX)");
  assert.match(hint!, /conversational/, "must indicate it's conversational");
  // Should NOT mention /skill:discover or any phase
  assert.ok(!hint!.includes("/skill:discover"), "must not inject phase skills for conversational");
});

test("golden small: 'fix typo in README' classifies as small", () => {
  const result = triage(
    { prompt: "fix typo in README", cwd: "/tmp" },
    DEFAULT_TRIAGE_CONFIG
  );
  assert.equal(result.path, "small");
});

// ─────────────────────────────────────────────────────────────────
// Suite 4: Gate-response detection (3 tests — fix 3 from Sprint 3.1)
// ─────────────────────────────────────────────────────────────────

test("golden gate-response: 'dale' does not inject any hint", () => {
  const result = triage(
    { prompt: "dale", cwd: "/tmp" },
    DEFAULT_TRIAGE_CONFIG
  );
  assert.equal(result.path, "gate_response", "must detect 'dale' as gate response");
  const hint = buildWorkflowHint(result);
  assert.equal(hint, undefined, "must NOT inject hint for gate_response");
});

test("golden gate-response: 'approve' does not inject hint", () => {
  const result = triage(
    { prompt: "approve", cwd: "/tmp" },
    DEFAULT_TRIAGE_CONFIG
  );
  assert.equal(result.path, "gate_response");
  const hint = buildWorkflowHint(result);
  assert.equal(hint, undefined);
});

test("golden gate-response: 'cancel' does not inject hint", () => {
  const result = triage(
    { prompt: "cancel", cwd: "/tmp" },
    DEFAULT_TRIAGE_CONFIG
  );
  assert.equal(result.path, "gate_response");
  const hint = buildWorkflowHint(result);
  assert.equal(hint, undefined);
});

// ─────────────────────────────────────────────────────────────────
// Suite 5: Agent skill map integrity (2 tests)
// ─────────────────────────────────────────────────────────────────

test("golden skill-map: no agent references an empty skill folder", async () => {
  const skillsDir = resolve(REPO_ROOT, "skills");
  const agentSkillMapImport = await import("../skill-registry/types.js");
  const agentSkillMap = agentSkillMapImport.DEFAULT_REGISTRY_CONFIG.agent_skill_map;

  const allSkillNames = new Set<string>();
  for (const skills of Object.values(agentSkillMap)) {
    if (Array.isArray(skills)) {
      skills.forEach((s) => allSkillNames.add(s));
    }
  }

  for (const skillName of allSkillNames) {
    const skillPath = resolve(skillsDir, skillName, "SKILL.md");
    assert.ok(
      existsSync(skillPath),
      `skill "${skillName}" referenced in agent_skill_map but SKILL.md does not exist at ${skillPath}`
    );
  }
});

test("golden skill-map: substantial-path agents have correct mappings", async () => {
  const agentSkillMapImport = await import("../skill-registry/types.js");
  const agentSkillMap = agentSkillMapImport.DEFAULT_REGISTRY_CONFIG.agent_skill_map;

  // product-planner should be mapped to propose and specify
  assert.ok(agentSkillMap["product-planner"], "product-planner missing from agent_skill_map");
  assert.deepEqual(
    agentSkillMap["product-planner"],
    ["propose", "specify"],
    "product-planner should map to propose and specify"
  );

  // architect should be mapped to specify
  assert.ok(agentSkillMap["architect"], "architect missing from agent_skill_map");
  assert.deepEqual(
    agentSkillMap["architect"],
    ["specify"],
    "architect should map to specify"
  );

  // archivist should be mapped to empty array (no skills)
  assert.ok(agentSkillMap["archivist"] !== undefined, "archivist missing from agent_skill_map");
  assert.deepEqual(
    agentSkillMap["archivist"],
    [],
    "archivist should map to empty array"
  );
});

// ─────────────────────────────────────────────────────────────────
// Suite 6: Sub-agent tool_call hook (3 tests)
// ─────────────────────────────────────────────────────────────────

test("golden subagent: triage() on substantial+risk task returns has_risk_keywords=true", () => {
  // OPTION D: use cross-cutting pattern to trigger substantial
  const result = triage(
    { prompt: "rebuild auth para soportar SAML SSO across all modules", cwd: "/tmp" },
    DEFAULT_TRIAGE_CONFIG
  );
  assert.equal(result.path, "substantial", "must classify as substantial");
  assert.equal(result.has_risk_keywords, true, "must detect risk keywords (auth, saml, sso)");
});

test("golden subagent: triage() on substantial without risk returns has_risk_keywords=false", () => {
  const result = triage(
    { prompt: "refactor everything across all modules and services", cwd: "/tmp" },
    DEFAULT_TRIAGE_CONFIG
  );
  assert.equal(result.path, "substantial", "must classify as substantial (cross-cutting)");
  assert.equal(result.has_risk_keywords, false, "must not detect risk keywords");
});

test("golden subagent: triage() on small task for subagent is transparent", () => {
  const result = triage(
    { prompt: "fix typo in README", cwd: "/tmp" },
    DEFAULT_TRIAGE_CONFIG
  );
  assert.equal(result.path, "small", "must classify as small");
  assert.equal(result.has_risk_keywords, false, "no risk keywords for trivial task");
});
