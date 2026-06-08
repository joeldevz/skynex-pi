/**
 * Type definitions for SDD (Sustainable Design Delivery) mode.
 * Pure module with no imports from @earendil-works.
 */

/**
 * Whether SDD mode is active for this session.
 */
export type SddMode = "active" | "inactive";

/**
 * The current phase within an active SDD session.
 * Persisted in state so the model can resume after /compact.
 */
export type SddPhase =
  | "idle"
  | "discover"
  | "propose"
  | "specify"
  | "plan" // HITL gate — unified gate, model waits for user approval
  | "build"
  | "validate"
  | "sync"
  | "archive"
  | "complete";

/**
 * Per-session state stored in the module-level Map.
 * Mirrors ExecutionState pattern from skynex-execute.
 */
export interface SddState {
  /** Whether SDD mode is active. */
  mode: SddMode;
  /**
   * Feature slug being developed (e.g. "rebuild-auth-saml-sso").
   * null = not yet set (user will be asked on activation).
   */
  featureSlug: string | null;
  /**
   * Canonical domain for the sync phase (e.g. "auth").
   * null = not yet resolved.
   */
  domain: string | null;
  /** Current SDD phase. Enables resume after /compact. */
  phase: SddPhase;
  /** ISO timestamp when mode was last toggled. */
  toggledAt: string;
}
