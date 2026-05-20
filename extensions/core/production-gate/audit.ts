/**
 * Append-only JSONL audit log for the production gate.
 *
 * One entry per gate trigger (allowed or blocked). One entry per mode change.
 *
 * File rotation: when the log exceeds `rotate_at_mb`, current file is renamed
 * to `audit.log.{timestamp}` and a fresh log begins.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AuditEntry, ModeChangeEntry, AuditLogConfig } from "./types.js";

function ensureGitignored(cwd: string, relPath: string): void {
  // best-effort: add to .gitignore if not already there
  const gitignorePath = path.join(cwd, ".gitignore");
  let contents = "";
  if (fs.existsSync(gitignorePath)) {
    contents = fs.readFileSync(gitignorePath, "utf-8");
    if (contents.split(/\r?\n/).some((line) => line.trim() === relPath)) return;
  }
  const append = (contents && !contents.endsWith("\n") ? "\n" : "") + `${relPath}\n`;
  try {
    fs.appendFileSync(gitignorePath, append);
  } catch {
    // gitignore write failed — non-critical
  }
}

function rotateIfNeeded(absPath: string, maxMb: number): void {
  if (!fs.existsSync(absPath)) return;
  try {
    const stat = fs.statSync(absPath);
    if (stat.size <= maxMb * 1024 * 1024) return;
    const rotated = `${absPath}.${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.renameSync(absPath, rotated);
  } catch {
    // rotation failed — non-critical
  }
}

export function appendAuditEntry(
  cwd: string,
  config: AuditLogConfig,
  entry: AuditEntry | ModeChangeEntry,
): void {
  const absPath = path.isAbsolute(config.path)
    ? config.path
    : path.join(cwd, config.path);
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  rotateIfNeeded(absPath, config.rotate_at_mb);

  if (config.auto_gitignore) {
    const rel = path.isAbsolute(config.path) ? config.path : config.path;
    ensureGitignored(cwd, rel);
  }

  const line = JSON.stringify(entry) + "\n";
  try {
    fs.appendFileSync(absPath, line);
  } catch (err) {
    // best-effort; do not crash the gate if logging fails
    console.warn(`[production-gate] audit log write failed:`, err);
  }
}

export interface AuditQuery {
  /** ISO date string — entries >= this date. */
  since?: string;
  /** Filter by category. */
  category?: string;
  /** Max results. */
  limit?: number;
}

export interface AuditReadResult {
  total: number;
  entries: (AuditEntry | ModeChangeEntry)[];
}

export function readAuditEntries(
  cwd: string,
  config: AuditLogConfig,
  query: AuditQuery = {},
): AuditReadResult {
  const absPath = path.isAbsolute(config.path)
    ? config.path
    : path.join(cwd, config.path);
  if (!fs.existsSync(absPath)) return { total: 0, entries: [] };

  const lines = fs.readFileSync(absPath, "utf-8").split("\n").filter(Boolean);
  const entries: (AuditEntry | ModeChangeEntry)[] = [];
  let skipped = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as AuditEntry | ModeChangeEntry;
      if (query.since && entry.ts < query.since) continue;
      if (query.category && "category" in entry && entry.category !== query.category) continue;
      entries.push(entry);
    } catch {
      skipped++;
    }
  }

  if (query.limit && entries.length > query.limit) {
    entries.splice(0, entries.length - query.limit);
  }

  return { total: entries.length, entries };
}
