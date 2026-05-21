/**
 * Types matching the archivist envelope contract.
 * These define what the archivist sub-agent outputs and what the dispatcher processes.
 */

export type ObservationType =
  | "decision"
  | "discovery"
  | "bugfix"
  | "pattern"
  | "gotcha"
  | "preference"
  | "config";

export type ObservationKind = "episodic" | "semantic" | "procedural";

export type ArchivistObservation = {
  title: string;
  content: string;
  observation_type: ObservationType;
  kind: ObservationKind;
  importance: number;
  tags: string[];
  namespace: string;
  files: string[];
  topic_key?: string;
};

export type ArchivistArtifact = {
  path: string;
  kind: "proposal" | "spec" | "architecture" | "plan" | "validation";
};

export type ArchivistEnvelope = {
  status: "archived" | "partial" | "skipped";
  session_summary: {
    goal: string;
    outcome: string;
    duration_turns: number;
    cost_usd: number;
  };
  observations_to_save: ArchivistObservation[];
  artifacts_archived: ArchivistArtifact[];
  next_steps_suggested: string[];
  notes?: string;
};

export type SaveOperation = {
  title: string;
  content: string;
  observation_type: ObservationType;
  kind: ObservationKind;
  tags: string; // comma-separated for neurox_save
  namespace: string;
  files: string; // comma-separated
  topic_key?: string;
};
