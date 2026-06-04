/**
 * Types for the skynex-mutation extension.
 *
 * We consume the StrykerJS JSON report (mutation-testing-elements schema v1)
 * rather than parsing clear-text output — the JSON shape is stable across
 * Stryker versions, the clear-text table is not.
 */

/** Mutant statuses as emitted by Stryker in the JSON report. */
export type MutantStatus =
  | "Killed"
  | "Survived"
  | "NoCoverage"
  | "Timeout"
  | "CompileError"
  | "RuntimeError"
  | "Ignored";

/** A mutant that the test suite failed to detect — i.e. a real test gap. */
export interface Survivor {
  file: string;
  line: number;
  mutatorName: string;
  /** Only "Survived" or "NoCoverage" are listed as gaps (Timeout = detected). */
  status: "Survived" | "NoCoverage";
}

/** Normalized, UI-ready summary of a mutation run. */
export interface MutationReport {
  /** Mutation score % = detected / valid * 100, rounded to 2 decimals. */
  score: number;
  killed: number;
  survived: number;
  timeout: number;
  noCoverage: number;
  compileErrors: number;
  runtimeErrors: number;
  ignored: number;
  /** killed + timeout */
  totalDetected: number;
  /** detected + survived + noCoverage (excludes errors/ignored) */
  totalValid: number;
  survivors: Survivor[];
}

/** Minimal subset of the Stryker JSON report schema we read. */
export interface MutationJsonReport {
  files?: Record<
    string,
    {
      mutants?: Array<{
        mutatorName: string;
        status: string;
        location?: { start?: { line?: number } };
      }>;
    }
  >;
}

export interface MutationRunOptions {
  /** Overrides the `mutate` glob from stryker.config.json. */
  scope?: string;
}

/** How to invoke the Stryker binary (local bin vs npx fallback). */
export interface StrykerInvocation {
  command: string;
  prefixArgs: string[];
}
