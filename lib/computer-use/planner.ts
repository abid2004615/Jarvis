/**
 * JARVIS Computer Use — Action Planner
 *
 * Plans multi-step computer-use operations by:
 *   - Breaking user intent into structured actions
 *   - Integrating with existing ActionChain
 *   - Verifying targets before execution
 *   - Stopping on failure
 *   - Never guessing between ambiguous targets
 */

import type {
  ComputerAction,
  ComputerActionResult,
  UIElementTarget,
  ResolvedTarget,
} from "./types";
import { resolveTarget, validateTargetBounds, validateTargetOwnership } from "./targets";
import { detectHighRiskAction, getConfirmationDescription } from "./high-risk";
import { canPerformAction, canAttemptResolution, canRetry, resetChainCounters } from "./rate-limiter";
import { captureSnapshot, verifyAction, type ScreenSnapshot } from "./verifier";
import { executeComputerAction } from "./executor";
import { buildScreenContext } from "@/lib/vision/context";
import { getFrontmostApplication } from "@/lib/macos/applications";

// ── Action Plan ───────────────────────────────────────────────────────────────

export interface ActionPlanStep {
  action: ComputerAction;
  description: string;
  requiresConfirmation: boolean;
  confirmationDescription?: string;
}

export interface ActionPlan {
  steps: ActionPlanStep[];
  totalSteps: number;
}

/**
 * Create an action plan from a single computer-use action.
 */
export function planAction(action: ComputerAction): ActionPlan {
  const highRisk = detectHighRiskAction(action);
  const description = getConfirmationDescription(action);

  return {
    steps: [
      {
        action,
        description,
        requiresConfirmation: true, // All computer-use actions require confirmation
        confirmationDescription: highRisk.isHighRisk
          ? `HIGH RISK: ${highRisk.reason}. ${description}`
          : description,
      },
    ],
    totalSteps: 1,
  };
}

/**
 * Create an action plan from multiple computer-use actions.
 */
export function planActionChain(actions: ComputerAction[]): ActionPlan {
  const steps: ActionPlanStep[] = [];

  for (const action of actions) {
    const highRisk = detectHighRiskAction(action);
    const description = getConfirmationDescription(action);

    steps.push({
      action,
      description,
      requiresConfirmation: true,
      confirmationDescription: highRisk.isHighRisk
        ? `HIGH RISK: ${highRisk.reason}. ${description}`
        : description,
    });
  }

  return {
    steps,
    totalSteps: steps.length,
  };
}

// ── Pre-execution Validation ──────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  resolvedTarget?: ResolvedTarget;
  error?: string;
  needsClarification?: boolean;
  candidates?: ResolvedTarget[];
}

/**
 * Validate and resolve a computer-use action before execution.
 * This is the main validation pipeline.
 */
export function validateAction(action: ComputerAction): ValidationResult {
  // Step 1: Rate limit check
  const rateCheck = canPerformAction(action.type);
  if (!rateCheck.allowed) {
    return { valid: false, error: rateCheck.reason };
  }

  // Step 2: Resolve target if needed
  if (action.target) {
    // Resolution attempt limit
    const resCheck = canAttemptResolution();
    if (!resCheck.allowed) {
      return { valid: false, error: resCheck.reason };
    }

    // Resolve the target
    const resolution = resolveTarget(action.target);

    switch (resolution.status) {
      case "resolved":
        // Validate bounds
        const boundsCheck = validateTargetBounds(resolution.target);
        if (!boundsCheck.valid) {
          return { valid: false, error: boundsCheck.reason };
        }

        // Validate ownership if expected app/window specified
        if (action.application || action.windowTitle) {
          const ownershipCheck = validateTargetOwnership(
            resolution.target,
            action.application,
            action.windowTitle,
          );
          if (!ownershipCheck.valid) {
            return { valid: false, error: ownershipCheck.reason };
          }
        }

        return { valid: true, resolvedTarget: resolution.target };

      case "ambiguous":
        return {
          valid: false,
          needsClarification: true,
          candidates: resolution.candidates,
          error: `Found ${resolution.candidates.length} possible targets. Which one should I use?`,
        };

      case "not_found":
        return { valid: false, error: resolution.reason };

      case "stale":
        return { valid: false, error: resolution.reason };

      case "out_of_bounds":
        return { valid: false, error: resolution.reason };

      case "error":
        return { valid: false, error: resolution.error };
    }
  }

  // Step 3: Actions without targets (scroll, keypress, focus_window) are valid
  return { valid: true };
}

// ── Execution with Verification ───────────────────────────────────────────────

export interface ExecutionResult {
  result: ComputerActionResult;
  beforeSnapshot?: ScreenSnapshot;
  afterSnapshot?: ScreenSnapshot;
  verified: boolean;
}

/**
 * Execute a computer-use action with pre/post verification.
 */
export function executeWithVerification(action: ComputerAction): ExecutionResult {
  // Capture before state
  const before = captureSnapshot();

  // Execute the action
  const result = executeComputerAction(action);

  // Capture after state
  const after = captureSnapshot();

  // Verify
  const verification = verifyAction(action, before, after);

  return {
    result,
    beforeSnapshot: before,
    afterSnapshot: after,
    verified: verification.verified,
  };
}
