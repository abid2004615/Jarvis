/**
 * P12 Tests — Goal Security & Tool Validation
 */

import { validateGoalInput, validateGoalPlan } from "@/lib/goals/validator";

describe("P12 Goal Security", () => {
  describe("Shell command rejection", () => {
    it("should reject rm -rf in title", () => {
      const result = validateGoalInput({ title: "Run rm -rf /" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("shell command");
    });

    it("should reject sudo in description", () => {
      const result = validateGoalInput({ title: "Test", description: "sudo do something" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("shell command");
    });

    it("should reject chmod 777", () => {
      const result = validateGoalInput({ title: "chmod 777 important files" });
      expect(result.valid).toBe(false);
    });

    it("should reject shutdown", () => {
      const result = validateGoalInput({ title: "Shutdown the system" });
      expect(result.valid).toBe(false);
    });

    it("should reject reboot", () => {
      const result = validateGoalInput({ title: "Reboot the Mac" });
      expect(result.valid).toBe(false);
    });
  });

  describe("Script injection rejection", () => {
    it("should reject osascript in title", () => {
      const result = validateGoalInput({ title: "Run osascript" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("script injection");
    });

    it("should reject AppleScript in description", () => {
      const result = validateGoalInput({ title: "Test", description: "Use AppleScript" });
      expect(result.valid).toBe(false);
    });

    it("should reject eval()", () => {
      const result = validateGoalInput({ title: "eval(malicious)" });
      expect(result.valid).toBe(false);
    });
  });

  describe("Secret rejection", () => {
    it("should reject password in title", () => {
      const result = validateGoalInput({ title: "My password is secret" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Rejected");
    });

    it("should reject API key patterns", () => {
      expect(validateGoalInput({ title: "sk-1234567890abcdef" }).valid).toBe(false);
      expect(validateGoalInput({ title: "gsk_1234567890abcdef" }).valid).toBe(false);
    });

    it("should reject GitHub tokens", () => {
      expect(validateGoalInput({ title: "ghp_12345678901234567890" }).valid).toBe(false);
    });

    it("should reject AWS keys", () => {
      expect(validateGoalInput({ title: "AKIA1234567890123456" }).valid).toBe(false);
    });

    it("should reject private keys", () => {
      expect(validateGoalInput({ title: "-----BEGIN PRIVATE KEY-----" }).valid).toBe(false);
    });
  });

  describe("Plan security validation", () => {
    const validStep = {
      id: "step_1",
      description: "Check battery",
      toolId: "get_battery_status",
      risk: "safe",
      requiresConfirmation: false,
      verification: "Battery status retrieved",
    };

    it("should reject shell commands in step descriptions", () => {
      expect(validateGoalPlan([{ ...validStep, description: "Run sudo rm -rf /" }])).toBeFalsy;
    });

    it("should reject secrets in step descriptions", () => {
      expect(validateGoalPlan([{ ...validStep, description: "password: abc123" }])).toBeFalsy;
    });

    it("should reject script injection in steps", () => {
      expect(validateGoalPlan([{ ...validStep, description: "Run osascript" }])).toBeFalsy;
    });

    it("should reject arbitrary coordinates", () => {
      expect(validateGoalPlan([{ ...validStep, description: "click 100,200" }])).toBeFalsy;
    });

    it("should reject path traversal", () => {
      expect(validateGoalPlan([{ ...validStep, description: "Access ../../etc/passwd" }])).toBeFalsy;
    });

    it("should reject unsafe URLs", () => {
      expect(validateGoalPlan([{ ...validStep, description: "Open javascript:alert(1)" }])).toBeFalsy;
    });

    it("should reject file:// URLs", () => {
      expect(validateGoalPlan([{ ...validStep, description: "Open file:///etc/passwd" }])).toBeFalsy;
    });

    it("should reject data: URLs", () => {
      expect(validateGoalPlan([{ ...validStep, description: "Open data:text/html,<script>" }])).toBeFalsy;
    });
  });

  describe("Goal input security", () => {
    it("should not allow setting id", () => {
      const result = validateGoalInput({ id: "evil-id", title: "Test" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unknown goal field");
    });

    it("should not allow setting status", () => {
      const result = validateGoalInput({ title: "Test", status: "completed" });
      expect(result.valid).toBe(false);
    });

    it("should not allow setting createdAt", () => {
      const result = validateGoalInput({ title: "Test", createdAt: 0 });
      expect(result.valid).toBe(false);
    });

    it("should not allow setting history", () => {
      const result = validateGoalInput({ title: "Test", history: [] });
      expect(result.valid).toBe(false);
    });
  });

  describe("Limits enforcement", () => {
    it("should reject plan with more than 20 steps", () => {
      const steps = Array.from({ length: 21 }, (_, i) => ({
        id: `step_${i}`,
        description: `Step ${i}`,
        risk: "safe" as const,
        requiresConfirmation: false,
        verification: `Verify step ${i}`,
      }));
      const result = validateGoalPlan(steps);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("20 steps");
    });

    it("should reject goal title over 200 chars", () => {
      const result = validateGoalInput({ title: "x".repeat(201) });
      expect(result.valid).toBe(false);
    });

    it("should reject goal description over 1000 chars", () => {
      const result = validateGoalInput({ title: "Test", description: "x".repeat(1001) });
      expect(result.valid).toBe(false);
    });
  });
});
