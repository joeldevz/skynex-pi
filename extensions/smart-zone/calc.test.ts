/**
 * Smart Zone pure-logic tests. No Pi runtime.
 *
 * Run: pnpm exec tsx --test extensions/core/smart-zone/calc.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAction, formatBar, formatTokens, formatStatusLine, buildCheckpointContent } from "./calc.js";
import { DEFAULT_SMART_ZONE_CONFIG, calculateEffectiveThresholds } from "./types.js";

const cfg = DEFAULT_SMART_ZONE_CONFIG;

// ─── calculateEffectiveThresholds ────────────────────────────────────────────

test("calculateEffectiveThresholds: auto_detect=true, Opus 272K", () => {
  const result = calculateEffectiveThresholds(DEFAULT_SMART_ZONE_CONFIG, 272_000);
  assert.equal(result.warning_threshold, 149_600); // 272K * 0.55
  assert.equal(result.hard_cap, 204_000); // 272K * 0.75
});

test("calculateEffectiveThresholds: auto_detect=true, Sonnet 200K", () => {
  const result = calculateEffectiveThresholds(DEFAULT_SMART_ZONE_CONFIG, 200_000);
  assert.equal(result.warning_threshold, 110_000); // 200K * 0.55
  assert.equal(result.hard_cap, 150_000); // 200K * 0.75
});

test("calculateEffectiveThresholds: auto_detect=true, GPT 128K", () => {
  const result = calculateEffectiveThresholds(DEFAULT_SMART_ZONE_CONFIG, 128_000);
  assert.equal(result.warning_threshold, 70_400); // 128K * 0.55
  assert.equal(result.hard_cap, 96_000); // 128K * 0.75
});

test("calculateEffectiveThresholds: auto_detect=false returns absolute thresholds", () => {
  const config = { ...DEFAULT_SMART_ZONE_CONFIG, auto_detect: false };
  const result = calculateEffectiveThresholds(config, 272_000);
  assert.equal(result.warning_threshold, 60_000);
  assert.equal(result.hard_cap, 80_000);
});

test("calculateEffectiveThresholds: custom percentages respected", () => {
  const config = { ...DEFAULT_SMART_ZONE_CONFIG, warning_percent: 0.5, hard_cap_percent: 0.7 };
  const result = calculateEffectiveThresholds(config, 200_000);
  assert.equal(result.warning_threshold, 100_000); // 200K * 0.5
  assert.equal(result.hard_cap, 140_000); // 200K * 0.7
});

// ─── decideAction ────────────────────────────────────────────────────────────

test("decide: below warning → ok", () => {
  const d = decideAction(50_000, 60_000, 80_000, 0, 5_000);
  assert.equal(d.action, "ok");
  assert.equal(d.tokens, 50_000);
  assert.equal(d.percent_of_cap, 63); // 50K / 80K = 62.5% → 63%
});

test("decide: at warning threshold and not yet warned → warn", () => {
  const d = decideAction(60_000, 60_000, 80_000, 0, 5_000);
  assert.equal(d.action, "warn");
  assert.equal(d.threshold_crossed, 60_000);
});

test("decide: just above warning, already warned at exactly threshold → ok (within step)", () => {
  const d = decideAction(62_000, 60_000, 80_000, 60_000, 5_000);
  // last warned at 60K, next at 65K, current 62K → still ok
  assert.equal(d.action, "ok");
});

test("decide: crossed next step (60K + 5K) → warn again", () => {
  const d = decideAction(65_000, 60_000, 80_000, 60_000, 5_000);
  // Next warn is at 60K + 5K = 65K
  assert.equal(d.action, "warn");
  assert.equal(d.threshold_crossed, 65_000);
});

test("decide: at hard cap → compact", () => {
  const d = decideAction(80_000, 60_000, 80_000, 75_000, 5_000);
  assert.equal(d.action, "compact");
  assert.equal(d.threshold_crossed, 80_000);
});

test("decide: over hard cap → compact (still)", () => {
  const d = decideAction(100_000, 60_000, 80_000, 75_000, 5_000);
  assert.equal(d.action, "compact");
  assert.equal(d.percent_of_cap, 100); // clamped
});

test("decide: custom thresholds respected", () => {
  assert.equal(decideAction(49_000, 50_000, 70_000, 0, 5_000).action, "ok");
  assert.equal(decideAction(50_000, 50_000, 70_000, 0, 5_000).action, "warn");
  assert.equal(decideAction(70_000, 50_000, 70_000, 0, 5_000).action, "compact");
});

test("decide: percent_of_cap is rounded", () => {
  // 33_333 / 80_000 = 41.666% → 42
  assert.equal(decideAction(33_333, 60_000, 80_000, 0, 5_000).percent_of_cap, 42);
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
  const line = formatStatusLine(45_000, 80_000);
  assert.match(line, /45K/);
  assert.match(line, /80K/);
  assert.match(line, /56%/);
  assert.match(line, /█/);
});

test("status line: 0 tokens", () => {
  const line = formatStatusLine(0, 80_000);
  assert.match(line, /0\/80K/);
  assert.match(line, /0%/);
});

// ─── buildCheckpointContent ──────────────────────────────────────────────────

test("checkpoint: includes 'Workflow Checkpoint' header", () => {
  const content = buildCheckpointContent(85_000, 80_000, "/tmp/session.json", "medium");
  assert.match(content, /# Workflow Checkpoint/);
});

test("checkpoint: includes recovery steps section", () => {
  const content = buildCheckpointContent(85_000, 80_000, "/tmp/session.json", "medium");
  assert.match(content, /## Recovery steps/);
  assert.match(content, /Read \.skynex\/ directory/);
  assert.match(content, /git diff/);
});

test("checkpoint: includes triage classification when provided", () => {
  const content = buildCheckpointContent(90_000, 80_000, "/tmp/session.json", "substantial");
  assert.match(content, /## Triage classification: substantial/);
});

test("checkpoint: handles undefined triage classification gracefully", () => {
  const content = buildCheckpointContent(90_000, 80_000, "/tmp/session.json", undefined);
  assert.match(content, /## Triage classification: unknown/);
  assert.doesNotMatch(content, /undefined/);
});

test("checkpoint: uses provided hard_cap in token display", () => {
  const content = buildCheckpointContent(90_000, 204_000, "/tmp/session.json", "medium");
  assert.match(content, /90K \/ 204K/);
});
