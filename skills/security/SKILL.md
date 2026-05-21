---
name: security
description: On-demand security audit of code, config, or infrastructure. Use when the user wants security review outside the normal /skill:validate flow.
---

# Security — On-Demand Security Audit

> Empirical findings from skynex-pi sessions: RBAC missing, plaintext secrets
> in API responses, missing rate limiting, raw SQL without sanitization.
> These weren't found by the engineer who wrote the code. They were found
> by a fresh pair of eyes asking "what could go wrong?".

## When to Use

Invoke `/skill:security` when:
- User explicitly asks for a security review
- Auditing third-party code before adopting it
- Reviewing a deploy config or IaC change
- Investigating a suspected vulnerability
- Before adding auth/payment/PII-touching features

DO NOT use for:
- Code review inside the normal build→validate flow (already covered)
- Trivial changes (typo, single-line)
- Architecture-only reviews (use `/skill:adversarial-review`)

## Compact Rules

1. Always run TWO security judges IN PARALLEL — `subagent({ tasks: [...] })`
2. Each judge gets the same target files but explicit "judge A/B" framing
3. Cover the OWASP Top 10 explicitly — checklist below
4. Findings must include: severity, file, line, evidence, remediation
5. Group findings by domain (auth/data/injection/crypto/deps/config)
6. Synthesize: agreement between judges = high confidence
7. Critical findings → STOP, do not approve without remediation
8. Suggest concrete remediation, not just "fix this"
9. Save findings to Neurox with `topic_key: security/<project>/<finding>`
10. HITL gate before declaring AUDIT COMPLETE

## OWASP Top 10 Coverage Checklist

Each security audit must explicitly cover:

| # | Area | Common Issues |
|---|------|---------------|
| A01 | Broken Access Control | Missing RBAC, IDOR, privilege escalation |
| A02 | Cryptographic Failures | Plaintext secrets, weak algorithms, missing TLS |
| A03 | Injection | SQL, NoSQL, command, XSS, log injection |
| A04 | Insecure Design | Missing rate limit, missing input validation |
| A05 | Security Misconfiguration | Open ports, default creds, verbose errors |
| A06 | Vulnerable Components | Outdated deps with known CVEs |
| A07 | Identification & Auth Failures | Weak passwords, missing MFA, session fixation |
| A08 | Software Integrity Failures | Unsigned deps, untrusted CI/CD |
| A09 | Logging & Monitoring | Missing audit logs, sensitive data in logs |
| A10 | SSRF | Unvalidated URL fetching |

## How to Invoke (parallel dual-judge)

```
subagent({
  agentScope: "project",
  confirmProjectAgents: false,
  tasks: [
    {
      agent: "security",
      task: "SECURITY JUDGE A. Audit files: <list>. Cover OWASP Top 10. Be ruthless. Return YAML envelope."
    },
    {
      agent: "security",
      task: "SECURITY JUDGE B. Audit files: <list>. Cover OWASP Top 10. Be ruthless. Return YAML envelope."
    }
  ]
})
```

## Synthesis Protocol

After both envelopes return:

1. Group findings by OWASP category
2. Mark findings as `agreed` (both judges) or `unique`
3. `agreed` + `critical` → BLOCKER, surface immediately
4. `unique` + `critical` → HIGH CONFIDENCE, surface with note
5. `agreed` + `medium` → confirmed issue
6. `unique` + `low` → mention briefly
7. Generate remediation plan ordered by severity

## Output Envelope

```yaml
status: APPROVED | NEEDS_FIX | ESCALATED
audit_target: "<files or feature audited>"
owasp_coverage:
  A01: covered
  A02: covered
  # ... etc
agreement_summary:
  agreed_findings: <N>
  unique_to_judge_a: <N>
  unique_to_judge_b: <N>
severity_summary:
  critical: <N>
  high: <N>
  medium: <N>
  low: <N>
findings:
  - id: SEC-1
    severity: critical | high | medium | low
    owasp_category: A01 | A02 | etc
    domain: auth | data | injection | crypto | deps | config
    agreement: agreed | unique_a | unique_b
    file: <path>
    line: <N>
    description: "<what's wrong>"
    evidence: "<code snippet or pattern>"
    impact: "<what happens if exploited>"
    remediation: "<concrete fix>"
    confidence: high | medium | low
remediation_plan:
  - step: 1
    finding_id: SEC-1
    action: "<concrete change>"
    priority: immediate | next-sprint | future
verdict: APPROVE | BLOCK | ESCALATE
```

## HITL Gate

After synthesis:

```
Security audit complete: <target>

Agreement: <N> findings both judges flagged
Severity: <N> critical, <N> high, <N> medium, <N> low

Top blockers:
- SEC-1 (critical): <description> → <remediation>
- SEC-2 (high): <description> → <remediation>

Verdict: <APPROVE | BLOCK | ESCALATE>

Reply: approve / edit "<note>" / cancel
```

## Anti-Patterns (do NOT do)

- Single-judge review → defeats adversarial purpose
- Skipping OWASP coverage → blind spots
- Vague remediation ("fix the auth") → must be concrete (add `@RolesGuard('admin')` on line X)
- Auto-applying judge fixes → user must approve
- "Looks secure" without evidence → forbidden phrase
- Ignoring agreement signal → both judges flagged = strong signal

## Neurox Integration

- **At start**: `neurox_recall(query="security findings <project>")` 
- **Save EACH finding**: `neurox_save(observation_type="bugfix" if critical else "discovery", topic_key="security/<project>/<finding-id>")`
- **Cross-namespace**: OWASP patterns apply globally, search without namespace
- **On false-positive (finding rejected by user)**: invalidate the observation

## Known Patterns (from skynex-pi history)

These were found in real audits — check explicitly:

- **Missing RBAC on admin endpoints**: JWT verified but role not checked. Common in handler chains.
- **Plaintext secrets in response body**: API key creation returns plaintext in JSON. Should be shown once at creation, never returned again.
- **Missing rate limiting on auth endpoints**: `/login`, `/register`, `/forgot-password` without throttle = brute force risk.
- **Raw SQL without parameterization**: Even with Prisma `$queryRaw`, must use tagged templates.
- **Verbose error messages**: Stack traces in production responses = info disclosure.
- **Audit logs missing for privileged ops**: Revoke key, delete user, change role — all must log.

## Examples

### Bad finding
```
- description: "auth is weak"
```
Too vague. What auth? Where? What's the impact?

### Good finding
```
- id: SEC-1
  severity: critical
  owasp_category: A01
  domain: auth
  file: src/api/admin.handler.ts
  line: 47
  description: "handleDeleteUser does not check user role before deletion"
  evidence: "Function calls db.users.delete(req.params.id) without RBAC guard"
  impact: "Any authenticated user (including members) can delete any other user"
  remediation: "Add `@RolesGuard('admin')` decorator on line 45 before the @Post() handler"
  confidence: high
```
