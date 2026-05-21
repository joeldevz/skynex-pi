# Spec: Rebuild Auth para soportar SAML SSO

**Status:** SPECIFIED (awaiting user approval)
**Feature slug:** rebuild-auth-saml-sso
**Date:** 2026-05-20
**Sources:** proposal.md (approved by default workflow) + product-planner envelope + architect envelope

## ⚠️ Risks to Confirm

- **critical** R-1: XML signature wrapping or canonicalization bugs could allow forged assertions to authenticate users. — Mitigation: Use a maintained SAML library, validate the signed assertion actually used for claims, add malicious fixture tests, and run security review.
- **high** R-2: Replay or missing `inResponseTo` checks could issue sessions for old or unsolicited SAML responses. — Mitigation: Persist AuthnRequest IDs with TTL, consume IDs atomically, maintain replay cache for assertion IDs, and restrict IdP-initiated SSO.
- **high** R-3: Incorrect audience, issuer, destination, or ACS URL validation could accept assertions intended for another SP or tenant. — Mitigation: Resolve expected values from `SamlConfigRegistry` per organization and validate them before identity mapping.
- **high** R-4: JIT provisioning or account linking could bind an external identity to the wrong internal user. — Mitigation: Require stable identifiers, reject ambiguous email conflicts, record IdP/entity linkage, and make JIT opt-in per organization.
- **high** R-5: Role mapping from untrusted or misconfigured SAML attributes could grant excessive privileges. — Mitigation: Use allowlisted mappings, least-privilege defaults, explicit admin roles only, and tests for unmapped/hostile attributes.

---

## What & Why (Product)

Rebuild auth as a greenfield SAML SSO subsystem under `src/auth/saml/` that supports both SP-initiated and IdP-initiated SAML login, JIT provisioning, role mapping, and preservation of the existing JWT/session contract.

### Acceptance Criteria

- AC-1: Given an organization with SAML SSO enabled and valid IdP configuration, when SAML login is initiated, then only that configured and enabled IdP is accepted; unknown, disabled, or mismatched organizations are rejected without issuing a session.
  - testable: true
- AC-2: Given an unauthenticated user starts SP-initiated login for a configured organization, when the login request is created, then the user is redirected to the configured IdP with a valid SAML AuthnRequest and correlation state.
  - testable: true
- AC-3: Given a configured IdP sends an IdP-initiated SAML response, when the response is valid and maps to an enabled organization, then authentication succeeds without requiring a prior SP login request.
  - testable: true
- AC-4: Given a signed SAML response with valid issuer, audience, destination, recipient, time conditions, and trusted certificate, when it is processed, then the user is authenticated and the existing JWT/session contract is preserved.
  - testable: true
- AC-5: Given a SAML response that is malformed, unsigned, expired, not yet valid, replayed, has an untrusted issuer/certificate, invalid audience, invalid destination, or invalid signature, when it is processed, then authentication is rejected and no session or JWT is issued.
  - testable: true
- AC-6: Given JIT provisioning is enabled and a valid SAML response contains required identity attributes, when no matching user exists, then a new user is provisioned with the mapped identity and authenticated.
  - testable: true
- AC-7: Given JIT provisioning is disabled or required identity attributes are missing, when a valid SAML response is processed for a non-existing user, then authentication is rejected without creating a user.
  - testable: true
- AC-8: Given a valid SAML identity matches an existing user according to configured linking rules, when authentication succeeds, then the SAML identity is linked to that user without creating duplicates.
  - testable: true
- AC-9: Given configured role mappings from SAML attributes and/or email-domain rules, when authentication succeeds, then the resulting user roles match the configured mapping and never exceed the allowed default roles.
  - testable: true
- AC-10: Given authentication succeeds or fails, when the flow completes, then auditable security events are recorded for success, rejection reason category, organization, IdP, and user identity when available, without logging sensitive SAML assertion contents.
  - testable: true

### Edge Cases

- Clock skew between IdP and service: accept assertions only within the configured allowed skew; reject assertions outside the valid time window.
- Multiple certificates configured for an IdP during certificate rotation: accept signatures from currently trusted certificates only; reject removed or unknown certificates.
- Duplicate or conflicting identity attributes such as multiple emails or NameIDs: use configured precedence if unambiguous; otherwise reject authentication as an identity conflict.
- Existing local user email matches SAML email but linking rules do not permit automatic linking: reject authentication or require pre-existing approved link; do not silently attach the SAML identity.
- Role mapping produces no match: assign the configured safe default role or reject if no default is configured.
- Role mapping produces privileged roles from untrusted or missing attributes: do not grant privileged roles unless explicitly configured and validated.
- RelayState is missing, expired, tampered with, or too large: reject or fall back only to a safe configured destination; never redirect to an untrusted URL.
- IdP-initiated login for an organization that requires SP-initiated correlation: reject the response without issuing a session.
- User account exists but is disabled, suspended, or not allowed for the organization: reject authentication even if the SAML assertion is valid.
- Concurrent first login for the same new SAML identity: create at most one user/link and authenticate only against the single canonical account.

### Error Modes

- SAML response cannot be parsed: reject authentication, return a generic login failure to the user, and log a sanitized parse-failure event.
- Signature validation fails or certificate is untrusted: reject authentication, issue no session, and record a high-severity security event.
- Replay or duplicate assertion/request ID detected: reject authentication, issue no session, and record a replay-attempt event.
- Required user attributes are missing or invalid: reject authentication with a generic user-facing failure and log the missing attribute category.
- User provisioning or account linking conflicts with an existing user: reject authentication, avoid partial duplicate creation, and log an identity-conflict event for admin review.
- Role mapping configuration is invalid or ambiguous: fail closed by rejecting authentication or assigning only the configured lowest-privilege default, depending on policy.
- Session/JWT issuance fails after successful SAML validation: do not consider login complete; return a login failure and log the issuance failure without exposing token details.
- Audit logging fails: authentication may continue only if core security checks passed, but the logging failure must be surfaced to operational logs/alerts.
- Configured organization or IdP is missing, disabled, or inconsistent: reject the flow before authentication and return a generic configuration/login failure.
- Unexpected internal error during SAML login: fail closed, issue no session, return a generic error, and log diagnostic details safely.

### Non-Functional Requirements

- Performance: SAML response validation and session issuance should complete in <500ms p95 excluding external IdP/browser redirect time.
- Security: Fail closed by default; require trusted signed assertions; validate issuer, audience, destination, recipient, time conditions, replay, and account status; never log raw assertions, secrets, private keys, or issued tokens.
- Scalability: Support multiple organizations/IdPs, including certificate rotation, without cross-tenant authentication or role leakage.

### Out of Scope

- No OAuth/OIDC provider implementation in this scope.
- No SCIM directory sync or bulk user lifecycle management.
- No admin UI for configuring IdPs or role mappings unless separately requested.
- No SAML Single Logout in v1.
- No MFA policy enforcement beyond whatever the IdP already performs.
- No migration of unrelated legacy auth behavior except preserving the existing JWT/session contract.
- No support for unsigned assertions or test-only insecure IdPs in production behavior.

---

## How (Architecture)

### Modules

- **SamlHttpBoundary** (`src/auth/saml/http.ts`, `src/auth/saml/routes.ts`, `src/auth/saml/errors.ts`) — Owns SAML HTTP entry points for login initiation, ACS callback, metadata, and SAML-specific error responses.
- **SamlConfigRegistry** (`src/auth/saml/config.ts`, `src/auth/saml/metadata.ts`, `src/auth/saml/types.ts`) — Resolves organization/IdP configuration, SP metadata, trusted certificates, JIT flags, and role-mapping rules.
- **SamlFlowCoordinator** (`src/auth/saml/flow.ts`, `src/auth/saml/request-state.ts`) — Coordinates SP-initiated AuthnRequest creation, RelayState handling, request correlation, and IdP-initiated flow eligibility.
- **SamlResponseValidator** (`src/auth/saml/validator.ts`, `src/auth/saml/replay-store.ts`) — Validates SAMLResponse XML, signatures, issuer, audience, destination, assertion timing, replay, and `inResponseTo` semantics before identity extraction.
- **SamlIdentityMapper** (`src/auth/saml/identity.ts`, `src/auth/saml/user-directory.ts`) — Maps validated SAML assertions to existing users or safely JIT-provisions users through a user-directory port.
- **SamlSessionBridge** (`src/auth/saml/session.ts`) — Converts a validated SAML principal plus mapped roles into the existing JWT/session contract without letting SAML own token semantics.

### Data Flow

1. User browser → SamlHttpBoundary: user starts SP-initiated login with organization or IdP identifier.
2. SamlHttpBoundary → SamlConfigRegistry: resolve IdP entity ID, SSO URL, certificate set, ACS URL, audience/entity ID, JIT policy, and role rules.
3. SamlFlowCoordinator → RequestStateStore: persist AuthnRequest ID, organization, RelayState, expiry, and anti-replay metadata with short TTL.
4. SamlFlowCoordinator → External IdP: redirect browser to IdP with AuthnRequest according to configured IdP requirements.
5. External IdP → SamlHttpBoundary: POST SAMLResponse to ACS endpoint; IdP-initiated responses also enter here if explicitly enabled for the organization.
6. SamlHttpBoundary → SamlResponseValidator: validate XML size/shape, signature, trust chain/certificate, issuer, audience, destination, conditions, clock skew, replay, and `inResponseTo`.
7. SamlResponseValidator → SamlIdentityMapper: pass only normalized, validated claims such as NameID, email, display name, groups, and attributes.
8. SamlIdentityMapper → UserDirectory / database boundary: find linked user, safely link by verified identifier, or JIT-provision if enabled; reject ambiguous conflicts.
9. SamlIdentityMapper → SamlSessionBridge: provide internal user ID, organization ID, mapped roles, and authentication context.
10. SamlSessionBridge → Existing JWT/session boundary: issue the same JWT/session contract used by non-SAML auth; SAML module does not define token format.
11. SamlHttpBoundary → User browser: return session response or redirect target; on validation failure return no session and log a safe audit event.

### Decisions

- **D-1**: Use a dedicated SAML validation library behind `SamlResponseValidator`, preferably `@node-saml/node-saml`, instead of hand-rolling XML signature and assertion validation.
  - Rationale: SAML XML signature validation is security-critical and error-prone; wrapping a maintained library keeps cryptographic parsing isolated while preserving project-specific validation rules.
  - Alternatives rejected: custom XML/signature validation; `passport-saml` directly as the auth subsystem.
- **D-2**: Model request correlation and replay protection as a `RequestStateStore`/`ReplayStore` port with TTL semantics.
  - Rationale: SP-initiated SAML requires `inResponseTo` correlation and all SAML flows require replay detection; a port allows tests to use memory while production can use Redis or an existing database.
  - Alternatives rejected: in-process Map only; no request state for SP-initiated login.
- **D-3**: Preserve the existing JWT/session contract through a `SamlSessionBridge` port rather than embedding token signing inside the SAML module.
  - Rationale: SAML is an authentication input, not a session authority; keeping token semantics centralized avoids divergent session behavior.
  - Alternatives rejected: SAML module signs its own JWTs; replace local sessions with IdP-only sessions.
- **D-4**: Separate identity mapping/JIT provisioning from role mapping, with conflict rejection and least-privilege defaults.
  - Rationale: Account identity and authorization are different trust decisions; separating them makes privilege escalation and accidental account linking easier to test.
  - Alternatives rejected: auto-link users by email without conflict checks; assign roles directly from every IdP group.
- **D-5**: Support IdP-initiated SSO only as an explicit per-organization configuration option.
  - Rationale: IdP-initiated SSO lacks SP-generated `inResponseTo` correlation, so it needs a narrower trust path and explicit enablement.
  - Alternatives rejected: enable IdP-initiated SSO globally; reject IdP-initiated SSO entirely.

### Tradeoffs

- Security strictness vs IdP interoperability: chose strict validation of signatures, audience, issuer, destination, expiry, replay, and request correlation; accepted cost: some IdPs require precise metadata/configuration fixes.
- Statelessness vs replay protection: chose stateful short-lived request/replay store; accepted cost: requires shared TTL-capable storage or adapter.
- Greenfield isolation vs immediate integration depth: chose greenfield SAML subsystem with ports for users and sessions; accepted cost: adapter work once concrete user/session implementation exists.
- Flexible role mapping vs safe authorization: chose config-driven allowlisted role mappings with least-privilege fallback; accepted cost: admins must maintain mapping configuration.
- IdP-initiated convenience vs request-correlation guarantees: chose explicit enablement and heavier validation; accepted cost: IdP-initiated remains weaker than SP-initiated.

### Risks (full list)

- **critical** R-1: XML signature wrapping or canonicalization bugs could allow forged assertions to authenticate users. → Use a maintained SAML library, validate the signed assertion actually used for claims, add malicious fixture tests, and run security review.
- **high** R-2: Replay or missing `inResponseTo` checks could issue sessions for old or unsolicited SAML responses. → Persist AuthnRequest IDs with TTL, consume IDs atomically, maintain replay cache for assertion IDs, and restrict IdP-initiated SSO.
- **high** R-3: Incorrect audience, issuer, destination, or ACS URL validation could accept assertions intended for another SP or tenant. → Resolve expected values from `SamlConfigRegistry` per organization and validate them before identity mapping.
- **high** R-4: JIT provisioning or account linking could bind an external identity to the wrong internal user. → Require stable identifiers, reject ambiguous email conflicts, record IdP/entity linkage, and make JIT opt-in per organization.
- **high** R-5: Role mapping from untrusted or misconfigured SAML attributes could grant excessive privileges. → Use allowlisted mappings, least-privilege defaults, explicit admin roles only, and tests for unmapped/hostile attributes.
- **medium** R-6: Clock skew between SP and IdP could reject valid users or accept expired assertions. → Use a small configurable skew window, test boundary cases, and document NTP/time-sync requirement.
- **medium** R-7: Certificate rotation could break login or accidentally trust stale certificates. → Support multiple active trusted certs per IdP, audit config changes, and reject unknown certs by default.
- **medium** R-8: Large or malicious XML payloads could cause denial of service. → Set request size limits, reject compressed/binary surprises, avoid unsafe XML parser features, and cap validation time.
- **low** R-9: Because `src/` is currently absent and gitignored, implementation may miss tsconfig/package test globs. → Plan first slice to add src include/test globs and avoid type-only tests that pass without real source files.

### New Dependencies

- `@node-saml/node-saml@^5.0.0` — Core SAML AuthnRequest generation and SAMLResponse/XML signature validation behind the `SamlResponseValidator` wrapper. — License: MIT
- `shared RequestStateStore/ReplayStore infrastructure` — Production-safe TTL storage for AuthnRequest correlation and replay prevention; can be Redis or an existing database adapter. — License: n/a

## Next Step

On approval, run `/skill:plan` to produce executable PLAN.md.
