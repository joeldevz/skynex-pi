/**
 * Pure, side-effect-free helpers for the skynex-spec merge command.
 *
 * Everything here is unit-tested in merge-runner.test.ts. The thin
 * orchestration (reading the delta/canonical files, writing the merged
 * canonical, calling ctx.ui.notify) lives in index.ts and is kept minimal.
 */

import { join } from "node:path";
import { parseDeltaSpec } from "./deltas.ts";
import { analyzeDeltaDestructiveness } from "./guardrails.ts";

export interface SpecMergeArgs {
	domain?: string;
	deltaPath?: string;
	dryRun: boolean;
	force: boolean;
	error?: string;
}

/** Parse `/skynex:spec-merge <domain> <deltaFile> [--dry-run] [--force]`. */
export function parseSpecMergeArgs(raw: string): SpecMergeArgs {
	const tokens = raw.trim().split(/\s+/).filter(Boolean);
	let dryRun = false;
	let force = false;
	const positional: string[] = [];
	for (const token of tokens) {
		if (token === "--dry-run") dryRun = true;
		else if (token === "--force") force = true;
		else positional.push(token);
	}
	const [domain, deltaPath] = positional;
	if (!domain || !deltaPath) {
		return {
			domain,
			deltaPath,
			dryRun,
			force,
			error:
				"Usage: /skynex:spec-merge <domain> <deltaFile> [--dry-run] [--force]",
		};
	}
	return { domain, deltaPath, dryRun, force };
}

/** Canonical spec path for a domain: `.skynex/specs/<domain>/spec.md`. */
export function resolveCanonicalPath(cwd: string, domain: string): string {
	return join(cwd, ".skynex", "specs", domain, "spec.md");
}

/** Empty canonical scaffold used the first time a domain is synced. */
export function buildCanonicalTemplate(domain: string): string {
	const title = domain.charAt(0).toUpperCase() + domain.slice(1);
	return `# ${title} Specification\n\n## Purpose\n\n{Describe what the ${domain} domain covers.}\n\n## Requirements\n`;
}

export interface DeltaSummary {
	added: number;
	modified: number;
	removed: number;
	destructive: boolean;
	removedNames: string[];
	largeModified: { name: string; lineCount: number }[];
}

/** Count delta operations and detect destructive ones (removals / big rewrites). */
export function summarizeDelta(deltaMarkdown: string): DeltaSummary {
	const delta = parseDeltaSpec(deltaMarkdown);
	const destruct = analyzeDeltaDestructiveness(deltaMarkdown);
	return {
		added: delta.added.length,
		modified: delta.modified.length,
		removed: delta.removed.length,
		destructive: destruct.destructive,
		removedNames: destruct.removedRequirements,
		largeModified: destruct.largeModifiedRequirements,
	};
}

export interface MergeNotificationInput {
	domain: string;
	isNewDomain: boolean;
	dryRun: boolean;
	written: boolean;
	summary: DeltaSummary;
	canonicalPath: string;
	blockedReason?: "destructive";
}

function changeLine(summary: DeltaSummary): string {
	return `Changes: +${summary.added} added, ~${summary.modified} modified, -${summary.removed} removed`;
}

/** Render the command result as a notification string. */
export function formatMergeNotification(input: MergeNotificationInput): string {
	const { domain, isNewDomain, dryRun, summary, canonicalPath } = input;

	if (input.blockedReason === "destructive") {
		const lines = [
			`⚠️ Destructive merge blocked — ${domain}`,
			"",
			changeLine(summary),
		];
		if (summary.removedNames.length > 0) {
			lines.push(`Removed requirements: ${summary.removedNames.join(", ")}`);
		}
		if (summary.largeModified.length > 0) {
			lines.push(
				`Large modifications: ${summary.largeModified
					.map((item) => `${item.name} (${item.lineCount} lines)`)
					.join(", ")}`,
			);
		}
		lines.push(
			"",
			"Nothing written. Re-run with --dry-run to preview, or --force to apply.",
		);
		return lines.join("\n");
	}

	if (dryRun) {
		return [
			`🔍 Dry run — ${domain} (nothing written)`,
			"",
			`Would ${isNewDomain ? "create new" : "update"} canonical: ${canonicalPath}`,
			changeLine(summary),
			`Destructive: ${summary.destructive ? "yes" : "no"}`,
		].join("\n");
	}

	return [
		`✅ Spec ${isNewDomain ? "created" : "updated"} — ${domain}`,
		"",
		`Canonical: ${canonicalPath}${isNewDomain ? " (new domain)" : ""}`,
		changeLine(summary),
	].join("\n");
}
