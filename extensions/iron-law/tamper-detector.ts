/**
 * Iron Law tamper detector — detects test file rename/delete patterns in bash commands.
 *
 * This prevents the bypass chain:
 *   1. Sub-agent creates fake .spec.ts
 *   2. mv .spec.ts .test.ts  ← we block this
 *   3. Edit succeeds
 *   4. Sub-agent deletes .test.ts  ← we block this
 *
 * Pure function (no I/O), safe to test.
 */

/**
 * Detects suspicious bash patterns affecting test files.
 * Returns { matched: boolean; pattern: string }
 *
 * Patterns detected:
 *   - mv <path>.spec.ts <path>.test.ts (and vice versa)
 *   - rm <path>.test.ts or rm <path>.spec.ts
 *   - cp <path>.spec.ts <path>.test.ts (copy with rename)
 */
export function detectTestFileTampering(cmd: string): {
  matched: boolean;
  pattern: string;
} {
  // Normalize: remove leading/trailing whitespace
  const normalized = cmd.trim();

  // ── Pattern 1: mv rename between .test.<ext> and .spec.<ext> ──────────────

  // Matches: mv "foo.spec.ts" "foo.test.ts" or mv foo.spec.ts foo.test.ts
  const mvTestSpecPattern =
    /\bmv\s+(?:["']?)(?:[^\s"']+)[/\\]?([^/\\.\s"']+)\.(?:spec)\.(ts|tsx|js|jsx)(?:["']?)\s+(?:["']?)(?:[^\s"']+)[/\\]?[^/\\.\s"']*\.(?:test)\.\2/i;
  if (mvTestSpecPattern.test(normalized)) {
    return { matched: true, pattern: "mv rename .spec.<ext> → .test.<ext>" };
  }

  // Matches: mv "foo.test.ts" "foo.spec.ts" (other direction)
  const mvSpecTestPattern =
    /\bmv\s+(?:["']?)(?:[^\s"']+)[/\\]?([^/\\.\s"']+)\.(?:test)\.(ts|tsx|js|jsx)(?:["']?)\s+(?:["']?)(?:[^\s"']+)[/\\]?[^/\\.\s"']*\.(?:spec)\.\2/i;
  if (mvSpecTestPattern.test(normalized)) {
    return { matched: true, pattern: "mv rename .test.<ext> → .spec.<ext>" };
  }

  // ── Pattern 2: rm delete test files ──────────────────────────────────────

  // Matches: rm foo.test.ts or rm -rf foo.test.ts or rm "foo.test.ts"
  const rmTestPattern =
    /\brm\s+(?:-\w*\s+)*(?:["']?)(?:[^\s"']+[/\\])?[^\s"']+\.(?:test)\.(ts|tsx|js|jsx)(?:["']?)/i;
  if (rmTestPattern.test(normalized)) {
    return { matched: true, pattern: "rm delete .test.<ext>" };
  }

  // Matches: rm foo.spec.ts or rm -rf foo.spec.ts or rm "foo.spec.ts"
  const rmSpecPattern =
    /\brm\s+(?:-\w*\s+)*(?:["']?)(?:[^\s"']+[/\\])?[^\s"']+\.(?:spec)\.(ts|tsx|js|jsx)(?:["']?)/i;
  if (rmSpecPattern.test(normalized)) {
    return { matched: true, pattern: "rm delete .spec.<ext>" };
  }

  // ── Pattern 3: cp copy with test file rename ────────────────────────────

  // Matches: cp src/a.spec.ts src/a.test.ts (copy with rename pattern)
  const cpTestSpecPattern =
    /\bcp\s+(?:["']?)(?:[^\s"']+)[/\\]?([^/\\.\s"']+)\.(?:spec)\.(ts|tsx|js|jsx)(?:["']?)\s+(?:["']?)(?:[^\s"']+)[/\\]?[^/\\.\s"']*\.(?:test)\.\2/i;
  if (cpTestSpecPattern.test(normalized)) {
    return { matched: true, pattern: "cp copy with rename .spec.<ext> → .test.<ext>" };
  }

  return { matched: false, pattern: "" };
}
