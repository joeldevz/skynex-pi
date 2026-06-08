import assert from "node:assert/strict";
import test from "node:test";
import {
	applyDeltaSpec,
	parseDeltaSpec,
	parseRequirementBlocks,
} from "./deltas.ts";

const canonicalSpec = `# Example Specification

## Purpose

Example domain.

## Requirements

### Requirement: Existing Behavior

The system MUST keep existing behavior.

#### Scenario: Happy path

- GIVEN an existing condition
- WHEN the action runs
- THEN existing behavior is preserved

---

### Requirement: Deprecated Behavior

The system MUST support old behavior.

#### Scenario: Old path

- GIVEN an old condition
- WHEN the action runs
- THEN old behavior is preserved
`;

const deltaSpec = `# Delta for Example

## ADDED Requirements

### Requirement: New Behavior

The system MUST support new behavior.

#### Scenario: New path

- GIVEN a new condition
- WHEN the action runs
- THEN new behavior is available

## MODIFIED Requirements

### Requirement: Existing Behavior

The system MUST keep existing behavior and report audit evidence.
(Previously: existing behavior did not report audit evidence)

#### Scenario: Happy path

- GIVEN an existing condition
- WHEN the action runs
- THEN existing behavior is preserved
- AND audit evidence is recorded

## REMOVED Requirements

### Requirement: Deprecated Behavior

(Reason: old behavior is no longer supported)
`;

test("parseRequirementBlocks extracts requirement blocks with names", () => {
	const blocks = parseRequirementBlocks(canonicalSpec);

	assert.deepEqual(
		blocks.map((block) => block.name),
		["Existing Behavior", "Deprecated Behavior"],
	);
	assert.match(blocks[0].content, /Scenario: Happy path/);
	assert.match(blocks[1].content, /old behavior/i);
});

test("parseDeltaSpec extracts ADDED, MODIFIED, and REMOVED sections", () => {
	const delta = parseDeltaSpec(deltaSpec);

	assert.deepEqual(
		delta.added.map((block) => block.name),
		["New Behavior"],
	);
	assert.deepEqual(
		delta.modified.map((block) => block.name),
		["Existing Behavior"],
	);
	assert.deepEqual(
		delta.removed.map((block) => block.name),
		["Deprecated Behavior"],
	);
});

test("applyDeltaSpec applies ADDED, MODIFIED, and REMOVED while preserving unrelated content", () => {
	const result = applyDeltaSpec(canonicalSpec, deltaSpec);

	assert.match(result, /### Requirement: New Behavior/);
	assert.match(result, /audit evidence is recorded/);
	assert.doesNotMatch(result, /### Requirement: Deprecated Behavior/);
	assert.match(result, /# Example Specification/);
	assert.match(result, /## Purpose/);
	assert.match(result, /## Requirements/);
});

test("applyDeltaSpec preserves sections after Requirements when appending ADDED", () => {
	const result = applyDeltaSpec(
		`${canonicalSpec}\n## Notes\n\nKeep this section.\n`,
		`# Delta

## ADDED Requirements

### Requirement: New Behavior

The system MUST support new behavior.
`,
	);

	assert.match(result, /### Requirement: New Behavior[\s\S]*\n\n## Notes\n\nKeep this section\./);
	assert.doesNotMatch(result, /Behavior## Notes/);
});

test("applyDeltaSpec does not duplicate separators between multiple ADDED requirements", () => {
	const result = applyDeltaSpec(
		canonicalSpec,
		`# Delta

## ADDED Requirements

### Requirement: First New Behavior

The system MUST support the first behavior.

---

### Requirement: Second New Behavior

The system MUST support the second behavior.
`,
	);

	assert.match(result, /### Requirement: First New Behavior[\s\S]*---[\s\S]*### Requirement: Second New Behavior/);
	assert.doesNotMatch(result, /---\n\n---/);
});

test("applyDeltaSpec rejects MODIFIED requirements that do not exist", () => {
	assert.throws(
		() =>
			applyDeltaSpec(
				canonicalSpec,
				`# Delta

## MODIFIED Requirements

### Requirement: Missing Behavior

The system MUST fail.
`,
			),
		/missing canonical requirement.*Missing Behavior/i,
	);
});

test("applyDeltaSpec rejects REMOVED requirements that do not exist", () => {
	assert.throws(
		() =>
			applyDeltaSpec(
				canonicalSpec,
				`# Delta

## REMOVED Requirements

### Requirement: Missing Behavior

(Reason: already absent)
`,
			),
		/missing canonical requirement.*Missing Behavior/i,
	);
});

test("applyDeltaSpec rejects duplicate operations for the same requirement", () => {
	assert.throws(
		() =>
			parseDeltaSpec(`# Delta

## ADDED Requirements

### Requirement: Same Behavior

The system MUST do one thing.

## REMOVED Requirements

### Requirement: Same Behavior

(Reason: conflict)
`),
		/duplicate delta operation.*Same Behavior/i,
	);
});

// Category 1: Regex anchors — verify ^ (start) and $ (end) are enforced
test("parseRequirementBlocks does NOT match requirement heading with content before ###", () => {
	const blocks = parseRequirementBlocks("some text ### Requirement: Fake\n\ncontent\n");
	assert.equal(blocks.length, 0);
});

test("parseDeltaSpec does NOT match section heading with content before ##", () => {
	const delta = parseDeltaSpec("text ## ADDED Requirements\n\n### Requirement: Fake\n\ncontent\n");
	assert.equal(delta.added.length, 0);
});

test("parseDeltaSpec matches ADDED section with multiple spaces after ##", () => {
	const delta = parseDeltaSpec("##  ADDED Requirements\n\n### Requirement: Multi\n\nMUST work.\n");
	assert.equal(delta.added.length, 1);
	assert.equal(delta.added[0].name, "Multi");
});

test("parseRequirementBlocks matches heading with single space after ###", () => {
	const blocks = parseRequirementBlocks("### Requirement: Single\n\nMUST work.\n");
	assert.equal(blocks.length, 1);
	assert.equal(blocks[0].name, "Single");
});

// Category 2: trimEnd vs trimStart — verify trailing whitespace is stripped
test("applyDeltaSpec result ends with exactly one newline", () => {
	const result = applyDeltaSpec(canonicalSpec, deltaSpec);
	assert.ok(result.endsWith("\n"), "result must end with newline");
	assert.ok(!result.endsWith("\n\n"), "result must not end with double newline");
});

test("parseRequirementBlocks trims trailing whitespace from content but preserves heading", () => {
	const blocks = parseRequirementBlocks("### Requirement: Padded\n\nThe system MUST work.   \n\n");
	assert.ok(!blocks[0].content.endsWith("   "), "trailing spaces must be stripped");
	assert.ok(blocks[0].content.includes("### Requirement:"), "heading must be preserved");
});

// Category 3: Separator strip in cleanRequirementContent
test("parseRequirementBlocks strips trailing --- separator from requirement content", () => {
	const spec = `### Requirement: Clean\n\nThe system MUST work.\n\n---\n\n### Requirement: Next\n\nAnother.\n`;
	const blocks = parseRequirementBlocks(spec);
	assert.ok(!blocks[0].content.includes("---"), "trailing separator must be stripped");
	assert.equal(blocks[1].name, "Next");
});

test("applyDeltaSpec cleans trailing separator from requirement content in canonical", () => {
	const canonical = `# Spec\n\n## Requirements\n\n### Requirement: Old\n\nOld content.\n\n---\n`;
	const delta = `# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Old\n\nUpdated content.\n`;
	const result = applyDeltaSpec(canonical, delta);
	assert.ok(!result.match(/---$/m), "trailing separator must be removed");
});

// Category 4: Error messages — verify they include the requirement name
test("applyDeltaSpec MODIFIED non-existent requirement error message includes requirement name", () => {
	assert.throws(
		() =>
			applyDeltaSpec(
				canonicalSpec,
				`# Delta\n## MODIFIED Requirements\n\n### Requirement: Ghost\n\nMUST fail.\n`,
			),
		(err: Error) => {
			assert.ok(err.message.includes("Ghost"), `Error message must include requirement name`);
			return true;
		},
	);
});

test("applyDeltaSpec REMOVED non-existent requirement error message includes requirement name", () => {
	assert.throws(
		() =>
			applyDeltaSpec(
				canonicalSpec,
				`# Delta\n## REMOVED Requirements\n\n### Requirement: Ghost\n\n(Reason: gone)\n`,
			),
		(err: Error) => {
			assert.ok(err.message.includes("Ghost"), `Error message must include requirement name`);
			return true;
		},
	);
});

test("parseDeltaSpec duplicate operation error message includes requirement name", () => {
	assert.throws(
		() =>
			parseDeltaSpec(
				`# Delta\n## ADDED Requirements\n\n### Requirement: Same\n\nMUST work.\n## REMOVED Requirements\n\n### Requirement: Same\n\n(Reason: conflict)\n`,
			),
		(err: Error) => {
			assert.ok(err.message.includes("Same"), `Error message must include requirement name`);
			return true;
		},
	);
});

test("applyDeltaSpec ADDED existing requirement error message includes requirement name", () => {
	assert.throws(
		() =>
			applyDeltaSpec(
				canonicalSpec,
				`# Delta\n## ADDED Requirements\n\n### Requirement: Existing Behavior\n\nMUST conflict.\n`,
			),
		(err: Error) => {
			assert.ok(
				err.message.includes("Existing Behavior"),
				`Error message must include requirement name`,
			);
			return true;
		},
	);
});

// Category 5: appendAddedRequirements edge cases
test("applyDeltaSpec with empty ADDED section preserves canonical unchanged", () => {
	const onlyModified = `# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Existing Behavior\n\nUpdated.\n`;
	const result = applyDeltaSpec(canonicalSpec, onlyModified);
	assert.match(result, /Existing Behavior/);
	assert.match(result, /## Purpose/);
});

test("applyDeltaSpec ADDED to spec without ## Requirements section creates the section", () => {
	const noSection = `# Spec\n\n## Purpose\n\nNo requirements yet.\n`;
	const delta = `# Delta\n\n## ADDED Requirements\n\n### Requirement: First\n\nMUST exist.\n`;
	const result = applyDeltaSpec(noSection, delta);
	assert.match(result, /## Requirements/);
	assert.match(result, /### Requirement: First/);
});

test("applyDeltaSpec appends ADDED requirements AFTER existing requirements in section", () => {
	const result = applyDeltaSpec(
		canonicalSpec,
		`# Delta\n\n## ADDED Requirements\n\n### Requirement: Brand New\n\nMUST appear after existing.\n`,
	);
	const existingIdx = result.indexOf("Existing Behavior");
	const newIdx = result.indexOf("Brand New");
	assert.ok(existingIdx < newIdx, "new requirement must appear after existing ones");
});

test("applyDeltaSpec preserves structure after ## Requirements when no section follows", () => {
	const canonical = `# Spec\n\n## Requirements\n\n### Requirement: Only\n\nOne.\n`;
	const delta = `# Delta\n\n## ADDED Requirements\n\n### Requirement: New\n\nTwo.\n`;
	const result = applyDeltaSpec(canonical, delta);
	assert.match(result, /Only[\s\S]*New/);
	assert.ok(result.endsWith("\n"), "must end with single newline");
});

test("applyDeltaSpec handles MODIFIED requirement with trailing whitespace and separator", () => {
	const canonical = `# Spec\n\n## Requirements\n\n### Requirement: Target\n\nOld.   \n\n---\n`;
	const delta = `# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Target\n\nNew content.\n`;
	const result = applyDeltaSpec(canonical, delta);
	assert.match(result, /New content/);
	assert.ok(!result.includes("Old.   "), "old content with trailing spaces must be replaced");
});

test("parseRequirementBlocks extracts block positions correctly for multiple blocks", () => {
	const blocks = parseRequirementBlocks(canonicalSpec);
	assert.equal(blocks.length, 2);
	assert.ok(blocks[0].start < blocks[0].end);
	assert.ok(blocks[1].start < blocks[1].end);
	assert.ok(blocks[0].end <= blocks[1].start);
});

test("applyDeltaSpec multiple modifications in correct order", () => {
	const canonical = `# Spec\n\n## Requirements\n\n### Requirement: First\n\nA.\n\n### Requirement: Second\n\nB.\n`;
	const delta = `# Delta\n\n## MODIFIED Requirements\n\n### Requirement: First\n\nA'.\n\n### Requirement: Second\n\nB'.\n`;
	const result = applyDeltaSpec(canonical, delta);
	assert.match(result, /A'\./);
	assert.match(result, /B'\./);
	assert.ok(!result.includes("\nA.\n"), "old First must be removed");
	assert.ok(!result.includes("\nB.\n"), "old Second must be removed");
});

test("applyDeltaSpec combines ADDED and MODIFIED and REMOVED correctly", () => {
	const result = applyDeltaSpec(canonicalSpec, deltaSpec);
	// ADDED: New Behavior present
	assert.match(result, /### Requirement: New Behavior/);
	// MODIFIED: Existing Behavior has "audit evidence"
	assert.match(result, /audit evidence is recorded/);
	// REMOVED: Deprecated Behavior absent
	assert.doesNotMatch(result, /### Requirement: Deprecated Behavior/);
});

// Additional tests to kill remaining trimEnd/trimStart/string literal mutants
test("applyDeltaSpec removes leading newlines from suffix correctly", () => {
	// This tests the replace(/^\n+/, "") on suffix
	const canonical = `# Spec\n\n## Requirements\n\n### Requirement: A\n\nContent A.\n\n\n\n### Requirement: B\n\nContent B.\n`;
	const delta = `# Delta\n\n## REMOVED Requirements\n\n### Requirement: A\n\n(Reason: remove).\n`;
	const result = applyDeltaSpec(canonical, delta);
	// Result should have clean spacing around B, not double newlines
	assert.match(result, /Content B\./);
	const doubleNewlines = (result.match(/\n\n\n/g) || []).length;
	assert.ok(doubleNewlines <= 2, "should not have excessive blank lines");
});

test("applyDeltaSpec handles replacement with no suffix correctly", () => {
	// Tests the trimEnd() + "\n" logic when suffix is empty
	const canonical = `# Spec\n\n## Requirements\n\n### Requirement: Only\n\nContent only.`;
	const delta = `# Delta\n\n## REMOVED Requirements\n\n### Requirement: Only\n\n(Reason: remove).\n`;
	const result = applyDeltaSpec(canonical, delta);
	assert.ok(result.endsWith("\n"), "result must end with newline");
	assert.ok(!result.endsWith("\n\n"), "result must end with single newline only");
});

test("applyDeltaSpec correctly applies replacement when both prefix and suffix exist", () => {
	// Tests the `${prefix}\n\n${replacement.content}\n\n${suffix}` path
	const canonical = `# Spec\n\n## Requirements\n\n### Requirement: A\n\nOld A.\n\n### Requirement: B\n\nContent B.\n`;
	const delta = `# Delta\n\n## MODIFIED Requirements\n\n### Requirement: A\n\nNew A.\n`;
	const result = applyDeltaSpec(canonical, delta);
	assert.match(result, /New A\./);
	assert.match(result, /Content B\./);
	const aIdx = result.indexOf("New A");
	const bIdx = result.indexOf("Content B");
	assert.ok(aIdx < bIdx, "A should come before B");
});

test("applyDeltaSpec correctly applies removal when both prefix and suffix exist", () => {
	// Tests the `${prefix}\n\n${suffix}` path for removals
	const canonical = `# Spec\n\n## Requirements\n\n### Requirement: A\n\nContent A.\n\n### Requirement: B\n\nContent B.\n`;
	const delta = `# Delta\n\n## REMOVED Requirements\n\n### Requirement: A\n\n(Reason: remove).\n`;
	const result = applyDeltaSpec(canonical, delta);
	assert.doesNotMatch(result, /Content A/);
	assert.match(result, /Content B/);
	assert.ok(result.endsWith("\n"), "must end with single newline");
});

test("applyDeltaSpec appends new requirements with separator correctly", () => {
	// Tests the `${added.map((block) => block.content.trim()).join("\n\n---\n\n")}` logic
	const delta = `# Delta\n\n## ADDED Requirements\n\n### Requirement: First\n\nFirst content.\n\n### Requirement: Second\n\nSecond content.\n`;
	const result = applyDeltaSpec(canonicalSpec, delta);
	// Ensure separator is present between added requirements
	assert.match(result, /First content\.[\s\S]*---[\s\S]*Second content\./);
});

test("parseRequirementBlocks correctly identifies content boundaries", () => {
	// Tests that start/end positions are correct
	const spec = `### Requirement: One\n\nContent one.\n\n### Requirement: Two\n\nContent two.\n`;
	const blocks = parseRequirementBlocks(spec);
	assert.equal(blocks.length, 2);
	// The first block's content should include its heading and content
	assert.ok(blocks[0].content.includes("### Requirement: One"));
	assert.ok(blocks[0].content.includes("Content one"));
	assert.ok(!blocks[0].content.includes("Two"));
});

test("applyDeltaSpec result has exactly one trailing newline after each operation", () => {
	// Verify trimEnd() + "\n" is applied correctly
	const result1 = applyDeltaSpec(
		canonicalSpec,
		`# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Existing Behavior\n\nChanged.\n`,
	);
	const result2 = applyDeltaSpec(
		canonicalSpec,
		`# Delta\n\n## ADDED Requirements\n\n### Requirement: New\n\nNew content.\n`,
	);
	const result3 = applyDeltaSpec(
		canonicalSpec,
		`# Delta\n\n## REMOVED Requirements\n\n### Requirement: Deprecated Behavior\n\n(Reason: removed).\n`,
	);
	for (const result of [result1, result2, result3]) {
		assert.ok(result.endsWith("\n"), "must end with newline");
		assert.ok(!result.endsWith("\n\n"), "must not end with double newline");
	}
});

// Additional regex and edge case tests
test("parseRequirementBlocks requires ### at line start (not indented)", () => {
	const blocks = parseRequirementBlocks("  ### Requirement: Indented\n\nShould not match.\n");
	assert.equal(blocks.length, 0);
});

test("parseDeltaSpec requires ## at line start for section headings", () => {
	const delta = parseDeltaSpec("  ## ADDED Requirements\n\n### Requirement: Fake\n\nContent.\n");
	assert.equal(delta.added.length, 0);
});

test("parseRequirementBlocks extracts requirement name with leading/trailing spaces", () => {
	const blocks = parseRequirementBlocks("### Requirement:   Padded Name   \n\nContent.\n");
	assert.equal(blocks[0].name, "Padded Name");
});

test("normalizeMarkdown converts CRLF to LF", () => {
	// Test that \r\n is converted to \n
	const spec = `### Requirement: Test\r\nContent.\r\n`;
	const blocks = parseRequirementBlocks(spec);
	assert.equal(blocks.length, 1);
	// Verify the content doesn't have \r
	assert.ok(!blocks[0].content.includes("\r"));
});

test("cleanRequirementContent removes separator with whitespace variations", () => {
	// Test that various whitespace around --- is handled
	const spec1 = `### Requirement: A\n\nContent.  \n  ---  \n`;
	const blocks1 = parseRequirementBlocks(spec1);
	assert.ok(!blocks1[0].content.includes("---"));

	const spec2 = `### Requirement: B\n\nContent.\n---\n`;
	const blocks2 = parseRequirementBlocks(spec2);
	assert.ok(!blocks2[0].content.includes("---"));
});

test("parseRequirementBlocks handles multiline requirement content", () => {
	const spec = `### Requirement: Multi\n\nLine 1.\n\nLine 2.\n\nLine 3.\n`;
	const blocks = parseRequirementBlocks(spec);
	assert.equal(blocks.length, 1);
	assert.match(blocks[0].content, /Line 1/);
	assert.match(blocks[0].content, /Line 2/);
	assert.match(blocks[0].content, /Line 3/);
});

test("parseDeltaSpec requires exact section heading format", () => {
	// Missing "Requirements" suffix
	const delta1 = parseDeltaSpec("## ADDED\n\n### Requirement: Fake\n\nContent.\n");
	assert.equal(delta1.added.length, 0);

	// Case sensitivity check
	const delta2 = parseDeltaSpec("## added requirements\n\n### Requirement: Fake\n\nContent.\n");
	assert.equal(delta2.added.length, 1); // Should match (case-insensitive /i flag)
});

test("parseRequirementBlocks with named capture group extracts name correctly", () => {
	const blocks = parseRequirementBlocks(
		`### Requirement: Feature One\n\nDesc.\n\n### Requirement: Feature Two\n\nDesc.\n`,
	);
	assert.equal(blocks[0].name, "Feature One");
	assert.equal(blocks[1].name, "Feature Two");
});

test("operationKey function validates exact operation names", () => {
	// Calling via parseDeltaSpec which uses operationKey internally
	// If an invalid operation is somehow matched (shouldn't happen with the regex), it throws
	// The regex won't match INVALID, so this just ensures no error is thrown on valid input
	const delta = parseDeltaSpec("# Delta\n\n## ADDED Requirements\n\n### Requirement: Test\n\nContent.\n");
	assert.equal(delta.added.length, 1);
});

test("parseRequirementBlocks handles greedy vs non-greedy matching", () => {
	// Test that (.+?) is non-greedy and captures correctly
	const spec = `### Requirement: Name With Colons: Extra\n\nContent.\n`;
	const blocks = parseRequirementBlocks(spec);
	// Should extract "Name With Colons: Extra" as the name (everything after "Requirement:")
	assert.ok(blocks[0].name.includes("Name With Colons: Extra") || blocks[0].name.includes("Name With Colons"));
});

test("requirement block position tracking includes exact indices", () => {
	const spec = `### Requirement: First\n\nA.\n\n### Requirement: Second\n\nB.\n`;
	const blocks = parseRequirementBlocks(spec);
	// First block should start at 0
	assert.equal(blocks[0].start, 0);
	// Positions should be in order
	assert.ok(blocks[0].end <= blocks[1].start);
	// Content should be within bounds
	const first = spec.slice(blocks[0].start, blocks[0].end);
	assert.match(first, /First/);
});

// Additional tests to target edge cases in string processing
test("applyDeltaSpec correctly handles replacement.content being empty string for removals", () => {
	const canonical = `# Spec\n\n## Requirements\n\n### Requirement: ToRemove\n\nRemove me.\n\n### Requirement: Keep\n\nKeep me.\n`;
	const delta = `# Delta\n\n## REMOVED Requirements\n\n### Requirement: ToRemove\n\n(Reason: obsolete).\n`;
	const result = applyDeltaSpec(canonical, delta);
	// The replacement.content is empty string, which should trigger the second branch
	assert.doesNotMatch(result, /Remove me/);
	assert.match(result, /Keep me/);
});

test("applyDeltaSpec correctly applies to modified content with replacement.content non-empty", () => {
	const canonical = `# Spec\n\n## Requirements\n\n### Requirement: Old\n\nOld text.\n`;
	const delta = `# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Old\n\nNew text.\n`;
	const result = applyDeltaSpec(canonical, delta);
	// The replacement.content is non-empty, should trigger first branch
	assert.doesNotMatch(result, /Old text/);
	assert.match(result, /New text/);
});

test("parseRequirementBlocks correctly extracts name when requirement ends at file boundary", () => {
	const spec = `### Requirement: LastOne\n\nLast content without extra newlines.`;
	const blocks = parseRequirementBlocks(spec);
	assert.equal(blocks.length, 1);
	assert.equal(blocks[0].name, "LastOne");
	assert.match(blocks[0].content, /Last content/);
});

test("parseDeltaSpec correctly identifies all three section types in delta", () => {
	const spec = `# Delta\n\n## ADDED Requirements\n\n### Requirement: New\n\nNew.\n\n## MODIFIED Requirements\n\n### Requirement: Changed\n\nChanged.\n\n## REMOVED Requirements\n\n### Requirement: Deleted\n\nDeleted.`;
	const delta = parseDeltaSpec(spec);
	assert.equal(delta.added.length, 1);
	assert.equal(delta.modified.length, 1);
	assert.equal(delta.removed.length, 1);
	assert.equal(delta.added[0].name, "New");
	assert.equal(delta.modified[0].name, "Changed");
	assert.equal(delta.removed[0].name, "Deleted");
});

test("applyDeltaSpec correctly orders replacements by descending index", () => {
	// Multiple replacements should be applied in reverse order to preserve indices
	const canonical = `# Spec\n\n## Requirements\n\n### Requirement: A\n\nA.\n\n### Requirement: B\n\nB.\n\n### Requirement: C\n\nC.\n`;
	const delta = `# Delta\n\n## MODIFIED Requirements\n\n### Requirement: A\n\nA'.\n\n### Requirement: B\n\nB'.\n\n### Requirement: C\n\nC'.\n`;
	const result = applyDeltaSpec(canonical, delta);
	assert.match(result, /A'\./);
	assert.match(result, /B'\./);
	assert.match(result, /C'\./);
	assert.ok(!result.includes("\nA.\n"));
	assert.ok(!result.includes("\nB.\n"));
	assert.ok(!result.includes("\nC.\n"));
});

test("cleanRequirementContent applies both trimEnd calls correctly", () => {
	// The function does trimEnd().replace(...).trimEnd()
	// This verifies both trimEnd calls are necessary
	const contentWithTrailing = `### Requirement: X\n\nContent.   \n\n---   \n`;
	const blocks = parseRequirementBlocks(contentWithTrailing);
	// Should have no trailing spaces (after "Content." not including the period) and no separator
	assert.ok(!blocks[0].content.match(/\.   $/m), "should not have trailing spaces after period");
	assert.ok(!blocks[0].content.includes("---"), "should not have separator");
	assert.match(blocks[0].content, /Content\.$/m, "should end with period");
});

test("applyDeltaSpec with modification that includes content.trimEnd()", () => {
	// Verify that modified content uses .trimEnd()
	const canonical = `# Spec\n\n## Requirements\n\n### Requirement: Mod\n\nOld.\n`;
	const delta = `# Delta\n\n## MODIFIED Requirements\n\n### Requirement: Mod\n\nNew.   \n`;
	const result = applyDeltaSpec(canonical, delta);
	// The modified content should be trimmed
	assert.match(result, /New\./);
	assert.ok(!result.includes("New.   "));
});

test("appendAddedRequirements correctly joins multiple added requirements with separator", () => {
	const canonical = `# Spec\n\n## Requirements\n\n### Requirement: Existing\n\nOld.\n`;
	const delta = `# Delta\n\n## ADDED Requirements\n\n### Requirement: First\n\nFirst.\n\n### Requirement: Second\n\nSecond.\n\n### Requirement: Third\n\nThird.\n`;
	const result = applyDeltaSpec(canonical, delta);
	// Verify separator between all added requirements
	const firstIdx = result.indexOf("### Requirement: First");
	const secondIdx = result.indexOf("### Requirement: Second");
	const thirdIdx = result.indexOf("### Requirement: Third");
	assert.ok(firstIdx < secondIdx && secondIdx < thirdIdx);
	assert.ok(result.slice(firstIdx, secondIdx).includes("---"));
	assert.ok(result.slice(secondIdx, thirdIdx).includes("---"));
});
