/**
 * JARVIS Goal-Oriented Workflows — Manager
 *
 * Central authority for goal CRUD and lifecycle. The manager never directly
 * executes tools — it delegates to an injected GoalRunner (the pipeline).
 * Goals execute through the existing ActionChain → PermissionManager →
 * Confirmation flow. Goals never bypass the existing safety architecture.
 *
 * A goal is NOT a permission grant. Goals must never elevate privileges.
 */

import type { Goal, GoalInput, GoalStep, GoalStatus, GoalEvent, GoalResult, GoalSummary } from "./types";
import { GOAL_LIMITS, GOAL_VALID_TRANSITIONS, isValidGoalTransition } from "./types";
import { validateGoalInput } from "./validator";
import { isGoalLike, toGoalSummary, computeGoalProgress, countConfirmationGatedSteps, isGoalActive, isGoalFinished } from "./model";
import type { GoalStore } from "./store";
import { GoalFileStore } from "./store";

/** The callback the pipeline provides so the manager can execute steps. */
export type GoalStepRunner = (
  step: GoalStep,
  goal: Goal,
) => Promise<{ success: boolean; result?: unknown; error?: string; pendingConfirmationId?: string }>;

/** Callback for goal state changes (HUD updates). */
export type GoalStateListener = (goal: Goal) => void;

function generateGoalId(): string {
  return `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class GoalManager {
  private goals: Goal[] = [];
  private runner: GoalStepRunner | null = null;
  private listeners: Set<GoalStateListener> = new Set();
  private store: GoalStore;

  constructor(store?: GoalStore) {
    this.store = store ?? new GoalFileStore();
    this.goals = this.store.load();
  }

  /** Inject the step runner (pipeline). */
  setRunner(runner: GoalStepRunner): void {
    this.runner = runner;
  }

  /** Subscribe to state changes. */
  addListener(listener: GoalStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(goal: Goal): void {
    for (const listener of this.listeners) {
      try {
        listener(goal);
      } catch {
        // Listener errors must not break the manager.
      }
    }
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  /** Create a new goal in draft status. */
  create(input: GoalInput): { goal?: Goal; error?: string } {
    const validation = validateGoalInput(input);
    if (!validation.valid) {
      return { error: validation.error };
    }

    // Enforce bounded active goals
    const activeGoals = this.goals.filter((g) => isGoalActive(g));
    if (activeGoals.length >= GOAL_LIMITS.MAX_GOALS) {
      return { error: `Maximum ${GOAL_LIMITS.MAX_GOALS} active goals reached` };
    }

    const now = Date.now();
    const goal: Goal = {
      id: generateGoalId(),
      title: input.title.trim(),
      description: (input.description ?? input.title).trim(),
      type: input.type ?? "multi_step",
      status: "draft",
      priority: input.priority ?? "normal",
      createdAt: now,
      updatedAt: now,
      plan: [],
      currentStepIndex: 0,
      progress: 0,
      requiresUserInput: false,
      replanCount: 0,
      maxReplans: GOAL_LIMITS.MAX_REPLANS,
      history: [
        { type: "created", timestamp: now },
      ],
    };

    this.goals.push(goal);
    this.persist();
    this.notify(goal);

    return { goal };
  }

  /** Get a goal by ID. */
  get(id: string): Goal | undefined {
    return this.goals.find((g) => g.id === id);
  }

  /** Get a summary by ID. */
  getSummary(id: string): GoalSummary | undefined {
    const goal = this.get(id);
    return goal ? toGoalSummary(goal) : undefined;
  }

  /** List all goals. */
  list(): Goal[] {
    return [...this.goals];
  }

  /** List goals filtered by status. */
  listByStatus(status: GoalStatus): Goal[] {
    return this.goals.filter((g) => g.status === status);
  }

  /** Get the most recent active goal. */
  getActiveGoal(): Goal | undefined {
    return this.goals.find((g) => isGoalActive(g));
  }

  /** Delete a goal. Only draft, completed, failed, or cancelled goals may be deleted. */
  delete(id: string): { success: boolean; error?: string } {
    const goal = this.get(id);
    if (!goal) {
      return { success: false, error: `Goal '${id}' not found` };
    }
    if (isGoalActive(goal)) {
      return { success: false, error: "Cannot delete an active goal. Cancel or complete it first." };
    }
    this.goals = this.goals.filter((g) => g.id !== id);
    this.persist();
    return { success: true };
  }

  // ── State Transitions ───────────────────────────────────────────────────────

  /** Transition a goal to a new status. Validates the transition. */
  transition(id: string, to: GoalStatus, detail?: string): { success: boolean; error?: string } {
    const goal = this.get(id);
    if (!goal) {
      return { success: false, error: `Goal '${id}' not found` };
    }
    if (!isValidGoalTransition(goal.status, to)) {
      return { success: false, error: `Invalid transition from '${goal.status}' to '${to}'` };
    }
    goal.status = to;
    goal.updatedAt = Date.now();
    goal.history.push({
      type: to as GoalEvent["type"],
      timestamp: Date.now(),
      detail,
    });
    this.trimHistory(goal);
    this.persist();
    this.notify(goal);
    return { success: true };
  }

  // ── Plan Management ─────────────────────────────────────────────────────────

  /** Set the plan on a goal. Goal must be in draft or replanning status. */
  setPlan(id: string, steps: GoalStep[]): { success: boolean; error?: string } {
    const goal = this.get(id);
    if (!goal) {
      return { success: false, error: `Goal '${id}' not found` };
    }
    if (goal.status !== "draft" && goal.status !== "replanning") {
      return { success: false, error: `Cannot set plan in '${goal.status}' status` };
    }

    goal.plan = steps;
    goal.currentStepIndex = 0;
    goal.progress = 0;
    goal.updatedAt = Date.now();
    // Reset retry counts for fresh plan
    for (const step of steps) {
      step.retryCount = 0;
      step.status = "pending";
    }
    goal.history.push({
      type: "planned",
      timestamp: Date.now(),
      detail: `${steps.length} step(s)`,
    });
    this.trimHistory(goal);

    // Auto-transition: draft → planning → ready (or replanning → ready)
    if (goal.status === "draft") {
      this.transitionInternal(goal, "planning");
    }
    const transResult = this.transitionInternal(goal, "ready");
    if (!transResult.success) return transResult;

    this.persist();
    this.notify(goal);
    return { success: true };
  }

  // ── Execution Control ───────────────────────────────────────────────────────

  /** Start or resume execution of a goal. */
  start(id: string): { success: boolean; error?: string; pendingConfirmation?: string } {
    const goal = this.get(id);
    if (!goal) {
      return { success: false, error: `Goal '${id}' not found` };
    }

    // Allow start from ready, paused, or waiting_for_confirmation (resume)
    if (goal.status === "waiting_for_confirmation" || goal.status === "waiting_for_user") {
      // Resume — the confirmation/user input flow handles the rest
      return { success: true };
    }

    if (goal.status === "paused") {
      const transResult = this.transitionInternal(goal, "running");
      if (!transResult.success) return transResult;
      goal.history.push({ type: "resumed", timestamp: Date.now() });
      this.trimHistory(goal);
      this.persist();
      this.notify(goal);
      return { success: true };
    }

    if (goal.status !== "ready") {
      return { success: false, error: `Cannot start goal in '${goal.status}' status` };
    }

    if (goal.plan.length === 0) {
      return { success: false, error: "Goal has no plan. Generate a plan first." };
    }

    // Validate confirmation limit
    const gatedCount = countConfirmationGatedSteps(goal.plan);
    if (gatedCount > GOAL_LIMITS.MAX_CONFIRMATION_GATED_ACTIONS) {
      return { success: false, error: `Plan has ${gatedCount} confirmation-gated steps (max ${GOAL_LIMITS.MAX_CONFIRMATION_GATED_ACTIONS})` };
    }

    const transResult = this.transitionInternal(goal, "running");
    if (!transResult.success) return transResult;
    goal.history.push({ type: "started", timestamp: Date.now() });
    this.trimHistory(goal);
    this.persist();
    this.notify(goal);

    return { success: true };
  }

  /** Pause a running goal. */
  pause(id: string): { success: boolean; error?: string } {
    const goal = this.get(id);
    if (!goal) {
      return { success: false, error: `Goal '${id}' not found` };
    }
    if (goal.status !== "running") {
      return { success: false, error: `Cannot pause goal in '${goal.status}' status` };
    }
    const transResult = this.transitionInternal(goal, "paused");
    if (!transResult.success) return transResult;
    goal.history.push({ type: "paused", timestamp: Date.now() });
    this.trimHistory(goal);
    this.persist();
    this.notify(goal);
    return { success: true };
  }

  /** Cancel a goal. Never executes remaining steps. */
  cancel(id: string): { success: boolean; error?: string } {
    const goal = this.get(id);
    if (!goal) {
      return { success: false, error: `Goal '${id}' not found` };
    }
    if (!isValidGoalTransition(goal.status, "cancelled")) {
      return { success: false, error: `Cannot cancel goal in '${goal.status}' status` };
    }

    goal.status = "cancelled";
    goal.updatedAt = Date.now();
    goal.result = {
      status: "cancelled",
      completedSteps: goal.plan.filter((s) => s.status === "executed").length,
      totalSteps: goal.plan.length,
      message: "Goal cancelled by user",
    };
    goal.history.push({ type: "cancelled", timestamp: Date.now() });
    this.trimHistory(goal);
    this.persist();
    this.notify(goal);
    return { success: true };
  }

  // ── Step Execution ──────────────────────────────────────────────────────────

  /** Execute the current step. Returns the step result. */
  async executeStep(id: string): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
    pendingConfirmationId?: string;
    goalComplete?: boolean;
    goalFailed?: string;
  }> {
    const goal = this.get(id);
    if (!goal) {
      return { success: false, error: `Goal '${id}' not found` };
    }
    if (goal.status !== "running") {
      return { success: false, error: `Goal is not running (status: ${goal.status})` };
    }
    if (!this.runner) {
      return { success: false, error: "Goal runner not connected. Pipeline not wired." };
    }
    if (goal.currentStepIndex >= goal.plan.length) {
      // All steps completed
      return this.completeGoal(goal);
    }

    const step = goal.plan[goal.currentStepIndex];

    // Check dependencies
    if (step.dependencies) {
      for (const depId of step.dependencies) {
        const depStep = goal.plan.find((s) => s.id === depId);
        if (depStep && depStep.status !== "executed") {
          return { success: false, error: `Step '${step.id}' depends on incomplete step '${depId}'` };
        }
      }
    }

    // Mark as executing
    step.status = "executing";
    step.retryCount++;
    goal.updatedAt = Date.now();
    this.persist();
    this.notify(goal);

    try {
      const result = await this.runner(step, goal);

      if (result.pendingConfirmationId) {
        // Step needs confirmation
        step.status = "pending";
        step.pendingConfirmationId = result.pendingConfirmationId;
        goal.pendingConfirmation = result.pendingConfirmationId;
        goal.status = "waiting_for_confirmation";
        goal.updatedAt = Date.now();
        goal.history.push({
          type: "confirmation_requested",
          timestamp: Date.now(),
          stepId: step.id,
        });
        this.trimHistory(goal);
        this.persist();
        this.notify(goal);
        return { success: true, pendingConfirmationId: result.pendingConfirmationId };
      }

      if (result.success) {
        step.status = "executed";
        step.result = result.result;
        step.error = undefined;
        goal.currentStepIndex++;
        goal.progress = computeGoalProgress(goal.plan);
        goal.updatedAt = Date.now();
        goal.history.push({
          type: "step_completed",
          timestamp: Date.now(),
          stepId: step.id,
        });
        this.trimHistory(goal);
        this.persist();
        this.notify(goal);

        // Check if goal is complete
        if (goal.currentStepIndex >= goal.plan.length) {
          return this.completeGoal(goal);
        }

        return { success: true, result: result.result };
      } else {
        // Step failed
        return this.handleStepFailure(goal, step, result.error ?? "Step execution failed");
      }
    } catch (error) {
      return this.handleStepFailure(goal, step, error instanceof Error ? error.message : "Unknown error");
    }
  }

  // ── Confirmation ────────────────────────────────────────────────────────────

  /** Handle a confirmation decision. */
  handleConfirmation(
    goalId: string,
    stepId: string,
    approved: boolean,
  ): { success: boolean; error?: string; goalStatus?: GoalStatus } {
    const goal = this.get(goalId);
    if (!goal) {
      return { success: false, error: `Goal '${goalId}' not found` };
    }
    if (goal.status !== "waiting_for_confirmation") {
      return { success: false, error: `Goal is not waiting for confirmation (status: ${goal.status})` };
    }

    const step = goal.plan.find((s) => s.id === stepId);
    if (!step) {
      return { success: false, error: `Step '${stepId}' not found in goal` };
    }

    goal.pendingConfirmation = undefined;

    if (approved) {
      step.status = "executed";
      goal.history.push({
        type: "confirmation_approved",
        timestamp: Date.now(),
        stepId: step.id,
      });
    } else {
      step.status = "denied";
      goal.history.push({
        type: "confirmation_denied",
        timestamp: Date.now(),
        stepId: step.id,
      });
    }

    goal.currentStepIndex++;
    goal.progress = computeGoalProgress(goal.plan);
    goal.updatedAt = Date.now();
    this.trimHistory(goal);

    // Transition back to running
    const transResult = this.transitionInternal(goal, "running");
    if (!transResult.success) {
      // If running is not valid (e.g., goal already completed), keep current status
    }

    this.persist();
    this.notify(goal);

    return { success: true, goalStatus: goal.status };
  }

  // ── Recovery ────────────────────────────────────────────────────────────────

  /** Handle a step failure with bounded retry/recovery. */
  private handleStepFailure(
    goal: Goal,
    step: GoalStep,
    error: string,
  ): { success: boolean; error: string; goalFailed?: string } {
    step.status = "failed";
    step.error = error;
    goal.history.push({
      type: "step_failed",
      timestamp: Date.now(),
      stepId: step.id,
      detail: error,
    });
    this.trimHistory(goal);

    // Check retry limit
    if (step.retryCount < GOAL_LIMITS.MAX_RETRIES_PER_STEP) {
      // Retry — reset status and re-execute
      step.status = "pending";
      step.retryCount++;
      goal.updatedAt = Date.now();
      goal.history.push({
        type: "step_retried",
        timestamp: Date.now(),
        stepId: step.id,
        detail: `Retry ${step.retryCount}/${GOAL_LIMITS.MAX_RETRIES_PER_STEP}`,
      });
      this.trimHistory(goal);
      this.persist();
      this.notify(goal);
      return { success: false, error };
    }

    // Check replan limit
    if (goal.replanCount < goal.maxReplans) {
      goal.replanCount++;
      goal.status = "replanning";
      goal.updatedAt = Date.now();
      goal.history.push({
        type: "replanned",
        timestamp: Date.now(),
        detail: `Replan ${goal.replanCount}/${goal.maxReplans}`,
      });
      this.trimHistory(goal);
      this.persist();
      this.notify(goal);
      return { success: false, error: `Step failed after ${GOAL_LIMITS.MAX_RETRIES_PER_STEP} retries. Replanning needed.` };
    }

    // Goal failed
    goal.status = "failed";
    goal.error = error;
    goal.result = {
      status: "failed",
      completedSteps: goal.plan.filter((s) => s.status === "executed").length,
      totalSteps: goal.plan.length,
      message: error,
    };
    goal.updatedAt = Date.now();
    goal.history.push({ type: "failed", timestamp: Date.now(), detail: error });
    this.trimHistory(goal);
    this.persist();
    this.notify(goal);
    return { success: false, error, goalFailed: error };
  }

  /** Mark a goal as completed. */
  private completeGoal(goal: Goal): { success: boolean; result?: GoalResult; goalComplete: boolean } {
    goal.status = "completed";
    goal.progress = 100;
    goal.updatedAt = Date.now();
    goal.result = {
      status: "completed",
      completedSteps: goal.plan.filter((s) => s.status === "executed").length,
      totalSteps: goal.plan.length,
      message: "Goal completed successfully",
    };
    goal.history.push({ type: "completed", timestamp: Date.now() });
    this.trimHistory(goal);
    this.persist();
    this.notify(goal);
    return { success: true, result: goal.result, goalComplete: true };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Internal transition without generating history. */
  private transitionInternal(goal: Goal, to: GoalStatus): { success: boolean; error?: string } {
    if (!isValidGoalTransition(goal.status, to)) {
      return { success: false, error: `Invalid transition from '${goal.status}' to '${to}'` };
    }
    goal.status = to;
    return { success: true };
  }

  /** Trim history to the maximum allowed length. */
  private trimHistory(goal: Goal): void {
    if (goal.history.length > GOAL_LIMITS.MAX_HISTORY) {
      goal.history = goal.history.slice(-GOAL_LIMITS.MAX_HISTORY);
    }
  }

  /** Persist goals to disk. */
  private persist(): void {
    try {
      this.store.save(this.goals);
    } catch {
      // Persistence failure must not break the manager.
    }
  }

  /** Reset for tests. */
  reset(): void {
    this.goals = [];
    this.runner = null;
    this.listeners.clear();
    this.persist();
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let defaultManager: GoalManager | null = null;

export function getGoalManager(): GoalManager {
  if (!defaultManager) {
    defaultManager = new GoalManager();
  }
  return defaultManager;
}

/** Test helper: replace the singleton. */
export function setGoalManagerForTesting(manager: GoalManager): void {
  defaultManager = manager;
}

/** Test helper: reset the singleton. */
export function resetGoalManager(): void {
  if (defaultManager) {
    defaultManager.reset();
    defaultManager = null;
  }
}
