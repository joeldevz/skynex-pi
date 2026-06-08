import assert from "node:assert/strict";
import test from "node:test";
import {
	buildCanonicalTemplate,
	formatMergeNotification,
	parseSpecMergeArgs,
	resolveCanonicalPath,
	summarizeDelta,
} from "./merge-runner.ts";

test("parseSpecMergeArgs parses domain and delta path", () => {
	const parsed = parseSpecMergeArgs("auth .skynex/auth/delta.md");
	assert.equal(parsed.domain, "auth");
	assert.equal(parsed.deltaPath, ".skynex/auth/delta.md");
	assert.equal(parsed.dryRun, false);
	assert.equal(parsed.force, false);
	assert.equal(parsed.error, undefined);
});

test("parseSpecMergeArgs detects --dry-run and --force flags in any position", () => {
	const parsed = parseSpecMergeArgs("--dry-run auth delta.md --force");
	assert.equal(parsed.domain, "auth");
	assert.equal(parsed.deltaPath, "delta.md");
	assert.equal(parsed.dryRun, true);
	assert.equal(parsed.force, true);
});

test("parseSpecMergeArgs returns error when domain or delta path missing", () => {
	const onlyDomain = parseSpecMergeArgs("auth");
	assert.ok(onlyDomain.error);
	const empty = parseSpecMergeArgs("");
	assert.ok(empty.error);
});

test("resolveCanonicalPath builds .skynex/specs/<domain>/spec.md", () => {
	assert.equal(
		resolveCanonicalPath("/repo", "auth"),
		"/repo/.skynex/specs/auth/spec.md",
	);
});

test("buildCanonicalTemplate capitalizes domain and includes Requirements heading", () => {
	const template = buildCanonicalTemplate("auth");
	assert.match(template, /^# Auth Specification/);
	assert.match(template, /## Purpose/);
	assert.match(template, /## Requirements/);
});

test("summarizeDelta counts added, modified, removed and flags destructive removals", () => {
	const delta = `# Delta for auth

## ADDED Requirements

### Requirement: New One

The system MUST do new things.

## REMOVED Requirements

### Requirement: Old One

(Reason: deprecated)
`;
	const summary = summarizeDelta(delta);
	assert.equal(summary.added, 1);
	assert.equal(summary.modified, 0);
	assert.equal(summary.removed, 1);
	assert.equal(summary.destructive, true);
	assert.deepEqual(summary.removedNames, ["Old One"]);
});

test("summarizeDelta is non-destructive for additions only", () => {
	const delta = `# Delta

## ADDED Requirements

### Requirement: Only New

The system MUST add behavior.
`;
	const summary = summarizeDelta(delta);
	assert.equal(summary.destructive, false);
	assert.equal(summary.added, 1);
});

test("formatMergeNotification reports created canonical for new domain write", () => {
	const msg = formatMergeNotification({
		domain: "auth",
		isNewDomain: true,
		dryRun: false,
		written: true,
		summary: { added: 4, modified: 0, removed: 0, destructive: false, removedNames: [], largeModified: [] },
		canonicalPath: ".skynex/specs/auth/spec.md",
	});
	assert.match(msg, /created/i);
	assert.match(msg, /auth/);
	assert.match(msg, /\.skynex\/specs\/auth\/spec\.md/);
	assert.match(msg, /4/);
});

test("formatMergeNotification reports updated canonical for existing domain write", () => {
	const msg = formatMergeNotification({
		domain: "auth",
		isNewDomain: false,
		dryRun: false,
		written: true,
		summary: { added: 1, modified: 1, removed: 0, destructive: false, removedNames: [], largeModified: [] },
		canonicalPath: ".skynex/specs/auth/spec.md",
	});
	assert.match(msg, /updated/i);
});

test("formatMergeNotification marks dry-run and writes nothing", () => {
	const msg = formatMergeNotification({
		domain: "auth",
		isNewDomain: true,
		dryRun: true,
		written: false,
		summary: { added: 4, modified: 0, removed: 0, destructive: false, removedNames: [], largeModified: [] },
		canonicalPath: ".skynex/specs/auth/spec.md",
	});
	assert.match(msg, /dry.run/i);
	assert.match(msg, /nothing written|would/i);
});

test("formatMergeNotification surfaces destructive block with removed names", () => {
	const msg = formatMergeNotification({
		domain: "auth",
		isNewDomain: false,
		dryRun: false,
		written: false,
		summary: { added: 0, modified: 0, removed: 1, destructive: true, removedNames: ["Legacy Login"], largeModified: [] },
		canonicalPath: ".skynex/specs/auth/spec.md",
		blockedReason: "destructive",
	});
	assert.match(msg, /destructive/i);
	assert.match(msg, /Legacy Login/);
	assert.match(msg, /--force/);
});
