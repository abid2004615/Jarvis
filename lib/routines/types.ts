/**
 * JARVIS Personal Routines — Type Definitions
 *
 * Routines are user-controlled sequences of REGISTERED tool calls. A routine
 * step references a ToolRegistry tool by ID with validated arguments — it can
 * NEVER be a command, path, URL, or arbitrary executable. Storage is separate
 * from automations, tasks, reminders, memory, and conversation context.
 *
 * Execution flows through the same ActionChain as normal conversation, so
 * confirmation-gated steps remain gated — a routine can never bypass approval.
 */

/** A routine step: a registered tool ID + validated arguments. */
export interface RoutineStep {
  toolId: string;
  arguments: Record<string, unknown>;
  /** Optional human-readable note about the step. */
  label?: string;
}

export interface Routine {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  steps: RoutineStep[];
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastRunStatus?: "success" | "failed" | "waiting_for_confirmation";
}

/** Input accepted from the model/API. The client can never set id/timestamps. */
export interface RoutineInput {
  name: string;
  description?: string;
  steps: RoutineStep[];
}

/** Validation outcome. */
export interface RoutineValidationResult {
  valid: boolean;
  error?: string;
}

/** Client-safe projection. */
export interface RoutineSummary {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  steps: Array<{ toolId: string; label?: string }>;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastRunStatus?: Routine["lastRunStatus"];
}

/** Serialized on-disk shape. */
export interface RoutineStoreData {
  version: number;
  updatedAt: number;
  routines: Routine[];
}

export const ROUTINE_STORAGE_DIR = ".jarvis";
export const ROUTINE_STORAGE_FILE = "routines.json";

export const ROUTINE_LIMITS = {
  MAX_ROUTINES: 20,
  MAX_NAME: 120,
  MAX_DESCRIPTION: 500,
  MAX_STEPS: 10,
  MAX_LABEL: 200,
} as const;
