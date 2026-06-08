/**
 * skynex-spec — OpenSpec canonical spec layer for skynex-pi.
 *
 * Registers the mechanical `/skynex:spec-merge` command that applies a
 * requirement-block delta to the canonical spec store at
 * `.skynex/specs/<domain>/spec.md` using the deterministic merge engine.
 * No tokens, no sub-agents: the engine runs in TypeScript, not in the LLM.
 *
 * Command:
 *   /skynex:spec-merge <domain> <deltaFile> [--dry-run] [--force]
 *     - reads .skynex/specs/<domain>/spec.md (or an empty template if new)
 *     - applies the delta in <deltaFile> (ADDED / MODIFIED / REMOVED blocks)
 *     - --dry-run: report counts + destructiveness, write nothing
 *     - --force:   apply even when the delta is destructive (removals/big rewrites)
 *     - default:   write the merged canonical, but refuse destructive merges
 *                  unless --force is given
 *
 * The pure engine + helpers are also re-exported so the sync skill / other
 * extensions can call them directly.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyDeltaSpec } from "./deltas.ts";
import {
	buildCanonicalTemplate,
	formatMergeNotification,
	parseSpecMergeArgs,
	resolveCanonicalPath,
	summarizeDelta,
} from "./merge-runner.ts";

export {
	applyDeltaSpec,
	parseDeltaSpec,
	parseRequirementBlocks,
} from "./deltas.ts";
export type { DeltaSpec, RequirementBlock } from "./deltas.ts";

export {
	analyzeDeltaDestructiveness,
	detectActiveDomainCollisions,
	detectLegacyFlatSpec,
} from "./guardrails.ts";
export type {
	DestructiveDeltaOptions,
	DestructiveDeltaReport,
	DomainCollision,
	LargeModifiedRequirement,
	LegacyFlatSpecWarning,
} from "./guardrails.ts";

export {
	buildCanonicalTemplate,
	formatMergeNotification,
	parseSpecMergeArgs,
	resolveCanonicalPath,
	summarizeDelta,
} from "./merge-runner.ts";
export type { DeltaSummary, SpecMergeArgs } from "./merge-runner.ts";

export default function skynexSpec(pi: ExtensionAPI): void {
	pi.registerCommand("skynex:spec-merge", {
		description:
			"Merge a requirement-block delta into the canonical spec at .skynex/specs/<domain>/spec.md using the deterministic engine. Usage: /skynex:spec-merge <domain> <deltaFile> [--dry-run] [--force].",
		handler: async (args, ctx) => {
			const parsed = parseSpecMergeArgs(args);
			if (parsed.error) {
				ctx.ui.notify(parsed.error, "error");
				return;
			}
			const domain = parsed.domain as string;
			const deltaPath = parsed.deltaPath as string;

			const deltaFull = join(ctx.cwd, deltaPath);
			if (!existsSync(deltaFull)) {
				ctx.ui.notify(`✗ Delta file not found: ${deltaPath}`, "error");
				return;
			}
			const delta = readFileSync(deltaFull, "utf8");

			const canonicalPath = resolveCanonicalPath(ctx.cwd, domain);
			const isNewDomain = !existsSync(canonicalPath);
			const canonical = isNewDomain
				? buildCanonicalTemplate(domain)
				: readFileSync(canonicalPath, "utf8");

			let summary;
			try {
				summary = summarizeDelta(delta);
			} catch (err) {
				const reason = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`✗ Invalid delta: ${reason}`, "error");
				return;
			}

			const relCanonical = canonicalPath.startsWith(`${ctx.cwd}/`)
				? canonicalPath.slice(ctx.cwd.length + 1)
				: canonicalPath;

			// Destructive merges require --force unless this is only a preview.
			if (summary.destructive && !parsed.dryRun && !parsed.force) {
				ctx.ui.notify(
					formatMergeNotification({
						domain,
						isNewDomain,
						dryRun: false,
						written: false,
						summary,
						canonicalPath: relCanonical,
						blockedReason: "destructive",
					}),
					"warning",
				);
				return;
			}

			if (parsed.dryRun) {
				ctx.ui.notify(
					formatMergeNotification({
						domain,
						isNewDomain,
						dryRun: true,
						written: false,
						summary,
						canonicalPath: relCanonical,
					}),
					"info",
				);
				return;
			}

			let merged: string;
			try {
				merged = applyDeltaSpec(canonical, delta);
			} catch (err) {
				const reason = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`✗ Merge failed: ${reason}`, "error");
				return;
			}

			mkdirSync(dirname(canonicalPath), { recursive: true });
			writeFileSync(canonicalPath, merged);

			ctx.ui.notify(
				formatMergeNotification({
					domain,
					isNewDomain,
					dryRun: false,
					written: true,
					summary,
					canonicalPath: relCanonical,
				}),
				"info",
			);
		},
	});
}
