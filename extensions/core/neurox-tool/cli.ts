/**
 * Neurox CLI args + parsing — pure helpers, no execution.
 *
 * Building CLI args is testable as pure logic. The actual exec happens in
 * index.ts via execFileSync with timeout.
 */

import type {
  RecallInput,
  SaveInput,
  ContextInput,
  SessionStartInput,
  SessionEndInput,
} from "./types.js";

function pushFlag(args: string[], flag: string, value: string | number | boolean | undefined): void {
  if (value === undefined || value === null) return;
  if (typeof value === "boolean") {
    if (value) args.push(flag);
    return;
  }
  args.push(flag, String(value));
}

/**
 * Build CLI args for `neurox recall <query>`. Query is the LAST positional arg.
 */
export function buildRecallArgs(input: RecallInput, defaultNamespace: string): string[] {
  const args: string[] = ["recall"];
  pushFlag(args, "-namespace", input.namespace ?? defaultNamespace);
  pushFlag(args, "-limit", input.limit);
  pushFlag(args, "-kind", input.kind);
  pushFlag(args, "-type", input.type);
  pushFlag(args, "-files", input.files);
  pushFlag(args, "-include-stale", input.include_stale);
  // Query goes last as positional
  args.push(input.query);
  return args;
}

export function buildSaveArgs(input: SaveInput, defaultNamespace: string): string[] {
  const args: string[] = ["save"];
  pushFlag(args, "-title", input.title); // -title is needed but used positionally too — but neurox accepts as flag
  pushFlag(args, "-content", input.content);
  pushFlag(args, "-namespace", input.namespace ?? defaultNamespace);
  pushFlag(args, "-type", input.type);
  pushFlag(args, "-kind", input.kind);
  pushFlag(args, "-tags", input.tags);
  pushFlag(args, "-files", input.files);
  pushFlag(args, "-topic-key", input.topic_key);
  pushFlag(args, "-confidence", input.confidence);
  pushFlag(args, "-retention", input.retention);
  return args;
}

export function buildContextArgs(input: ContextInput, defaultNamespace: string): string[] {
  const args: string[] = ["context"];
  pushFlag(args, "-namespace", input.namespace ?? defaultNamespace);
  pushFlag(args, "-limit", input.limit);
  pushFlag(args, "-files", input.files);
  return args;
}

export function buildSessionStartArgs(input: SessionStartInput, defaultNamespace: string): string[] {
  const args: string[] = ["session-start"];
  pushFlag(args, "-namespace", input.namespace ?? defaultNamespace);
  pushFlag(args, "-title", input.title);
  pushFlag(args, "-directory", input.directory);
  pushFlag(args, "-branch", input.branch);
  return args;
}

export function buildSessionEndArgs(input: SessionEndInput): string[] {
  const args: string[] = ["session-end"];
  pushFlag(args, "-session-id", input.session_id);
  pushFlag(args, "-summary", input.summary);
  return args;
}

/**
 * Parse neurox stdout. Tries JSON first; falls back to raw string.
 * neurox outputs JSON natively for memory queries, plain text for some
 * operations. We attempt JSON parse and fall back gracefully.
 */
export function parseStdout(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  // Try to find the first JSON object/array in the output
  // (neurox sometimes prepends a log line before JSON)
  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  let start = -1;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);

  if (start === -1) return trimmed;
  try {
    return JSON.parse(trimmed.slice(start));
  } catch {
    return trimmed;
  }
}
