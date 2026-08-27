/**
 * P12 Tests — Goal Validator
 */

import { validateGoalInput, validateGoalPlan } from "@/lib/goals/validator";

describe("P12 Goal Validator", () => {
  describe("validateGoalInput", () => {
    it("should accept valid minimal input", () => {
      const result = validateGoalInput({ title: "Test Goal" });
      expect(result.valid).toBe(true);
    });

    it("should accept valid full input", () => {
      const result = validateGoalInput({
        title: "Prepare Mac",
        description: "Get ready for presentation",
        type: "multi_step",
        priority: "high",
      });
      expect(result.valid).toBe(true);
    });

    it("should reject non-object input", () => {
      expect(validateGoalInput(null).valid).toBe(false);
      expect(validateGoalInput("string").valid).toBe(false);
      expect(validateGoalInput(42).valid).toBe(false);
    });

    it("should reject unknown fields", () => {
      const result = validateGoalInput({ title: "Test", secretField: "value" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unknown goal field");
    });

    it("should reject empty title", () => {
      expect(validateGoalInput({ title: "" }).valid).toBe(false);
      expect(validateGoalInput({ title: "   " }).valid).toBe(false);
    });

    it("should reject title exceeding max length", () => {
      expect(validateGoalInput({ title: "x".repeat(201) }).valid).toBe(false);
    });

    it("should reject description exceeding max length", () => {
      expect(validateGoalInput({ title: "Test", description: "x".repeat(1001) }).valid).toBe(false);
    });

    it("should reject invalid type", () => {
      expect(validateGoalInput({ title: "Test", type: "invalid" }).valid).toBe(false);
    });

    it("should accept valid types", () => {
      expect(validateGoalInput({ title: "Test", type: "one_shot" }).valid).toBe(true);
      expect(validateGoalInput({ title: "Test", type: "multi_step" }).valid).toBe(true);
      expect(validateGoalInput({ title: "Test", type: "conditional" }).valid).toBe(true);
      expect(validateGoalInput({ title: "Test", type: "monitoring" }).valid).toBe(true);
    });

    it("should reject invalid priority", () => {
      expect(validateGoalInput({ title: "Test", priority: "invalid" }).valid).toBe(false);
    });

    it("should accept valid priorities", () => {
      expect(validateGoalInput({ title: "Test", priority: "low" }).valid).toBe(true);
      expect(validateGoalInput({ title: "Test", priority: "normal" }).valid).toBe(true);
      expect(validateGoalInput({ title: "Test", priority: "high" }).valid).toBe(true);
      expect(validateGoalInput({ title: "Test", priority: "urgent" }).valid).toBe(true);
    });

    it("should reject secrets in title", () => {
      expect(validateGoalInput({ title: "My password is abc123" }).valid).toBe(false);
    });

    it("should reject secrets in description", () => {
      expect(validateGoalInput({ title: "Test", description: "api_key: sk-1234567890abcdef" }).valid).toBe(false);
    });

    it("should reject shell commands in title", () => {
      expect(validateGoalInput({ title: "Run sudo rm -rf /" }).valid).toBe(false);
    });

    it("should reject AppleScript in description", () => {
      expect(validateGoalInput({ title: "Test", description: "run osascript" }).valid).toBe(false);
    });
  });

  describe("validateGoalPlan", () => {
    const validStep = {
      id: "step_1",
      description: "Check battery",
      toolId: "get_battery_status",
      risk: "safe",
      requiresConfirmation: false,
      verification: "Battery status retrieved",
    };

    it("should accept valid plan", () => {
      const result = validateGoalPlan([validStep]);
      expect(result.valid).toBe(true);
    });

    it("should reject non-array", () => {
      expect(validateGoalPlan(null).valid).toBe(false);
      expect(validateGoalPlan("string").valid).toBe(false);
    });

    it("should reject empty plan", () => {
      expect(validateGoalPlan([]).valid).toBe(false);
    });

    it("should reject plan exceeding max steps", () => {
      const steps = Array.from({ length: 21 }, (_, i) => ({
        ...validStep,
        id: `step_${i}`,
      }));
      expect(validateGoalPlan(steps).valid).toBe(false);
    });

    it("should reject duplicate step ids", () => {
      expect(validateGoalPlan([validStep, { ...validStep }]).valid).toBe(false);
    });

    it("should reject step with unknown toolId", () => {
      expect(validateGoalPlan([{ ...validStep, toolId: "nonexistent_tool" }]).valid).toBe(false);
    });

    it("should reject step with unknown fields", () => {
      expect(validateGoalPlan([{ ...validStep, evilField: true }])).toBeFalsy;
    });

    it("should reject step with empty id", () => {
      expect(validateGoalPlan([{ ...validStep, id: "" }]).valid).toBe(false);
    });

    it("should reject step with empty description", () => {
      expect(validateGoalPlan([{ ...validStep, description: "" }])).toBeFalsy;
    });

    it("should reject step with empty verification", () => {
      expect(validateGoalPlan([{ ...validStep, verification: "" }])).toBeFalsy;
    });

    it("should reject secrets in plan", () => {
      expect(validateGoalPlan([{ ...validStep, description: "password: abc123" }])).toBeFalsy;
    });

    it("should reject shell commands in plan", () => {
      expect(validateGoalPlan([{ ...validStep, description: "sudo rm -rf /" }])).toBeFalsy;
    });

    it("should reject unknown dependency references", () => {
      expect(validateGoalPlan([{ ...validStep, dependencies: ["nonexistent"] }])).toBeFalsy;
    });

    it("should accept valid dependencies", () => {
      const step2 = { ...validStep, id: "step_2", dependencies: ["step_1"] };
      expect(validateGoalPlan([validStep, step2]).valid).toBe(true);
    });

    it("should accept step without toolId (planning step)", () => {
      const step = {
        id: "step_1",
        description: "Analyze situation",
        risk: "safe" as const,
        requiresConfirmation: false,
        verification: "Analysis complete",
      };
      expect(validateGoalPlan([step]).valid).toBe(true);
    });

    it("should reject invalid risk level", () => {
      expect(validateGoalPlan([{ ...validStep, risk: "invalid" }])).toBeFalsy;
    });

    it("should accept valid risk levels", () => {
      expect(validateGoalPlan([{ ...validStep, risk: "safe" }]).valid).toBe(true);
      expect(validateGoalPlan([{ ...validStep, risk: "confirmation" }]).valid).toBe(true);
    });
  });
});
