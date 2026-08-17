/**
 * JARVIS Personal Routines — Model helpers
 *
 * Structural validation of stored routine records and client-safe projections.
 * Routine records are data only — execution is delegated to the runtime
 * pipeline via an injected runner.
 */

import type { Routine, RoutineSummary } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRoutineStepLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.toolId !== "string" || value.toolId.length === 0) return false;
  if (typeof value.arguments !== "object" || value.arguments === null || Array.isArray(value.arguments)) return false;
  if (value.label !== undefined && typeof value.label !== "string") return false;
  return true;
}

/** Structural check for stored routine records (loaded from disk). */
export function isRoutineLike(value: unknown): value is Routine {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  if (typeof value.name !== "string" || value.name.length === 0) return false;
  if (typeof value.enabled !== "boolean") return false;
  if (typeof value.createdAt !== "number" || typeof value.updatedAt !== "number") return false;
  if (!Array.isArray(value.steps) || value.steps.length === 0 || !value.steps.every(isRoutineStepLike)) return false;
  if (value.lastRunStatus !== undefined && !["success", "failed", "waiting_for_confirmation"].includes(value.lastRunStatus as string)) return false;
  return true;
}

/** Client-safe projection: never includes arguments. */
export function toRoutineSummary(routine: Routine): RoutineSummary {
  return {
    id: routine.id,
    name: routine.name,
    description: routine.description,
    enabled: routine.enabled,
    steps: routine.steps.map((step) => ({ toolId: step.toolId, label: step.label })),
    createdAt: routine.createdAt,
    updatedAt: routine.updatedAt,
    lastRunAt: routine.lastRunAt,
    lastRunStatus: routine.lastRunStatus,
  };
}
