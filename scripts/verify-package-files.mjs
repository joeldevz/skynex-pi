#!/usr/bin/env node
/**
 * verify-package-files.mjs
 *
 * Pre-publish validation:
 * 1. Required directories exist (extensions/, skills/, assets/agents/)
 * 2. package.json has required fields (name, version, pi manifest)
 * 3. All extensions referenced in pi manifest exist
 * 4. All bundled agents have valid frontmatter (name + envelope)
 * 5. All skills have SKILL.md
 *
 * Exits with code 1 on validation failure.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const errors = [];
const warnings = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

// 1. Required directories
for (const dir of ["extensions", "skills", "assets/agents"]) {
  const p = join(ROOT, dir);
  if (!existsSync(p)) err(`Missing required directory: ${dir}/`);
}

// 2. package.json
let pkg;
try {
  pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
} catch (e) {
  err(`Cannot read package.json: ${e.message}`);
}

if (pkg) {
  if (!pkg.name) err("package.json missing 'name'");
  if (!pkg.version) err("package.json missing 'version'");
  if (!pkg.pi) err("package.json missing 'pi' manifest");
  if (pkg.pi && !pkg.pi.extensions) err("pi manifest missing 'extensions'");
  if (pkg.pi && !pkg.pi.skills) err("pi manifest missing 'skills'");

  // 3. Each extension path exists
  if (pkg.pi?.extensions) {
    for (const ext of pkg.pi.extensions) {
      const extPath = join(ROOT, ext);
      if (!existsSync(extPath)) {
        err(`Extension path missing: ${ext}`);
      } else {
        // Check there's an index.ts
        const idx = join(extPath, "index.ts");
        if (!existsSync(idx)) {
          err(`Extension missing index.ts: ${ext}`);
        }
      }
    }
  }
}

// 4. Validate bundled agents
const agentsDir = join(ROOT, "assets/agents");
if (existsSync(agentsDir)) {
  const agentFiles = readdirSync(agentsDir).filter(
    (f) => f.endsWith(".md") && f !== "README.md"
  );
  if (agentFiles.length === 0) {
    err("No agent files found in assets/agents/");
  }
  for (const file of agentFiles) {
    const content = readFileSync(join(agentsDir, file), "utf8");
    if (!content.match(/^---\s*\n.*name:/ms)) {
      err(`Agent ${file}: missing frontmatter with name`);
    }
    if (!content.includes("```yaml")) {
      warn(`Agent ${file}: no YAML envelope block found`);
    }
    if (!content.includes("Emit the envelope and stop")) {
      warn(`Agent ${file}: missing kill-switch sentence`);
    }
  }
}

// 5. Validate skills
const skillsDir = join(ROOT, "skills");
if (existsSync(skillsDir)) {
  const skillDirs = readdirSync(skillsDir).filter((name) => {
    const p = join(skillsDir, name);
    return statSync(p).isDirectory() && !name.startsWith("_");
  });
  for (const skillName of skillDirs) {
    const skillFile = join(skillsDir, skillName, "SKILL.md");
    if (!existsSync(skillFile)) {
      warn(`Skill ${skillName}: missing SKILL.md`);
      continue;
    }
    const content = readFileSync(skillFile, "utf8");
    if (!content.match(/^---\s*\n.*name:/ms)) {
      err(`Skill ${skillName}: missing frontmatter with name`);
    }
    if (!content.match(/^## Compact Rules/m)) {
      warn(`Skill ${skillName}: missing '## Compact Rules' section`);
    }
  }
}

// Report
if (warnings.length > 0) {
  console.log("\n⚠️  Warnings:");
  for (const w of warnings) console.log(`  - ${w}`);
}

if (errors.length > 0) {
  console.error("\n❌ Validation failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`\n✅ Package validation passed (${warnings.length} warning(s))`);
