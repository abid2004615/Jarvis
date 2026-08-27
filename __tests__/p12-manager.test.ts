/**
 * P12 Tests — Goal Manager
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

describe("P12 Goal Manager", () => {
  let manager: GoalManager;

  beforeEach(() => {
    const store = new InMemoryGoalStore();
    manager = new GoalManager(store);
    setGoalManagerForTesting(manager);
  });

  afterEach(() => {
    resetGoalManager();
  });

  describe("create", () => {
    it("should create a goal in draft status", () => {
      const result = manager.create({ title: "Test Goal" });
      expect(result.error).toBeUndefined();
      expect(result.goal).toBeDefined();
      expect(result.goal!.title).toBe("Test Goal");
      expect(result.goal!.status).toBe("draft");
      expect(result.goal!.plan).toEqual([]);
    });

    it("should reject empty title", () => {
      const result = manager.create({ title: "" });
      expect(result.error).toContain("non-empty");
    });

    it("should reject secrets in title", () => {
      const result = manager.create({ title: "password: abc123" });
      expect(result.error).toContain("Rejected");
    });

    it("should default to multi_step type", () => {
      const result = manager.create({ title: "Test" });
      expect(result.goal!.type).toBe("multi_step");
    });

    it("should default to normal priority", () => {
      const result = manager.create({ title: "Test" });
      expect(result.goal!.priority).toBe("normal");
    });

    it("should create initial history event", () => {
      const result = manager.create({ title: "Test" });
      expect(result.goal!.history).toHaveLength(1);
      expect(result.goal!.history[0].type).toBe("created");
    });
  });

  describe("get / list", () => {
    it("should get goal by ID", () => {
      const { goal } = manager.create({ title: "Test" });
      expect(manager.get(goal!.id)).toBeDefined();
      expect(manager.get(goal!.id)!.title).toBe("Test");
    });

    it("should return undefined for unknown ID", () => {
      expect(manager.get("nonexistent")).toBeUndefined();
    });

    it("should list all goals", () => {
      manager.create({ title: "Goal 1" });
      manager.create({ title: "Goal 2" });
      expect(manager.list()).toHaveLength(2);
    });

    it("should list by status", () => {
      manager.create({ title: "Goal 1" });
      manager.create({ title: "Goal 2" });
      expect(manager.listByStatus("draft")).toHaveLength(2);
      expect(manager.listByStatus("completed")).toHaveLength(0);
    });

    it("should get summary", () => {
      const { goal } = manager.create({ title: "Test" });
      const summary = manager.getSummary(goal!.id);
      expect(summary).toBeDefined();
      expect(summary!.title).toBe("Test");
      expect(summary!.status).toBe("draft");
    });
  });

  describe("setPlan", () => {
    it("should set plan on draft goal", () => {
      const { goal } = manager.create({ title: "Test" });
      const result = manager.setPlan(goal!.id, [makeStep()]);
      expect(result.success).toBe(true);
      const updated = manager.get(goal!.id);
      expect(updated!.plan).toHaveLength(1);
      expect(updated!.status).toBe("ready");
    });

    it("should reject plan on non-draft goal", () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      // Now it's ready
      const result = manager.setPlan(goal!.id, [makeStep()]);
      expect(result.error).toContain("Cannot set plan");
    });

    it("should add planned history event", () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      const updated = manager.get(goal!.id);
      expect(updated!.history.some((e) => e.type === "planned")).toBe(true);
    });
  });

  describe("transition", () => {
    it("should allow valid transitions", () => {
      const { goal } = manager.create({ title: "Test" });
      const result = manager.transition(goal!.id, "planning");
      expect(result.success).toBe(true);
      expect(manager.get(goal!.id)!.status).toBe("planning");
    });

    it("should reject invalid transitions", () => {
      const { goal } = manager.create({ title: "Test" });
      const result = manager.transition(goal!.id, "running");
      expect(result.error).toContain("Invalid transition");
    });

    it("should add history event on transition", () => {
      const { goal } = manager.create({ title: "Test" });
      manager.transition(goal!.id, "planning");
      const updated = manager.get(goal!.id);
      expect(updated!.history.some((e) => e.type === "planning")).toBe(true);
    });
  });

  describe("start / pause / resume / cancel", () => {
    it("should start a ready goal", () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      const result = manager.start(goal!.id);
      expect(result.error).toBeUndefined();
      expect(manager.get(goal!.id)!.status).toBe("running");
    });

    it("should reject start on draft goal", () => {
      const { goal } = manager.create({ title: "Test" });
      const result = manager.start(goal!.id);
      expect(result.error).toContain("Cannot start");
    });

    it("should pause a running goal", () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);
      const result = manager.pause(goal!.id);
      expect(result.success).toBe(true);
      expect(manager.get(goal!.id)!.status).toBe("paused");
    });

    it("should reject pause on non-running goal", () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      const result = manager.pause(goal!.id);
      expect(result.error).toContain("Cannot pause");
    });

    it("should resume a paused goal", () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);
      manager.pause(goal!.id);
      const result = manager.start(goal!.id);
      expect(result.success).toBe(true);
      expect(manager.get(goal!.id)!.status).toBe("running");
    });

    it("should cancel a goal", () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);
      const result = manager.cancel(goal!.id);
      expect(result.success).toBe(true);
      expect(manager.get(goal!.id)!.status).toBe("cancelled");
    });

    it("should cancel a draft goal", () => {
      const { goal } = manager.create({ title: "Test" });
      const result = manager.cancel(goal!.id);
      expect(result.success).toBe(true);
    });

    it("should not cancel a completed goal", () => {
      const { goal } = manager.create({ title: "Test" });
      const result = manager.cancel(goal!.id);
      expect(result.success).toBe(true);
      // completed goals can't transition to cancelled
      expect(manager.get(goal!.id)!.status).toBe("cancelled");
    });
  });

  describe("handleConfirmation", () => {
    it("should approve a confirmation step", () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep({ requiresConfirmation: true })]);
      manager.start(goal!.id);

      // Manually set to waiting_for_confirmation
      manager.transition(goal!.id, "waiting_for_confirmation");

      const result = manager.handleConfirmation(goal!.id, "step_1", true);
      expect(result.success).toBe(true);
    });

    it("should deny a confirmation step", () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep({ requiresConfirmation: true })]);
      manager.start(goal!.id);
      manager.transition(goal!.id, "waiting_for_confirmation");

      const result = manager.handleConfirmation(goal!.id, "step_1", false);
      expect(result.success).toBe(true);
    });

    it("should reject confirmation on non-waiting goal", () => {
      const { goal } = manager.create({ title: "Test" });
      const result = manager.handleConfirmation(goal!.id, "step_1", true);
      expect(result.error).toContain("not waiting for confirmation");
    });
  });

  describe("executeStep", () => {
    it("should reject execution without runner", async () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);

      const result = await manager.executeStep(goal!.id);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not connected");
    });

    it("should reject execution on non-running goal", async () => {
      const { goal } = manager.create({ title: "Test" });
      const result = await manager.executeStep(goal!.id);
      expect(result.success).toBe(false);
    });

    it("should execute steps with runner", async () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep(), makeStep({ id: "step_2" })]);
      manager.start(goal!.id);

      manager.setRunner(async () => ({
        success: true,
        result: { value: 42 },
      }));

      const result = await manager.executeStep(goal!.id);
      expect(result.success).toBe(true);
      expect(manager.get(goal!.id)!.currentStepIndex).toBe(1);
    });

    it("should complete goal after all steps", async () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);

      manager.setRunner(async () => ({
        success: true,
        result: { value: 42 },
      }));

      const result = await manager.executeStep(goal!.id);
      expect(result.goalComplete).toBe(true);
      expect(manager.get(goal!.id)!.status).toBe("completed");
      expect(manager.get(goal!.id)!.progress).toBe(100);
    });

    it("should handle step failure with retry", async () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);

      let callCount = 0;
      manager.setRunner(async () => {
        callCount++;
        if (callCount === 1) {
          return { success: false, error: "Transient failure" };
        }
        return { success: true, result: { value: 42 } };
      });

      const result1 = await manager.executeStep(goal!.id);
      expect(result1.success).toBe(false);

      const result2 = await manager.executeStep(goal!.id);
      expect(result2.success).toBe(true);
    });

    it("should fail goal after max retries and replans", async () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);

      manager.setRunner(async () => ({
        success: false,
        error: "Persistent failure",
      }));

      // First failure → retry
      await manager.executeStep(goal!.id);
      // Second failure → retry (retryCount=2)
      await manager.executeStep(goal!.id);
      // Third failure → replan (retryCount exhausted)
      await manager.executeStep(goal!.id);
      expect(manager.get(goal!.id)!.status).toBe("replanning");

      // Replan: set new plan and restart
      manager.setPlan(goal!.id, [makeStep({ id: "new_step" })]);
      manager.start(goal!.id);

      // Fourth failure → retry
      await manager.executeStep(goal!.id);
      // Fifth failure → retry
      await manager.executeStep(goal!.id);
      // Sixth failure → replan (replanCount=2)
      await manager.executeStep(goal!.id);
      expect(manager.get(goal!.id)!.status).toBe("replanning");

      // Replan again (replanCount will hit maxReplans=2)
      manager.setPlan(goal!.id, [makeStep({ id: "final_step" })]);
      manager.start(goal!.id);

      // Seventh+ failures → should eventually fail
      for (let i = 0; i < 3; i++) {
        await manager.executeStep(goal!.id);
      }

      expect(manager.get(goal!.id)!.status).toBe("failed");
    });

    it("should handle confirmation-pending steps", async () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);

      manager.setRunner(async () => ({
        success: true,
        pendingConfirmationId: "conf-123",
      }));

      const result = await manager.executeStep(goal!.id);
      expect(result.pendingConfirmationId).toBe("conf-123");
      expect(manager.get(goal!.id)!.status).toBe("waiting_for_confirmation");
    });
  });

  describe("delete", () => {
    it("should delete a draft goal", () => {
      const { goal } = manager.create({ title: "Test" });
      const result = manager.delete(goal!.id);
      expect(result.success).toBe(true);
      expect(manager.get(goal!.id)).toBeUndefined();
    });

    it("should not delete an active goal", () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);
      const result = manager.delete(goal!.id);
      expect(result.error).toContain("Cannot delete");
    });

    it("should delete a completed goal", async () => {
      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);
      manager.start(goal!.id);
      manager.setRunner(async () => ({ success: true }));
      await manager.executeStep(goal!.id);
      const result = manager.delete(goal!.id);
      expect(result.success).toBe(true);
    });
  });

  describe("state changes", () => {
    it("should notify listeners on state change", () => {
      const calls: string[] = [];
      manager.addListener((goal) => {
        calls.push(goal.status);
      });

      const { goal } = manager.create({ title: "Test" });
      manager.setPlan(goal!.id, [makeStep()]);

      expect(calls).toContain("draft");
      expect(calls).toContain("ready");
    });

    it("should remove listener on cleanup", () => {
      const calls: string[] = [];
      const unsub = manager.addListener(() => {
        calls.push("called");
      });

      unsub();
      manager.create({ title: "Test" });
      expect(calls).toHaveLength(0);
    });
  });
});
