import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildStrykerArgs,
  resolveStrykerBinary,
  parseMutationJson,
  formatMutationNotification,
} from "./runner.js";
import type { MutationJsonReport } from "./types.js";

// ── buildStrykerArgs ──────────────────────────────────────────────────────────

test("buildStrykerArgs: defaults to run + json/clear-text reporters", () => {
  assert.deepEqual(buildStrykerArgs(), ["run", "--reporters", "json,clear-text"]);
});

test("buildStrykerArgs: appends --mutate when a scope is given", () => {
  assert.deepEqual(buildStrykerArgs({ scope: "extensions/triage/rules.ts" }), [
    "run",
    "--reporters",
    "json,clear-text",
    "--mutate",
    "extensions/triage/rules.ts",
  ]);
});

test("buildStrykerArgs: ignores blank/whitespace scope", () => {
  assert.deepEqual(buildStrykerArgs({ scope: "   " }), ["run", "--reporters", "json,clear-text"]);
});

// ── resolveStrykerBinary ──────────────────────────────────────────────────────

test("resolveStrykerBinary: uses local node_modules/.bin/stryker when present", () => {
  const inv = resolveStrykerBinary("/proj", (p) => p.endsWith("node_modules/.bin/stryker"));
  assert.match(inv.command, /node_modules\/\.bin\/stryker$/);
  assert.deepEqual(inv.prefixArgs, []);
});

test("resolveStrykerBinary: falls back to npx when local bin is absent", () => {
  const inv = resolveStrykerBinary("/proj", () => false);
  assert.equal(inv.command, "npx");
  assert.deepEqual(inv.prefixArgs, ["stryker"]);
});

// ── parseMutationJson ─────────────────────────────────────────────────────────

const SAMPLE: MutationJsonReport = {
  files: {
    "a.ts": {
      mutants: [
        { mutatorName: "EqualityOperator", status: "Killed", location: { start: { line: 9 } } },
        { mutatorName: "EqualityOperator", status: "Survived", location: { start: { line: 9 } } },
        { mutatorName: "BooleanLiteral", status: "NoCoverage", location: { start: { line: 12 } } },
        { mutatorName: "ConditionalExpression", status: "Timeout", location: { start: { line: 20 } } },
        { mutatorName: "ArithmeticOperator", status: "Ignored", location: { start: { line: 5 } } },
      ],
    },
    "b.ts": {
      mutants: [
        { mutatorName: "StringLiteral", status: "Killed", location: { start: { line: 3 } } },
        { mutatorName: "BlockStatement", status: "CompileError", location: { start: { line: 4 } } },
      ],
    },
  },
};

test("parseMutationJson: counts statuses correctly", () => {
  const r = parseMutationJson(SAMPLE);
  assert.equal(r.killed, 2);
  assert.equal(r.survived, 1);
  assert.equal(r.noCoverage, 1);
  assert.equal(r.timeout, 1);
  assert.equal(r.ignored, 1);
  assert.equal(r.compileErrors, 1);
});

test("parseMutationJson: score = detected / valid * 100", () => {
  // detected = killed(2) + timeout(1) = 3; valid = 3 + survived(1) + noCov(1) = 5 → 60%
  const r = parseMutationJson(SAMPLE);
  assert.equal(r.totalDetected, 3);
  assert.equal(r.totalValid, 5);
  assert.equal(r.score, 60);
});

test("parseMutationJson: survivors list = Survived + NoCoverage only (sorted by file:line)", () => {
  const r = parseMutationJson(SAMPLE);
  assert.equal(r.survivors.length, 2);
  assert.deepEqual(r.survivors[0], {
    file: "a.ts",
    line: 9,
    mutatorName: "EqualityOperator",
    status: "Survived",
  });
  assert.deepEqual(r.survivors[1], {
    file: "a.ts",
    line: 12,
    mutatorName: "BooleanLiteral",
    status: "NoCoverage",
  });
});

test("parseMutationJson: empty report is score 0, no survivors, no throw", () => {
  const r = parseMutationJson({});
  assert.equal(r.score, 0);
  assert.equal(r.totalValid, 0);
  assert.deepEqual(r.survivors, []);
});

// ── formatMutationNotification ────────────────────────────────────────────────

test("formatMutationNotification: flags surviving mutants with file:line", () => {
  const r = parseMutationJson(SAMPLE);
  const msg = formatMutationNotification(r, "a.ts");
  assert.match(msg, /SURVIVING MUTANT/);
  assert.match(msg, /a\.ts:9/);
  assert.match(msg, /60%/);
});

test("formatMutationNotification: celebrates a clean run", () => {
  const r = parseMutationJson({ files: { "a.ts": { mutants: [{ mutatorName: "X", status: "Killed", location: { start: { line: 1 } } }] } } });
  const msg = formatMutationNotification(r, "a.ts");
  assert.match(msg, /ALL MUTANTS KILLED/);
  assert.equal(r.score, 100);
});
