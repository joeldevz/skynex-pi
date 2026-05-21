# Proposal: Rebuild Auth para soportar SAML SSO

**Status:** PROPOSED (awaiting user approval)
**Feature slug:** rebuild-auth-saml-sso
**Date:** 2026-05-20

## Goal

Rebuild auth as a greenfield SAML SSO subsystem under `src/auth/saml/`. The new subsystem must support SAML login while preserving the existing JWT/session contract.

## Proposed Approach

Create a focused SAML auth module that handles SP-initiated and IdP-initiated login flows, validates SAML responses before session issuance, and integrates with the existing JWT/session boundary. Support JIT provisioning for new SAML users and configurable role mapping from SAML attributes/email-domain rules. Treat security validation as core product behavior, not a follow-up hardening task.

## Key Acceptance Criteria

- AC-1: Supports SP-initiated SAML authentication for configured organizations/IdPs.
- AC-2: Authenticates valid signed SAML responses and preserves the existing JWT/session contract.
- AC-3: JIT provisions or links users from required identity attributes when enabled.
- AC-4: Applies configured role mappings consistently from SAML attributes and/or email domains.
- AC-5: Rejects malformed, unsigned, expired, replayed, or untrusted SAML responses without issuing a session.

## Major Risks

- **High**: XML signature / certificate validation mistakes could allow auth bypass — mitigate with library selection, negative tests, and security review.
- **High**: Replay, `inResponseTo`, audience, issuer, or clock-skew handling bugs could issue invalid sessions — mitigate with explicit validators and test fixtures.
- **Medium**: JIT provisioning and role mapping can create privilege or account-linking errors — mitigate with safe defaults and conflict rejection.

## Effort Estimate

L (several focused slices across SAML validation, flow handling, JIT provisioning, role mapping, and session integration)

## Next Step

On approval, run `/skill:specify` to produce full SPEC.md with product-planner + architect in parallel.
