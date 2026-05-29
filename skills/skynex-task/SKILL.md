---
name: skynex-task
description: Task-creation mode flow. Sequential 4 steps — grill, decompose, HITL gate, Jira creation. Activated by /skynex:task. Main model is the executor; no sub-agents.
---

# skynex-task — Task Creation Flow

> Use ONLY when task-creation mode is active.
> The main model executes ALL steps — no sub-agents, no delegation.

## Compact Rules

1. SEQUENTIAL — never skip or reorder: GRILL → DECOMPOSE → GATE → JIRA
2. ONE grill question at a time — invoke /skill:grill-me discipline exactly
3. Save every grill answer to Neurox immediately (observation_type: decision)
4. Detect grill completion: ≥3 answers + acceptance criteria clear + scope defined
5. Decompose produces exactly 1 parent + 2-6 subtasks; no more, no less
6. Show draft as a formatted table before asking for approval
7. NEVER create Jira issues before explicit gate approval
8. Approval keywords: approve / dale / ok / sí / go — anything else = clarify
9. Cancel = abort immediately, nothing written to Jira, notify user
10. After Jira creation, return all issue links in a summary block

## Step 1 — GRILL

Use `/skill:grill-me` discipline:
- Ask ONE question at a time following the question format in grill-me
- Cover: Purpose → Scope → Constraints → Tradeoffs → Validation
- Stop when ALL true: can describe in 3 sentences, 3-5 acceptance criteria clear, 2-3 risks named, out-of-scope stated
- Save each answer: `neurox_save({ observation_type: "decision", kind: "semantic" })`

Minimum questions before decompose: **3**. Maximum: 10.

## Step 2 — DECOMPOSE

After grill completes, produce a `TaskDraft`:

```
Parent task:
  title: <imperative summary, ≤80 chars>
  description: <2-3 sentences: what + why>
  acceptance_criteria:
    - <observable criterion 1>
    - <observable criterion 2>
  estimated_complexity: S | M | L

Subtasks (2-6):
  - title: <imperative, ≤60 chars>
    description: <1-2 sentences>
    acceptance_criteria:
      - <observable criterion>
    estimated_complexity: S | M | L
```

Rules:
- Parent = feature-level summary (Story or Task in Jira)
- Subtasks = implementation pieces (each independently reviewable)
- Each subtask title must start with an imperative verb (Add, Create, Update, Remove, Fix)
- complexity S = <4h, M = 4h-2d, L = >2d

## Step 3 — DRAFT REVIEW (HITL Gate)

Show the draft as a **formatted table** then ask:

```
| # | Type | Title | Complexity |
|---|------|-------|-----------|
| 0 | Parent | <title> | <S/M/L> |
| 1 | Subtask | <title> | <S/M/L> |
...

¿Aprobás este desglose? Podés editar, agregar o eliminar tasks.
(approve / dale / ok → crear en Jira | edit inline → actualizar | cancel → abortar)
```

Handling responses:
- **approve / dale / ok / sí / go**: proceed to Step 4
- **edit "..."**: apply the edit, re-show the table, ask again
- **cancel / no / stop / abortar**: notify "Cancelado — nada fue enviado a Jira." and stop
- **anything else**: ask "¿Aprobás o querés hacer cambios?" (one clarifying question)

## Step 4 — JIRA CREATION

Only execute after explicit gate approval. In order:

1. **Verify project** — call `mcp_Atlassian_getVisibleJiraProjects` to confirm the project key exists and get its ID
2. **Get issue types** — call `mcp_Atlassian_getJiraProjectIssueTypesMetadata(cloudId, projectKey)` to find valid type names
3. **Create parent** — `mcp_Atlassian_createJiraIssue`:
   ```
   cloudId: <from step 1>
   projectKey: <stored project key>
   issueTypeName: "Story" (prefer) or "Task" if Story not available
   summary: <parent.title>
   description: <parent.description + acceptance_criteria formatted as bullet list>
   ```
4. **Create each subtask** — `mcp_Atlassian_createJiraIssue` for each subtask:
   ```
   cloudId: <from step 1>
   projectKey: <stored project key>
   issueTypeName: "Sub-task" (prefer) or "Task" if Sub-task not available
   summary: <subtask.title>
   description: <subtask.description + acceptance_criteria>
   parent: <parent issue key returned in step 3>
   ```
5. **Return summary**:
   ```
   ✅ Creado en Jira:
   [PROJ-123] Parent: <title> → <url>
   [PROJ-124] Subtask 1: <title> → <url>
   [PROJ-125] Subtask 2: <title> → <url>
   ...
   ```

## Anti-Patterns

- ❌ Creating Jira issues before gate approval
- ❌ Bundling multiple grill questions in one message
- ❌ Skipping grill and going straight to decompose
- ❌ Producing more than 6 subtasks (breaks review UX)
- ❌ Using "Task" as parent when "Story" is available
- ❌ Proceeding on ambiguous approval ("sure", "yeah maybe") — clarify first
