/**
 * P12 Tests — Goal Tools Integration
 */

import { GoalManager, setGoalManagerForTesting, resetGoalManager } from "@/lib/goals/manager";
import { InMemoryGoalStore } from "@/lib/goals/store";
import type { GoalStep } from "@/lib/goals/types";

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

describe("P12 Goal Tools Integration", () => {
  let manager: GoalManager;

  beforeEach(() => {
    const store = new InMemoryGoalStore();
    manager = new GoalManager(store);
    setGoalManagerForTesting(manager);
  });

  afterEach(() => {
    resetGoalManager();
  });

  describe("goal lifecycle", () => {
    it("should create, plan, start, and complete a goal", async () => {
      // Create
      const { goal } = manager.create({ title: "Check battery" });
      expect(goal).toBeDefined();
      expect(goal!.status).toBe("draft");

      // Plan
      manager.setPlan(goal!.id, [makeStep()]);
      expect(manager.get(goal!.id)!.status).toBe("ready");

      // Start
      manager.start(goal!.id);
      expect(manager.get(goal!.id)!.status).toBe("running");

      // Execute
      manager.setRunner(async () => ({ success: true, result: { level: 85 } }));
      await manager.executeStep(goal!.id);
      expect(manager.get(goal!.id)!.status).toBe("completed");
      expect(manager.get(goal!.id)!.progress).toBe(100);
    });

    it("should handle multi-step goal", async () => {
      const { goal } = manager.create({ title: "Multi-step check" });
      manager.setPlan(goal!.id, [
        makeStep({ id: "step_1" }),
        makeStep({ id: "step_2", toolId: "get_cpu_usage" }),
        makeStep({ id: "step_3", toolId: "get_memory_usage" }),
      ]);
      manager.start(goal!.id);

      manager.setRunner(async () => ({ success: true, result: { value: 1 } }));

      await manager.executeStep(goal!.id);
      expect(manager.get(goal!.id)!.currentStepIndex).toBe(1);
      expect(manager.get(goal!.id)!.progress).toBe(33);

      await manager.executeStep(goal!.id);
      expect(manager.get(goal!.id)!.currentStepIndex).toBe(2);
      expect(manager.get(goal!.id)!.progress).toBe(67);

      await manager.executeStep(goal!.id);
      expect(manager.get(goal!.id)!.status).toBe("completed");
      expect(manager.get(goal!.id)!.progress).toBe(100);
    });

    it("should handle confirmation flow", async () => {
      const { goal } = manager.create({ title: "Launch app" });
      manager.setPlan(goal!.id, [
        makeStep({ requiresConfirmation: true, risk: "confirmation" }),
      ]);
      manager.start(goal!.id);

      manager.setRunner(async () => ({
        success: true,
        pendingConfirmationId: "conf-abc",
      }));

      await manager.executeStep(goal!.id);
      expect(manager.get(goal!.id)!.status).toBe("waiting_for_confirmation");
      expect(manager.get(goal!.id)!.pendingConfirmation).toBe("conf-abc");

      // Approve
      manager.handleConfirmation(goal!.id, "step_1", true);
      expect(manager.get(goal!.id)!.status).toBe("running");
    });

    it("should handle denial flow", async () => {
      const { goal } = manager.create({ title: "Launch app" });
      manager.setPlan(goal!.id, [
        makeStep({ requiresConfirmation: true }),
      ]);
      manager.start(goal!.id);

      manager.setRunner(async () => ({
        success: true,
        pendingConfirmationId: "conf-abc",
      }));

      await manager.executeStep(goal!.id);
      manager.handleConfirmation(goal!.id, "step_1", false);

      // After denial, step is denied and goal moves on
      expect(manager.get(goal!.id)!.status).toBe("running");
      expect(manager.get(goal!.id)!.currentStepIndex).toBe(1);
    });

    it("should pause and resume goal", async () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep(), makeStep({ id: "step_2" })]);
      manager.start(goal!.id);

      manager.pause(goal!.id);
      expect(manager.get(goal!.id)!.status).toBe("paused");

      manager.start(goal!.id);
      expect(manager.get(goal!.id)!.status).toBe("running");
    });

    it("should cancel goal at any point", async () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);

      manager.cancel(goal!.id);
      expect(manager.get(goal!.id)!.status).toBe("cancelled");
      expect(manager.get(goal!.id)!.result?.status).toBe("cancelled");
    });

    it("should handle step failure with recovery", async () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);

      let callCount = 0;
      manager.setRunner(async () => {
        callCount++;
        if (callCount <= 2) {
          return { success: false, error: "Transient" };
        }
        return { success: true, result: { value: 1 } };
      });

      // First attempt fails, triggers retry
      await manager.executeStep(goal!.id);
      expect(manager.get(goal!.id)!.status).toBe("running");

      // Second attempt fails, triggers replan
      await manager.executeStep(goal!.id);
      expect(manager.get(goal!.id)!.status).toBe("replanning");

      // Replan: set new plan
      manager.setPlan(goal!.id, [makeStep({ id: "new_step" })]);
      manager.start(goal!.id);

      // Third attempt succeeds
      await manager.executeStep(goal!.id);
      expect(manager.get(goal!.id)!.status).toBe("completed");
    });

    it("should track history throughout lifecycle", async () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);

      manager.setRunner(async () => ({ success: true }));
      await manager.executeStep(goal!.id);

      const updated = manager.get(goal!.id)!;
      expect(updated.history.length).toBeGreaterThanOrEqual(4);
      expect(updated.history.some((e) => e.type === "created")).toBe(true);
      expect(updated.history.some((e) => e.type === "planned")).toBe(true);
      expect(updated.history.some((e) => e.type === "started")).toBe(true);
      expect(updated.history.some((e) => e.type === "step_completed")).toBe(true);
      expect(updated.history.some((e) => e.type === "completed")).toBe(true);
    });

    it("should persist goals to store", async () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);

      // Reload from store
      const newManager = new GoalManager(new InMemoryGoalStore());
      newManager.setRunner(async () => ({ success: true }));

      // The original manager's store should have the goal
      const loaded = manager.list();
      expect(loaded.length).toBe(1);
      expect(loaded[0].title).toBe("Test");
    });
  });

  describe("getActiveGoal", () => {
    it("should return the active goal", () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);

      const active = manager.getActiveGoal();
      expect(active).toBeDefined();
      expect(active!.id).toBe(goal!.id);
    });

    it("should return undefined when no active goal", () => {
      expect(manager.getActiveGoal()).toBeUndefined();
    });
  });

  describe("goal completion", () => {
    it("should set result on completion", async () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);

      manager.setRunner(async () => ({ success: true }));
      await manager.executeStep(goal!.id);

      const result = manager.get(goal!.id)!.result;
      expect(result).toBeDefined();
      expect(result!.status).toBe("completed");
      expect(result!.completedSteps).toBe(1);
      expect(result!.totalSteps).toBe(1);
    });

    it("should set result on failure", async () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);

      manager.setRunner(async () => ({ success: false, error: "Failed" }));

      // First failures → retries
      await manager.executeStep(goal!.id);
      await manager.executeStep(goal!.id);
      // Third failure → replan
      await manager.executeStep(goal!.id);
      expect(manager.get(goal!.id)!.status).toBe("replanning");

      // Replan and restart
      manager.setPlan(goal!.id, [makeStep({ id: "new_step" })]);
      manager.start(goal!.id);

      // More failures → replan again (replanCount hits maxReplans=2)
      await manager.executeStep(goal!.id);
      await manager.executeStep(goal!.id);
      await manager.executeStep(goal!.id);

      // Final replan
      manager.setPlan(goal!.id, [makeStep({ id: "final" })]);
      manager.start(goal!.id);

      // Final failures → goal fails
      for (let i = 0; i < 3; i++) {
        await manager.executeStep(goal!.id);
      }

      const result = manager.get(goal!.id)!.result;
      expect(result).toBeDefined();
      expect(result!.status).toBe("failed");
    });
  });
});
