/**
 * Pure dispatcher logic for parsing and processing archivist envelopes.
 * No Pi imports — all functions are pure and testable in isolation.
 */

import type {
  ArchivistEnvelope,
  SaveOperation,
  ArchivistObservation,
} from "./types.js";

/**
 * Parse a YAML envelope block from the archivist's output text.
 * Looks for a ```yaml ... ``` fenced block and parses it as YAML.
 * Returns null if no valid envelope found.
 */
export function parseArchivistEnvelope(text: string): ArchivistEnvelope | null {
  if (!text || typeof text !== "string") return null;

  // Find the first ```yaml ... ``` block
  const yamlMatch = text.match(/```yaml\s*([\s\S]*?)```/);
  if (!yamlMatch || !yamlMatch[1]) return null;

  const yamlBlock = yamlMatch[1].trim();
  if (!yamlBlock) return null;

  try {
    // Simple YAML parser for the envelope structure (well-defined)
    // We manually parse the YAML because we want to avoid new dependencies
    const envelope = parseYAML(yamlBlock) as ArchivistEnvelope;
    return envelope;
  } catch (err) {
    return null;
  }
}

/**
 * Simple YAML parser for the archivist envelope structure.
 * Supports the specific schema: status, session_summary, observations_to_save, etc.
 * Not a general YAML parser — only handles what the envelope uses.
 */
function parseYAML(yaml: string): unknown {
  const lines = yaml.split("\n");
  const result: Record<string, unknown> = {};
  let currentObject: Record<string, unknown> = result;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentList: any[] | null = null;
  let objectStack: Array<[indent: number, obj: Record<string, unknown>]> = [
    [0, result],
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Count leading spaces for indent level
    const indent = line.search(/\S/);

    // Pop stack if we're dedented
    while (objectStack.length > 1 && indent < objectStack[objectStack.length - 1]![0]) {
      objectStack.pop();
    }
    currentObject = objectStack[objectStack.length - 1]![1];

    // Array element
    if (trimmed.startsWith("- ")) {
      const elem = trimmed.substring(2).trim();
      if (currentList !== null) {
        if (elem.includes(":")) {
          // Object in array
          const [k, ...v] = elem.split(":");
          const obj: Record<string, unknown> = {
            [k.trim()]: parseScalar(v.join(":").trim()),
          };
          currentList.push(obj);
        } else {
          // Scalar in array
          currentList.push(parseScalar(elem));
        }
      }
      continue;
    }

    // Key: value line
    if (trimmed.includes(":")) {
      const colonIdx = trimmed.indexOf(":");
      const key = trimmed.substring(0, colonIdx).trim();
      const value = trimmed.substring(colonIdx + 1).trim();

      if (value === "") {
        // Start nested object or array
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const nextTrimmed = nextLine.trim();
          if (nextTrimmed.startsWith("-")) {
            // Array starting
            currentList = [];
            currentObject[key] = currentList;
          } else {
            // Nested object starting
            const newObj: Record<string, unknown> = {};
            currentObject[key] = newObj;
            objectStack.push([indent + 2, newObj]);
            currentObject = newObj;
          }
        }
      } else {
        // Scalar value
        currentObject[key] = parseScalar(value);
      }
    }
  }

  return result;
}

/**
 * Parse a scalar value from YAML, handling strings, numbers, booleans.
 */
function parseScalar(value: string): unknown {
  const trimmed = value.trim();

  // Handle quoted strings
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // Boolean
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // Number
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== "") return num;

  // String
  return trimmed;
}

/**
 * Validate an envelope structure (required fields present, types correct).
 * Returns array of error messages, empty array if valid.
 */
export function validateEnvelope(env: ArchivistEnvelope): string[] {
  const errors: string[] = [];

  if (!env) {
    errors.push("Envelope is null or undefined");
    return errors;
  }

  // Check required top-level fields
  if (!env.status) {
    errors.push("Missing required field: status");
  }
  if (!["archived", "partial", "skipped"].includes(env.status)) {
    errors.push(`Invalid status: ${env.status}, must be one of archived, partial, skipped`);
  }

  if (!env.session_summary) {
    errors.push("Missing required field: session_summary");
  } else {
    if (typeof env.session_summary.goal !== "string") {
      errors.push("session_summary.goal must be a string");
    }
    if (typeof env.session_summary.outcome !== "string") {
      errors.push("session_summary.outcome must be a string");
    }
  }

  if (!Array.isArray(env.observations_to_save)) {
    errors.push("observations_to_save must be an array");
  }

  if (!Array.isArray(env.artifacts_archived)) {
    errors.push("artifacts_archived must be an array");
  }

  if (!Array.isArray(env.next_steps_suggested)) {
    errors.push("next_steps_suggested must be an array");
  }

  return errors;
}

/**
 * Convert envelope observations to neurox_save operations.
 * Skips observations missing required fields (title, content).
 * Caps importance to [0.0, 1.0].
 * Uses defaultNamespace if observation.namespace is empty.
 */
export function toSaveOperations(
  env: ArchivistEnvelope,
  defaultNamespace: string,
): SaveOperation[] {
  if (!env.observations_to_save || !Array.isArray(env.observations_to_save)) {
    return [];
  }

  return env.observations_to_save
    .filter((obs) => {
      // Skip if missing required fields
      if (!obs.title || !obs.content) return false;
      return true;
    })
    .map((obs) => {
      // Cap importance to [0.0, 1.0]
      let importance = obs.importance ?? 0.5;
      if (typeof importance !== "number") {
        importance = 0.5;
      }
      importance = Math.max(0.0, Math.min(1.0, importance));

      return {
        title: obs.title,
        content: obs.content,
        observation_type: obs.observation_type,
        kind: obs.kind,
        tags: Array.isArray(obs.tags) ? obs.tags.join(", ") : "",
        namespace: obs.namespace && obs.namespace.trim() ? obs.namespace : defaultNamespace,
        files: Array.isArray(obs.files) ? obs.files.join(", ") : "",
        topic_key: obs.topic_key,
      };
    });
}

/**
 * Decide whether to run the archivist for this session.
 * Returns true if substantial path AND reached at least build phase.
 */
export function shouldArchive(
  triageClassification: string | undefined,
  reachedPhase: string | undefined,
): boolean {
  // Only archive substantial path
  if (triageClassification !== "substantial") {
    return false;
  }

  // Must have reached at least the build phase
  if (reachedPhase !== "build") {
    return false;
  }

  return true;
}
