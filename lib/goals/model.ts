/**
 * JARVIS Goal-Oriented Workflows — Model helpers
 *
 * Structural validation of stored goal records and client-safe projections.
 * Goal records contain execution state and step data — they are never
 * executed directly by the model layer.
 */

import type { Goal, GoalSummary, GoalStep, GoalEvent } from "./types";
import { GOAL_STATUSES, GOAL_LIMITS } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** Structural check for a goal step loaded from disk. */
export function isGoalStepLike(value: unknown): value is GoalStep {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  if (typeof value.description !== "string" || value.description.length === 0) return false;
  if (typeof value.verification !== "string" || value.verification.length === 0) return false;
  if (typeof value.risk !== "string" || !["safe", "confirmation", "restricted"].includes(value.risk)) return false;
  if (typeof value.requiresConfirmation !== "boolean") return false;
  if (typeof value.status !== "string" || !["pending", "executing", "executed", "failed", "denied", "skipped"].includes(value.status)) return false;
  if (typeof value.retryCount !== "number") return false;
  return true;
}

/** Structural check for a goal event loaded from disk. */
export function isGoalEventLike(value: unknown): value is GoalEvent {
  if (!isRecord(value)) return false;
  if (typeof value.type !== "string") return false;
  if (typeof value.timestamp !== "number") return false;
  return true;
}

/** Structural check for stored goal records (loaded from disk). */
export function isGoalLike(value: unknown): value is Goal {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  if (typeof value.title !== "string" || value.title.length === 0) return false;
  if (typeof value.description !== "string") return false;
  if (typeof value.type !== "string" || !["one_shot", "multi_step", "conditional", "monitoring"].includes(value.type)) return false;
  if (typeof value.status !== "string" || !GOAL_STATUSES.includes(value.status as Goal["status"])) return false;
  if (typeof value.priority !== "string" || !["low", "normal", "high", "urgent"].includes(value.priority)) return false;
  if (typeof value.createdAt !== "number" || typeof value.updatedAt !== "number") return false;
  if (!Array.isArray(value.plan)) return false;
  if (typeof value.currentStepIndex !== "number" || typeof value.progress !== "number") return false;
  if (typeof value.requiresUserInput !== "boolean") return false;
  if (typeof value.replanCount !== "number" || typeof value.maxReplans !== "number") return false;
  if (!Array.isArray(value.history)) return false;
  // Validate plan steps
  if (!value.plan.every(isGoalStepLike)) return false;
  // Validate history events
  if (!value.history.every(isGoalEventLike)) return false;
  return true;
}

/** Client-safe projection: never includes internal fields, step arguments, or full history. */
export function toGoalSummary(goal: Goal): GoalSummary {
  const completedSteps = goal.plan.filter((s) => s.status === "executed").length;
  const currentStep = goal.plan[goal.currentStepIndex];
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    type: goal.type,
    status: goal.status,
    priority: goal.priority,
    progress: goal.progress,
    currentStepDescription: currentStep?.description,
    totalSteps: goal.plan.length,
    completedSteps,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
    error: goal.error,
  };
}

/** Get a bounded slice of goal history for display. */
export function getGoalHistorySlice(goal: Goal, maxEvents?: number): GoalEvent[] {
  const limit = maxEvents ?? 20;
  return goal.history.slice(-limit);
}

/** Compute progress percentage from plan steps. */
export function computeGoalProgress(plan: GoalStep[]): number {
  if (plan.length === 0) return 0;
  const completed = plan.filter((s) => s.status === "executed").length;
  return Math.round((completed / plan.length) * 100);
}

/** Count confirmation-gated steps in a plan. */
export function countConfirmationGatedSteps(plan: GoalStep[]): number {
  return plan.filter((s) => s.requiresConfirmation).length;
}

/** Check if a goal is in an active state (running, waiting, paused). */
export function isGoalActive(goal: Goal): boolean {
  return ["running", "waiting_for_confirmation", "waiting_for_user", "paused", "verifying", "replanning"].includes(goal.status);
}

/** Check if a goal has finished (completed, failed, cancelled). */
export function isGoalFinished(goal: Goal): boolean {
  return ["completed", "failed", "cancelled"].includes(goal.status);
}
