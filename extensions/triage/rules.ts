/**
 * Triage rules — pure deterministic logic, no LLM, no I/O.
 *
 * Given a prompt + config, returns a TriageResult.
 * All matching is case-insensitive and word-boundary-aware where it matters.
 *
 * Rule order matters: first match wins.
 *
 * OPTION D: HYBRID EXPLICIT TRIGGERS
 * Only promote path on UNAMBIGUOUS structural signals:
 *
 *   0. Gate response (approval/cancel keywords) → gate_response
 *   1. Conversational (greeting / small talk, no task signals) → conversational
 *   2. Cross-cutting patterns (across all, everywhere) → substantial
 *   3. High ambiguity (≥3 vague terms) + ambiguity_threshold → substantial
 *   4. Explicit skill command (/skill:propose, /skill:specify, /skill:plan) → substantial
 *   5. Explicit slash command (/anything) → medium (unless matched rule 4 above)
 *   6. Code block present (``` or `) → medium
 *   7. File path present (src/, ./, .ts, .js, .go, .py, etc.) → medium
 *   8. Trivial pattern (rename, format, typo) → small
 *   9. TDD signal explicit (con tests, TDD, tests primero) → medium
 *  10. Default → small (let the model decide; has_risk_keywords flag visible but doesn't promote)
 *
 * Key change: risk_keywords no longer promote to substantial or medium.
 * Risk keywords still set has_risk_keywords=true (for warnings/audit) but don't change path.
 * The model sees has_risk_keywords in the hint and can decide to use skills if needed.
 *
 * should_load_neurox: true for medium/substantial/search_intent, false for conversational/small.
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
const CODE_BLOCK_REGEX = /```|`/;
const FILE_PATH_REGEX = /(?:src\/|\.\/|\.ts|\.js|\.go|\.py|\.jsx|\.tsx|\.rb|\.java|\.kt|\.rs)/i;

/**
 * Tokenize the prompt to lowercase tokens for keyword matching.
 * Strips punctuation, normalizes Unicode accents (NFD + diacritic strip) so
 * "buenos días" matches the config pattern "buenos dias" without forcing the
 * config to enumerate every accented variant.
 */
function tokenize(prompt: string): string {
  return prompt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^\w\s\-/.]/g, " ");
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
 * Returns true if any of the matched task signals imply creating a NEW module
 * OR investigating a bug (vs a mechanical edit). Used to upgrade
 * "single-file mention" from small to medium when the user is starting new
 * work or diagnosing something.
 *
 * Two categories of verbs trigger this:
 *
 * CREATE verbs — introduce new code surface, design thought needed:
 *   create / crea / build / construye / add / agrega / añade / write /
 *   escribe / implement / implementa
 *
 * INVESTIGATE verbs — diagnostic work that may touch multiple things or
 * change scope as understanding deepens:
 *   debug / depura / investigate / investiga / analyze / analiza /
 *   refactor / refactoriza / explain / explica / design / diseña
 *
 * Pure EDIT verbs (fix, update, rename, remove, format) stay small-eligible
 * because they are usually mechanical.
 */
function hasNonTrivialIntent(taskHits: readonly string[]): boolean {
  const NON_TRIVIAL_VERBS = new Set([
    // create verbs
    "create",
    "crea",
    "crear",
    "build",
    "construye",
    "construir",
    "add",
    "agrega",
    "agregar",
    "añade",
    "añadir",
    "write",
    "escribe",
    "escribir",
    "implement",
    "implementa",
    "implementar",
    // investigate verbs
    "debug",
    "depura",
    "depurar",
    "investigate",
    "investiga",
    "investigar",
    "analyze",
    "analiza",
    "analizar",
    "refactor",
    "refactoriza",
    "refactorizar",
    "explain",
    "explica",
    "explicar",
    "design",
    "diseña",
    "diseñar",
  ]);
  return taskHits.some((h) => NON_TRIVIAL_VERBS.has(h.toLowerCase()));
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

/**
 * Returns true if the prompt contains a code block (``` or backticks).
 */
function hasCodeBlock(prompt: string): boolean {
  return CODE_BLOCK_REGEX.test(prompt);
}

/**
 * Returns true if the prompt contains a file path reference
 * (src/, ./, .ts, .js, .go, .py, etc.).
 */
function hasFilePath(prompt: string): boolean {
  return FILE_PATH_REGEX.test(prompt);
}

/**
 * Returns true if the prompt starts with /skill: command (e.g., /skill:propose, /skill:plan).
 * Substantial triggers: /skill:propose, /skill:specify, /skill:plan
 * Medium triggers: /skill:* (others)
 */
function detectSkillCommand(prompt: string): "substantial" | "medium" | null {
  const trimmed = prompt.trim();
  const substantialSkills = [
    "/skill:propose",
    "/skill:specify",
    "/skill:plan",
  ];
  for (const skill of substantialSkills) {
    if (trimmed.startsWith(skill)) return "substantial";
  }
  if (trimmed.startsWith("/skill:")) return "medium";
  if (trimmed.startsWith("/")) return "medium";
  return null;
}

/**
 * Returns true if the prompt contains the keyword "subagent" literally.
 * Used to detect explicit agent delegation intent.
 */
function hasSubagentKeyword(haystack: string): boolean {
  return /\bsubagent\b/i.test(haystack);
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
  const conversationalHits = findMatches(haystack, config.conversational_patterns);
  const taskHits = findMatches(haystack, config.task_signals);
  const searchHits = findMatches(haystack, config.search_intent);
  const tddHits = findMatches(haystack, config.tdd_signals);

  const fileMentions = extractFileMentions(input.prompt);
  const moduleHints = extractModuleHints(input.prompt);
  const promptLength = input.prompt.length;

  // Record signals for audit/debug
  if (riskHits.length > 0) signals.push(`risk_keywords:${riskHits.join(",")}`);
  if (crossCuttingHits.length > 0) signals.push(`cross_cutting:${crossCuttingHits.join(",")}`);
  if (ambiguityHits.length > 0) signals.push(`ambiguity_terms:${ambiguityHits.join(",")}`);
  if (trivialHits.length > 0) signals.push(`trivial_patterns:${trivialHits.join(",")}`);
  if (conversationalHits.length > 0) signals.push(`conversational_patterns:${conversationalHits.join(",")}`);
  if (taskHits.length > 0) signals.push(`task_signals:${taskHits.slice(0, 3).join(",")}`);
  if (searchHits.length > 0) signals.push(`search_intent:${searchHits.slice(0, 3).join(",")}`);
  if (tddHits.length > 0) signals.push(`tdd_signals:${tddHits.slice(0, 3).join(",")}`);
  if (fileMentions.length > 0) signals.push(`file_mentions:${fileMentions.length}`);
  if (moduleHints.length > 0) signals.push(`module_hints:${moduleHints.length}`);
  signals.push(`prompt_length:${promptLength}`);

   let path: TriagePath = "small"; // OPTION D: default to small, not medium
   let reason = "default: no structural signal detected";

   // Rule 0: gate response detection
   // If the prompt matches a known gate-response keyword, return classification "gate_response"
   // which tells buildWorkflowHint to NOT inject any hint (preserve current workflow state).
   // Only detect UNAMBIGUOUS gate keywords (not "ok" or "y" which are conversational).
   const GATE_RESPONSE_KEYWORDS = new Set([
     // approval — unambiguous gate keywords
     "approve",
     "approved",
     "dale",
     "si",
     "sí",
     "proceed",
     "continua",
     "continúa",
     "ejecuta",
     "lgtm",
     // cancel — unambiguous gate keywords
     "cancel",
     "stop",
     "para",
     "abortar",
     "abort",
     "salir",
   ]);

   // Check: is the entire prompt (trimmed, lowercased) a gate keyword?
   // Also match: "edit <anything>" pattern
   const trimmed = input.prompt.trim().toLowerCase();
   if (
     GATE_RESPONSE_KEYWORDS.has(trimmed) ||
     trimmed.startsWith("edit ") ||
     trimmed.startsWith('edit"')
   ) {
     path = "gate_response";
     reason = "gate response: preserving current workflow state";
     return {
       path,
       reason,
       tdd: false,
       should_load_neurox: false,
       estimated_files: 0,
       estimated_modules: 0,
       has_risk_keywords: riskHits.length > 0,
       signals: [`gate_response:${trimmed.slice(0, 30)}`],
       ts: new Date().toISOString(),
     };
   }

   // Rule 1: conversational — pure greeting / small talk, no technical intent
   // Triggers if: matches a conversational pattern AND no task signals AND no
   // file mentions AND no file paths AND no code blocks AND prompt is short.
   if (
     conversationalHits.length > 0 &&
     taskHits.length === 0 &&
     searchHits.length === 0 &&
     fileMentions.length === 0 &&
     !hasFilePath(input.prompt) &&
     !hasCodeBlock(input.prompt) &&
     promptLength <= config.conversational_max_chars
   ) {
     path = "conversational";
     reason = `conversational / small talk: "${conversationalHits[0]}"`;
   }
   // Rule 2: explicit slash command or /skill:* → substantial or medium
   // SUBSTANTIAL: /skill:propose, /skill:specify, /skill:plan (unambiguous intent)
   // MEDIUM: other /skill:* or generic /command
   else if (detectSkillCommand(input.prompt) === "substantial") {
     path = "substantial";
     reason = "explicit skill command: /skill:propose, /skill:specify, or /skill:plan";
   }
   else if (detectSkillCommand(input.prompt) === "medium") {
     path = "medium";
     reason = "explicit skill command or slash command";
   }
   // Rule 3: cross-cutting → substantial
   // Explicit signals: "across all", "everywhere", "all modules", "entire codebase", etc.
   else if (crossCuttingHits.length > 0 || moduleHints.length >= 3) {
     path = "substantial";
     reason =
       crossCuttingHits.length > 0
         ? `cross-cutting language: "${crossCuttingHits[0]}"`
         : `affects ${moduleHints.length} modules: ${moduleHints.slice(0, 3).join(", ")}`;
   }
   // Rule 4: high ambiguity → substantial
   else if (ambiguityHits.length >= config.ambiguity_threshold) {
     path = "substantial";
     reason = `ambiguous request: ${ambiguityHits.length} vague terms (${ambiguityHits.slice(0, 3).join(", ")})`;
   }
   // Rule 5: code block present → medium (user pasting code to review/edit)
   else if (hasCodeBlock(input.prompt)) {
     path = "medium";
     reason = "code block detected: user pasting code to review/edit";
   }
   // Rule 6: file path mention → medium (user pointing at specific code)
   else if (hasFilePath(input.prompt)) {
     path = "medium";
     reason = "file path detected: user pointing at specific code";
   }
   // Rule 7: subagent keyword → medium (explicit agent delegation intent)
   else if (hasSubagentKeyword(input.prompt)) {
     path = "medium";
     reason = "explicit subagent keyword: user requesting agent delegation";
   }
   // Rule 8: explicit TDD intent → medium
   // Rationale: TDD requires red→green→refactor cycles, not a one-shot edit.
   // The user said "con tests TDD" or similar — they explicitly want the workflow.
   else if (tddHits.length > 0) {
     path = "medium";
     reason = `explicit TDD intent: "${tddHits[0]}"`;
   }
   // Rule 9: trivial pattern → small (rename, format, typo only)
   else if (trivialHits.length > 0) {
     path = "small";
     reason = `trivial mechanical change: "${trivialHits[0]}"`;
   }
   // Rule 10 (default): small
   // No structural signal detected → let the model decide.
   // Risk keywords still set has_risk_keywords=true (visible in hint) but don't promote path.

    // should_load_neurox decision:
    //  - conversational → never (unless explicit search_intent)
    //  - gate_response → never
    //  - small → never (unless explicit search_intent)
    //  - medium/substantial → yes
    //  - explicit search_intent → always yes
    const should_load_neurox =
      (path === "medium" || path === "substantial") ||
      searchHits.length > 0;

   // tdd: enforce for medium/substantial, OR for small if risk keywords present
   // (OPTION D: risk keywords no longer auto-promote, but they still force TDD)
   const tdd =
     path === "substantial" ||
     path === "medium" ||
     (path === "small" && riskHits.length > 0);

  return {
    path,
    reason,
    tdd,
    should_load_neurox,
    estimated_files: Math.max(
      fileMentions.length,
      moduleHints.length,
      path === "small" ? 1 : path === "conversational" ? 0 : 3,
    ),
    estimated_modules: Math.max(moduleHints.length, path === "conversational" ? 0 : 1),
    has_risk_keywords: riskHits.length > 0,
    signals,
    ts: new Date().toISOString(),
  };
}
