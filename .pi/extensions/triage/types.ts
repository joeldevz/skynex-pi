/**
 * Triage types — internal to the triage extension.
 * Imported by index.ts (the Pi extension entry) and rules.ts (the matchers).
 */

/**
 * conversational — greeting, small talk, no technical task. Skips Neurox, skips planning.
 * small  — trivial mechanical change in 1 file.
 * medium — clear technical request, single module.
 * substantial — ambiguous, cross-module, or risky.
 * gate_response — response to an active HITL gate (approve/cancel/edit). Preserves workflow state.
 */
export type TriagePath = "conversational" | "small" | "medium" | "substantial" | "gate_response";

export interface TriageResult {
  /** The path the request is routed to. */
  path: TriagePath;
  /** Human-readable reason that selected this path. */
  reason: string;
  /** True if TDD discipline should be enforced for this request. */
  tdd: boolean;
  /**
   * Whether downstream agents should consult Neurox (recall/context) for this request.
   * False for conversational, true for small+/risk_keywords.
   */
  should_load_neurox: boolean;
  /** Estimated number of files this request will touch (heuristic, not exact). */
  estimated_files: number;
  /** Estimated number of modules / top-level directories affected. */
  estimated_modules: number;
  /** True if the request mentions risk keywords (auth, payment, migration, etc.). */
  has_risk_keywords: boolean;
  /** Which specific signals fired (for debugging / audit). */
  signals: string[];
  /** Timestamp when triage was computed. */
  ts: string;
}

export interface TriageInput {
  /** The raw user prompt text. */
  prompt: string;
  /** Current working directory (read from ctx.cwd). */
  cwd: string;
}

/**
 * Configuration for triage rules.
 * Loaded from .skynex/triage.json if present, defaults otherwise.
 */
export interface TriageConfig {
  /** Keywords that ALWAYS promote to substantial path. */
  risk_keywords: string[];
  /** Patterns ("across", "all", "everywhere", etc.) that signal cross-cutting work. */
  cross_cutting_patterns: string[];
  /** Vague terms that signal ambiguity. */
  ambiguity_terms: string[];
  /** Patterns that signal a trivial mechanical change. */
  trivial_patterns: string[];
  /**
   * Patterns that signal pure conversation / greeting / small talk.
   * If matched AND no task signals, AND no risk/file mentions → conversational path.
   */
  conversational_patterns: string[];
  /**
   * Words that signal "user wants to do technical work or search memory".
   * Their presence promotes from conversational to small/medium.
   */
  task_signals: string[];
  /** Words that signal explicit memory/search intent (force should_load_neurox=true). */
  search_intent: string[];
  /**
   * Patterns that signal the user explicitly wants TDD (test-driven development).
   * When present, the triage path is promoted from `small` to `medium` because
   * TDD requires red→green→refactor cycles, not a one-shot edit. The iron-law
   * hook will also fire, but triage needs to inject the medium-path workflow
   * hint so the model uses /skill:discover → /skill:build correctly.
   */
  tdd_signals: string[];
  /** Maximum prompt length (chars) to still consider it conversational. */
  conversational_max_chars: number;
  /** Minimum number of vague terms to consider request ambiguous. */
  ambiguity_threshold: number;
}

export const DEFAULT_TRIAGE_CONFIG: TriageConfig = {
  risk_keywords: [
    "auth",
    "authentication",
    "authorization",
    "login",
    "logout",
    "password",
    "session",
    "token",
    "jwt",
    "oauth",
    "saml",
    "sso",
    "payment",
    "billing",
    "checkout",
    "stripe",
    "paypal",
    "invoice",
    "migration",
    "migrate",
    "schema",
    "database schema",
    "alter table",
    "security",
    "vulnerability",
    "cve",
    "exploit",
    "crypto",
    "encryption",
    "decrypt",
    "hash",
    "secret",
    "credential",
    "rbac",
    "permission system",
    "production",
    "deploy to prod",
  ],
  cross_cutting_patterns: [
    "across",
    "all modules",
    "all services",
    "everywhere",
    "every file",
    "whole codebase",
    "entire project",
    "system-wide",
    "global refactor",
  ],
  ambiguity_terms: [
    "improve",
    "better",
    "refactor",
    "clean up",
    "modernize",
    "optimize",
    "fix the architecture",
    "make it nice",
    "ideally",
    "maybe",
    "i think",
    "somehow",
    "should be",
    "would be good",
  ],
  trivial_patterns: [
    "rename",
    "typo",
    "fix typo",
    "fix the typo",
    "add comment",
    "format",
    "prettier",
    "lint fix",
    "remove unused",
    "rename variable",
    "rename function",
    "change name",
  ],
  conversational_patterns: [
    "hola",
    "hello",
    "hi",
    "hey",
    "buenas",
    "buenos dias",
    "buenas tardes",
    "buenas noches",
    "que tal",
    "como estas",
    "como vas",
    "gracias",
    "thanks",
    "ok",
    "perfecto",
    "genial",
    "dale",
    "adios",
    "bye",
    "chau",
    "nos vemos",
  ],
  task_signals: [
    "implement",
    "implementa",
    "implementar",
    "create",
    "crea",
    "crear",
    "build",
    "construye",
    "construir",
    "fix",
    "arregla",
    "arreglar",
    "refactor",
    "refactoriza",
    "refactorizar",
    "add",
    "agrega",
    "agregar",
    "añade",
    "añadir",
    "remove",
    "elimina",
    "eliminar",
    "borra",
    "borrar",
    "rename",
    "renombra",
    "renombrar",
    "deploy",
    "despliega",
    "desplegar",
    "run",
    "ejecuta",
    "ejecutar",
    "test",
    "testea",
    "testear",
    "lint",
    "review",
    "revisa",
    "revisar",
    "explain",
    "explica",
    "explicar",
    "show",
    "muestra",
    "mostrar",
    "write",
    "escribe",
    "escribir",
    "update",
    "actualiza",
    "actualizar",
    "investigate",
    "investiga",
    "investigar",
    "debug",
    "depura",
    "depurar",
    "analyze",
    "analiza",
    "analizar",
    "design",
    "diseña",
    "diseñar",
    "migrate",
    "migra",
    "migrar",
  ],
  search_intent: [
    "find",
    "busca",
    "buscar",
    "encuentra",
    "encontrar",
    "search",
    "recuerda",
    "recordar",
    "qué hicimos",
    "que hicimos",
    "what did we",
    "history",
    "historial",
    "previous",
    "anterior",
    "remember",
    "decisión",
    "decision",
    "patrón",
    "pattern",
  ],
  tdd_signals: [
    "tdd",
    "test-driven",
    "test driven",
    "con tests",
    "with tests",
    "with test",
    "con test",
    "incluye tests",
    "incluye test",
    "incluyendo tests",
    "including tests",
    "y tests",
    "and tests",
    "tests primero",
    "tests first",
    "test first",
    "red green refactor",
    "red-green-refactor",
  ],
  conversational_max_chars: 60,
  ambiguity_threshold: 3,
};
