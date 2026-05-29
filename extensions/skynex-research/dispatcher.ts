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
    "The user wants to investigate something. Your job is to UNDERSTAND first, then SEARCH.",
    "",
    "FLOW:",
    "1. UNDERSTAND — read the user's message carefully.",
    "   - If the question is clear and specific → go directly to step 2.",
    "   - If the question is vague or needs clarification → ask ONE clarifying question.",
    "     Wait for the answer before searching. Do NOT launch agents on vague input.",
    "   - If the user is just greeting or making small talk → respond naturally, do NOT search.",
    "",
    "2. SEARCH (only when you have a clear question) — invoke 3 sub-agents IN PARALLEL:",
    "   subagent({ tasks: [",
    "     { agent: 'research-neurox', task: '<specific question>' },",
    "     { agent: 'research-web',    task: '<specific question>' },",
    "     { agent: 'research-code',   task: '<specific question>' },",
    "   ]})",
    "",
    "3. SYNTHESIZE — read all 3 envelopes (findings + defense + sources).",
    "   Give the user a clear answer with source attribution.",
    "   Resolve contradictions between sources explicitly.",
    "",
    "4. SAVE — if findings are relevant and durable:",
    "   neurox_save({ title, content, observation_type: 'discovery', kind: 'semantic',",
    "     tags: ['research-mode'], namespace: <project> })",
    "",
    "RULES:",
    "  • Greetings, acks, or off-topic messages → respond normally, no search.",
    "  • Vague questions → ask ONE clarifying question first, then search.",
    "  • Clear questions → search immediately without asking first.",
    "  • NEVER launch agents just because a message was sent.",
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
