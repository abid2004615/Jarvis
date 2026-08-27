/**
 * P12 Tests — Goal Types & State Machine
 */

import {
  GOAL_VALID_TRANSITIONS,
  isValidGoalTransition,
  GOAL_LIMITS,
  GOAL_STATUSES,
  goalStatusLabel,
  goalPriorityLabel,
} from "@/lib/goals/types";
import type {
  GoalStatus,
  GoalType,
  GoalPriority,
  GoalStep,
  Goal,
  GoalEvent,
  GoalResult,
  StepRisk,
  StepStatus,
} from "@/lib/goals/types";

describe("P12 Goal Types", () => {
  describe("GOAL_VALID_TRANSITIONS", () => {
    it("should have entries for all 12 statuses", () => {
      expect(Object.keys(GOAL_VALID_TRANSITIONS)).toHaveLength(12);
    });

    it("should have draft transitions", () => {
      expect(GOAL_VALID_TRANSITIONS.draft).toContain("planning");
      expect(GOAL_VALID_TRANSITIONS.draft).toContain("cancelled");
    });

    it("should have running transitions", () => {
      expect(GOAL_VALID_TRANSITIONS.running).toContain("verifying");
      expect(GOAL_VALID_TRANSITIONS.running).toContain("waiting_for_confirmation");
      expect(GOAL_VALID_TRANSITIONS.running).toContain("waiting_for_user");
      expect(GOAL_VALID_TRANSITIONS.running).toContain("replanning");
      expect(GOAL_VALID_TRANSITIONS.running).toContain("paused");
      expect(GOAL_VALID_TRANSITIONS.running).toContain("completed");
      expect(GOAL_VALID_TRANSITIONS.running).toContain("failed");
      expect(GOAL_VALID_TRANSITIONS.running).toContain("cancelled");
    });

    it("completed and cancelled should have no transitions", () => {
      expect(GOAL_VALID_TRANSITIONS.completed).toHaveLength(0);
      expect(GOAL_VALID_TRANSITIONS.cancelled).toHaveLength(0);
    });

    it("should not allow draft → running directly", () => {
      expect(GOAL_VALID_TRANSITIONS.draft).not.toContain("running");
    });

    it("should not allow completed → anything", () => {
      expect(GOAL_VALID_TRANSITIONS.completed).toHaveLength(0);
    });

    it("should not allow failed → running directly", () => {
      expect(GOAL_VALID_TRANSITIONS.failed).not.toContain("running");
    });

    it("failed should only transition to draft", () => {
      expect(GOAL_VALID_TRANSITIONS.failed).toEqual(["draft"]);
    });
  });

  describe("isValidGoalTransition", () => {
    it("should accept valid transitions", () => {
      expect(isValidGoalTransition("draft", "planning")).toBe(true);
      expect(isValidGoalTransition("planning", "ready")).toBe(true);
      expect(isValidGoalTransition("ready", "running")).toBe(true);
      expect(isValidGoalTransition("running", "completed")).toBe(true);
      expect(isValidGoalTransition("running", "paused")).toBe(true);
      expect(isValidGoalTransition("paused", "running")).toBe(true);
      expect(isValidGoalTransition("running", "waiting_for_confirmation")).toBe(true);
      expect(isValidGoalTransition("waiting_for_confirmation", "running")).toBe(true);
      expect(isValidGoalTransition("running", "failed")).toBe(true);
      expect(isValidGoalTransition("draft", "cancelled")).toBe(true);
      expect(isValidGoalTransition("running", "cancelled")).toBe(true);
    });

    it("should reject invalid transitions", () => {
      expect(isValidGoalTransition("completed", "running")).toBe(false);
      expect(isValidGoalTransition("cancelled", "running")).toBe(false);
      expect(isValidGoalTransition("draft", "running")).toBe(false);
      expect(isValidGoalTransition("draft", "completed")).toBe(false);
      expect(isValidGoalTransition("failed", "running")).toBe(false);
      expect(isValidGoalTransition("failed", "completed")).toBe(false);
    });

    it("should reject transitions from unknown status", () => {
      expect(isValidGoalTransition("unknown" as GoalStatus, "running")).toBe(false);
    });
  });

  describe("GOAL_STATUSES", () => {
    it("should have 12 statuses", () => {
      expect(GOAL_STATUSES).toHaveLength(12);
    });

    it("should include all expected statuses", () => {
      expect(GOAL_STATUSES).toContain("draft");
      expect(GOAL_STATUSES).toContain("planning");
      expect(GOAL_STATUSES).toContain("ready");
      expect(GOAL_STATUSES).toContain("running");
      expect(GOAL_STATUSES).toContain("paused");
      expect(GOAL_STATUSES).toContain("waiting_for_confirmation");
      expect(GOAL_STATUSES).toContain("waiting_for_user");
      expect(GOAL_STATUSES).toContain("verifying");
      expect(GOAL_STATUSES).toContain("replanning");
      expect(GOAL_STATUSES).toContain("completed");
      expect(GOAL_STATUSES).toContain("failed");
      expect(GOAL_STATUSES).toContain("cancelled");
    });
  });

  describe("GOAL_LIMITS", () => {
    it("should have bounded limits", () => {
      expect(GOAL_LIMITS.MAX_GOALS).toBeGreaterThan(0);
      expect(GOAL_LIMITS.MAX_STEPS).toBeGreaterThan(0);
      expect(GOAL_LIMITS.MAX_STEPS).toBeLessThanOrEqual(20);
      expect(GOAL_LIMITS.MAX_REPLANS).toBeGreaterThan(0);
      expect(GOAL_LIMITS.MAX_REPLANS).toBeLessThanOrEqual(3);
      expect(GOAL_LIMITS.MAX_RETRIES_PER_STEP).toBeGreaterThan(0);
      expect(GOAL_LIMITS.MAX_RETRIES_PER_STEP).toBeLessThanOrEqual(3);
      expect(GOAL_LIMITS.MAX_EXECUTION_TIME_MS).toBeGreaterThan(0);
      expect(GOAL_LIMITS.MAX_HISTORY).toBeGreaterThan(0);
    });

    it("should have reasonable title/description limits", () => {
      expect(GOAL_LIMITS.MAX_TITLE).toBeGreaterThanOrEqual(100);
      expect(GOAL_LIMITS.MAX_DESCRIPTION).toBeGreaterThanOrEqual(500);
    });
  });

  describe("goalStatusLabel", () => {
    it("should uppercase and replace underscores", () => {
      expect(goalStatusLabel("draft")).toBe("DRAFT");
      expect(goalStatusLabel("waiting_for_confirmation")).toBe("WAITING FOR CONFIRMATION");
      expect(goalStatusLabel("completed")).toBe("COMPLETED");
    });
  });

  describe("goalPriorityLabel", () => {
    it("should return the priority as-is", () => {
      expect(goalPriorityLabel("low")).toBe("low");
      expect(goalPriorityLabel("normal")).toBe("normal");
      expect(goalPriorityLabel("high")).toBe("high");
      expect(goalPriorityLabel("urgent")).toBe("urgent");
    });
  });
});
