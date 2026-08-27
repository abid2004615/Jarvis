/**
 * JARVIS Computer Use — Public API
 *
 * Safe, structured computer-use capability.
 * All actions go through: Target Resolution → Validation → Permission → Confirmation → Execution → Verification.
 */

// Types
export type {
  ComputerActionType,
  UIRole,
  TargetSource,
  UIElementTarget,
  ScrollDirection,
  ComputerAction,
  ResolvedTarget,
  TargetResolutionResult,
  ComputerActionStatus,
  ComputerActionResult,
  ConfirmationLevel,
  ConfirmationRequest,
  RateLimitConfig,
  AccessibilityPermissionStatus,
  AccessibilityElement,
  AccessibilityTree,
  ComputerUseHUDState,
  AllowedKey,
} from "./types";

export {
  ALLOWED_KEYS,
  DEFAULT_RATE_LIMITS,
  HIGH_RISK_LABELS,
} from "./types";

// Accessibility
export {
  checkAccessibilityPermission,
  queryAccessibilityElements,
  findAccessibilityElement,
  countAccessibilityElements,
} from "./accessibility";

// Target Resolution
export {
  resolveTarget,
  validateTargetBounds,
  validateTargetOwnership,
} from "./targets";

// Action Executor
export {
  executeComputerAction,
} from "./executor";

// Verifier
export {
  captureSnapshot,
  verifyAction,
} from "./verifier";

export type {
  ScreenSnapshot,
  VerificationResult,
} from "./verifier";

// Rate Limiter
export {
  resetChainCounters,
  setRateLimitConfig,
  getRateLimitConfig,
  canPerformAction,
  canAttemptResolution,
  canRetry,
  canCaptureScreenshot,
  getCurrentCounters,
} from "./rate-limiter";

// High-Risk Detector
export {
  detectHighRiskAction,
  getConfirmationLevel,
  getConfirmationDescription,
} from "./high-risk";

export type {
  HighRiskCheck,
} from "./high-risk";

// Action Planner
export {
  planAction,
  planActionChain,
  validateAction,
  executeWithVerification,
} from "./planner";

export type {
  ActionPlanStep,
  ActionPlan,
  ValidationResult,
  ExecutionResult,
} from "./planner";
