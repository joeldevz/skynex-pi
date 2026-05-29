/**
 * Dispatcher — pure functions for research mode injection and notifications.
 */

import type { ResearchMode } from "./types.js";

/**
 * Returns the system-prompt block to inject when research mode is active.
 * Returns undefined when mode is inactive (no injection).
 */
export function buildResearchHint(mode: ResearchMode): string | undefined {
  if (mode !== "active") return undefined;

  return [
    "## RESEARCH MODE: active",
    "The user has activated research mode. For EVERY message, you MUST:",
    "",
    "1. Invoke 3 research sub-agents IN PARALLEL via a single subagent({tasks: [...]}) call:",
    "   - research-neurox: searches Neurox memory for prior decisions and context",
    "   - research-web:    searches the web for external information",
    "   - research-code:   searches the codebase for relevant patterns and files",
    "",
    "2. Each agent returns a YAML envelope with: findings, defense, sources.",
    "   Read ALL 3 envelopes before responding.",
    "",
    "3. Synthesize a final verdict: combine findings from all 3 sources, resolve",
    "   contradictions, and give the user a clear answer with source attribution.",
    "",
    "4. If findings are relevant and durable, save to Neurox:",
    "   neurox_save({ title, content, observation_type: 'discovery', kind: 'semantic',",
    "     tags: ['research-mode'], namespace: <project> })",
    "",
    "IMPORTANT: Do NOT skip the subagent call. Even for short questions, all 3 agents",
    "must run. This is the user's explicit contract for research mode.",
    "",
    "Invoke the /skill:skynex-research synthesis protocol after agents return.",
  ].join("\n");
}

/**
 * One-line notification shown to the user when mode changes.
 */
export function formatResearchNotification(mode: ResearchMode): string {
  if (mode === "active") {
    return "🔬 RESEARCH MODE: active — next messages will dispatch 3 parallel agents (neurox + web + code)";
  }
  return "🔬 RESEARCH MODE: inactive — back to normal conversation";
}
