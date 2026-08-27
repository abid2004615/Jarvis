/**
 * P10 Tests — Tool Registry Integration
 */

import { getToolRegistry, resetToolRegistry } from "@/lib/tools/registry";

describe("P10 Tool Registry Integration", () => {
  beforeEach(() => {
    resetToolRegistry();
  });

  describe("Computer-use tools registered", () => {
    it("should have computer_click tool", () => {
      const registry = getToolRegistry();
      expect(registry.hasTool("computer_click")).toBe(true);
    });

    it("should have computer_type tool", () => {
      const registry = getToolRegistry();
      expect(registry.hasTool("computer_type")).toBe(true);
    });

    it("should have computer_scroll tool", () => {
      const registry = getToolRegistry();
      expect(registry.hasTool("computer_scroll")).toBe(true);
    });

    it("should have computer_keypress tool", () => {
      const registry = getToolRegistry();
      expect(registry.hasTool("computer_keypress")).toBe(true);
    });

    it("should have computer_use_status tool", () => {
      const registry = getToolRegistry();
      expect(registry.hasTool("computer_use_status")).toBe(true);
    });
  });

  describe("Tool definitions", () => {
    it("computer_click should require confirmation", () => {
      const registry = getToolRegistry();
      const tool = registry.getToolOrThrow("computer_click");
      expect(tool.riskLevel).toBe("confirmation");
      expect(tool.requiresUserConfirmation).toBe(true);
    });

    it("computer_type should require confirmation", () => {
      const registry = getToolRegistry();
      const tool = registry.getToolOrThrow("computer_type");
      expect(tool.riskLevel).toBe("confirmation");
      expect(tool.requiresUserConfirmation).toBe(true);
    });

    it("computer_scroll should require confirmation", () => {
      const registry = getToolRegistry();
      const tool = registry.getToolOrThrow("computer_scroll");
      expect(tool.riskLevel).toBe("confirmation");
      expect(tool.requiresUserConfirmation).toBe(true);
    });

    it("computer_keypress should require confirmation", () => {
      const registry = getToolRegistry();
      const tool = registry.getToolOrThrow("computer_keypress");
      expect(tool.riskLevel).toBe("confirmation");
      expect(tool.requiresUserConfirmation).toBe(true);
    });

    it("computer_use_status should be safe (no confirmation)", () => {
      const registry = getToolRegistry();
      const tool = registry.getToolOrThrow("computer_use_status");
      expect(tool.riskLevel).toBe("safe");
      expect(tool.requiresUserConfirmation).toBe(false);
    });
  });

  describe("Tool schemas", () => {
    it("computer_click should have label as required", () => {
      const registry = getToolRegistry();
      const tool = registry.getToolOrThrow("computer_click");
      expect(tool.inputSchema.required).toContain("label");
    });

    it("computer_type should have text as required", () => {
      const registry = getToolRegistry();
      const tool = registry.getToolOrThrow("computer_type");
      expect(tool.inputSchema.required).toContain("text");
    });

    it("computer_keypress should have key as required", () => {
      const registry = getToolRegistry();
      const tool = registry.getToolOrThrow("computer_keypress");
      expect(tool.inputSchema.required).toContain("key");
    });

    it("computer_use_status should have no required fields", () => {
      const registry = getToolRegistry();
      const tool = registry.getToolOrThrow("computer_use_status");
      expect(tool.inputSchema.required).toEqual([]);
    });
  });

  describe("Existing P9 tools preserved", () => {
    it("should still have get_clipboard", () => {
      const registry = getToolRegistry();
      expect(registry.hasTool("get_clipboard")).toBe(true);
    });

    it("should still have list_windows", () => {
      const registry = getToolRegistry();
      expect(registry.hasTool("list_windows")).toBe(true);
    });

    it("should still have focus_application", () => {
      const registry = getToolRegistry();
      expect(registry.hasTool("focus_application")).toBe(true);
    });

    it("should still have get_safari_state", () => {
      const registry = getToolRegistry();
      expect(registry.hasTool("get_safari_state")).toBe(true);
    });

    it("should still have get_system_snapshot", () => {
      const registry = getToolRegistry();
      expect(registry.hasTool("get_system_snapshot")).toBe(true);
    });

    it("should still have get_screen_context", () => {
      const registry = getToolRegistry();
      expect(registry.hasTool("get_screen_context")).toBe(true);
    });
  });

  describe("Tool count", () => {
    it("should have at least 58 tools total (53 original + 24 P9 + 5 P10)", () => {
      const registry = getToolRegistry();
      expect(registry.getAllTools().length).toBeGreaterThanOrEqual(58);
    });
  });
});
