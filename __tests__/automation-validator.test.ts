/**
 * JARVIS Automation — Validator Tests
 *
 * Strict schema validation, secret rejection, and allowlist enforcement.
 */

import { validateAutomationInput, validateApplicationCondition, toolRequiresScheduledConfirmation, containsSecret } from "@/lib/automation/validator";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Morning CPU check",
    description: "Reports CPU usage every morning",
    trigger: { type: "daily", at: "09:00" },
    action: { toolId: "get_cpu_usage", arguments: {} },
    ...overrides,
  };
}

describe("Automation Validator", () => {
  describe("valid automations", () => {
    test("accepts a valid daily automation", () => {
      const result = validateAutomationInput(validInput());
      expect(result.valid).toBe(true);
    });

    test("accepts a valid weekly automation", () => {
      const result = validateAutomationInput(
        validInput({
          trigger: { type: "weekly", at: "18:00", dayOfWeek: 1 },
        }),
      );
      expect(result.valid).toBe(true);
    });

    test("accepts a valid interval automation", () => {
      const result = validateAutomationInput(
        validInput({ trigger: { type: "interval", minutes: 30 } }),
      );
      expect(result.valid).toBe(true);
    });

    test("accepts a valid once automation", () => {
      const result = validateAutomationInput(
        validInput({ trigger: { type: "once", date: "2026-01-01", at: "12:00" } }),
      );
      expect(result.valid).toBe(true);
    });

    test("accepts a valid condition automation", () => {
      const result = validateAutomationInput(
        validInput({
          trigger: { type: "condition", metric: "battery", operator: "<", value: 20 },
        }),
      );
      expect(result.valid).toBe(true);
    });

    test("accepts a valid notify_user action", () => {
      const result = validateAutomationInput(
        validInput({ action: { toolId: "notify_user", arguments: { message: "Battery is low" } } }),
      );
      expect(result.valid).toBe(true);
    });

    test("accepts a valid gated launch_application action (execution still requires confirmation)", () => {
      const result = validateAutomationInput(
        validInput({
          trigger: { type: "daily", at: "09:00" },
          action: { toolId: "launch_application", arguments: { application: "Safari" } },
        }),
      );
      expect(result.valid).toBe(true);
      expect(toolRequiresScheduledConfirmation("launch_application")).toBe(true);
    });
  });

  describe("trigger validation", () => {
    test("rejects unknown trigger type", () => {
      const result = validateAutomationInput(validInput({ trigger: { type: "cron", at: "09:00" } }));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unknown trigger type");
    });

    test("rejects cron-style expressions", () => {
      const result = validateAutomationInput(
        validInput({ trigger: { type: "daily", at: "09:00", expression: "0 9 * * *" } }),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unknown trigger field");
    });

    test("rejects missing daily at", () => {
      const result = validateAutomationInput(validInput({ trigger: { type: "daily" } }));
      expect(result.valid).toBe(false);
    });

    test("rejects malformed time", () => {
      const result = validateAutomationInput(validInput({ trigger: { type: "daily", at: "25:00" } }));
      expect(result.valid).toBe(false);
    });

    test("rejects invalid dayOfWeek", () => {
      const result = validateAutomationInput(
        validInput({ trigger: { type: "weekly", at: "09:00", dayOfWeek: 7 } }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects negative interval", () => {
      const result = validateAutomationInput(
        validInput({ trigger: { type: "interval", minutes: -5 } }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects zero interval", () => {
      const result = validateAutomationInput(
        validInput({ trigger: { type: "interval", minutes: 0 } }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects interval above maximum", () => {
      const result = validateAutomationInput(
        validInput({ trigger: { type: "interval", minutes: 24 * 60 + 1 } }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects invalid condition threshold", () => {
      const result = validateAutomationInput(
        validInput({ trigger: { type: "condition", metric: "battery", operator: "<", value: 200 } }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects negative condition threshold", () => {
      const result = validateAutomationInput(
        validInput({ trigger: { type: "condition", metric: "cpu", operator: ">", value: -1 } }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects non-numeric condition value", () => {
      const result = validateAutomationInput(
        validInput({ trigger: { type: "condition", metric: "cpu", operator: ">", value: "high" } }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects unknown condition metric", () => {
      const result = validateAutomationInput(
        validInput({ trigger: { type: "condition", metric: "temperature", operator: ">", value: 50 } }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects unsupported condition operator", () => {
      const result = validateAutomationInput(
        validInput({ trigger: { type: "condition", metric: "battery", operator: "!=", value: 20 } }),
      );
      expect(result.valid).toBe(false);
    });
  });

  describe("application conditions", () => {
    test("accepts a running condition", () => {
      const result = validateApplicationCondition({
        type: "condition",
        metric: "application",
        operator: "running",
        value: "Safari",
      });
      expect(result.valid).toBe(true);
    });

    test("accepts a not_running condition", () => {
      const result = validateApplicationCondition({
        type: "condition",
        metric: "application",
        operator: "not_running",
        value: "Safari",
      });
      expect(result.valid).toBe(true);
    });

    test("rejects missing app name", () => {
      const result = validateApplicationCondition({
        type: "condition",
        metric: "application",
        operator: "running",
        value: "",
      });
      expect(result.valid).toBe(false);
    });

    test("rejects application condition with numeric operators", () => {
      const result = validateApplicationCondition({
        type: "condition",
        metric: "application",
        operator: "<",
        value: 5,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("action validation", () => {
    test("rejects arbitrary command tool", () => {
      const result = validateAutomationInput(
        validInput({ action: { toolId: "shell_exec", arguments: {} } }),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be used in an automation");
    });

    test("rejects unallowlisted real tool (echo)", () => {
      const result = validateAutomationInput(
        validInput({ action: { toolId: "echo", arguments: { message: "hi" } } }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects command argument keys", () => {
      const result = validateAutomationInput(
        validInput({ action: { toolId: "notify_user", arguments: { command: "rm -rf /" } } }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects path argument keys", () => {
      const result = validateAutomationInput(
        validInput({ action: { toolId: "notify_user", arguments: { path: "/tmp/x" } } }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects url argument keys", () => {
      const result = validateAutomationInput(
        validInput({ action: { toolId: "notify_user", arguments: { url: "https://example.com" } } }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects extra action fields", () => {
      const result = validateAutomationInput(
        validInput({ action: { toolId: "get_cpu_usage", arguments: {}, shell: "bash" } }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects arguments not matching tool schema", () => {
      const result = validateAutomationInput(
        validInput({ action: { toolId: "get_cpu_usage", arguments: { bogus: 1 } } }),
      );
      expect(result.valid).toBe(false);
    });
  });

  describe("authorization cannot be set by the client", () => {
    test("rejects enabled field", () => {
      const result = validateAutomationInput(validInput({ enabled: true }));
      expect(result.valid).toBe(false);
    });

    test("rejects requiresConfirmation field", () => {
      const result = validateAutomationInput(validInput({ requiresConfirmation: false }));
      expect(result.valid).toBe(false);
    });

    test("rejects id field", () => {
      const result = validateAutomationInput(validInput({ id: "auto-1" }));
      expect(result.valid).toBe(false);
    });

    test("rejects authorized field", () => {
      const result = validateAutomationInput(validInput({ authorized: true }));
      expect(result.valid).toBe(false);
    });
  });

  describe("secret rejection", () => {
    test("rejects password in arguments", () => {
      const result = validateAutomationInput(
        validInput({
          action: { toolId: "notify_user", arguments: { message: "password is hunter2" } },
        }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects api key in name", () => {
      const result = validateAutomationInput(validInput({ name: "My api_key 1234" }));
      expect(result.valid).toBe(false);
    });

    test("rejects sk- style key", () => {
      const result = validateAutomationInput(
        validInput({ description: "sk-abcdef1234567890 secret" }),
      );
      expect(result.valid).toBe(false);
    });

    test("rejects groq key", () => {
      const result = validateAutomationInput(
        validInput({ description: "gsk_abcdefghij1234567890" }),
      );
      expect(result.valid).toBe(false);
    });

    test("containsSecret detects JWTs", () => {
      const result = containsSecret("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0");
      expect(result.found).toBe(true);
    });

    test("accepts innocuous text", () => {
      const result = containsSecret("Remember to feed the cat at 6 PM");
      expect(result.found).toBe(false);
    });
  });

  describe("name/length bounds", () => {
    test("rejects empty name", () => {
      const result = validateAutomationInput(validInput({ name: "   " }));
      expect(result.valid).toBe(false);
    });

    test("rejects oversized name", () => {
      const result = validateAutomationInput(validInput({ name: "x".repeat(121) }));
      expect(result.valid).toBe(false);
    });

    test("rejects non-object input", () => {
      expect(validateAutomationInput(null).valid).toBe(false);
      expect(validateAutomationInput("hello").valid).toBe(false);
    });
  });
});
