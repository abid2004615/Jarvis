/**
 * JARVIS Goal-Oriented Workflows — Executor
 *
 * Executes individual goal steps through the existing ActionChain →
 * PermissionManager → Confirmation flow. The executor never bypasses the
 * existing safety architecture.
 *
 * Each step is wrapped as a single-step ActionChain, leveraging the pipeline's
 * existing runRoutineSteps-like execution path.
 */

import type { Goal, GoalStep } from "./types";

/** Result of executing a single goal step. */
export interface StepExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  pendingConfirmationId?: string;
  needsConfirmation: boolean;
}

/** Callback type for executing a step through the pipeline. */
export type StepExecutor = (
  step: GoalStep,
  goal: Goal,
) => Promise<StepExecutionResult>;

/**
 * Execute a single goal step.
 * Delegates to the injected executor (the pipeline).
 */
export async function executeGoalStep(
  step: GoalStep,
  goal: Goal,
  executor: StepExecutor,
): Promise<StepExecutionResult> {
  // Validate step is in a runnable state
  if (step.status === "executed") {
    return {
      success: true,
      result: step.result,
      needsConfirmation: false,
    };
  }

  if (step.status === "denied") {
    return {
      success: false,
      error: "Step was denied by user",
      needsConfirmation: false,
    };
  }

  // Delegate to the pipeline executor
  try {
    return await executor(step, goal);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown executor error",
      needsConfirmation: false,
    };
  }
}

/**
 * Validate a step before execution.
 * Checks that the step has a valid toolId, arguments, etc.
 */
export function validateStepForExecution(step: GoalStep): { valid: boolean; error?: string } {
  if (!step.toolId) {
    return { valid: false, error: `Step '${step.id}' has no toolId` };
  }

  if (step.status === "executing") {
    return { valid: false, error: `Step '${step.id}' is already executing` };
  }

  return { valid: true };
}

/**
 * Compute the effective arguments for a step.
 * Merges the step's base arguments with any overrides.
 */
export function computeStepArguments(
  step: GoalStep,
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  const base = step.arguments ?? {};
  if (!overrides) return { ...base };
  return { ...base, ...overrides };
}
