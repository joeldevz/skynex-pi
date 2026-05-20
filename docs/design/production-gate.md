# skynex-pi — Production Gate

> **Status**: Design v1 · **Component**: `extensions/core/production-gate.ts`
> **Sprint**: 1 (infra) · **Lines estimated**: ~250 TypeScript
> **Hooks**: `tool_call` on `bash`, `write`, `edit`
> **Last revision**: 2026-05-20

---

## Goal

Block commands that affect production until a human confirms. Log everything. Configurable per team.

**Not a replacement for**: CI/CD checks, branch protection rules, cluster RBAC. This is the **last line of defense before local execution** — catches honest mistakes (wrong context, fat-finger), not sophisticated attacks.

---

## Why this exists (in skynex-pi specifically)

The skynex orchestrator delegates `bash` execution to sub-agents. A sub-agent in a long session can lose track of which `kubectl` context is active. A model can decide that `terraform apply` "is probably fine" because it ran a plan 30 turns earlier. A migration script can fire because the prompt sounded like "deploy".

In OpenCode this would be a `permission` rule in JSON — but the granularity is per-tool (you can say "ask before bash" but not "ask before `kubectl apply` specifically while letting `kubectl get` through silently"). In Pi, `tool_call` hook gives us programmatic control over **the exact command string**, with full session context.

---

## Modes

| Mode | Behavior | When to use |
|------|----------|-------------|
| `strict` | Block + require typed confirmation for every match | Team default. New repos. Sensitive projects. |
| `warn` | Show warning + log, but allow execution | Senior devs with established muscle memory |
| `silent` | Log only, no UI interruption | CI environments with their own gates |
| `off` | Disabled entirely | Local sandboxes, intentional testing |

Default is `strict`. Changing to `warn`/`silent`/`off` is itself logged in the audit log.

---

## Configuration

### File: `.skynex/production-gate.json`

**Gitignored by default**. Contains your team's actual production contexts (sensitive).

```json
{
  "$schema": "skynex-pi://schemas/production-gate.json",
  "mode": "strict",
  "audit_log": {
    "path": ".skynex/audit.log",
    "auto_gitignore": true,
    "rotate_at_mb": 50,
    "retention_days": 365
  },
  "confirmation": {
    "require_typed": true,
    "typed_phrase": "yes apply",
    "afk_behavior": "always_abort"
  },
  "safe_contexts": {
    "kubectl": [],
    "git_branches": ["personal/*", "feat/*", "fix/*", "chore/*"],
    "comment": "Empty kubectl list = treat ALL contexts as production. Add your staging/local contexts to relax."
  },
  "patterns": {
    "kubectl": {
      "enabled": true,
      "block_verbs": ["apply", "delete", "scale", "rollout", "drain", "exec", "edit", "patch", "replace"],
      "always_allow_verbs": ["get", "describe", "logs", "top", "explain", "diff", "version"]
    },
    "db_migrations": {
      "enabled": true,
      "tools": [
        "prisma migrate deploy",
        "rails db:migrate",
        "alembic upgrade",
        "knex migrate:latest",
        "sqlx migrate run",
        "flyway migrate",
        "drizzle-kit push",
        "atlas migrate apply"
      ]
    },
    "db_direct": {
      "enabled": true,
      "regex_blockers": [
        "(?i)(DELETE|DROP|TRUNCATE|ALTER)\\s+(?!.*WHERE)",
        "(?i)UPDATE\\s+\\w+\\s+SET.*(?!WHERE)",
        "(?i)FLUSHALL",
        "(?i)deleteMany\\("
      ]
    },
    "terraform": { "enabled": true, "block_verbs": ["apply", "destroy", "import"] },
    "pulumi":    { "enabled": true, "block_verbs": ["up", "destroy", "refresh"] },
    "helm":      { "enabled": true, "block_verbs": ["upgrade", "uninstall", "rollback", "install"] },
    "git_force": { "enabled": true },
    "git_main_push": {
      "enabled": true,
      "protected_branches": ["main", "master", "production", "prod", "release/*"]
    },
    "publishing": {
      "enabled": true,
      "tools": ["npm publish", "pnpm publish", "yarn publish", "cargo publish", "twine upload"]
    },
    "destructive_fs": {
      "enabled": true,
      "patterns": ["rm -rf /", "rm -rf /*", "sudo rm", "chmod 777 /", "chown -R"]
    },
    "cloud_delete": {
      "enabled": true,
      "tools": ["aws", "gcloud", "az"],
      "verb_regex": "(?i)\\b(delete|remove|terminate|destroy)\\b"
    },
    "container_destructive": {
      "enabled": true,
      "patterns": ["docker volume rm", "docker system prune", "kubectl delete pvc", "podman volume rm"]
    },
    "service_control": {
      "enabled": true,
      "patterns": ["systemctl restart", "systemctl stop", "pm2 reload --update-env", "supervisorctl restart"]
    }
  },
  "custom_patterns": [
    {
      "name": "team-deploy-script",
      "regex": "^\\./deploy\\.sh\\s+(prod|production)",
      "category": "team-deploy",
      "severity": "high"
    }
  ]
}
```

### File: `.skynex/production-gate.example.json` (committed)

Same schema as above but with **placeholder values** (no real contexts). This is what new team members see when cloning the repo. They copy it to `production-gate.json`, customize, and that copy stays gitignored.

---

## Risk pattern catalog (full table)

| Category | Detection | Default | Why blocked |
|----------|-----------|---------|-------------|
| `kubectl-mutation` | `kubectl (apply\|delete\|scale\|rollout\|drain\|exec\|edit\|patch\|replace)` AND context NOT in `safe_contexts.kubectl` | strict | Modifies live cluster |
| `kubectl-readonly` | `kubectl (get\|describe\|logs\|top\|diff)` | allow | Read-only, safe |
| `db-migration` | Any tool in `patterns.db_migrations.tools` | strict | Schema change, often irreversible |
| `db-bulk-write` | SQL DELETE/DROP/TRUNCATE/ALTER/UPDATE without WHERE | strict | Mass data destruction risk |
| `terraform-apply` | `terraform (apply\|destroy\|import)` | strict | Infrastructure mutation |
| `helm-upgrade` | `helm (upgrade\|uninstall\|rollback\|install)` | strict | Live release mutation |
| `git-force-push` | `git push --force` or `git push -f` | strict | Rewrites shared history |
| `git-protected-push` | `git push` to `main\|master\|production\|prod\|release/*` | strict | Direct production deploy |
| `npm-publish` | `npm publish`, `pnpm publish`, etc. | strict | Public release, immutable |
| `cloud-delete` | `aws/gcloud/az` + delete/remove/terminate/destroy | strict | Cloud resource destruction |
| `container-destroy` | `docker volume rm`, `docker system prune`, etc. | strict | Data loss risk |
| `service-restart` | `systemctl restart/stop`, `pm2 reload` | strict | Production service interruption |
| `fs-destructive` | `rm -rf /`, `sudo rm`, `chmod 777` | strict | System damage |

Custom patterns can be added by your team without touching code.

---

## UX flow examples

### Example 1 — kubectl apply against unknown context (strict block + confirm)

```
[user types prompt: "deploy the new api version"]
[coder sub-agent generates: kubectl apply -f infra/k8s/api-deployment.yaml]

⚠️  PRODUCTION GATE TRIGGERED

  Category:  kubectl-mutation
  Command:   kubectl apply -f infra/k8s/api-deployment.yaml
  Severity:  high
  
  Context detected:
    • kubectl context:  prod-eu-west-1   ⚠️ NOT in safe_contexts.kubectl
    • namespace:        api-production
    • file:             infra/k8s/api-deployment.yaml
  
  Predicted changes (dry-run output):
    Deployment/api-service
      replicas:   3 → 5
      image:      api:v2.3.0 → api:v2.4.0
      env:        LOG_LEVEL=info (unchanged)
  
  Safer alternatives:
    • Switch to staging:   kubectl apply --context=staging-cluster ...
    • Dry run only:        kubectl apply --dry-run=client -f ...
    • Diff first:          kubectl diff -f ...
  
  This command MUTATES production state and affects real users.
  
  ┌──────────────────────────────────────────────────┐
  │  Type "yes apply" to proceed                     │
  │  Type "no" or press Esc to abort                 │
  │  Type "dry-run" to convert to --dry-run=client   │
  └──────────────────────────────────────────────────┘
  > _
```

### Example 2 — git push --force (strict block + confirm)

```
⚠️  PRODUCTION GATE TRIGGERED

  Category:  git-force-push
  Command:   git push --force origin main
  Severity:  high
  
  Context detected:
    • remote:  origin → git@github.com:joeldevz/skynex.git
    • branch:  main  ⚠️ in protected_branches
    • diff:    47 commits will be removed, 12 new commits will replace them
  
  This rewrites shared history. Other contributors will need to reset.
  
  Type "yes apply" to proceed.
  > _
```

### Example 3 — npm publish (strict block + confirm)

```
⚠️  PRODUCTION GATE TRIGGERED

  Category:  npm-publish
  Command:   pnpm publish
  Severity:  critical
  
  Context detected:
    • package:  @joeldevz/skynex-pi
    • version:  0.3.0 (current: 0.2.4 on registry)
    • registry: https://registry.npmjs.org
    • scope:    public
    • files:    156 files, 2.3 MB
  
  npm publish is IRREVERSIBLE. The version cannot be re-uploaded.
  
  Pre-flight checks:
    ✓ tests pass
    ✓ build clean
    ✗ CHANGELOG.md not updated for 0.3.0
    ✗ git tag v0.3.0 not created
  
  Type "yes apply" to proceed despite warnings.
  > _
```

---

## Audit log format

Every gate trigger writes one JSONL line to `.skynex/audit.log`:

```jsonl
{"ts":"2026-05-20T15:30:00Z","cmd":"kubectl apply -f deploy.yaml","category":"kubectl-mutation","severity":"high","ctx":{"kubectl_context":"prod-eu-west-1","namespace":"api-production"},"confirmed":true,"response":"yes apply","outcome":"success","duration_ms":1240,"session":"01KS21CFVHJFGT6F5A0TSCNWDA"}
{"ts":"2026-05-20T15:32:14Z","cmd":"terraform apply","category":"terraform-apply","severity":"high","ctx":{"workdir":"infra/aws-prod"},"confirmed":false,"response":"no","outcome":"aborted","session":"01KS21CFVHJFGT6F5A0TSCNWDA"}
{"ts":"2026-05-20T15:35:00Z","cmd":"git push --force origin main","category":"git-force-push","severity":"high","ctx":{"remote":"github.com:joeldevz/skynex","branch":"main"},"confirmed":true,"response":"yes apply","outcome":"success","session":"01KS21CFVHJFGT6F5A0TSCNWDA"}
{"ts":"2026-05-20T16:01:22Z","mode_change":"strict→warn","reason":"user_command","actor":"clasing","session":"01KS21CFVHJFGT6F5A0TSCNWDA"}
```

**Properties**:
- Append-only (never modified)
- JSONL (one object per line, easy to grep/jq)
- Rotated automatically when reaching `rotate_at_mb` (default 50MB)
- Retention configurable (default 365 days)
- Mode changes (strict→warn, etc.) are logged as their own entries
- Gitignored by default (contains sensitive context like cluster names)

**Querying examples**:

```bash
# All aborted commands today
jq 'select(.outcome=="aborted" and (.ts | startswith("2026-05-20")))' .skynex/audit.log

# All production kubectl operations last 30 days
jq 'select(.category=="kubectl-mutation")' .skynex/audit.log

# Mode change history
jq 'select(.mode_change != null)' .skynex/audit.log
```

---

## Commands (registered by the extension)

| Command | Description |
|---------|-------------|
| `/production-gate:status` | Show current mode + last 10 audit entries |
| `/production-gate:test "<cmd>"` | Dry-run: would this command trigger the gate? |
| `/production-gate:add-safe <context-or-branch>` | Add to `safe_contexts` |
| `/production-gate:remove-safe <context-or-branch>` | Remove from `safe_contexts` |
| `/production-gate:audit [--since=7d] [--category=X]` | Query audit log |
| `/production-gate:disable session` | Disable for current session (still logged!) |
| `/production-gate:disable forever` | Permanently disable (requires typed `"I accept the risk"`) |
| `/production-gate:mode <strict\|warn\|silent\|off>` | Change mode (logged) |
| `/production-gate:reload-config` | Re-read `production-gate.json` |

---

## First-run UX

When the extension loads and `.skynex/production-gate.json` does NOT exist:

1. Creates `.skynex/production-gate.json` with strict defaults (empty `safe_contexts`)
2. Creates `.skynex/production-gate.example.json` for the repo (same schema, placeholder values)
3. Adds `.skynex/production-gate.json` and `.skynex/audit.log` to `.gitignore`
4. Notifies the user:

```
🛡️  Production Gate enabled (strict mode)
   
   Config:        .skynex/production-gate.json (gitignored)
   Example:       .skynex/production-gate.example.json (committed)
   Audit log:     .skynex/audit.log (gitignored, append-only)
   
   Default behavior:
     ✓ Blocks kubectl mutations against any cluster
     ✓ Blocks DB migrations from any framework
     ✓ Blocks terraform/helm/pulumi destructive ops
     ✓ Blocks git push --force and pushes to main/master/prod
     ✓ Blocks npm publish and similar
   
   To allow specific contexts/branches without confirmation:
     /production-gate:add-safe staging-cluster
     /production-gate:add-safe feat/*
   
   Type /production-gate:status to see active config.
```

---

## Integration with other skynex-pi extensions

| Extension | Interaction |
|---|---|
| `triage.ts` | If a Substantial-path task touches production-related code, `triage` can preemptively warn that the gate will fire multiple times |
| `iron-law.ts` | Both hooks run on `tool_call`. Production-gate runs FIRST (user confirms intent). Iron Law runs after (verifies test discipline). |
| `smart-zone.ts` | The dry-run preview costs tokens. If smart-zone is near 80K, the preview is shortened to summary only. |
| `neurox-tool.ts` | Major gate triggers (mode change, override forever) are also saved to Neurox as `gotcha` observations for cross-session memory |
| `afk-runner.ts` | When AFK mode is active, `afk_behavior: "always_abort"` is the default — humans aren't there to confirm |

---

## What this does NOT do (explicit limitations)

- **Does not prevent sophisticated bypass**: `echo "kubectl delete..." | bash` evades simple regex matching. For that you need sandboxing (Docker, gVisor, firejail). Production-gate is for honest mistakes, not adversarial users.
- **Does not replace CI/CD**: Branch protection, required reviews, deployment pipelines remain essential. This is one additional layer.
- **Does not know business semantics**: It detects technical patterns. "This endpoint is business-critical" is the domain of the security dual-judge, not this gate.
- **Does not validate command correctness**: It can detect that `kubectl apply` is happening, but not whether the YAML inside is correct. Use `kubectl diff` and reviews for that.
- **Does not run sub-process inspection**: `make deploy` would be caught only if you add a custom pattern matching `make deploy`. Otherwise the gate only sees `make` (which is safe).

---

## Implementation notes

```typescript
// extensions/core/production-gate.ts (skeleton)

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, saveConfig, detectRisk, dryRun, audit } from "./production-gate/index.js";

export default function (pi: ExtensionAPI) {
  let config = loadConfig();  // creates from default if missing

  pi.on("tool_call", async (event, ctx) => {
    if (config.mode === "off") return;
    if (!["bash", "write", "edit"].includes(event.toolName)) return;

    const cmd = event.toolName === "bash" ? event.input.command : `${event.toolName}:${event.input.file_path}`;
    const risk = detectRisk(cmd, config);
    if (!risk) return;

    // silent mode: just log
    if (config.mode === "silent") {
      audit.append({ cmd, ...risk, mode: "silent", outcome: "auto-allowed" });
      return;
    }

    // warn mode: show, log, allow
    if (config.mode === "warn") {
      ctx.ui.notify(`⚠️ ${risk.category}: ${cmd}`, "warn");
      audit.append({ cmd, ...risk, mode: "warn", outcome: "auto-allowed" });
      return;
    }

    // strict mode: dry-run preview + confirm
    const preview = await dryRun(cmd, risk);
    const confirmed = await ctx.ui.custom({
      title: `⚠️ PRODUCTION GATE — ${risk.category}`,
      body: renderRiskAnalysis(cmd, risk, preview),
      confirmText: config.confirmation.typed_phrase,
      cancelText: "abort",
      requireTyped: config.confirmation.require_typed,
    });

    audit.append({ cmd, ...risk, mode: "strict", confirmed, outcome: confirmed ? "user-allowed" : "aborted" });

    if (!confirmed) {
      return { block: true, reason: `Aborted at production gate (${risk.category})` };
    }
  });

  // Register commands: /production-gate:status, /production-gate:test, etc.
  registerCommands(pi, config);
}
```

---

## Tests / golden evals

`evals/golden/production-gate/`:
- `01-kubectl-apply-blocks.yaml` — kubectl apply triggers gate
- `02-kubectl-get-allows.yaml` — kubectl get passes through
- `03-safe-context-bypass.yaml` — kubectl apply on safe context passes
- `04-typed-confirmation-required.yaml` — pressing Enter without typing aborts
- `05-warn-mode-logs-but-allows.yaml` — warn mode behavior
- `06-afk-aborts-automatically.yaml` — AFK behavior
- `07-mode-change-logged.yaml` — strict→warn transition appears in audit
- `08-custom-pattern-matches.yaml` — team-defined pattern triggers

---

## References

- Pi extension API: `~/.npm/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- Pi example: `examples/extensions/permission-gate.ts` (similar pattern, simpler)
- Pi example: `examples/extensions/confirm-destructive.ts` (similar pattern, narrower scope)
- Skynex Iron Law (related but different scope): `docs/design/request-flow.md` § TDD Iron Law (L4)
