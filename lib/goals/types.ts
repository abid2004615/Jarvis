/**
 * JARVIS Goal-Oriented Workflows — Types
 *
 * Goals are multi-step, user-authorized execution plans. Every step goes
 * through the existing ActionChain → PermissionManager → Confirmation flow.
 * Goals never bypass the existing safety architecture.
 *
 * A goal is NOT a permission grant. Goals must never elevate privileges.
 */

// ── Goal Status (Finite State Machine) ────────────────────────────────────────

export type GoalStatus =
  | "draft"
  | "planning"
  | "ready"
  | "running"
  | "paused"
  | "waiting_for_confirmation"
  | "waiting_for_user"
  | "verifying"
  | "replanning"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Finite state transitions. Every status change must be validated against this
 * map. If a transition is not listed, it is forbidden.
 */
export const GOAL_VALID_TRANSITIONS: Record<GoalStatus, GoalStatus[]> = {
  draft: ["planning", "cancelled"],
  planning: ["ready", "failed", "cancelled"],
  ready: ["running", "cancelled"],
  running: [
    "verifying",
    "waiting_for_confirmation",
    "waiting_for_user",
    "replanning",
    "paused",
    "completed",
    "failed",
    "cancelled",
  ],
  paused: ["running", "cancelled"],
  waiting_for_confirmation: ["running", "failed", "cancelled"],
  waiting_for_user: ["running", "failed", "cancelled"],
  verifying: ["running", "completed", "failed", "replanning"],
  replanning: ["running", "ready", "failed"],
  completed: [],
  failed: ["draft"],
  cancelled: [],
};

/** Check if a status transition is allowed. */
export function isValidGoalTransition(from: GoalStatus, to: GoalStatus): boolean {
  return GOAL_VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Goal Type ─────────────────────────────────────────────────────────────────

export type GoalType = "one_shot" | "multi_step" | "conditional" | "monitoring";

// ── Goal Priority ─────────────────────────────────────────────────────────────

export type GoalPriority = "low" | "normal" | "high" | "urgent";

// ── Goal Step ─────────────────────────────────────────────────────────────────

export type StepRisk = "safe" | "confirmation" | "restricted";

export type StepStatus =
  | "pending"
  | "executing"
  | "executed"
  | "failed"
  | "denied"
  | "skipped";

export interface GoalStep {
  id: string;
  description: string;
  toolId?: string;
  arguments?: Record<string, unknown>;
  dependencies?: string[];
  risk: StepRisk;
  requiresConfirmation: boolean;
  verification: string;
  status: StepStatus;
  result?: unknown;
  error?: string;
  pendingConfirmationId?: string;
  retryCount: number;
}

// ── Goal Result ───────────────────────────────────────────────────────────────

export type GoalResultStatus = "completed" | "failed" | "cancelled" | "partial";

export interface GoalResult {
  status: GoalResultStatus;
  completedSteps: number;
  totalSteps: number;
  message: string;
  summary?: string;
}

// ── Goal Events ───────────────────────────────────────────────────────────────

export type GoalEventType =
  | "created"
  | "planned"
  | "started"
  | "step_completed"
  | "step_failed"
  | "step_retried"
  | "confirmation_requested"
  | "confirmation_approved"
  | "confirmation_denied"
  | "user_input_requested"
  | "user_input_received"
  | "paused"
  | "resumed"
  | "replanned"
  | "completed"
  | "failed"
  | "cancelled";

export interface GoalEvent {
  type: GoalEventType;
  timestamp: number;
  stepId?: string;
  detail?: string;
}

// ── Goal ──────────────────────────────────────────────────────────────────────

export interface Goal {
  id: string;
  title: string;
  description: string;
  type: GoalType;
  status: GoalStatus;
  priority: GoalPriority;
  createdAt: number;
  updatedAt: number;
  plan: GoalStep[];
  currentStepIndex: number;
  progress: number;
  requiresUserInput: boolean;
  pendingConfirmation?: string;
  pendingUserInput?: string;
  result?: GoalResult;
  error?: string;
  replanCount: number;
  maxReplans: number;
  history: GoalEvent[];
}

// ── Goal Input ────────────────────────────────────────────────────────────────

/** Input accepted from the model/API. The client can NEVER set id, timestamps, or internal state. */
export interface GoalInput {
  title: string;
  description?: string;
  type?: GoalType;
  priority?: GoalPriority;
}

// ── Goal Summary ──────────────────────────────────────────────────────────────

/** Client-safe projection: never includes internal fields, step arguments, or full history. */
export interface GoalSummary {
  id: string;
  title: string;
  description: string;
  type: GoalType;
  status: GoalStatus;
  priority: GoalPriority;
  progress: number;
  currentStepDescription?: string;
  totalSteps: number;
  completedSteps: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface GoalStoreData {
  version: number;
  updatedAt: number;
  goals: Goal[];
}

// ── Limits ────────────────────────────────────────────────────────────────────

export const GOAL_LIMITS = {
  MAX_GOALS: 20,
  MAX_HISTORY: 100,
  MAX_STEPS: 20,
  MAX_TITLE: 200,
  MAX_DESCRIPTION: 1000,
  MAX_REPLANS: 2,
  MAX_RETRIES_PER_STEP: 2,
  MAX_EXECUTION_TIME_MS: 30 * 60 * 1000, // 30 minutes
  MAX_CONFIRMATION_GATED_ACTIONS: 10,
  MAX_STEP_DESCRIPTION: 200,
  MAX_VERIFICATION_DESCRIPTION: 200,
} as const;

// ── Storage ───────────────────────────────────────────────────────────────────

export const GOAL_STORAGE_DIR = ".jarvis";
export const GOAL_STORAGE_FILE = "goals.json";

// ── Status Labels ─────────────────────────────────────────────────────────────

export const GOAL_STATUSES: GoalStatus[] = [
  "draft",
  "planning",
  "ready",
  "running",
  "paused",
  "waiting_for_confirmation",
  "waiting_for_user",
  "verifying",
  "replanning",
  "completed",
  "failed",
  "cancelled",
];

export function goalStatusLabel(status: GoalStatus): string {
  return status.replace(/_/g, " ").toUpperCase();
}

export function goalPriorityLabel(priority: GoalPriority): string {
  return priority;
}
