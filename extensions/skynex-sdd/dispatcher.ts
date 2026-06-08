/**
 * Dispatcher — pure functions for SDD mode injection and notifications.
 */

import type { SddMode, SddPhase, SddState } from "./types.js";

/**
 * Builds the system-prompt injection block when SDD mode is active.
 * Returns undefined when mode is inactive (zero overhead).
 * Always includes the current phase so the model can resume correctly.
 *
 * @param state - Current SDD state.
 */
export function buildSddHint(state: SddState): string | undefined {
  if (state.mode !== "active") return undefined;

  const featureLine = state.featureSlug
    ? `Feature: **${state.featureSlug}** (loaded — do NOT ask again).`
    : "Feature: **not yet set** — your FIRST action must be to ask: \"¿Qué feature querés desarrollar? Pasá un nombre corto (slug), ej: rebuild-auth-saml-sso\"";

  const phaseLabel = `Current phase: **${state.phase}** — resume here after /compact.`;

  const phaseInstructions = buildPhaseInstructions(state.phase);

  return [
    "## SDD MODE: active",
    featureLine,
    phaseLabel,
    "",
    "You are in SDD mode. Follow the OpenSpec lifecycle through all phases.",
    "Each phase has specific skills and gates you must respect.",
    "Proceed with the CURRENT PHASE only — do not jump ahead.",
    "",
    phaseInstructions,
    "",
    "CRITICAL RULES:",
    "  • Do NOT skip the unified HITL gate at the `plan` phase — wait for explicit user approval",
    "  • Do NOT run /skill:sync before /skill:validate returns APPROVED",
    "  • Do NOT advance phases without completing required skills",
    "  • Approval keywords: approve / dale / ok / sí / go / proceed / ejecuta",
    "  • Cancel keywords: cancel / no / stop / para / abortar",
    "  • When the user already provided a PRD, reuse it as proposal.md instead of regenerating it",
  ].join("\n");
}

/**
 * Returns phase-specific instruction block for the current phase.
 * Keeps the main hint readable while still being prescriptive per-phase.
 */
function buildPhaseInstructions(phase: SddPhase): string {
  switch (phase) {
    case "idle":
      return "Next: if no feature is set, ask the user for the feature name/slug. If the user already has a PRD or proposal, note its location. Then advance phase to `discover`.";
    case "discover":
      return "Next: PHASE 1 — invoke /skill:discover (scout exploration). Read the scout envelope. Then advance phase to `propose`.";
    case "propose":
      return "Next: PHASE 2 — invoke /skill:propose (product-planner writes proposal.md to .skynex/<slug>/proposal.md). IF THE USER ALREADY HAS A PRD: save it verbatim as .skynex/<slug>/proposal.md and treat propose as satisfied. Then advance phase to `specify`.";
    case "specify":
      return "Next: PHASE 3 — invoke /skill:specify (product-planner + architect IN PARALLEL → .skynex/<slug>/SPEC.md). Then advance phase to `plan`.";
    case "plan":
      return [
        "Next: PHASE 4 — 🚦 UNIFIED HITL GATE.",
        "Invoke /skill:plan (tech-planner → .skynex/<slug>/PLAN.md).",
        "Then STOP and present proposal.md + SPEC.md + PLAN.md together for approval.",
        "Wait for approve/edit/cancel.",
        "ONLY on approve, advance phase to `build`.",
      ].join("\n");
    case "build":
      return "Next: PHASE 5 — invoke /skill:build per slice (coder + verifier chain; parallel for disjoint slices). When all slices pass, advance phase to `validate`.";
    case "validate":
      return "Next: PHASE 6 — invoke /skill:validate (test-reviewer + security×2 + skill-validator in parallel). On APPROVED, advance phase to `sync`. On ESCALATED, surface to user and stay in `validate`.";
    case "sync":
      return "Next: PHASE 7 — invoke /skill:sync. The spec-syncer agent translates SPEC.md into a delta, then merges into .skynex/specs/<domain>/spec.md. Resolve the domain if not set. Then advance phase to `archive`.";
    case "archive":
      return "Next: PHASE 8 — invoke /skill:archive-spec. Moves .skynex/<slug>/ to .skynex/archive/YYYY-MM-DD-<slug>/. Then advance phase to `complete`.";
    case "complete":
      return "SDD flow complete. The canonical spec is updated and the feature is archived. Deactivate mode with /skynex:sdd.";
  }
}

/**
 * One-line notification shown to the user when mode changes.
 */
export function formatSddNotification(
  mode: SddMode,
  featureSlug: string | null,
): string {
  if (mode === "active") {
    const slug = featureSlug ? ` [${featureSlug}]` : "";
    return `🧭 SDD MODE: active${slug} — discover → propose → specify → plan → build → validate → sync → archive`;
  }
  return "🧭 SDD MODE: inactive — volviendo a conversación normal";
}
