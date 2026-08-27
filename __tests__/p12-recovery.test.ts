/**
 * P12 Tests — Goal Recovery
 */

import { determineRecovery, formatRecoveryDecision } from "@/lib/goals/recovery";
import type { Goal, GoalStep } from "@/lib/goals/types";

function makeStep(overrides?: Partial<GoalStep>): GoalStep {
  return {
    id: "step_1",
    description: "Check battery",
    toolId: "get_battery_status",
    risk: "safe",
    requiresConfirmation: false,
    verification: "Battery status retrieved",
    status: "failed",
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

describe("P12 Goal Recovery", () => {
  describe("determineRecovery", () => {
    it("should retry on transient failure under limit", () => {
      const decision = determineRecovery(makeGoal(), makeStep({ retryCount: 0 }), "Timeout error");
      expect(decision.action).toBe("retry");
    });

    it("should replan on transient failure after max retries", () => {
      const decision = determineRecovery(makeGoal(), makeStep({ retryCount: 2 }), "Timeout error");
      expect(decision.action).toBe("replan");
    });

    it("should fail on transient failure after max retries and replans", () => {
      const decision = determineRecovery(
        makeGoal({ replanCount: 2 }),
        makeStep({ retryCount: 2 }),
        "Timeout error",
      );
      expect(decision.action).toBe("fail");
    });

    it("should ask user on permission issues", () => {
      const decision = determineRecovery(makeGoal(), makeStep(), "Permission denied");
      expect(decision.action).toBe("ask_user");
    });

    it("should ask user on missing application", () => {
      const decision = determineRecovery(makeGoal(), makeStep(), "Application not found");
      expect(decision.action).toBe("ask_user");
    });

    it("should ask user when user input required", () => {
      const decision = determineRecovery(makeGoal(), makeStep(), "Which calendar?");
      expect(decision.action).toBe("ask_user");
    });

    it("should replan on stale state under replan limit", () => {
      const decision = determineRecovery(makeGoal(), makeStep(), "Safari is no longer frontmost");
      expect(decision.action).toBe("replan");
    });

    it("should retry on stale state after replans exhausted", () => {
      const decision = determineRecovery(
        makeGoal({ replanCount: 2 }),
        makeStep(),
        "Safari is no longer frontmost",
      );
      expect(decision.action).toBe("retry");
    });

    it("should fail on stale state after all recovery exhausted", () => {
      const decision = determineRecovery(
        makeGoal({ replanCount: 2 }),
        makeStep({ retryCount: 2 }),
        "Safari is no longer frontmost",
      );
      expect(decision.action).toBe("fail");
    });

    it("should retry on unknown failure under limit", () => {
      const decision = determineRecovery(makeGoal(), makeStep(), "Something went wrong");
      expect(decision.action).toBe("retry");
    });

    it("should replan on unknown failure after max retries", () => {
      const decision = determineRecovery(makeGoal(), makeStep({ retryCount: 2 }), "Something went wrong");
      expect(decision.action).toBe("replan");
    });

    it("should fail on unknown failure after all recovery exhausted", () => {
      const decision = determineRecovery(
        makeGoal({ replanCount: 2 }),
        makeStep({ retryCount: 2 }),
        "Something went wrong",
      );
      expect(decision.action).toBe("fail");
    });

    it("should handle network errors as transient", () => {
      const decision = determineRecovery(makeGoal(), makeStep(), "ECONNREFUSED");
      expect(decision.action).toBe("retry");
    });
  });

  describe("formatRecoveryDecision", () => {
    it("should format retry decisions", () => {
      const decision = determineRecovery(makeGoal(), makeStep(), "Timeout error");
      const formatted = formatRecoveryDecision(decision);
      expect(formatted).toContain("Retrying");
      expect(formatted).toContain("step_1");
    });

    it("should format replan decisions", () => {
      const decision = determineRecovery(makeGoal(), makeStep({ retryCount: 2 }), "Timeout error");
      const formatted = formatRecoveryDecision(decision);
      expect(formatted).toContain("Replanning");
    });

    it("should format ask_user decisions", () => {
      const decision = determineRecovery(makeGoal(), makeStep(), "Permission denied");
      const formatted = formatRecoveryDecision(decision);
      expect(formatted).toContain("Need user input");
    });

    it("should format fail decisions", () => {
      const decision = determineRecovery(
        makeGoal({ replanCount: 2 }),
        makeStep({ retryCount: 2 }),
        "Persistent failure",
      );
      const formatted = formatRecoveryDecision(decision);
      expect(formatted).toContain("Goal cannot continue");
    });
  });
});
