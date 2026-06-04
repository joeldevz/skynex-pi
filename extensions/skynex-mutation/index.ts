/**
 * skynex-mutation extension.
 *
 * Registers a mechanical, on-demand command that runs StrykerJS mutation
 * testing and reports surviving mutants — the empirical complement to the
 * static `test-reviewer` in the validate phase. No tokens, no sub-agents:
 * you invoke it explicitly.
 *
 * Commands:
 *   /skynex:mutation [glob]  — run mutation testing on the configured `mutate`
 *                              scope, or on [glob] if provided.
 *
 * Mutation testing is slow by design (it re-runs the suite per mutant). Scope
 * it to changed files / a single module for fast feedback.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  buildStrykerArgs,
  resolveStrykerBinary,
  parseMutationJson,
  formatMutationNotification,
} from "./runner.js";
import type { MutationJsonReport } from "./types.js";

const REPORT_PATH = path.join("reports", "mutation", "mutation.json");
const TIMEOUT_MS = 10 * 60 * 1000; // 10 min hard cap; mutation runs can be long
const MAX_BUFFER = 64 * 1024 * 1024;

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("skynex:mutation", {
    description:
      "Run StrykerJS mutation testing on the configured scope (or a given glob) and report surviving mutants = gaps in your tests. Usage: /skynex:mutation [glob]. Slow — scope it to changed files.",
    handler: async (args, ctx) => {
      const scope = args.trim();
      const scopeLabel = scope || "stryker.config.json `mutate`";

      const { command, prefixArgs } = resolveStrykerBinary(ctx.cwd, (p) => fs.existsSync(p));
      const fullArgs = [...prefixArgs, ...buildStrykerArgs({ scope })];

      ctx.ui.notify(
        `⏳ Running mutation testing on ${scopeLabel} … (re-runs tests per mutant; this can be slow)`,
        "info",
      );

      try {
        execFileSync(command, fullArgs, {
          cwd: ctx.cwd,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: TIMEOUT_MS,
          maxBuffer: MAX_BUFFER,
        });
      } catch (err) {
        // Stryker exits non-zero when a `break` threshold is hit — that is a
        // legitimate result, not a crash. We still read the report below.
        // Only treat a missing report as a real failure.
        const reason = err instanceof Error ? err.message : String(err);
        if (!fs.existsSync(path.join(ctx.cwd, REPORT_PATH))) {
          ctx.ui.notify(
            `✗ Mutation run failed before producing a report.\n${reason}\n` +
              `Check that StrykerJS is installed (\`pnpm add -D @stryker-mutator/core\`) ` +
              `and that \`pnpm mutation\` runs from a terminal.`,
            "error",
          );
          return;
        }
      }

      const reportFull = path.join(ctx.cwd, REPORT_PATH);
      if (!fs.existsSync(reportFull)) {
        ctx.ui.notify(
          `✗ No mutation report at ${REPORT_PATH}. Is StrykerJS configured (stryker.config.json)?`,
          "error",
        );
        return;
      }

      let report: MutationJsonReport;
      try {
        report = JSON.parse(fs.readFileSync(reportFull, "utf8")) as MutationJsonReport;
      } catch {
        ctx.ui.notify(`✗ Could not parse ${REPORT_PATH}.`, "error");
        return;
      }

      const parsed = parseMutationJson(report);
      ctx.ui.notify(
        formatMutationNotification(parsed, scopeLabel),
        parsed.survivors.length === 0 ? "info" : "warning",
      );
    },
  });
}
