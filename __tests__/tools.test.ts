/**
 * Tests for Tool Registry System
 * Validates tool registration, permissions, and validation
 */

import { ToolRegistry, ToolPermissionManager, ToolInputValidator } from "@/lib/tools/types";
import type { ToolDefinition, JSONSchema } from "@/lib/tools/types";

// Mock tool for testing
const mockTool: ToolDefinition = {
  name: "test_tool",
  description: "A test tool",
  inputSchema: {
    type: "object",
    properties: {
      value: { type: "string" },
    },
    required: ["value"],
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input: Record<string, unknown>) => {
    return { result: input.value };
  },
};

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  test("should register a tool successfully", () => {
    registry.register(mockTool);
    expect(registry.getTool("test_tool")).toBe(mockTool);
  });

  test("should throw error when registering duplicate tool", () => {
    registry.register(mockTool);
    expect(() => registry.register(mockTool)).toThrow("Tool 'test_tool' is already registered");
  });

  test("should return all registered tools", () => {
    registry.register(mockTool);
    const tools = registry.getAllTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toBe(mockTool);
  });

  test("should check if tool exists", () => {
    registry.register(mockTool);
    expect(registry.hasTool("test_tool")).toBe(true);
    expect(registry.hasTool("nonexistent")).toBe(false);
  });

  test("should get tool or throw error", () => {
    registry.register(mockTool);
    expect(registry.getToolOrThrow("test_tool")).toBe(mockTool);
    expect(() => registry.getToolOrThrow("nonexistent")).toThrow("Tool 'nonexistent' not found");
  });

  test("should return tools for AI (without execute function)", () => {
    registry.register(mockTool);
    const aiTools = registry.getToolsForAI();
    expect(aiTools).toHaveLength(1);
    expect(aiTools[0]).toHaveProperty("name", "test_tool");
    expect(aiTools[0]).toHaveProperty("description");
    expect(aiTools[0]).toHaveProperty("inputSchema");
    expect(aiTools[0]).not.toHaveProperty("execute");
  });
});

describe("ToolPermissionManager", () => {
  let registry: ToolRegistry;
  let manager: ToolPermissionManager;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(mockTool);
    manager = new ToolPermissionManager(registry);
  });

  test("should deny execution of non-existent tool", async () => {
    const result = await manager.canExecute("nonexistent", {});
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not found");
  });

  test("should deny execution of restricted tool", async () => {
    manager.restrictTool("test_tool");
    const result = await manager.canExecute("test_tool", {});
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("restricted");
  });

  test("should allow execution of unrestricted safe tool", async () => {
    const result = await manager.canExecute("test_tool", {});
    expect(result.allowed).toBe(true);
  });

  test("should allow tool after unrestricting it", async () => {
    manager.restrictTool("test_tool");
    manager.allowTool("test_tool");
    const result = await manager.canExecute("test_tool", {});
    expect(result.allowed).toBe(true);
  });

  test("should require user confirmation for confirmation-level tools", async () => {
    const confirmationTool: ToolDefinition = {
      ...mockTool,
      name: "confirmation_tool",
      riskLevel: "confirmation",
    };
    registry.register(confirmationTool);

    // Without callback, should deny
    let result = await manager.canExecute("confirmation_tool", {});
    expect(result.allowed).toBe(false);

    // With callback, should proceed
    manager.setUserConfirmationCallback(async () => true);
    result = await manager.canExecute("confirmation_tool", {});
    expect(result.allowed).toBe(true);
  });

  test("should deny if user declines confirmation", async () => {
    const confirmationTool: ToolDefinition = {
      ...mockTool,
      name: "confirmation_tool",
      riskLevel: "confirmation",
    };
    registry.register(confirmationTool);
    manager.setUserConfirmationCallback(async () => false);

    const result = await manager.canExecute("confirmation_tool", {});
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("User declined");
  });
});

describe("ToolInputValidator", () => {
  test("should validate correct input", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    };
    const result = ToolInputValidator.validate({ name: "test" }, schema);
    expect(result.valid).toBe(true);
  });

  test("should reject wrong type", () => {
    const schema: JSONSchema = {
      type: "object",
    };
    const result = ToolInputValidator.validate("not an object", schema);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Expected object");
  });

  test("should reject missing required property", () => {
    const schema: JSONSchema = {
      type: "object",
      required: ["name"],
    };
    const result = ToolInputValidator.validate({}, schema);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing required property");
  });

  test("should reject additional properties when not allowed", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { name: { type: "string" } },
      additionalProperties: false,
    };
    const result = ToolInputValidator.validate({ name: "test", extra: "value" }, schema);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Additional property not allowed");
  });

  test("should allow additional properties when allowed", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { name: { type: "string" } },
      additionalProperties: true,
    };
    const result = ToolInputValidator.validate({ name: "test", extra: "value" }, schema);
    expect(result.valid).toBe(true);
  });

  test("should allow additional properties by default", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: { name: { type: "string" } },
    };
    const result = ToolInputValidator.validate({ name: "test", extra: "value" }, schema);
    expect(result.valid).toBe(true);
  });
});
