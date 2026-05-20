/**
 * Iron Law types — L4 TDD enforcement.
 *
 * Philosophy:
 *   "Never modify a test to pass. If a test fails, fix the code."
 *   — skynex Iron Law (derived from skynex-OpenCode, hardened in Pi)
 *
 * L4 is the strictest level:
 *   1. Production code requires a test file to exist
 *   2. That test must FAIL before writing the implementation
 *   3. Cannot edit a test that is currently PASSING
 *   4. Override is available but logged for audit
 */

export interface IronLawConfig {
  /**
   * Glob patterns that bypass the Iron Law entirely.
   * Matches against the file path relative to cwd.
   */
  whitelist: string[];

  /**
   * Patterns that identify "production code" requiring tests.
   * If a write/edit target matches one of these, Iron Law applies.
   */
  production_code_patterns: string[];

  /**
   * How to derive the expected test file from a production file path.
   * Applied in order — first match wins.
   * Source → test path transformation.
   */
  test_path_rules: TestPathRule[];

  /**
   * If true, only enforce Iron Law when triage result has tdd=true.
   * If false (L4), enforce always (whitelist still applies).
   * Default: false (L4 = always enforce)
   */
  require_tdd_flag: boolean;
}

export interface TestPathRule {
  /** Regex to match against the source file path. */
  match: string;
  /** Replacement pattern to derive the test path.
   *  Capture groups from `match` can be referenced as $1, $2, etc.
   *  Examples:
   *    src/$1.ts  →  src/$1.test.ts
   *    src/$1.ts  →  src/__tests__/$1.test.ts
   */
  test_path: string;
}

export const DEFAULT_IRON_LAW_CONFIG: IronLawConfig = {
  whitelist: [
    // Documentation
    "**/*.md",
    "**/docs/**",
    // Configs
    "**/*.json",
    "**/*.jsonc",
    "**/*.yaml",
    "**/*.yml",
    "**/package.json",
    "**/tsconfig*.json",
    "**/.eslintrc*",
    "**/.prettierrc*",
    // Git / CI
    "**/.gitignore",
    "**/.github/**",
    // Build / tooling
    "**/scripts/**",
    "**/Makefile",
    "**/Dockerfile*",
    // skynex workspace artifacts
    "**/.skynex/**",
    // Tests themselves (managed separately)
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.test.js",
    "**/*.spec.ts",
    "**/*.spec.tsx",
    "**/*.spec.js",
    "**/__tests__/**",
  ],

  production_code_patterns: [
    "src/**/*.ts",
    "src/**/*.tsx",
    "src/**/*.js",
    "src/**/*.jsx",
    "src/**/*.go",
    "src/**/*.py",
    "app/**/*.ts",
    "app/**/*.tsx",
    "lib/**/*.ts",
    "packages/*/src/**/*.ts",
  ],

  test_path_rules: [
    // src/foo/bar.ts → src/foo/bar.test.ts
    {
      match: "^(.+)\\.(ts|tsx|js|jsx|go|py)$",
      test_path: "$1.test.$2",
    },
  ],

  require_tdd_flag: false, // L4: always enforce
};

export interface IronLawOverride {
  file: string;
  reason: string;
  ts: string;
  session: string;
}

export interface IronLawState {
  /** Files written in this session (to detect test-before-impl ordering). */
  written_this_session: Set<string>;
  /** Override log (in-memory, also persisted to .skynex/{slice}/iron-law-overrides.md). */
  overrides: IronLawOverride[];
}
