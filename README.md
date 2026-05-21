# skynex-pi

> Multi-agent coding harness for Pi — triage + 17 skills + 11 sub-agents + 7 extensions.
> Full medium/substantial-path workflow with HITL gates, TDD enforcement, and adversarial review.

## What it gives you

When you install skynex-pi in Pi, you get:

- **7 extensions** — `triage`, `iron-law`, `skill-registry`, `smart-zone`, `archive`, `neurox-tool`, `production-gate`, `skynex-installer`
- **17 skills** — `discover`, `plan`, `build`, `validate`, `propose`, `specify`, `prd`, `grill-me`, `tdd-discipline`, `verification-before-completion`, `adversarial-review`, `security`, `branch-pr`, `chained-pr`, `work-unit-commits`, `comment-writer`, `cognitive-doc-design`, `research`
- **11 sub-agents** — `scout`, `tech-planner`, `coder`, `verifier`, `test-reviewer`, `security`, `skill-validator`, `product-planner`, `architect`, `archivist`

Triage classifies your prompt into one of 4 paths and injects the right workflow:

| Path | When | Workflow |
|------|------|----------|
| `conversational` | Greetings, questions | No workflow, just chat |
| `small` | Single-file edits, typos | Direct edit |
| `medium` | New features, refactors | discover → plan → build → validate |
| `substantial` | Auth, payments, migrations | discover → propose → specify → plan → build → validate |

## Quick install

```bash
# 1. Install skynex-pi globally
pi install npm:skynex-pi

# 2. Install companion Pi packages
pi install npm:pi-sub-agent
pi install npm:@juicesharp/rpiv-todo
pi install npm:pi-web-access
pi install npm:pi-mcp-adapter

# 3. Restart Pi or start a new session
pi
```

On first Pi session, `skynex-installer` automatically copies sub-agents to `~/.pi/agent/agents/` so they're available globally.

## Required companion packages

skynex-pi depends on these Pi packages for full functionality:

| Package | What it adds | Why required |
|---------|--------------|--------------|
| `pi-sub-agent` | `subagent` tool for parallel/chained agent invocation | All workflows use sub-agents |
| `@juicesharp/rpiv-todo` | `todo` tool + live overlay | Used by build skill to track slice progress |
| `pi-web-access` | `web_search`, `fetch_content` | Used by `/skill:research` and scout |
| `pi-mcp-adapter` | MCP server support (Atlassian, Slack, Figma, Neurox, etc.) | Optional but recommended |

These are NOT bundled to avoid version conflicts. Install them separately.

## MCPs (optional)

For MCP servers (Atlassian, Slack, Figma, Neurox memory, Cloudflare, etc.), create `~/.config/mcp/mcp.json` or `~/.pi/agent/mcp.json`:

```json
{
  "settings": {
    "toolPrefix": "short",
    "idleTimeout": 10
  },
  "mcpServers": {
    "neurox": {
      "command": "neurox",
      "args": ["mcp"],
      "lifecycle": "keep-alive"
    }
  }
}
```

See [pi-mcp-adapter docs](https://www.npmjs.com/package/pi-mcp-adapter) for full configuration options.

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `SKYNEX_HITL` | HITL gate mode: `single` (default), `strict`, or `none` | `single` |
| `SKYNEX_AGENT_HOME` | Override agent install location | `~/.pi/agent` |

For substantial-path workflows, defaults are sensible. Override only if needed.

## Usage

After install, just use Pi normally. Triage runs automatically on every prompt:

```bash
pi
# Type: "agrega isValidEmail con tests TDD"
# Triage → medium → discover → plan → build → validate (autonomous after gates)

# Or:
# Type: "rebuild auth para soportar SAML SSO"
# Triage → substantial → discover → propose → specify → plan → [HITL gate] → build → validate
```

### Slash commands

| Command | What it does |
|---------|--------------|
| `/skill:<name>` | Manually invoke a skill (discover, plan, build, validate, propose, specify, research, etc.) |
| `/triage:status` | Show current session classification |
| `/skynex:install` | Re-install/refresh agent files |
| `/skynex:status` | Show installation health |
| `/skills:list` | List all available skills |
| `/skills:refresh` | Reload skill registry |
| `/iron-law:status` | Check TDD enforcement status |
| `/archive:run` | Manually trigger archivist (end-of-session synthesis) |
| `/mcp` | Interactive MCP server panel (requires pi-mcp-adapter) |
| `/todos` | Show todo list (requires rpiv-todo) |

## Customization

### Skills

To override a skill in your project, create `.pi/skills/<name>/SKILL.md` in your project. Project skills take precedence over global ones.

### Sub-agents

To override a sub-agent, create `.pi/agents/<name>.md` in your project with `agentScope: "both"` or `"project"` in your subagent invocations.

### Triage rules

Configure via `.skynex/triage.config.json` in your project. See [triage docs](extensions/triage/README.md) if it exists.

## Status

**v0.1.0** — Initial public release. All 3 paths working end-to-end. 307 tests passing.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) if present, or open an issue on GitHub.

## License

MIT
