/**
 * P10 Tests — Action Planner
 */

import {
  planAction,
  planActionChain,
  validateAction,
} from "@/lib/computer-use/planner";
import { resetChainCounters, setRateLimitConfig } from "@/lib/computer-use/rate-limiter";
import type { ComputerAction } from "@/lib/computer-use/types";

describe("P10 Action Planner", () => {
  beforeEach(() => {
    resetChainCounters();
    setRateLimitConfig({});
  });

  describe("planAction", () => {
    it("should create a plan with one step", () => {
      const action: ComputerAction = {
        type: "click",
        target: { role: "button", label: "Save", source: "accessibility" },
      };
      const plan = planAction(action);
      expect(plan.totalSteps).toBe(1);
      expect(plan.steps[0].requiresConfirmation).toBe(true);
    });

    it("should include description in step", () => {
      const action: ComputerAction = {
        type: "click",
        target: { role: "button", label: "Save", source: "accessibility" },
      };
      const plan = planAction(action);
      expect(plan.steps[0].description).toContain("Click");
      expect(plan.steps[0].description).toContain("Save");
    });

    it("should mark high-risk actions", () => {
      const action: ComputerAction = {
        type: "click",
        target: { role: "button", label: "Buy Now", source: "ocr" },
      };
      const plan = planAction(action);
      expect(plan.steps[0].confirmationDescription).toContain("HIGH RISK");
    });
  });

  describe("planActionChain", () => {
    it("should create a plan with multiple steps", () => {
      const actions: ComputerAction[] = [
        { type: "click", target: { role: "button", label: "Open", source: "accessibility" } },
        { type: "scroll", direction: "down" },
        { type: "keypress", key: "enter" },
      ];
      const plan = planActionChain(actions);
      expect(plan.totalSteps).toBe(3);
    });

    it("should have all steps requiring confirmation", () => {
      const actions: ComputerAction[] = [
        { type: "scroll", direction: "down" },
        { type: "keypress", key: "enter" },
      ];
      const plan = planActionChain(actions);
      for (const step of plan.steps) {
        expect(step.requiresConfirmation).toBe(true);
      }
    });
  });

  describe("validateAction", () => {
    it("should validate scroll action without target", () => {
      const action: ComputerAction = {
        type: "scroll",
        direction: "down",
        amount: 3,
      };
      const result = validateAction(action);
      expect(result.valid).toBe(true);
    });

    it("should validate keypress action without target", () => {
      const action: ComputerAction = {
        type: "keypress",
        key: "enter",
      };
      const result = validateAction(action);
      expect(result.valid).toBe(true);
    });

    it("should validate type action without target", () => {
      const action: ComputerAction = {
        type: "type",
        value: "hello",
      };
      const result = validateAction(action);
      expect(result.valid).toBe(true);
    });

    it("should reject when rate limit exceeded", () => {
      setRateLimitConfig({ maxActionsPerChain: 2 });
      const action1: ComputerAction = { type: "scroll", direction: "down" };
      const action2: ComputerAction = { type: "scroll", direction: "down" };
      const action3: ComputerAction = { type: "scroll", direction: "down" };
      validateAction(action1);
      validateAction(action2);
      const result = validateAction(action3);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Rate limit");
    });

    it("should attempt target resolution for click actions", () => {
      const action: ComputerAction = {
        type: "click",
        target: { role: "button", label: "Nonexistent Label XYZ 123", source: "application" },
      };
      const result = validateAction(action);
      // Should not find the target
      expect(result.valid).toBe(false);
    });
  });
});
