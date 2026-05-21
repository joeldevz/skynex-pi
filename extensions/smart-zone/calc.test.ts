/**
 * Smart Zone pure-logic tests. No Pi runtime.
 *
 * Run: pnpm exec tsx --test extensions/core/smart-zone/calc.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAction, formatBar, formatTokens, formatStatusLine, buildCheckpointContent } from "./calc.js";
import { DEFAULT_SMART_ZONE_CONFIG } from "./types.js";

const cfg = DEFAULT_SMART_ZONE_CONFIG;

// ─── decideAction ────────────────────────────────────────────────────────────

test("decide: below warning → ok", () => {
  const d = decideAction(50_000, 0, cfg);
  assert.equal(d.action, "ok");
  assert.equal(d.tokens, 50_000);
  assert.equal(d.percent_of_cap, 63); // 50K / 80K = 62.5% → 63%
});

test("decide: at warning threshold and not yet warned → warn", () => {
  const d = decideAction(60_000, 0, cfg);
  assert.equal(d.action, "warn");
  assert.equal(d.threshold_crossed, 60_000);
});

test("decide: just above warning, already warned at exactly threshold → ok (within step)", () => {
  const d = decideAction(62_000, 60_000, cfg);
  // last warned at 60K, next at 65K, current 62K → still ok
  assert.equal(d.action, "ok");
});

test("decide: crossed next step (60K + 5K) → warn again", () => {
  const d = decideAction(65_000, 60_000, cfg);
  // Next warn is at 60K + 5K = 65K
  assert.equal(d.action, "warn");
  assert.equal(d.threshold_crossed, 65_000);
});

test("decide: at hard cap → compact", () => {
  const d = decideAction(80_000, 75_000, cfg);
  assert.equal(d.action, "compact");
  assert.equal(d.threshold_crossed, 80_000);
});

test("decide: over hard cap → compact (still)", () => {
  const d = decideAction(100_000, 75_000, cfg);
  assert.equal(d.action, "compact");
  assert.equal(d.percent_of_cap, 100); // clamped
});

test("decide: custom config respected", () => {
  const custom = { ...cfg, warning_threshold: 50_000, hard_cap: 70_000 };
  assert.equal(decideAction(49_000, 0, custom).action, "ok");
  assert.equal(decideAction(50_000, 0, custom).action, "warn");
  assert.equal(decideAction(70_000, 0, custom).action, "compact");
});

test("decide: percent_of_cap is rounded", () => {
  // 33_333 / 80_000 = 41.666% → 42
  assert.equal(decideAction(33_333, 0, cfg).percent_of_cap, 42);
});

// ─── formatBar ───────────────────────────────────────────────────────────────

test("bar: 0% all empty", () => {
  const out = formatBar(0);
  assert.match(out, /^░+ 0%$/);
});

test("bar: 100% all filled", () => {
  const out = formatBar(100);
  assert.match(out, /^█+ 100%$/);
});

test("bar: 50% half-half (default width 20)", () => {
  const out = formatBar(50);
  // 10 filled + 10 empty
  assert.equal(out.match(/█/g)!.length, 10);
  assert.equal(out.match(/░/g)!.length, 10);
  assert.ok(out.endsWith(" 50%"));
});

test("bar: custom width", () => {
  const out = formatBar(50, 10);
  assert.equal(out.match(/█/g)!.length, 5);
  assert.equal(out.match(/░/g)!.length, 5);
});

test("bar: clamps negative to 0", () => {
  const out = formatBar(-10);
  assert.ok(out.endsWith(" 0%"));
});

test("bar: clamps over-100 to 100", () => {
  const out = formatBar(150);
  assert.ok(out.endsWith(" 100%"));
});

// ─── formatTokens ────────────────────────────────────────────────────────────

test("tokens: small numbers raw", () => {
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(999), "999");
});

test("tokens: K range", () => {
  assert.equal(formatTokens(1_000), "1.0K");
  assert.equal(formatTokens(45_000), "45K");
  assert.equal(formatTokens(100_000), "100K");
});

test("tokens: M range", () => {
  assert.equal(formatTokens(1_200_000), "1.2M");
});

// ─── formatStatusLine ────────────────────────────────────────────────────────

test("status line: contains both numbers + bar", () => {
  const line = formatStatusLine(45_000, cfg);
  assert.match(line, /45K/);
  assert.match(line, /80K/);
  assert.match(line, /56%/);
  assert.match(line, /█/);
});

test("status line: 0 tokens", () => {
  const line = formatStatusLine(0, cfg);
  assert.match(line, /0\/80K/);
  assert.match(line, /0%/);
});

// ─── buildCheckpointContent ──────────────────────────────────────────────────

test("checkpoint: includes 'Workflow Checkpoint' header", () => {
  const content = buildCheckpointContent(85_000, "/tmp/session.json", "medium");
  assert.match(content, /# Workflow Checkpoint/);
});

test("checkpoint: includes recovery steps section", () => {
  const content = buildCheckpointContent(85_000, "/tmp/session.json", "medium");
  assert.match(content, /## Recovery steps/);
  assert.match(content, /Read \.skynex\/ directory/);
  assert.match(content, /git diff/);
});

test("checkpoint: includes triage classification when provided", () => {
  const content = buildCheckpointContent(90_000, "/tmp/session.json", "substantial");
  assert.match(content, /## Triage classification: substantial/);
});

test("checkpoint: handles undefined triage classification gracefully", () => {
  const content = buildCheckpointContent(90_000, "/tmp/session.json", undefined);
  assert.match(content, /## Triage classification: unknown/);
  assert.doesNotMatch(content, /undefined/);
});
