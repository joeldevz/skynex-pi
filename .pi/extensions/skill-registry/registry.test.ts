/**
 * Integration tests for the registry builder — uses tmp directories.
 *
 * Run: pnpm exec tsx --test extensions/core/skill-registry/registry.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  buildRegistry,
  loadCache,
  saveCache,
  isCacheValid,
  getSkillsForAgent,
  buildPromptInjection,
  shouldRefreshOnFile,
} from "./registry.js";
import { DEFAULT_REGISTRY_CONFIG } from "./types.js";

/** Create a temp project with a .pi/skills directory and N skills. */
function makeTempProject(skills: Array<{ dir: string; content: string }>): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skynex-skillreg-"));
  for (const { dir, content } of skills) {
    const skillDir = path.join(tmp, ".pi", "skills", dir);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);
  }
  return tmp;
}

function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const minimalSkill = (name: string, withRules = true) => `---
name: ${name}
description: Test skill ${name} description.
---

# ${name}

Some body content.

${withRules ? `## Compact Rules

1. First rule for ${name}
2. Second rule for ${name}
3. Third rule for ${name}
` : ""}
`;

const bloatedSkill = (name: string) => `---
name: ${name}
description: Bloated skill ${name}.
---

# ${name}

## Compact Rules

${Array.from({ length: 50 }, (_, i) => `${i + 1}. ${"a very long rule that takes many tokens to express in detail ".repeat(5)}`).join("\n")}
`;

// ─── buildRegistry ────────────────────────────────────────────────────────────

test("build: discovers skills from .pi/skills directory", () => {
  const tmp = makeTempProject([
    { dir: "alpha", content: minimalSkill("alpha") },
    { dir: "beta", content: minimalSkill("beta") },
  ]);
  try {
    const reg = buildRegistry(tmp, DEFAULT_REGISTRY_CONFIG, path.join(tmp, ".nonexistent-agent-dir"));
    assert.equal(Object.keys(reg.skills).length, 2);
    assert.ok(reg.skills["alpha"]);
    assert.ok(reg.skills["beta"]);
  } finally {
    cleanup(tmp);
  }
});

test("build: extracts compact rules per skill", () => {
  const tmp = makeTempProject([{ dir: "alpha", content: minimalSkill("alpha") }]);
  try {
    const reg = buildRegistry(tmp, DEFAULT_REGISTRY_CONFIG, path.join(tmp, ".nonexistent-agent-dir"));
    assert.equal(reg.skills["alpha"].compactRules.length, 3);
    assert.equal(reg.skills["alpha"].compactRules[0], "First rule for alpha");
  } finally {
    cleanup(tmp);
  }
});

test("build: skill without compact rules → empty array, not error", () => {
  const tmp = makeTempProject([{ dir: "alpha", content: minimalSkill("alpha", false) }]);
  try {
    const reg = buildRegistry(tmp, DEFAULT_REGISTRY_CONFIG, path.join(tmp, ".nonexistent-agent-dir"));
    assert.equal(reg.skills["alpha"].compactRules.length, 0);
    assert.equal(reg.skills["alpha"].exceedsBudget, false);
  } finally {
    cleanup(tmp);
  }
});

test("build: hashes are computed and stable", () => {
  const tmp = makeTempProject([{ dir: "alpha", content: minimalSkill("alpha") }]);
  try {
    const reg1 = buildRegistry(tmp, DEFAULT_REGISTRY_CONFIG, path.join(tmp, ".nonexistent-agent-dir"));
    const reg2 = buildRegistry(tmp, DEFAULT_REGISTRY_CONFIG, path.join(tmp, ".nonexistent-agent-dir"));
    assert.equal(reg1.skills["alpha"].hash, reg2.skills["alpha"].hash);
    assert.match(reg1.skills["alpha"].hash, /^[a-f0-9]{64}$/);
  } finally {
    cleanup(tmp);
  }
});

test("build: bloated skill exceeds budget and adds diagnostic", () => {
  const tmp = makeTempProject([{ dir: "bloated", content: bloatedSkill("bloated") }]);
  try {
    const reg = buildRegistry(tmp, DEFAULT_REGISTRY_CONFIG, path.join(tmp, ".nonexistent-agent-dir"));
    assert.equal(reg.skills["bloated"].exceedsBudget, true);
    assert.ok(reg.diagnostics.some((d) => d.includes("bloated") && d.includes("exceed")));
  } finally {
    cleanup(tmp);
  }
});

// ─── cache (load/save/validate) ──────────────────────────────────────────────

test("cache: saves and loads roundtrip", () => {
  const tmp = makeTempProject([{ dir: "alpha", content: minimalSkill("alpha") }]);
  try {
    const reg = buildRegistry(tmp, DEFAULT_REGISTRY_CONFIG, path.join(tmp, ".nonexistent-agent-dir"));
    saveCache(".skynex/test-cache.json", tmp, reg);
    const loaded = loadCache(".skynex/test-cache.json", tmp);
    assert.ok(loaded);
    assert.equal(Object.keys(loaded!.skills).length, 1);
    assert.equal(loaded!.skills["alpha"].name, "alpha");
  } finally {
    cleanup(tmp);
  }
});

test("cache: invalid when version mismatch", () => {
  const tmp = makeTempProject([{ dir: "alpha", content: minimalSkill("alpha") }]);
  try {
    const dir = path.join(tmp, ".skynex");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "test-cache.json"),
      JSON.stringify({ version: 999, lastBuilt: "...", skills: {}, diagnostics: [] }),
    );
    const loaded = loadCache(".skynex/test-cache.json", tmp);
    assert.equal(loaded, undefined);
  } finally {
    cleanup(tmp);
  }
});

test("cache: invalid when source file modified", () => {
  const tmp = makeTempProject([{ dir: "alpha", content: minimalSkill("alpha") }]);
  try {
    const reg = buildRegistry(tmp, DEFAULT_REGISTRY_CONFIG, path.join(tmp, ".nonexistent-agent-dir"));
    saveCache(".skynex/test-cache.json", tmp, reg);

    // Modify the source file → cache should be stale
    fs.writeFileSync(
      path.join(tmp, ".pi", "skills", "alpha", "SKILL.md"),
      minimalSkill("alpha-modified"),
    );

    const loaded = loadCache(".skynex/test-cache.json", tmp);
    assert.ok(loaded);
    assert.equal(isCacheValid(loaded!), false);
  } finally {
    cleanup(tmp);
  }
});

test("cache: valid when source files unchanged", () => {
  const tmp = makeTempProject([{ dir: "alpha", content: minimalSkill("alpha") }]);
  try {
    const reg = buildRegistry(tmp, DEFAULT_REGISTRY_CONFIG, path.join(tmp, ".nonexistent-agent-dir"));
    saveCache(".skynex/test-cache.json", tmp, reg);

    const loaded = loadCache(".skynex/test-cache.json", tmp);
    assert.ok(loaded);
    assert.equal(isCacheValid(loaded!), true);
  } finally {
    cleanup(tmp);
  }
});

// ─── getSkillsForAgent ────────────────────────────────────────────────────────

test("agent-map: returns subset matching agent_skill_map", () => {
  const tmp = makeTempProject([
    { dir: "propose", content: minimalSkill("propose") },
    { dir: "specify", content: minimalSkill("specify") },
    { dir: "discover", content: minimalSkill("discover") },
  ]);
  try {
    const reg = buildRegistry(tmp, DEFAULT_REGISTRY_CONFIG, path.join(tmp, ".nonexistent-agent-dir"));
    const productPlannerSkills = getSkillsForAgent(reg, "product-planner", DEFAULT_REGISTRY_CONFIG);
    const architectSkills = getSkillsForAgent(reg, "architect", DEFAULT_REGISTRY_CONFIG);

    // product-planner is mapped to ["propose", "specify"]
    assert.equal(productPlannerSkills.length, 2);
    assert.ok(productPlannerSkills.some((s) => s.name === "propose"));
    assert.ok(productPlannerSkills.some((s) => s.name === "specify"));

    // architect mapped to ["specify"], so only specify returns
    assert.equal(architectSkills.length, 1);
    assert.equal(architectSkills[0].name, "specify");
  } finally {
    cleanup(tmp);
  }
});

test("agent-map: unknown agent returns ALL skills (conservative)", () => {
  const tmp = makeTempProject([
    { dir: "alpha", content: minimalSkill("alpha") },
    { dir: "beta", content: minimalSkill("beta") },
  ]);
  try {
    const reg = buildRegistry(tmp, DEFAULT_REGISTRY_CONFIG, path.join(tmp, ".nonexistent-agent-dir"));
    const result = getSkillsForAgent(reg, "unknown-agent-xyz", DEFAULT_REGISTRY_CONFIG);
    assert.equal(result.length, 2);
  } finally {
    cleanup(tmp);
  }
});

// ─── buildPromptInjection ────────────────────────────────────────────────────

test("prompt: builds markdown injection for agent", () => {
  const tmp = makeTempProject([
    { dir: "tdd-discipline", content: minimalSkill("tdd-discipline") },
  ]);
  try {
    const reg = buildRegistry(tmp, DEFAULT_REGISTRY_CONFIG, path.join(tmp, ".nonexistent-agent-dir"));
    const inject = buildPromptInjection(reg, "coder", DEFAULT_REGISTRY_CONFIG);
    assert.match(inject, /## Project Standards \(auto-resolved\)/);
    assert.match(inject, /\*\*tdd-discipline\*\*/);
    assert.match(inject, /First rule for tdd-discipline/);
  } finally {
    cleanup(tmp);
  }
});

test("prompt: empty registry returns empty string", () => {
  const tmp = makeTempProject([]);
  try {
    const reg = buildRegistry(tmp, DEFAULT_REGISTRY_CONFIG, path.join(tmp, ".nonexistent-agent-dir"));
    const inject = buildPromptInjection(reg, "coder", DEFAULT_REGISTRY_CONFIG);
    assert.equal(inject, "");
  } finally {
    cleanup(tmp);
  }
});

// ─── agent_skill_map (Sprint 3 additions) ────────────────────────────────────

test("agent-map: product-planner maps to ['propose', 'specify']", () => {
  const config = DEFAULT_REGISTRY_CONFIG;
  assert.deepEqual(config.agent_skill_map["product-planner"], ["propose", "specify"]);
});

test("agent-map: architect maps to ['specify']", () => {
  const config = DEFAULT_REGISTRY_CONFIG;
  assert.deepEqual(config.agent_skill_map["architect"], ["specify"]);
});

test("agent-map: archivist maps to [] (no skills)", () => {
  const config = DEFAULT_REGISTRY_CONFIG;
  assert.deepEqual(config.agent_skill_map["archivist"], []);
});

test("agent-map: no entry references empty skill folders", () => {
  const config = DEFAULT_REGISTRY_CONFIG;
  const emptySkills = new Set([
    "grill-me",
    "prd",
    "tdd-discipline",
    "verification-before-completion",
    "adversarial-review",
  ]);
  const referencedSkills = new Set<string>();
  for (const skills of Object.values(config.agent_skill_map)) {
    for (const skill of skills) {
      referencedSkills.add(skill);
    }
  }
   const invalidRefs = Array.from(referencedSkills).filter((s) => emptySkills.has(s));
   assert.equal(
     invalidRefs.length,
     0,
     `Found references to empty skill folders: ${invalidRefs.join(", ")}`,
   );
});

// ─── shouldRefreshOnFile ──────────────────────────────────────────────────────

test("shouldRefreshOnFile: 'SKILL.md' → true", () => {
  assert.equal(shouldRefreshOnFile("SKILL.md"), true);
});

test("shouldRefreshOnFile: 'discover/SKILL.md' → true", () => {
  assert.equal(shouldRefreshOnFile("discover/SKILL.md"), true);
});

test("shouldRefreshOnFile: 'propose/SKILL.md' → true", () => {
  assert.equal(shouldRefreshOnFile("propose/SKILL.md"), true);
});

test("shouldRefreshOnFile: 'index.ts' → false", () => {
  assert.equal(shouldRefreshOnFile("index.ts"), false);
});

test("shouldRefreshOnFile: 'README.md' → false", () => {
  assert.equal(shouldRefreshOnFile("README.md"), false);
});

test("shouldRefreshOnFile: undefined → false", () => {
  assert.equal(shouldRefreshOnFile(undefined), false);
});
