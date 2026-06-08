import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	detectActiveDomainCollisions,
	detectLegacyFlatSpec,
	analyzeDeltaDestructiveness,
} from "./guardrails.ts";

test("detectActiveDomainCollisions finds other active changes touching the same domain", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-"));
	const changesDir = join(tmpDir, ".skynex", "changes");

	// Create directory structure
	mkdirSync(join(changesDir, "current", "specs", "auth"), { recursive: true });
	mkdirSync(join(changesDir, "other", "specs", "auth"), { recursive: true });
	mkdirSync(join(changesDir, "archive", "2026-01-01-old", "specs", "auth"), {
		recursive: true,
	});

	writeFileSync(join(changesDir, "current", "specs", "auth", "spec.md"), "current");
	writeFileSync(join(changesDir, "other", "specs", "auth", "spec.md"), "other");
	writeFileSync(
		join(changesDir, "archive", "2026-01-01-old", "specs", "auth", "spec.md"),
		"archive",
	);

	const collisions = detectActiveDomainCollisions(tmpDir, "current", "auth");

	assert.deepEqual(collisions, [{ change: "other", path: join(changesDir, "other", "specs", "auth", "spec.md") }]);
});

test("detectLegacyFlatSpec warns when a flat change spec exists without domain specs", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-"));
	const changeDir = join(tmpDir, ".skynex", "changes", "legacy");

	mkdirSync(changeDir, { recursive: true });
	writeFileSync(join(changeDir, "spec.md"), "flat spec content");

	const result = detectLegacyFlatSpec(tmpDir, "legacy");

	assert.ok(result);
	assert.equal(result.change, "legacy");
	assert.equal(result.path, join(changeDir, "spec.md"));
	assert.equal(result.hasDomainSpecs, false);
});

test("detectLegacyFlatSpec reports domain specs when both old and new layouts exist", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-"));
	const changeDir = join(tmpDir, ".skynex", "changes", "legacy");
	const specsDir = join(changeDir, "specs", "auth");

	mkdirSync(specsDir, { recursive: true });
	writeFileSync(join(changeDir, "spec.md"), "flat spec content");
	writeFileSync(join(specsDir, "spec.md"), "domain spec content");

	const result = detectLegacyFlatSpec(tmpDir, "legacy");

	assert.ok(result);
	assert.equal(result.change, "legacy");
	assert.equal(result.path, join(changeDir, "spec.md"));
	assert.equal(result.hasDomainSpecs, true);
});

test("analyzeDeltaDestructiveness reports removed and large modified requirements", () => {
	const deltaMarkdown = `# Delta for Example

## ADDED Requirements

### Requirement: New Behavior

The system MUST support new behavior.

## MODIFIED Requirements

### Requirement: Existing Behavior

This is a modified requirement with many lines.
Line 2.
Line 3.
Line 4.
Line 5.
Line 6.
Line 7.
Line 8.
Line 9.
Line 10.
Line 11.
Line 12.
Line 13.

## REMOVED Requirements

### Requirement: Deprecated Behavior

(Reason: old behavior is no longer supported)
`;

	const result = analyzeDeltaDestructiveness(deltaMarkdown, { largeModifiedLineThreshold: 10 });

	assert.equal(result.destructive, true);
	assert.deepEqual(result.removedRequirements, ["Deprecated Behavior"]);
	assert.equal(result.largeModifiedRequirements.length, 1);
	assert.equal(result.largeModifiedRequirements[0].name, "Existing Behavior");
	assert.ok(result.largeModifiedRequirements[0].lineCount >= 10);
});

// Category 6: guardrails — safeDirectories error paths
test("detectActiveDomainCollisions returns empty array when changes dir does not exist", () => {
	const cwd = "/nonexistent/path/that/does/not/exist";
	const collisions = detectActiveDomainCollisions(cwd, "current", "auth");
	assert.deepEqual(collisions, []);
});

test("detectLegacyFlatSpec returns undefined when change dir does not exist", () => {
	const cwd = "/nonexistent/path/that/does/not/exist";
	const result = detectLegacyFlatSpec(cwd, "nonexistent");
	assert.equal(result, undefined);
});

// Category 7: guardrails — detectActiveDomainCollisions logic
test("detectActiveDomainCollisions does NOT include changes without spec.md for the domain", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-nospec-"));
	mkdirSync(join(tmpDir, ".skynex/changes/other/some-other-domain"), { recursive: true });
	// other change exists but has NO spec.md for the domain
	const collisions = detectActiveDomainCollisions(tmpDir, "current", "auth");
	assert.deepEqual(collisions, []);
});

test("detectActiveDomainCollisions includes change named 'archive-something' (not exact archive)", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-archpfx-"));
	mkdirSync(join(tmpDir, ".skynex/changes/archive-v2/specs/auth"), { recursive: true });
	writeFileSync(join(tmpDir, ".skynex/changes/archive-v2/specs/auth/spec.md"), "# Spec\n");
	const collisions = detectActiveDomainCollisions(tmpDir, "current", "auth");
	assert.equal(collisions.length, 1);
	assert.equal(collisions[0].change, "archive-v2");
});

test("detectActiveDomainCollisions excludes current change from collisions", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-exclude-current-"));
	mkdirSync(join(tmpDir, ".skynex/changes/current/specs/auth"), { recursive: true });
	writeFileSync(join(tmpDir, ".skynex/changes/current/specs/auth/spec.md"), "current");
	mkdirSync(join(tmpDir, ".skynex/changes/other/specs/auth"), { recursive: true });
	writeFileSync(join(tmpDir, ".skynex/changes/other/specs/auth/spec.md"), "other");
	const collisions = detectActiveDomainCollisions(tmpDir, "current", "auth");
	assert.equal(collisions.length, 1);
	assert.equal(collisions[0].change, "other");
	assert.ok(!collisions.some((c) => c.change === "current"));
});

// Category 8: guardrails — analyzeDeltaDestructiveness logic
test("analyzeDeltaDestructiveness threshold is inclusive: requirement at exactly threshold lines is large", () => {
	const lines = Array.from({ length: 40 }, (_, i) => `Line ${i + 1}`).join("\n");
	const report = analyzeDeltaDestructiveness(
		`# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Exact\n\n${lines}\n`,
	);
	assert.equal(report.largeModifiedRequirements.length, 1, "exactly 40 lines must be flagged");
	assert.equal(report.largeModifiedRequirements[0].name, "Exact");
});

test("analyzeDeltaDestructiveness threshold is exclusive: requirement under threshold is NOT large", () => {
	// Content with exactly 38 lines when split (threshold=40)
	const lines = Array.from({ length: 37 }, (_, i) => `Line ${i + 1}`).join("\n");
	const report = analyzeDeltaDestructiveness(
		`# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Small\n\n${lines}\n`,
	);
	assert.equal(report.largeModifiedRequirements.length, 0, "under threshold must NOT be flagged");
});

test("analyzeDeltaDestructiveness is destructive=true for ONLY removals (no large modifications)", () => {
	const report = analyzeDeltaDestructiveness(
		`# Delta\n\n## REMOVED Requirements\n\n### Requirement: Gone\n\n(Reason: removed)\n`,
	);
	assert.equal(report.destructive, true);
	assert.equal(report.largeModifiedRequirements.length, 0);
});

test("analyzeDeltaDestructiveness is destructive=true for ONLY large modifications (no removals)", () => {
	const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join("\n");
	const report = analyzeDeltaDestructiveness(
		`# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Big\n\n${lines}\n`,
		{ largeModifiedLineThreshold: 5 },
	);
	assert.equal(report.destructive, true);
	assert.equal(report.removedRequirements.length, 0);
});

test("analyzeDeltaDestructiveness is destructive=false when no removals and no large modifications", () => {
	const report = analyzeDeltaDestructiveness(
		`# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Small\n\nOne line.\n`,
	);
	assert.equal(report.destructive, false);
});

test("analyzeDeltaDestructiveness reports multiple removed requirements", () => {
	const report = analyzeDeltaDestructiveness(
		`# Delta\n\n## REMOVED Requirements\n\n### Requirement: First\n\n(Reason: gone)\n\n### Requirement: Second\n\n(Reason: gone)\n`,
	);
	assert.equal(report.removedRequirements.length, 2);
	assert.deepEqual(report.removedRequirements, ["First", "Second"]);
	assert.equal(report.destructive, true);
});

test("analyzeDeltaDestructiveness reports multiple large modified requirements", () => {
	const lines = Array.from({ length: 40 }, (_, i) => `Line ${i + 1}`).join("\n");
	const report = analyzeDeltaDestructiveness(
		`# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Big1\n\n${lines}\n\n### Requirement: Big2\n\n${lines}\n`,
	);
	assert.equal(report.largeModifiedRequirements.length, 2);
	assert.ok(report.largeModifiedRequirements.some((r) => r.name === "Big1"));
	assert.ok(report.largeModifiedRequirements.some((r) => r.name === "Big2"));
});

// Category 9: guardrails — detectLegacyFlatSpec when no flat spec exists
test("detectLegacyFlatSpec returns undefined when no flat spec.md exists in change root", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-noflat-"));
	mkdirSync(join(tmpDir, ".skynex/changes/new-style/specs/auth"), { recursive: true });
	writeFileSync(join(tmpDir, ".skynex/changes/new-style/specs/auth/spec.md"), "# Domain spec\n");
	const result = detectLegacyFlatSpec(tmpDir, "new-style");
	assert.equal(result, undefined);
});

test("detectLegacyFlatSpec reports hasDomainSpecs=false when only flat spec exists", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-flat-only-"));
	mkdirSync(join(tmpDir, ".skynex/changes/flat-only"), { recursive: true });
	writeFileSync(join(tmpDir, ".skynex/changes/flat-only/spec.md"), "# Flat spec\n");
	const result = detectLegacyFlatSpec(tmpDir, "flat-only");
	assert.ok(result);
	assert.equal(result.hasDomainSpecs, false);
});

test("detectActiveDomainCollisions handles directories without spec.md gracefully", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-no-specs-"));
	mkdirSync(join(tmpDir, ".skynex/changes/change1/specs/auth"), { recursive: true });
	mkdirSync(join(tmpDir, ".skynex/changes/change2/specs/other"), { recursive: true });
	writeFileSync(join(tmpDir, ".skynex/changes/change2/specs/other/spec.md"), "other");
	// change1 has auth dir but no spec.md
	const collisions = detectActiveDomainCollisions(tmpDir, "current", "auth");
	assert.deepEqual(collisions, []);
});

test("analyzeDeltaDestructiveness counts newlines correctly for line count", () => {
	const lines5 = "Line1\nLine2\nLine3\nLine4\nLine5";
	const report = analyzeDeltaDestructiveness(
		`# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Test\n\n${lines5}\n`,
		{ largeModifiedLineThreshold: 4 },
	);
	// 5 lines should be >= 4 (threshold)
	assert.equal(report.largeModifiedRequirements.length, 1);
});

test("detectActiveDomainCollisions returns paths as absolute", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-paths-"));
	mkdirSync(join(tmpDir, ".skynex/changes/other/specs/auth"), { recursive: true });
	writeFileSync(join(tmpDir, ".skynex/changes/other/specs/auth/spec.md"), "other");
	const collisions = detectActiveDomainCollisions(tmpDir, "current", "auth");
	assert.equal(collisions.length, 1);
	assert.ok(collisions[0].path.includes(".skynex"));
	assert.ok(collisions[0].path.includes("specs/auth/spec.md"));
});

// Additional tests to kill remaining operator/logic mutants
test("detectActiveDomainCollisions must skip exact 'archive' directory, not prefix", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-archive-exact-"));
	mkdirSync(join(tmpDir, ".skynex/changes/archive/specs/auth"), { recursive: true });
	writeFileSync(join(tmpDir, ".skynex/changes/archive/specs/auth/spec.md"), "archive");
	const collisions = detectActiveDomainCollisions(tmpDir, "current", "auth");
	// 'archive' must be excluded, not included
	assert.equal(
		collisions.filter((c) => c.change === "archive").length,
		0,
		"exact 'archive' change must be excluded",
	);
});

test("detectActiveDomainCollisions collision report has all required fields", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-fields-"));
	mkdirSync(join(tmpDir, ".skynex/changes/other/specs/auth"), { recursive: true });
	writeFileSync(join(tmpDir, ".skynex/changes/other/specs/auth/spec.md"), "other");
	const collisions = detectActiveDomainCollisions(tmpDir, "current", "auth");
	assert.equal(collisions.length, 1);
	assert.ok(collisions[0].hasOwnProperty("change"));
	assert.ok(collisions[0].hasOwnProperty("path"));
	assert.equal(typeof collisions[0].change, "string");
	assert.equal(typeof collisions[0].path, "string");
});

test("safeDirectories filters out non-directories gracefully", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-safe-"));
	const changesDir = join(tmpDir, ".skynex/changes");
	mkdirSync(changesDir, { recursive: true });
	writeFileSync(join(changesDir, "file.txt"), "not a dir");
	mkdirSync(join(changesDir, "realdir"), { recursive: true });
	const collisions = detectActiveDomainCollisions(tmpDir, "current", "auth");
	// Should only detect realdir as a potential change, not file.txt
	const changeNames = collisions.map((c) => c.change);
	assert.ok(!changeNames.includes("file.txt"), "files must not be treated as changes");
});

test("hasAnyDomainSpec returns true only when spec.md exists in at least one domain", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-any-domain-"));
	const changeDir = join(tmpDir, ".skynex/changes/test");
	const specsDir = join(changeDir, "specs");
	mkdirSync(join(specsDir, "auth"), { recursive: true });
	mkdirSync(join(specsDir, "payment"), { recursive: true });
	// Write flat spec.md to trigger the check
	writeFileSync(join(changeDir, "spec.md"), "flat spec");
	// Only write spec.md for one domain
	writeFileSync(join(specsDir, "auth/spec.md"), "auth spec");
	const result = detectLegacyFlatSpec(tmpDir, "test");
	assert.ok(result);
	assert.equal(result.hasDomainSpecs, true);
});

test("hasAnyDomainSpec returns false when no spec.md exists in any domain", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-no-domain-"));
	const changeDir = join(tmpDir, ".skynex/changes/test");
	const specsDir = join(changeDir, "specs");
	mkdirSync(join(specsDir, "auth"), { recursive: true });
	mkdirSync(join(specsDir, "payment"), { recursive: true });
	// Write flat spec.md to trigger the check
	writeFileSync(join(changeDir, "spec.md"), "flat spec");
	// Don't write any spec.md files in domains
	const result = detectLegacyFlatSpec(tmpDir, "test");
	assert.ok(result);
	assert.equal(result.hasDomainSpecs, false);
});

test("analyzeDeltaDestructiveness correctly uses custom largeModifiedLineThreshold", () => {
	const lines40 = Array.from({ length: 40 }, (_, i) => `Line ${i + 1}`).join("\n");
	// With default threshold=40, 40 lines should be flagged
	const report1 = analyzeDeltaDestructiveness(
		`# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Test\n\n${lines40}\n`,
	);
	assert.equal(report1.largeModifiedRequirements.length, 1);

	// With custom threshold=50, 40 lines should NOT be flagged
	const report2 = analyzeDeltaDestructiveness(
		`# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Test\n\n${lines40}\n`,
		{ largeModifiedLineThreshold: 50 },
	);
	assert.equal(report2.largeModifiedRequirements.length, 0);
});

test("analyzeDeltaDestructiveness threshold boundary: exactly at threshold", () => {
	// Create content with exactly 40 lines in the content after heading
	const lines40 = Array.from({ length: 40 }, (_, i) => `L${i + 1}`).join("\n");
	const report = analyzeDeltaDestructiveness(
		`# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Boundary\n\n${lines40}\n`,
		{ largeModifiedLineThreshold: 40 },
	);
	// >= 40 means exactly 40 should be flagged
	assert.equal(report.largeModifiedRequirements.length, 1);
	assert.equal(report.largeModifiedRequirements[0].lineCount >= 40, true);
});

test("analyzeDeltaDestructiveness has correct line count for small modifications", () => {
	const report = analyzeDeltaDestructiveness(
		`# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Small\n\nOne.\n`,
		{ largeModifiedLineThreshold: 10 },
	);
	// Very small requirement should not be flagged
	assert.equal(report.largeModifiedRequirements.length, 0);
	assert.equal(report.destructive, false);
});

test("detectActiveDomainCollisions handles multiple domains in same change", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-multi-domain-"));
	mkdirSync(join(tmpDir, ".skynex/changes/multi/specs/auth"), { recursive: true });
	mkdirSync(join(tmpDir, ".skynex/changes/multi/specs/payment"), { recursive: true });
	writeFileSync(join(tmpDir, ".skynex/changes/multi/specs/auth/spec.md"), "auth");
	writeFileSync(join(tmpDir, ".skynex/changes/multi/specs/payment/spec.md"), "payment");
	// Query for auth domain
	const authCollisions = detectActiveDomainCollisions(tmpDir, "current", "auth");
	assert.equal(authCollisions.length, 1);
	assert.equal(authCollisions[0].change, "multi");
	// Query for payment domain
	const paymentCollisions = detectActiveDomainCollisions(tmpDir, "current", "payment");
	assert.equal(paymentCollisions.length, 1);
	assert.equal(paymentCollisions[0].change, "multi");
});

test("analyzeDeltaDestructiveness reports both removed and large modified together", () => {
	const lines50 = Array.from({ length: 50 }, (_, i) => `L${i + 1}`).join("\n");
	const report = analyzeDeltaDestructiveness(
		`# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Big\n\n${lines50}\n\n## REMOVED Requirements\n\n### Requirement: Gone\n\n(Reason: removed).\n`,
		{ largeModifiedLineThreshold: 40 },
	);
	assert.equal(report.destructive, true);
	assert.equal(report.removedRequirements.length, 1);
	assert.equal(report.largeModifiedRequirements.length, 1);
});

test("detectActiveDomainCollisions filters directories correctly from readdirSync", async () => {
	// This tests that readdirSync().filter() is used (not just readdirSync())
	// to exclude files from being treated as changes
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-filter-"));
	const changesDir = join(tmpDir, ".skynex/changes");
	mkdirSync(changesDir, { recursive: true });
	
	// Create both files and directories
	writeFileSync(join(changesDir, "file.txt"), "not a dir");
	mkdirSync(join(changesDir, "valid-change/specs/auth"), { recursive: true });
	writeFileSync(join(changesDir, "valid-change/specs/auth/spec.md"), "auth");
	
	const collisions = detectActiveDomainCollisions(tmpDir, "current", "auth");
	// Should only find "valid-change", not "file.txt"
	assert.equal(collisions.length, 1);
	assert.equal(collisions[0].change, "valid-change");
});

test("safeDirectories returns empty array on directory with mixed entries", async () => {
	const tmpDir = await mkdtemp(join(tmpdir(), "guardrails-mixed-"));
	const testDir = join(tmpDir, "mixed");
	mkdirSync(testDir, { recursive: true });
	
	// Create files and directories
	writeFileSync(join(testDir, "file1.txt"), "text");
	writeFileSync(join(testDir, "file2.json"), "json");
	mkdirSync(join(testDir, "dir1"), { recursive: true });
	mkdirSync(join(testDir, "dir2"), { recursive: true });
	
	// Test via detectActiveDomainCollisions which uses safeDirectories
	const changesDir = join(tmpDir, ".skynex/changes");
	const testDirInChanges = join(changesDir, "change1");
	mkdirSync(testDirInChanges, { recursive: true });
	
	// The function should handle this without throwing
	const result = detectActiveDomainCollisions(tmpDir, "current", "auth");
	assert.ok(Array.isArray(result));
});

test("analyzeDeltaDestructiveness boundary test for >= operator", () => {
	// Create requirement with EXACTLY 40 lines (threshold)
	const lines40 = Array.from({ length: 40 }, (_, i) => `L${i}`).join("\n");
	const report = analyzeDeltaDestructiveness(
		`# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Edge\n\n${lines40}\n`,
	);
	// With default threshold=40, exactly 40 lines should be >= threshold
	assert.equal(report.largeModifiedRequirements.length, 1, "exactly at threshold should be flagged");
	assert.equal(report.largeModifiedRequirements[0].lineCount >= 40, true);
});

test("analyzeDeltaDestructiveness filters correctly for requirements just under threshold", () => {
	// Create requirement with 37 content lines (one under threshold of 40 including heading)
	const lines37 = Array.from({ length: 37 }, (_, i) => `L${i}`).join("\n");
	const report = analyzeDeltaDestructiveness(
		`# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Small\n\n${lines37}\n`,
	);
	// With default threshold=40, content under 40 total lines should NOT be flagged
	assert.equal(report.largeModifiedRequirements.length, 0, "under threshold should NOT be flagged");
});
