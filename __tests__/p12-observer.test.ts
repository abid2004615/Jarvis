/**
 * P12 Tests — Goal Observer
 */

import { collectObservation } from "@/lib/goals/observer";
import type { GoalStep, Goal } from "@/lib/goals/types";

function makeStep(overrides?: Partial<GoalStep>): GoalStep {
  return {
    id: "step_1",
    description: "Check battery",
    toolId: "get_battery_status",
    risk: "safe",
    requiresConfirmation: false,
    verification: "Battery status retrieved",
    status: "executed",
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

describe("P12 Goal Observer", () => {
  describe("collectObservation", () => {
    it("should collect basic observation", async () => {
      const observation = await collectObservation(
        makeStep(),
        makeGoal(),
        { success: true, value: 42 },
        { captureSystemState: false, captureApplicationState: false },
      );

      expect(observation.stepId).toBe("step_1");
      expect(observation.timestamp).toBeGreaterThan(0);
      expect(observation.stepResult).toEqual({ success: true, value: 42 });
    });

    it("should include system state when configured", async () => {
      const observation = await collectObservation(
        makeStep(),
        makeGoal(),
        { success: true },
        { captureSystemState: true, captureApplicationState: false },
      );

      expect(observation.stepId).toBe("step_1");
      // System state may be empty in test env, but the field should exist
      expect(observation.systemState).toBeDefined();
    });

    it("should include application state when configured", async () => {
      const observation = await collectObservation(
        makeStep(),
        makeGoal(),
        { success: true },
        { captureSystemState: false, captureApplicationState: true },
      );

      expect(observation.applicationState).toBeDefined();
    });

    it("should handle null step result", async () => {
      const observation = await collectObservation(
        makeStep(),
        makeGoal(),
        null,
        { captureSystemState: false, captureApplicationState: false },
      );

      expect(observation.stepResult).toBeNull();
    });

    it("should default to capturing system and application state", async () => {
      const observation = await collectObservation(
        makeStep(),
        makeGoal(),
        { success: true },
      );

      expect(observation.systemState).toBeDefined();
      expect(observation.applicationState).toBeDefined();
    });
  });
});
