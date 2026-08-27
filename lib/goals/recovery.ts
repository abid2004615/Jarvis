/**
 * JARVIS Goal-Oriented Workflows — Recovery
 *
 * Structured recovery for failed goal steps. Determines the failure type
 * and recommends the appropriate recovery action: retry, replan, ask user,
 * or fail the goal.
 *
 * Recovery is bounded: max 2 retries per step, max 2 replans per goal.
 * Never loops indefinitely.
 */

import type { Goal, GoalStep } from "./types";
import { GOAL_LIMITS } from "./types";

/** Recovery action types. */
export type RecoveryAction = "retry" | "replan" | "ask_user" | "fail";

/** Recovery decision. */
export interface RecoveryDecision {
  action: RecoveryAction;
  reason: string;
  stepId: string;
  retryCount: number;
  replanCount: number;
}

/** Failure classification. */
type FailureType =
  | "transient"
  | "stale_state"
  | "permission"
  | "missing_application"
  | "user_input_required"
  | "actual_failure"
  | "unknown";

/**
 * Classify a step failure based on the error message.
 */
function classifyFailure(error: string): FailureType {
  const lower = error.toLowerCase();

  if (
    lower.includes("timeout") ||
    lower.includes("network") ||
    lower.includes("econnrefused") ||
    lower.includes("temporary")
  ) {
    return "transient";
  }

  // Check missing_application BEFORE stale_state because "application not found"
  // contains "not found" which would match stale_state
  if (
    lower.includes("application not found") ||
    lower.includes("app not installed") ||
    lower.includes("not installed")
  ) {
    return "missing_application";
  }

  if (
    lower.includes("no longer") ||
    lower.includes("stale") ||
    lower.includes("changed") ||
    lower.includes("not found")
  ) {
    return "stale_state";
  }

  if (
    lower.includes("permission") ||
    lower.includes("denied") ||
    lower.includes("access") ||
    lower.includes("authorization")
  ) {
    return "permission";
  }

  if (
    lower.includes("user input") ||
    lower.includes("clarification") ||
    lower.includes("which") ||
    lower.includes("what")
  ) {
    return "user_input_required";
  }

  return "unknown";
}

/**
 * Determine the appropriate recovery action for a failed step.
 */
export function determineRecovery(
  goal: Goal,
  step: GoalStep,
  error: string,
): RecoveryDecision {
  const failureType = classifyFailure(error);
  const retryCount = step.retryCount;
  const replanCount = goal.replanCount;
  const maxRetries = GOAL_LIMITS.MAX_RETRIES_PER_STEP;
  const maxReplans = goal.maxReplans;

  // Permission issues: ask user
  if (failureType === "permission") {
    return {
      action: "ask_user",
      reason: `Permission issue: ${error}. User action needed.`,
      stepId: step.id,
      retryCount,
      replanCount,
    };
  }

  // Missing application: ask user
  if (failureType === "missing_application") {
    return {
      action: "ask_user",
      reason: `Application not available: ${error}. User may need to install it.`,
      stepId: step.id,
      retryCount,
      replanCount,
    };
  }

  // User input required: ask user
  if (failureType === "user_input_required") {
    return {
      action: "ask_user",
      reason: `Additional information needed: ${error}`,
      stepId: step.id,
      retryCount,
      replanCount,
    };
  }

  // Transient failures: retry if under limit
  if (failureType === "transient") {
    if (retryCount < maxRetries) {
      return {
        action: "retry",
        reason: `Transient failure: ${error}. Retrying (${retryCount + 1}/${maxRetries}).`,
        stepId: step.id,
        retryCount,
        replanCount,
      };
    }
    // Retries exhausted, try replan
    if (replanCount < maxReplans) {
      return {
        action: "replan",
        reason: `Transient failure persisted after ${maxRetries} retries. Replanning.`,
        stepId: step.id,
        retryCount,
        replanCount,
      };
    }
    return {
      action: "fail",
      reason: `Transient failure persisted after ${maxRetries} retries and ${maxReplans} replans.`,
      stepId: step.id,
      retryCount,
      replanCount,
    };
  }

  // Stale state: replan if available
  if (failureType === "stale_state") {
    if (replanCount < maxReplans) {
      return {
        action: "replan",
        reason: `State changed: ${error}. Replanning.`,
        stepId: step.id,
        retryCount,
        replanCount,
      };
    }
    if (retryCount < maxRetries) {
      return {
        action: "retry",
        reason: `State changed but replans exhausted. Retrying.`,
        stepId: step.id,
        retryCount,
        replanCount,
      };
    }
    return {
      action: "fail",
      reason: `State changed and all recovery options exhausted.`,
      stepId: step.id,
      retryCount,
      replanCount,
    };
  }

  // Actual/unknown failure: retry then replan then fail
  if (retryCount < maxRetries) {
    return {
      action: "retry",
      reason: `Step failed: ${error}. Retrying (${retryCount + 1}/${maxRetries}).`,
      stepId: step.id,
      retryCount,
      replanCount,
    };
  }

  if (replanCount < maxReplans) {
    return {
      action: "replan",
      reason: `Step failed after ${maxRetries} retries. Replanning.`,
      stepId: step.id,
      retryCount,
      replanCount,
    };
  }

  return {
    action: "fail",
    reason: `Step failed and all recovery options exhausted: ${error}`,
    stepId: step.id,
    retryCount,
    replanCount,
  };
}

/**
 * Get a human-readable recovery summary.
 */
export function formatRecoveryDecision(decision: RecoveryDecision): string {
  switch (decision.action) {
    case "retry":
      return `Retrying step '${decision.stepId}': ${decision.reason}`;
    case "replan":
      return `Replanning goal: ${decision.reason}`;
    case "ask_user":
      return `Need user input: ${decision.reason}`;
    case "fail":
      return `Goal cannot continue: ${decision.reason}`;
  }
}
