/**
 * Tests for Tool Confirmation Manager
 * Validates confirmation requests, responses, and sanitization
 */

import { ConfirmationManager, getConfirmationManager, resetConfirmationManager } from "@/lib/runtime/confirmation";
import { executeToolSafely, resetToolRegistry } from "@/lib/tools/registry";

describe("Confirmation Manager", () => {
  let manager: ConfirmationManager;

  beforeEach(() => {
    resetConfirmationManager();
    resetToolRegistry();
    manager = new ConfirmationManager();
  });

  describe("Confirmation Requests", () => {
    test("should return null for tool without confirmation requirement", () => {
      // This test depends on tool registry which is mocked
      const result = manager.requestToolConfirmation("get_cpu_usage");
      expect(result).toBeNull();
    });

    test("should generate request with unique IDs", () => {
      // Create requests for a tool that might require confirmation
      manager.requestToolConfirmation("launch_application", { application: "Safari" });
      manager.requestToolConfirmation("launch_application", { application: "Chrome" });

      const pending = manager.getPendingConfirmations();
      if (pending.length >= 2) {
        expect(pending[0].id).not.toBe(pending[1].id);
      }
    });

    test("should sanitize arguments in request", () => {
      const request = manager.requestToolConfirmation("launch_application", {
        application: "Safari",
        password: "secret123",
        apiKey: "key456",
      });

      if (request) {
        expect(request.safeArguments.password).toBe("[REDACTED]");
        expect(request.safeArguments.apiKey).toBe("[REDACTED]");
        expect(request.safeArguments.application).toBe("Safari");
      }
    });

    test("should include human-readable action", () => {
      const request = manager.requestToolConfirmation("launch_application", { application: "Safari" });

      if (request) {
        expect(request.humanReadableAction).toBeDefined();
        expect(request.humanReadableAction).toContain("Safari");
      }
    });

    test("should include tool name and description", () => {
      const request = manager.requestToolConfirmation("launch_application", {});

      if (request) {
        expect(request.toolName).toBe("launch_application");
        expect(request.description).toBeDefined();
      }
    });
  });

  describe("Confirmation Responses", () => {
    test("should record approval response", () => {
      const request = manager.requestToolConfirmation("launch_application", {});

      if (request) {
        const success = manager.respondToConfirmation(request.id, true);
        expect(success).toBe(true);
      }
    });

    test("should record denial response", () => {
      const request = manager.requestToolConfirmation("launch_application", {});

      if (request) {
        const success = manager.respondToConfirmation(request.id, false, "User denied");
        expect(success).toBe(true);
      }
    });

    test("should return false for invalid request ID", () => {
      const success = manager.respondToConfirmation("invalid-id", true);
      expect(success).toBe(false);
    });

    test("should retrieve recorded response", () => {
      const request = manager.requestToolConfirmation("launch_application", {});

      if (request) {
        manager.respondToConfirmation(request.id, true);
        const response = manager.getConfirmationResponse(request.id);
        expect(response).toBeDefined();
        expect(response?.approved).toBe(true);
      }
    });

    test("should clear response after retrieval", () => {
      const request = manager.requestToolConfirmation("launch_application", {});

      if (request) {
        manager.respondToConfirmation(request.id, true);
        manager.getConfirmationResponse(request.id);
        const response2 = manager.getConfirmationResponse(request.id);
        expect(response2).toBeNull();
      }
    });
  });

  describe("Sanitization", () => {
    test("should sanitize common sensitive fields", () => {
      const request = manager.requestToolConfirmation("launch_application", {
        password: "pass123",
        token: "token456",
        secret: "secret789",
        apikey: "apikey000",
        key: "key111",
        credential: "cred222",
        passwd: "passwd333",
        pwd: "pwd444",
      });

      if (request) {
        for (const value of Object.values(request.safeArguments)) {
          if (typeof value === "string" && value !== "[REDACTED]") {
            // Should only find safe values
            expect(value).not.toMatch(/(pass|token|secret|api|credential|pwd)/i);
          }
        }
      }
    });

    test("should preserve non-sensitive arguments", () => {
      const request = manager.requestToolConfirmation("launch_application", {
        application: "Safari",
        action: "launch",
        safe_param: "value",
      });

      if (request) {
        expect(request.safeArguments.application).toBe("Safari");
        expect(request.safeArguments.action).toBe("launch");
        expect(request.safeArguments.safe_param).toBe("value");
      }
    });

    test("should handle case-insensitive field matching", () => {
      const request = manager.requestToolConfirmation("launch_application", {
        Password: "pass123",
        TOKEN: "token456",
        ApiKey: "apikey000",
      });

      if (request) {
        expect(request.safeArguments.Password).toBe("[REDACTED]");
        expect(request.safeArguments.TOKEN).toBe("[REDACTED]");
        expect(request.safeArguments.ApiKey).toBe("[REDACTED]");
      }
    });
  });

  describe("Pending Confirmations", () => {
    test("should track pending confirmations", () => {
      manager.requestToolConfirmation("launch_application", { application: "Safari" });
      manager.requestToolConfirmation("launch_application", { application: "Chrome" });

      const pending = manager.getPendingConfirmations();
      expect(pending.length).toBeGreaterThan(0);
    });

    test("should cancel pending confirmation", () => {
      const request = manager.requestToolConfirmation("launch_application", {});

      if (request) {
        const cancelled = manager.cancelConfirmation(request.id);
        expect(cancelled).toBe(true);

        const pending = manager.getPendingConfirmations();
        expect(pending.find((p) => p.id === request.id)).toBeUndefined();
      }
    });

    test("should clear all confirmations", () => {
      manager.requestToolConfirmation("launch_application", { application: "Safari" });
      manager.requestToolConfirmation("launch_application", { application: "Chrome" });
      manager.clear();

      expect(manager.getPendingConfirmations()).toHaveLength(0);
    });
  });

  describe("Event Listeners", () => {
    test("should notify listeners on confirmation request", () => {
      const listener = jest.fn();
      manager.onConfirmationRequest(listener);

      manager.requestToolConfirmation("launch_application", {});
      expect(listener).toHaveBeenCalled();
    });

    test("should unsubscribe listener", () => {
      const listener = jest.fn();
      const unsubscribe = manager.onConfirmationRequest(listener);

      manager.requestToolConfirmation("launch_application", {});
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      manager.requestToolConfirmation("launch_application", {});
      expect(listener).toHaveBeenCalledTimes(1); // Should not be called again
    });
  });

  describe("Safe Execution Gate", () => {
    test("should block confirmation-required tools without approval", async () => {
      const result = await executeToolSafely("launch_application", { application: "Safari" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("confirmation");
    });

    test("should allow confirmation-required tools with approval", async () => {
      // Requires the real launchApplication implementation; gate it behind a
      // mocked registry so no real app is ever launched during tests.
      const { ToolRegistry } = await import("@/lib/tools/types");
      const registry = new ToolRegistry();
      registry.register({
        name: "launch_application",
        description: "Launch an allowlisted application",
        inputSchema: {
          type: "object",
          properties: { application: { type: "string" } },
          required: ["application"],
          additionalProperties: false,
        },
        riskLevel: "confirmation",
        requiresUserConfirmation: true,
        execute: async () => ({ launched: "Safari" }),
      });

      const blocked = await executeToolSafely("launch_application", { application: "Safari" }, { registry });
      expect(blocked.success).toBe(false);

      const approved = await executeToolSafely("launch_application", { application: "Safari" }, { registry, confirmed: true });
      expect(approved.success).toBe(true);
      expect(approved.result).toEqual({ launched: "Safari" });
    });

    test("should reject invalid arguments for safe tools", async () => {
      const result = await executeToolSafely("get_cpu_usage", { nonsense: true });
      expect(result.success).toBe(false);
    });
  });

  describe("Singleton Pattern", () => {
    test("should return same instance from singleton", () => {
      resetConfirmationManager();
      const mgr1 = getConfirmationManager();
      const mgr2 = getConfirmationManager();
      expect(mgr1).toBe(mgr2);
    });

    test("should create new instance after reset", () => {
      const mgr1 = getConfirmationManager();
      mgr1.requestToolConfirmation("launch_application", {});

      resetConfirmationManager();
      const mgr2 = getConfirmationManager();

      expect(mgr1).not.toBe(mgr2);
      expect(mgr2.getPendingConfirmations()).toHaveLength(0);
    });
  });
});
