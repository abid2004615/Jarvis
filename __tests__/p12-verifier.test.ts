/**
 * P12 Tests — Goal Verifier
 */

import { verifyStepOutcome, verifyGoalSteps, allStepsVerified } from "@/lib/goals/verifier";
import type { GoalStep } from "@/lib/goals/types";
import type { StepObservation } from "@/lib/goals/observer";

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

function makeObservation(overrides?: Partial<StepObservation>): StepObservation {
  return {
    stepId: "step_1",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("P12 Goal Verifier", () => {
  describe("verifyStepOutcome", () => {
    it("should verify successfully executed step", () => {
      const step = makeStep();
      const result = verifyStepOutcome(step, makeObservation());
      expect(result.status).toBe("verified");
      expect(result.stepId).toBe("step_1");
    });

    it("should skip verification if no verification required", () => {
      const step = makeStep({ verification: "" });
      const result = verifyStepOutcome(step, makeObservation());
      expect(result.status).toBe("skipped");
    });

    it("should fail verification for denied step", () => {
      const step = makeStep({ status: "denied" });
      const result = verifyStepOutcome(step, makeObservation());
      expect(result.status).toBe("failed");
      expect(result.message).toContain("denied");
    });

    it("should fail verification for failed step", () => {
      const step = makeStep({ status: "failed", error: "Tool not found" });
      const result = verifyStepOutcome(step, makeObservation());
      expect(result.status).toBe("failed");
      expect(result.message).toContain("Tool not found");
    });

    it("should skip verification for pending step", () => {
      const step = makeStep({ status: "pending" });
      const result = verifyStepOutcome(step, makeObservation());
      expect(result.status).toBe("skipped");
    });

    it("should fail if step result has success=false", () => {
      const step = makeStep({ result: { success: false, message: "Failed" } });
      const result = verifyStepOutcome(step, makeObservation());
      expect(result.status).toBe("failed");
      expect(result.message).toBe("Failed");
    });

    it("should fail if step result has error", () => {
      const step = makeStep({ result: { error: "Something went wrong" } });
      const result = verifyStepOutcome(step, makeObservation());
      expect(result.status).toBe("failed");
      expect(result.message).toBe("Something went wrong");
    });

    it("should verify step with successful result", () => {
      const step = makeStep({ result: { success: true, battery: 85 } });
      const result = verifyStepOutcome(step, makeObservation());
      expect(result.status).toBe("verified");
    });
  });

  describe("verifyGoalSteps", () => {
    it("should verify multiple steps", () => {
      const steps = [
        { step: makeStep({ id: "s1" }), observation: makeObservation({ stepId: "s1" }) },
        { step: makeStep({ id: "s2" }), observation: makeObservation({ stepId: "s2" }) },
      ];
      const results = verifyGoalSteps(steps);
      expect(results).toHaveLength(2);
      expect(results[0].status).toBe("verified");
      expect(results[1].status).toBe("verified");
    });

    it("should handle mixed results", () => {
      const steps = [
        { step: makeStep({ id: "s1" }), observation: makeObservation({ stepId: "s1" }) },
        { step: makeStep({ id: "s2", status: "denied" }), observation: makeObservation({ stepId: "s2" }) },
      ];
      const results = verifyGoalSteps(steps);
      expect(results[0].status).toBe("verified");
      expect(results[1].status).toBe("failed");
    });
  });

  describe("allStepsVerified", () => {
    it("should return true when all steps are executed or skipped", () => {
      expect(allStepsVerified([
        makeStep({ status: "executed" }),
        makeStep({ id: "s2", status: "skipped" }),
      ])).toBe(true);
    });

    it("should return false when any step is denied", () => {
      expect(allStepsVerified([
        makeStep({ status: "executed" }),
        makeStep({ id: "s2", status: "denied" }),
      ])).toBe(false);
    });

    it("should return false when any step is failed", () => {
      expect(allStepsVerified([
        makeStep({ status: "executed" }),
        makeStep({ id: "s2", status: "failed" }),
      ])).toBe(false);
    });

    it("should return true for empty array", () => {
      expect(allStepsVerified([])).toBe(true);
    });
  });
});
