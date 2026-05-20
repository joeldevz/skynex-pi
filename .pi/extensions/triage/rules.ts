/**
 * Triage rules — pure deterministic logic, no LLM, no I/O.
 *
 * Given a prompt + config, returns a TriageResult.
 * All matching is case-insensitive and word-boundary-aware where it matters.
 *
 * Rule order matters: first match wins.
 *
 *   1. Risk keywords    → substantial
 *   2. Cross-cutting    → substantial
 *   3. High ambiguity   → substantial
 *   4. Trivial pattern  → small
 *   5. Short + concrete → small
 *   6. Default          → medium
 */

import type {
  TriageConfig,
  TriageInput,
  TriagePath,
  TriageResult,
} from "./types.js";

const PROMPT_LENGTH_SMALL = 120; // chars
const FILE_MENTION_REGEX = /([\w.\-/]+\.(?:ts|tsx|js|jsx|go|py|rb|java|kt|rs|md|yaml|yml|json))/gi;
const MODULE_HINT_REGEX = /(?:^|\s)(?:src|app|lib|packages|services|modules)\/([\w-]+)/gi;

/**
 * Tokenize the prompt to lowercase tokens for keyword matching.
 * Strips punctuation but preserves word boundaries.
 */
function tokenize(prompt: string): string {
  return prompt.toLowerCase().replace(/[^\w\s\-/.]/g, " ");
}

/**
 * Returns the list of keywords from `needles` that appear in `haystack`.
 * Multi-word needles are matched as substring; single-word needles are word-boundary-matched.
 */
function findMatches(haystack: string, needles: readonly string[]): string[] {
  const hits: string[] = [];
  for (const needle of needles) {
    const lower = needle.toLowerCase();
    if (lower.includes(" ")) {
      if (haystack.includes(lower)) hits.push(needle);
    } else {
      const re = new RegExp(`\\b${escapeRegex(lower)}\\b`, "i");
      if (re.test(haystack)) hits.push(needle);
    }
  }
  return hits;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract distinct file mentions from the prompt (e.g. "src/auth/service.ts").
 */
function extractFileMentions(prompt: string): string[] {
  const matches = prompt.match(FILE_MENTION_REGEX) ?? [];
  return Array.from(new Set(matches));
}

/**
 * Extract distinct module names from common path hints (src/X, app/X, etc.).
 */
function extractModuleHints(prompt: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(MODULE_HINT_REGEX);
  while ((m = re.exec(prompt)) !== null) {
    if (m[1]) out.add(m[1]);
  }
  return Array.from(out);
}

export function triage(
  input: TriageInput,
  config: TriageConfig,
): TriageResult {
  const haystack = tokenize(input.prompt);
  const signals: string[] = [];

  const riskHits = findMatches(haystack, config.risk_keywords);
  const crossCuttingHits = findMatches(haystack, config.cross_cutting_patterns);
  const ambiguityHits = findMatches(haystack, config.ambiguity_terms);
  const trivialHits = findMatches(haystack, config.trivial_patterns);

  const fileMentions = extractFileMentions(input.prompt);
  const moduleHints = extractModuleHints(input.prompt);
  const promptLength = input.prompt.length;

  // Record signals for audit/debug
  if (riskHits.length > 0) signals.push(`risk_keywords:${riskHits.join(",")}`);
  if (crossCuttingHits.length > 0) signals.push(`cross_cutting:${crossCuttingHits.join(",")}`);
  if (ambiguityHits.length > 0) signals.push(`ambiguity_terms:${ambiguityHits.join(",")}`);
  if (trivialHits.length > 0) signals.push(`trivial_patterns:${trivialHits.join(",")}`);
  if (fileMentions.length > 0) signals.push(`file_mentions:${fileMentions.length}`);
  if (moduleHints.length > 0) signals.push(`module_hints:${moduleHints.length}`);
  signals.push(`prompt_length:${promptLength}`);

  let path: TriagePath = "medium";
  let reason = "default: clear request affecting a single module";

  // Rule 1: risk keywords → substantial
  if (riskHits.length > 0) {
    path = "substantial";
    reason = `risk keyword(s) detected: ${riskHits.slice(0, 3).join(", ")}`;
  }
  // Rule 2: cross-cutting → substantial
  else if (crossCuttingHits.length > 0 || moduleHints.length >= 3) {
    path = "substantial";
    reason =
      crossCuttingHits.length > 0
        ? `cross-cutting language: "${crossCuttingHits[0]}"`
        : `affects ${moduleHints.length} modules: ${moduleHints.slice(0, 3).join(", ")}`;
  }
  // Rule 3: high ambiguity → substantial
  else if (ambiguityHits.length >= config.ambiguity_threshold) {
    path = "substantial";
    reason = `ambiguous request: ${ambiguityHits.length} vague terms (${ambiguityHits.slice(0, 3).join(", ")})`;
  }
  // Rule 4: trivial pattern → small (only if no risk/ambiguity already)
  else if (trivialHits.length > 0 && fileMentions.length <= 1) {
    path = "small";
    reason = `trivial mechanical change: "${trivialHits[0]}"`;
  }
  // Rule 5: short prompt + concrete file mention → small
  else if (
    promptLength < PROMPT_LENGTH_SMALL &&
    fileMentions.length === 1 &&
    ambiguityHits.length === 0
  ) {
    path = "small";
    reason = `short concrete request on single file: ${fileMentions[0]}`;
  }
  // Rule 6 (default): medium

  return {
    path,
    reason,
    tdd: path !== "small" || riskHits.length > 0,
    estimated_files: Math.max(fileMentions.length, moduleHints.length, path === "small" ? 1 : 3),
    estimated_modules: Math.max(moduleHints.length, 1),
    has_risk_keywords: riskHits.length > 0,
    signals,
    ts: new Date().toISOString(),
  };
}
