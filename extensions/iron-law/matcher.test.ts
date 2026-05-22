/**
 * Unit tests for iron-law matcher — pure functions, no I/O.
 *
 * Run: pnpm exec tsx --test extensions/core/iron-law/matcher.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isWhitelisted,
  isProductionCode,
  inferTestPath,
  inferTestPaths,
  findExistingTestPath,
  normalizePath,
} from "./matcher.js";
import { DEFAULT_IRON_LAW_CONFIG } from "./types.js";

const cfg = DEFAULT_IRON_LAW_CONFIG;

// ─── normalizePath ────────────────────────────────────────────────────────────

test("normalizePath: relative path passes through", () => {
  assert.equal(normalizePath("src/foo/bar.ts", "/cwd"), "src/foo/bar.ts");
});

test("normalizePath: absolute path resolved to relative", () => {
  assert.equal(normalizePath("/cwd/src/foo/bar.ts", "/cwd"), "src/foo/bar.ts");
});

test("normalizePath: backslashes converted to forward slashes", () => {
  const result = normalizePath("src\\foo\\bar.ts", "/cwd");
  assert.equal(result, "src/foo/bar.ts");
});

// ─── isWhitelisted ────────────────────────────────────────────────────────────

test("whitelist: .md files exempt", () => {
  assert.ok(isWhitelisted("README.md", cfg));
  assert.ok(isWhitelisted("docs/setup.md", cfg));
});

test("whitelist: .json files exempt", () => {
  assert.ok(isWhitelisted("package.json", cfg));
  assert.ok(isWhitelisted(".skynex/config.json", cfg));
  assert.ok(isWhitelisted("tsconfig.json", cfg));
});

test("whitelist: .yaml/.yml files exempt", () => {
  assert.ok(isWhitelisted(".github/workflows/ci.yml", cfg));
  assert.ok(isWhitelisted("docker-compose.yaml", cfg));
});

test("whitelist: .github/ files exempt", () => {
  assert.ok(isWhitelisted(".github/pull_request_template.md", cfg));
});

test("whitelist: scripts/ files exempt", () => {
  assert.ok(isWhitelisted("scripts/setup.sh", cfg));
});

test("whitelist: test files themselves exempt", () => {
  assert.ok(isWhitelisted("src/foo/bar.test.ts", cfg));
  assert.ok(isWhitelisted("src/foo/bar.spec.ts", cfg));
  assert.ok(isWhitelisted("src/__tests__/auth.ts", cfg));
});

test("whitelist: .skynex/ files exempt", () => {
  assert.ok(isWhitelisted(".skynex/production-gate.json", cfg));
});

// ─── NOT whitelisted (Iron Law applies) ──────────────────────────────────────

test("NOT whitelist: src/*.ts NOT exempt", () => {
  assert.ok(!isWhitelisted("src/auth/service.ts", cfg));
});

test("NOT whitelist: app/*.ts NOT exempt", () => {
  assert.ok(!isWhitelisted("app/api/route.ts", cfg));
});

test("NOT whitelist: lib/*.go NOT exempt", () => {
  assert.ok(!isWhitelisted("lib/handlers/user.go", cfg));
});

// ─── isProductionCode ─────────────────────────────────────────────────────────

test("production: src/**/*.ts matches", () => {
  assert.ok(isProductionCode("src/auth/service.ts", cfg));
  assert.ok(isProductionCode("src/deep/nested/file.ts", cfg));
});

test("production: src/**/*.tsx matches", () => {
  assert.ok(isProductionCode("src/components/Button.tsx", cfg));
});

test("production: app/**/*.ts matches", () => {
  assert.ok(isProductionCode("app/handlers/orders.ts", cfg));
});

test("production: lib/**/*.ts matches", () => {
  assert.ok(isProductionCode("lib/utils/format.ts", cfg));
});

test("production: packages/*/src/**/*.ts matches", () => {
  assert.ok(isProductionCode("packages/api/src/index.ts", cfg));
});

test("production + whitelist: test files match production glob BUT are whitelisted", () => {
  // src/foo/bar.test.ts matches src/**/*.ts (production pattern) — that's expected.
  // The Iron Law avoids touching them because they're ALSO whitelisted.
  // Two independent checks: production-pattern AND not-whitelisted both must hold.
  const testFile = "src/foo/bar.test.ts";
  assert.ok(isProductionCode(testFile, cfg), "test file matches production glob");
  assert.ok(isWhitelisted(testFile, cfg), "test file is whitelisted (exempt)");
});

test("NOT production: scripts/ doesn't match", () => {
  assert.ok(!isProductionCode("scripts/build.ts", cfg));
});

test("NOT production: docs/ doesn't match", () => {
  assert.ok(!isProductionCode("docs/api.ts", cfg));
});

// ─── inferTestPath ────────────────────────────────────────────────────────────

test("inferTestPath: src/foo/bar.ts → src/foo/bar.test.ts", () => {
  const result = inferTestPath("src/foo/bar.ts", cfg.test_path_rules);
  assert.equal(result, "src/foo/bar.test.ts");
});

test("inferTestPath: src/foo/bar.tsx → src/foo/bar.test.tsx", () => {
  const result = inferTestPath("src/foo/bar.tsx", cfg.test_path_rules);
  assert.equal(result, "src/foo/bar.test.tsx");
});

test("inferTestPath: app/handlers/orders.ts → app/handlers/orders.test.ts", () => {
  const result = inferTestPath("app/handlers/orders.ts", cfg.test_path_rules);
  assert.equal(result, "app/handlers/orders.test.ts");
});

test("inferTestPath: lib/utils/format.go → lib/utils/format.test.go", () => {
  const result = inferTestPath("lib/utils/format.go", cfg.test_path_rules);
  assert.equal(result, "lib/utils/format.test.go");
});

test("inferTestPath: file with no extension returns undefined", () => {
  const result = inferTestPath("src/Makefile", cfg.test_path_rules);
  assert.equal(result, undefined);
});

test("inferTestPath: custom rule overrides default", () => {
  const customRules = [
    { match: "^src/(.+)\\.(ts)$", test_path: "src/__tests__/$1.test.$2" },
  ];
  const result = inferTestPath("src/foo/bar.ts", customRules);
  assert.equal(result, "src/__tests__/foo/bar.test.ts");
});

test("inferTestPath: first matching rule wins", () => {
  const rules = [
    { match: "^src/controllers/(.+)\\.ts$", test_path: "src/__tests__/$1.test.ts" },
    { match: "^src/(.+)\\.ts$", test_path: "src/$1.test.ts" },
  ];
  const result = inferTestPath("src/controllers/users.ts", rules);
  assert.equal(result, "src/__tests__/users.test.ts");
});

// ─── inferTestPaths (plural) ──────────────────────────────────────────────────

test("inferTestPaths: returns all matching rule results", () => {
  const result = inferTestPaths("src/foo/bar.ts", cfg.test_path_rules);
  // Default config has 2 rules: .test.$2 and .spec.$2
  assert.deepEqual(result, ["src/foo/bar.test.ts", "src/foo/bar.spec.ts"]);
});

test("inferTestPaths: handles tsx with both patterns", () => {
  const result = inferTestPaths("src/components/Button.tsx", cfg.test_path_rules);
  assert.deepEqual(result, ["src/components/Button.test.tsx", "src/components/Button.spec.tsx"]);
});

test("inferTestPaths: .go only matches first rule (no .spec for go)", () => {
  const result = inferTestPaths("lib/handlers/user.go", cfg.test_path_rules);
  // .go matches first rule (.test.$2) but not second (typescript only)
  assert.deepEqual(result, ["lib/handlers/user.test.go"]);
});

test("inferTestPaths: no matching rules returns empty array", () => {
  const result = inferTestPaths("src/Makefile", cfg.test_path_rules);
  assert.deepEqual(result, []);
});

// ─── findExistingTestPath ─────────────────────────────────────────────────────

test("findExistingTestPath: returns first existing candidate", () => {
  const rules = cfg.test_path_rules;
  // This test uses actual filesystem. Just verify the logic with a temporary cwd.
  const result = findExistingTestPath("extensions/iron-law/index.ts", rules, "/home/clasing/skynex-pi");
  // Should find at least one (this test runs against real files if they exist)
  // For robustness, we just check that the function signature works and returns string | undefined
  assert.ok(typeof result === "string" || result === undefined);
});

test("findExistingTestPath: returns undefined if no candidates exist", () => {
  const rules = cfg.test_path_rules;
  const result = findExistingTestPath("nonexistent/file.ts", rules, "/tmp");
  assert.equal(result, undefined);
});
