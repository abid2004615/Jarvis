/**
 * P12 Tests — Goal Model
 */

import {
  isGoalLike,
  isGoalStepLike,
  isGoalEventLike,
  toGoalSummary,
  computeGoalProgress,
  countConfirmationGatedSteps,
  isGoalActive,
  isGoalFinished,
  getGoalHistorySlice,
} from "@/lib/goals/model";
import type { Goal, GoalStep, GoalEvent } from "@/lib/goals/types";

function makeStep(overrides?: Partial<GoalStep>): GoalStep {
  return {
    id: "step_1",
    description: "Check battery",
    toolId: "get_battery_status",
    risk: "safe",
    requiresConfirmation: false,
    verification: "Battery status retrieved",
    status: "pending",
    retryCount: 0,
    ...overrides,
  };
}

function makeGoal(overrides?: Partial<Goal>): Goal {
  const now = Date.now();
  return {
    id: `goal-${now}`,
    title: "Test Goal",
    description: "A test goal",
    type: "multi_step",
    status: "draft",
    priority: "normal",
    createdAt: now,
    updatedAt: now,
    plan: [makeStep()],
    currentStepIndex: 0,
    progress: 0,
    requiresUserInput: false,
    replanCount: 0,
    maxReplans: 2,
    history: [{ type: "created", timestamp: now }],
    ...overrides,
  };
}

describe("P12 Goal Model", () => {
  describe("isGoalLike", () => {
    it("should accept valid goal", () => {
      expect(isGoalLike(makeGoal())).toBe(true);
    });

    it("should reject non-objects", () => {
      expect(isGoalLike(null)).toBe(false);
      expect(isGoalLike("string")).toBe(false);
      expect(isGoalLike(42)).toBe(false);
    });

    it("should reject missing id", () => {
      expect(isGoalLike({ ...makeGoal(), id: "" })).toBe(false);
    });

    it("should reject missing title", () => {
      expect(isGoalLike({ ...makeGoal(), title: "" })).toBe(false);
    });

    it("should reject invalid status", () => {
      expect(isGoalLike({ ...makeGoal(), status: "invalid" })).toBe(false);
    });

    it("should reject invalid type", () => {
      expect(isGoalLike({ ...makeGoal(), type: "invalid" })).toBe(false);
    });

    it("should reject invalid priority", () => {
      expect(isGoalLike({ ...makeGoal(), priority: "invalid" })).toBe(false);
    });

    it("should reject non-numeric timestamps", () => {
      expect(isGoalLike({ ...makeGoal(), createdAt: "now" })).toBe(false);
      expect(isGoalLike({ ...makeGoal(), updatedAt: "now" })).toBe(false);
    });

    it("should reject non-array plan", () => {
      expect(isGoalLike({ ...makeGoal(), plan: "not array" })).toBe(false);
    });

    it("should reject non-boolean requiresUserInput", () => {
      expect(isGoalLike({ ...makeGoal(), requiresUserInput: "yes" })).toBe(false);
    });

    it("should reject goal with invalid plan step", () => {
      expect(isGoalLike({ ...makeGoal(), plan: [{ invalid: true }] })).toBe(false);
    });

    it("should reject goal with invalid history event", () => {
      expect(isGoalLike({ ...makeGoal(), history: [{ invalid: true }] })).toBe(false);
    });
  });

  describe("isGoalStepLike", () => {
    it("should accept valid step", () => {
      expect(isGoalStepLike(makeStep())).toBe(true);
    });

    it("should reject missing id", () => {
      expect(isGoalStepLike({ ...makeStep(), id: "" })).toBe(false);
    });

    it("should reject invalid risk", () => {
      expect(isGoalStepLike({ ...makeStep(), risk: "invalid" })).toBe(false);
    });

    it("should reject invalid status", () => {
      expect(isGoalStepLike({ ...makeStep(), status: "invalid" })).toBe(false);
    });
  });

  describe("isGoalEventLike", () => {
    it("should accept valid event", () => {
      expect(isGoalEventLike({ type: "created", timestamp: Date.now() })).toBe(true);
    });

    it("should reject missing type", () => {
      expect(isGoalEventLike({ timestamp: Date.now() })).toBe(false);
    });
  });

  describe("toGoalSummary", () => {
    it("should create client-safe summary", () => {
      const goal = makeGoal({ status: "running", progress: 50 });
      const summary = toGoalSummary(goal);
      expect(summary.id).toBe(goal.id);
      expect(summary.title).toBe(goal.title);
      expect(summary.status).toBe("running");
      expect(summary.progress).toBe(50);
      expect(summary.totalSteps).toBe(1);
    });

    it("should not include plan steps in summary", () => {
      const goal = makeGoal();
      const summary = toGoalSummary(goal);
      expect(summary).not.toHaveProperty("plan");
      expect(summary).not.toHaveProperty("history");
    });

    it("should count completed steps", () => {
      const goal = makeGoal({
        plan: [
          makeStep({ id: "s1", status: "executed" }),
          makeStep({ id: "s2", status: "pending" }),
        ],
      });
      const summary = toGoalSummary(goal);
      expect(summary.completedSteps).toBe(1);
      expect(summary.totalSteps).toBe(2);
    });
  });

  describe("computeGoalProgress", () => {
    it("should return 0 for empty plan", () => {
      expect(computeGoalProgress([])).toBe(0);
    });

    it("should return 100 for all executed", () => {
      expect(computeGoalProgress([
        makeStep({ status: "executed" }),
        makeStep({ id: "s2", status: "executed" }),
      ])).toBe(100);
    });

    it("should return 50 for half executed", () => {
      expect(computeGoalProgress([
        makeStep({ status: "executed" }),
        makeStep({ id: "s2", status: "pending" }),
      ])).toBe(50);
    });
  });

  describe("countConfirmationGatedSteps", () => {
    it("should count steps requiring confirmation", () => {
      expect(countConfirmationGatedSteps([
        makeStep({ requiresConfirmation: true }),
        makeStep({ id: "s2", requiresConfirmation: false }),
        makeStep({ id: "s3", requiresConfirmation: true }),
      ])).toBe(2);
    });

    it("should return 0 for no confirmation steps", () => {
      expect(countConfirmationGatedSteps([
        makeStep({ requiresConfirmation: false }),
      ])).toBe(0);
    });
  });

  describe("isGoalActive", () => {
    it("should return true for active states", () => {
      expect(isGoalActive(makeGoal({ status: "running" }))).toBe(true);
      expect(isGoalActive(makeGoal({ status: "paused" }))).toBe(true);
      expect(isGoalActive(makeGoal({ status: "waiting_for_confirmation" }))).toBe(true);
      expect(isGoalActive(makeGoal({ status: "waiting_for_user" }))).toBe(true);
      expect(isGoalActive(makeGoal({ status: "verifying" }))).toBe(true);
      expect(isGoalActive(makeGoal({ status: "replanning" }))).toBe(true);
    });

    it("should return false for inactive states", () => {
      expect(isGoalActive(makeGoal({ status: "completed" }))).toBe(false);
      expect(isGoalActive(makeGoal({ status: "failed" }))).toBe(false);
      expect(isGoalActive(makeGoal({ status: "cancelled" }))).toBe(false);
      expect(isGoalActive(makeGoal({ status: "draft" }))).toBe(false);
    });
  });

  describe("isGoalFinished", () => {
    it("should return true for finished states", () => {
      expect(isGoalFinished(makeGoal({ status: "completed" }))).toBe(true);
      expect(isGoalFinished(makeGoal({ status: "failed" }))).toBe(true);
      expect(isGoalFinished(makeGoal({ status: "cancelled" }))).toBe(true);
    });

    it("should return false for active states", () => {
      expect(isGoalFinished(makeGoal({ status: "running" }))).toBe(false);
      expect(isGoalFinished(makeGoal({ status: "paused" }))).toBe(false);
    });
  });

  describe("getGoalHistorySlice", () => {
    it("should return last N events", () => {
      const history: GoalEvent[] = Array.from({ length: 20 }, (_, i) => ({
        type: "step_completed" as const,
        timestamp: i,
      }));
      const goal = makeGoal({ history });
      const slice = getGoalHistorySlice(goal, 5);
      expect(slice).toHaveLength(5);
      expect(slice[0].timestamp).toBe(15);
    });

    it("should default to 20 events", () => {
      const history: GoalEvent[] = Array.from({ length: 30 }, (_, i) => ({
        type: "step_completed" as const,
        timestamp: i,
      }));
      const goal = makeGoal({ history });
      const slice = getGoalHistorySlice(goal);
      expect(slice).toHaveLength(20);
    });
  });
});
