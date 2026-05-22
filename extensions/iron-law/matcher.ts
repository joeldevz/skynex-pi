/**
 * Iron Law matchers — pure logic, no I/O.
 *
 * Determines:
 *  - Is a file path on the whitelist? (exempt from Iron Law)
 *  - Is it production code? (Iron Law applies)
 *  - What is the expected test file path?
 *
 * Uses minimatch for glob matching — same library Pi itself uses.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { minimatch } from "minimatch";
import type { IronLawConfig, TestPathRule } from "./types.js";

const MINIMATCH_OPTS = { dot: true } as const;

/**
 * Normalize a file path to forward-slashes relative to cwd.
 * Handles absolute paths and already-relative paths.
 */
export function normalizePath(filePath: string, cwd: string): string {
  let rel = filePath;
  if (path.isAbsolute(filePath)) {
    rel = path.relative(cwd, filePath);
  }
  return rel.replace(/\\/g, "/");
}

/**
 * Returns true if `relPath` matches any pattern in the whitelist.
 */
export function isWhitelisted(relPath: string, config: IronLawConfig): boolean {
  return config.whitelist.some((pattern) =>
    minimatch(relPath, pattern, MINIMATCH_OPTS),
  );
}

/**
 * Returns true if `relPath` matches any of the production code patterns.
 */
export function isProductionCode(relPath: string, config: IronLawConfig): boolean {
  return config.production_code_patterns.some((pattern) =>
    minimatch(relPath, pattern, MINIMATCH_OPTS),
  );
}

/**
 * Derives the expected test file path from a production file path,
 * using the first matching rule in config.test_path_rules.
 *
 * Returns undefined if no rule matches.
 */
export function inferTestPath(
  relPath: string,
  rules: readonly TestPathRule[],
): string | undefined {
  for (const rule of rules) {
    const re = new RegExp(rule.match);
    const match = relPath.match(re);
    if (!match) continue;

    let testPath = rule.test_path;
    for (let i = 1; i < match.length; i++) {
      if (match[i] !== undefined) {
        testPath = testPath.replaceAll(`$${i}`, match[i]);
      }
    }
    return testPath;
  }
  return undefined;
}

/**
 * Derives ALL possible test file paths from a production file path,
 * using all matching rules in config.test_path_rules.
 *
 * Returns array of paths (may be empty if no rules match).
 */
export function inferTestPaths(
  relPath: string,
  rules: readonly TestPathRule[],
): string[] {
  const paths: string[] = [];
  for (const rule of rules) {
    const re = new RegExp(rule.match);
    const match = relPath.match(re);
    if (!match) continue;

    let testPath = rule.test_path;
    for (let i = 1; i < match.length; i++) {
      if (match[i] !== undefined) {
        testPath = testPath.replaceAll(`$${i}`, match[i]);
      }
    }
    paths.push(testPath);
  }
  return paths;
}

/**
 * Checks which test paths exist on disk and returns the first one found.
 * Returns undefined if no candidate paths exist.
 */
export function findExistingTestPath(
  relPath: string,
  rules: readonly TestPathRule[],
  cwd: string,
): string | undefined {
  const candidates = inferTestPaths(relPath, rules);
  for (const candidate of candidates) {
    const absPath = path.isAbsolute(candidate)
      ? candidate
      : path.join(cwd, candidate);
    if (fs.existsSync(absPath)) {
      return candidate;
    }
  }
  return undefined;
}
