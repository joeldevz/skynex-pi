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
    { dir: "grill-me", content: minimalSkill("grill-me") },
    { dir: "tdd-discipline", content: minimalSkill("tdd-discipline") },
    { dir: "security", content: minimalSkill("security") },
  ]);
  try {
    const reg = buildRegistry(tmp, DEFAULT_REGISTRY_CONFIG, path.join(tmp, ".nonexistent-agent-dir"));
    const coderSkills = getSkillsForAgent(reg, "coder", DEFAULT_REGISTRY_CONFIG);
    const securitySkills = getSkillsForAgent(reg, "security", DEFAULT_REGISTRY_CONFIG);

    // coder is mapped to ["tdd-discipline", "verification-before-completion"]
    // verification-before-completion is not in our temp project, so only tdd-discipline returns
    assert.equal(coderSkills.length, 1);
    assert.equal(coderSkills[0].name, "tdd-discipline");

    // security mapped to ["security", "adversarial-review"], only "security" exists
    assert.equal(securitySkills.length, 1);
    assert.equal(securitySkills[0].name, "security");
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
