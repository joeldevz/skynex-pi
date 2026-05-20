/**
 * Compact-rules parser — pure, no I/O.
 *
 * Extracts a `## Compact Rules` (or configurable heading) section from a
 * SKILL.md body. Returns the rules as an array of strings.
 *
 * Rule format expected inside the section:
 *   1. Always do X
 *   2. Never do Y
 *   - Some rule (bullet form also accepted)
 *
 * Lines that are not numbered/bulleted are joined with the previous rule
 * as continuations (multi-line rule support).
 */

import { createHash } from "node:crypto";

/**
 * Returns the index of the heading line (start of `## Compact Rules` block)
 * or -1 if not present.
 */
function findHeadingIndex(lines: string[], heading: string): number {
  const target = heading.toLowerCase().trim();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match any heading level (## or ###) with the target text
    const match = line.match(/^#{2,6}\s+(.+?)\s*$/);
    if (match && match[1].toLowerCase() === target) return i;
  }
  return -1;
}

/**
 * Returns the index of the NEXT heading at the same or higher level,
 * after `startIndex`. -1 if no further heading (end of file).
 */
function findNextHeadingIndex(lines: string[], startIndex: number, currentLevel: number): number {
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+/);
    if (match && match[1].length <= currentLevel) return i;
  }
  return -1;
}

/**
 * Extract compact rules from a SKILL.md body.
 * Returns an array of rule strings (already trimmed, no leading numbering).
 */
export function extractCompactRules(body: string, heading: string): string[] {
  const lines = body.split(/\r?\n/);
  const headingIdx = findHeadingIndex(lines, heading);
  if (headingIdx === -1) return [];

  // Detect heading level (## = 2, ### = 3, etc.) at the found line
  const headingLine = lines[headingIdx].trim();
  const levelMatch = headingLine.match(/^(#{2,6})\s/);
  const level = levelMatch ? levelMatch[1].length : 2;

  const endIdx = findNextHeadingIndex(lines, headingIdx, level);
  const sectionLines = lines.slice(
    headingIdx + 1,
    endIdx === -1 ? undefined : endIdx,
  );

  // Parse rules: numbered, bulleted, or continuation lines
  const rules: string[] = [];
  let current: string | null = null;

  for (const raw of sectionLines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      // blank line: close current rule
      if (current !== null) {
        rules.push(current.trim());
        current = null;
      }
      continue;
    }

    // Numbered: "1. text" / "10) text"
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    // Bulleted: "- text" / "* text" / "+ text"
    const bulleted = line.match(/^\s*[-*+]\s+(.+)$/);

    if (numbered) {
      if (current !== null) rules.push(current.trim());
      current = numbered[1];
    } else if (bulleted) {
      if (current !== null) rules.push(current.trim());
      current = bulleted[1];
    } else if (current !== null) {
      // Continuation of previous rule
      current += " " + line.trim();
    }
    // Else: stray line before any rule, ignore
  }

  if (current !== null) rules.push(current.trim());
  return rules;
}

/**
 * Approximate token count using the chars/4 heuristic.
 * Standard rough estimate used by Anthropic, OpenAI, and others.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Compute SHA-256 hex of a string (used for cache invalidation).
 */
export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Format compact rules as a Markdown block for injection into a sub-agent prompt.
 * Output:
 *   ## Project Standards (auto-resolved)
 *
 *   **{skillName}**
 *   1. {rule1}
 *   2. {rule2}
 *
 *   **{otherSkill}**
 *   1. ...
 */
export function formatRulesForPrompt(skills: Array<{ name: string; compactRules: string[] }>): string {
  if (skills.length === 0) return "";
  const blocks: string[] = ["## Project Standards (auto-resolved)\n"];
  for (const skill of skills) {
    if (skill.compactRules.length === 0) continue;
    blocks.push(`**${skill.name}**`);
    for (let i = 0; i < skill.compactRules.length; i++) {
      blocks.push(`${i + 1}. ${skill.compactRules[i]}`);
    }
    blocks.push(""); // blank line between skills
  }
  return blocks.join("\n");
}
