/**
 * Archive extension — post-completion synthesis on session_shutdown.
 *
 * Hooks:
 *   - session_start: initialize per-session phase tracking
 *   - tool_call: track which phases/skills have been invoked
 *   - session_shutdown: decide whether to archive, notify user
 *
 * Commands:
 *   - /archive:run: manually invoke archivist sub-agent + dispatch saves
 *   - /archive:status: show which phases have been reached
 *
 * Integration:
 *   - Reads getTriage(sessionFile) from triage extension
 *   - Tracks phase progression via tool_call hook
 *   - On shutdown, decides whether to archive based on triage + phase reached
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { shouldArchive } from "./dispatcher.js";
import { getTriage } from "../triage/index.js";

// Per-session state: track reached phases
type PhaseState = {
  reached: Set<string>; // "discover" | "propose" | "specify" | "plan" | "build" | "validate"
  startedAt: number;
};

const sessionPhases = new Map<string, PhaseState>();

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", (event, ctx) => {
    const sessionFile =
      ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    sessionPhases.set(sessionFile, { reached: new Set(), startedAt: Date.now() });
  });

  // Track which skills/sub-agents have been invoked to know phase progress
  pi.on("tool_call", (event, ctx) => {
    const sessionFile =
      ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    const state = sessionPhases.get(sessionFile);
    if (!state) return;

    // Detect skill invocations by tool_call to "skill" with name=...
    // OR detect sub-agent invocations via "subagent" tool with agent=...
    // Mark phases reached based on what we see
    if (event.toolName === "skill" && event.input?.name) {
      const skillName = String(event.input.name);
      if (["discover", "propose", "specify", "plan", "build", "validate"].includes(skillName)) {
        state.reached.add(skillName);
      }
    }

    // Also detect subagent invocations (used in some phase implementations)
    if (event.toolName === "subagent" && event.input?.agent) {
      const agentName = String(event.input.agent);
      // Map agent names to phases
      const phaseMap: Record<string, string> = {
        scout: "discover",
        "product-planner": "propose",
        architect: "specify",
        "tech-planner": "plan",
        coder: "build",
        verifier: "build",
        "test-reviewer": "validate",
        security: "validate",
        "skill-validator": "validate",
      };
      if (phaseMap[agentName]) {
        state.reached.add(phaseMap[agentName]);
      }
    }
  });

  pi.on("session_shutdown", async (event, ctx) => {
    const sessionFile =
      ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
    const state = sessionPhases.get(sessionFile);
    sessionPhases.delete(sessionFile);

    if (!state) return;

    // Read triage classification for this session
    const triage = getTriage(sessionFile);
    const classification = triage?.path;

    // Decide: only archive if substantial AND reached build
    const reachedPhase = state.reached.has("build") ? "build" : undefined;
    if (!shouldArchive(classification, reachedPhase)) {
      // Not substantial OR didn't reach build — skip silently
      return;
    }

    // Notify user that archival is suggested
    // In v0.1, we can't directly invoke sub-agents from hooks.
    // Strategy: print a notification telling the user to /archive:run manually.
    if (ctx.hasUI) {
      ctx.ui.notify(
        "✓ Substantial-path session completed. Run `/archive:run` to synthesize Neurox observations.",
        "info",
      );
    }
  });

  // Slash command: /archive:run — manually invoke archivist + dispatch saves
  pi.registerCommand("archive:run", {
    description: "Invoke the archivist sub-agent and dispatch its observations to Neurox.",
    handler: async (_args, ctx) => {
      // In v0.1: we guide the user on how to invoke the archivist manually.
      // The actual subagent call + neurox_save dispatch is done by the LLM
      // based on the guidance below.
      // In v0.2: this command would execute the workflow automatically.
      const guidance = [
        "Archive workflow for this session:",
        "",
        "1. **Invoke the archivist sub-agent:**",
        "   subagent({agent: 'archivist', confirmProjectAgents: false})",
        "",
        "2. **Parse the envelope output (the archivist will emit a YAML block).**",
        "",
        "3. **For each observation in observations_to_save, call:**",
        "   neurox_save({",
        "     title: observation.title,",
        "     content: observation.content,",
        "     observation_type: observation.observation_type,",
        "     kind: observation.kind,",
        "     tags: observation.tags.join(', '),",
        "     namespace: observation.namespace,",
        "     files: observation.files.join(', '),",
        "     topic_key: observation.topic_key  // if present",
        "   })",
        "",
        "4. **Suggest next steps based on next_steps_suggested:**",
        "   - If /commit: invoke /commit",
        "   - If /pr: invoke /pr",
        "   - Otherwise, ask the user what's next",
        "",
        "(Future v0.2: this command will execute the workflow automatically.)",
      ].join("\n");

      if (ctx.hasUI) {
        ctx.ui.notify(guidance, "info");
      }
    },
  });

  // Slash command: /archive:status — show current session's phase progress
  pi.registerCommand("archive:status", {
    description: "Show which phases have been reached in the current session.",
    handler: async (_args, ctx) => {
      const sessionFile =
        ctx.sessionManager.getSessionFile() ?? `ephemeral-${process.pid}`;
      const state = sessionPhases.get(sessionFile);

      if (!state) {
        if (ctx.hasUI) {
          ctx.ui.notify("No active session state.", "warning");
        }
        return;
      }

      const phases = ["discover", "propose", "specify", "plan", "build", "validate"];
      const statusLines = phases.map((p) =>
        `${state.reached.has(p) ? "✓" : "✗"} ${p}`,
      );

      const lines = [
        "Archive Extension — Phase Progress",
        "",
        ...statusLines,
        "",
        `Session started: ${new Date(state.startedAt).toLocaleTimeString()}`,
        `Phase count: ${state.reached.size}/${phases.length}`,
      ];

      const output = lines.join("\n");
      if (ctx.hasUI) {
        ctx.ui.notify(output, "info");
      }
    },
  });
}
