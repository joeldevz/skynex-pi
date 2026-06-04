/**
 * Pure, side-effect-free helpers for the skynex-mutation extension.
 *
 * Everything here is unit-tested in runner.test.ts. The thin orchestration
 * (spawning Stryker, reading the report file, calling ctx.ui.notify) lives in
 * index.ts and is intentionally kept minimal.
 */

import * as path from "node:path";
import type {
  MutationJsonReport,
  MutationReport,
  MutationRunOptions,
  StrykerInvocation,
  Survivor,
} from "./types.js";

/** Build the Stryker CLI args. JSON reporter is what we parse; clear-text is for humans. */
export function buildStrykerArgs(opts: MutationRunOptions = {}): string[] {
  const args = ["run", "--reporters", "json,clear-text"];
  const scope = opts.scope?.trim();
  if (scope) {
    args.push("--mutate", scope);
  }
  return args;
}

/** Prefer the project-local Stryker binary; fall back to `npx stryker`. */
export function resolveStrykerBinary(
  cwd: string,
  exists: (p: string) => boolean,
): StrykerInvocation {
  const local = path.join(cwd, "node_modules", ".bin", "stryker");
  if (exists(local)) {
    return { command: local, prefixArgs: [] };
  }
  return { command: "npx", prefixArgs: ["stryker"] };
}

/** Normalize Stryker's JSON report into a UI-ready summary. */
export function parseMutationJson(report: MutationJsonReport): MutationReport {
  const counts: Record<string, number> = {
    Killed: 0,
    Survived: 0,
    NoCoverage: 0,
    Timeout: 0,
    CompileError: 0,
    RuntimeError: 0,
    Ignored: 0,
  };
  const survivors: Survivor[] = [];

  for (const [file, data] of Object.entries(report.files ?? {})) {
    for (const m of data.mutants ?? []) {
      if (m.status in counts) counts[m.status] += 1;
      if (m.status === "Survived" || m.status === "NoCoverage") {
        survivors.push({
          file,
          line: m.location?.start?.line ?? 0,
          mutatorName: m.mutatorName,
          status: m.status,
        });
      }
    }
  }

  survivors.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));

  const killed = counts.Killed;
  const survived = counts.Survived;
  const noCoverage = counts.NoCoverage;
  const timeout = counts.Timeout;
  const totalDetected = killed + timeout;
  const totalValid = totalDetected + survived + noCoverage;
  const score = totalValid === 0 ? 0 : Math.round((totalDetected / totalValid) * 10000) / 100;

  return {
    score,
    killed,
    survived,
    timeout,
    noCoverage,
    compileErrors: counts.CompileError,
    runtimeErrors: counts.RuntimeError,
    ignored: counts.Ignored,
    totalDetected,
    totalValid,
    survivors,
  };
}

const MAX_LISTED_SURVIVORS = 25;

/** Render the report as a notification string. */
export function formatMutationNotification(report: MutationReport, scopeLabel: string): string {
  const hasSurvivors = report.survivors.length > 0;
  const verdict = hasSurvivors
    ? `🔴 ${report.survivors.length} SURVIVING MUTANT(S)`
    : "🟢 ALL MUTANTS KILLED";

  const lines: string[] = [
    `Mutation testing — ${verdict}`,
    ``,
    `Scope:  ${scopeLabel}`,
    `Score:  ${report.score}%  ` +
      `(killed ${report.killed}, survived ${report.survived}, ` +
      `timeout ${report.timeout}, no-cov ${report.noCoverage})`,
  ];

  if (hasSurvivors) {
    lines.push(``, `Surviving mutants (changes your tests did NOT catch):`);
    for (const s of report.survivors.slice(0, MAX_LISTED_SURVIVORS)) {
      lines.push(`  • ${s.file}:${s.line}  [${s.status}] ${s.mutatorName}`);
    }
    if (report.survivors.length > MAX_LISTED_SURVIVORS) {
      lines.push(`  … and ${report.survivors.length - MAX_LISTED_SURVIVORS} more`);
    }
    lines.push(``, `Each survivor = a test worth adding. Full report: reports/mutation/mutation.html`);
  } else {
    lines.push(``, `Your tests caught every injected bug in scope.`);
  }

  return lines.join("\n");
}
