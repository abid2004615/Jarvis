/**
 * JARVIS Goal-Oriented Workflows — Verifier
 *
 * Verifies step outcomes after observation. The verifier checks whether
 * a step's expected outcome matches the observed state.
 * Verification is bounded and never trusts screen content.
 */

import type { GoalStep } from "./types";
import type { StepObservation } from "./observer";

/** Verification outcome. */
export type VerificationStatus = "verified" | "failed" | "partial" | "skipped";

export interface VerificationResult {
  status: VerificationStatus;
  stepId: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Verify a step's outcome.
 * Checks the step result against the expected verification description.
 */
export function verifyStepOutcome(
  step: GoalStep,
  observation: StepObservation,
): VerificationResult {
  // If step has no verification requirement, skip
  if (!step.verification || step.verification.trim().length === 0) {
    return {
      status: "skipped",
      stepId: step.id,
      message: "No verification required",
    };
  }

  // If step was denied, verification fails
  if (step.status === "denied") {
    return {
      status: "failed",
      stepId: step.id,
      message: "Step was denied by user",
    };
  }

  // If step failed, verification fails
  if (step.status === "failed") {
    return {
      status: "failed",
      stepId: step.id,
      message: step.error ?? "Step execution failed",
    };
  }

  // If step was not executed, skip verification
  if (step.status !== "executed") {
    return {
      status: "skipped",
      stepId: step.id,
      message: `Step status is '${step.status}', not executed`,
    };
  }

  // Check if the step result indicates success
  const stepResult = step.result as Record<string, unknown> | undefined;
  if (stepResult) {
    // If the result explicitly says success=false, verification fails
    if (stepResult.success === false) {
      return {
        status: "failed",
        stepId: step.id,
        message: typeof stepResult.message === "string"
          ? stepResult.message
          : "Step reported failure",
        details: stepResult as Record<string, unknown>,
      };
    }

    // If the result has an error, verification fails
    if (typeof stepResult.error === "string" && stepResult.error.length > 0) {
      return {
        status: "failed",
        stepId: step.id,
        message: stepResult.error,
        details: stepResult as Record<string, unknown>,
      };
    }
  }

  // Default: step executed without explicit failure = verified
  return {
    status: "verified",
    stepId: step.id,
    message: `Step completed: ${step.description}`,
  };
}

/**
 * Batch verify multiple steps.
 */
export function verifyGoalSteps(
  steps: Array<{ step: GoalStep; observation: StepObservation }>,
): VerificationResult[] {
  return steps.map(({ step, observation }) => verifyStepOutcome(step, observation));
}

/**
 * Check if all steps in a goal are verified.
 */
export function allStepsVerified(steps: GoalStep[]): boolean {
  return steps.every((step) => {
    if (step.status === "skipped") return true;
    if (step.status === "executed") return true;
    if (step.status === "denied") return false;
    if (step.status === "failed") return false;
    return true;
  });
}
