/**
 * P12 Tests — Goal Executor
 */

import { executeGoalStep, validateStepForExecution, computeStepArguments } from "@/lib/goals/executor";
import type { GoalStep, Goal } from "@/lib/goals/types";

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
    status: "running",
    priority: "normal",
    createdAt: now,
    updatedAt: now,
    plan: [],
    currentStepIndex: 0,
    progress: 0,
    requiresUserInput: false,
    replanCount: 0,
    maxReplans: 2,
    history: [{ type: "created", timestamp: now }],
    ...overrides,
  };
}

describe("P12 Goal Executor", () => {
  describe("executeGoalStep", () => {
    it("should return existing result for already executed step", async () => {
      const step = makeStep({ status: "executed", result: { value: 42 } });
      const result = await executeGoalStep(step, makeGoal(), async () => ({
        success: true,
        result: { value: 42 },
      }));
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ value: 42 });
    });

    it("should return error for denied step", async () => {
      const step = makeStep({ status: "denied" });
      const result = await executeGoalStep(step, makeGoal(), async () => ({
        success: true,
      }));
      expect(result.success).toBe(false);
      expect(result.error).toContain("denied");
    });

    it("should delegate to executor for pending step", async () => {
      const step = makeStep();
      let executorCalled = false;
      const result = await executeGoalStep(step, makeGoal(), async () => {
        executorCalled = true;
        return { success: true, result: { value: 42 } };
      });
      expect(executorCalled).toBe(true);
      expect(result.success).toBe(true);
    });

    it("should handle executor errors", async () => {
      const step = makeStep();
      const result = await executeGoalStep(step, makeGoal(), async () => {
        throw new Error("Executor crashed");
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Executor crashed");
    });
  });

  describe("validateStepForExecution", () => {
    it("should validate a pending step with toolId", () => {
      const result = validateStepForExecution(makeStep());
      expect(result.valid).toBe(true);
    });

    it("should reject step without toolId", () => {
      const result = validateStepForExecution(makeStep({ toolId: undefined }));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("no toolId");
    });

    it("should reject step already executing", () => {
      const result = validateStepForExecution(makeStep({ status: "executing" }));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("already executing");
    });
  });

  describe("computeStepArguments", () => {
    it("should return base arguments", () => {
      const step = makeStep({ arguments: { level: 50 } });
      const args = computeStepArguments(step);
      expect(args).toEqual({ level: 50 });
    });

    it("should merge with overrides", () => {
      const step = makeStep({ arguments: { level: 50 } });
      const args = computeStepArguments(step, { extra: "value" });
      expect(args).toEqual({ level: 50, extra: "value" });
    });

    it("should let overrides take precedence", () => {
      const step = makeStep({ arguments: { level: 50 } });
      const args = computeStepArguments(step, { level: 75 });
      expect(args).toEqual({ level: 75 });
    });

    it("should handle step without arguments", () => {
      const step = makeStep({ arguments: undefined });
      const args = computeStepArguments(step);
      expect(args).toEqual({});
    });
  });
});
