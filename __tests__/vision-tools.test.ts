/**
 * P8 Tests — Vision Tools
 */

import { GET_SCREEN_CONTEXT_TOOL, CAPTURE_SCREEN_TOOL, READ_SCREEN_TEXT_TOOL, ANALYZE_SCREEN_TOOL } from "@/lib/tools/registry";

describe("P8 — Vision Tools Schema", () => {
  const tools = [
    GET_SCREEN_CONTEXT_TOOL,
    CAPTURE_SCREEN_TOOL,
    READ_SCREEN_TEXT_TOOL,
    ANALYZE_SCREEN_TOOL,
  ];

  test("all vision tools have required fields", () => {
    for (const tool of tools) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
      expect(tool.inputSchema).toHaveProperty("type", "object");
      expect(tool.inputSchema).toHaveProperty("properties");
      expect(tool.inputSchema).toHaveProperty("required");
    }
  });

  test("GET_SCREEN_CONTEXT_TOOL has correct name", () => {
    expect(GET_SCREEN_CONTEXT_TOOL.name).toBe("get_screen_context");
    expect(GET_SCREEN_CONTEXT_TOOL.riskLevel).toBe("safe");
    expect(GET_SCREEN_CONTEXT_TOOL.requiresUserConfirmation).toBe(false);
  });

  test("CAPTURE_SCREEN_TOOL requires confirmation", () => {
    expect(CAPTURE_SCREEN_TOOL.name).toBe("capture_screen");
    expect(CAPTURE_SCREEN_TOOL.riskLevel).toBe("confirmation");
    expect(CAPTURE_SCREEN_TOOL.requiresUserConfirmation).toBe(true);
  });

  test("READ_SCREEN_TEXT_TOOL is safe", () => {
    expect(READ_SCREEN_TEXT_TOOL.name).toBe("read_screen_text");
    expect(READ_SCREEN_TEXT_TOOL.riskLevel).toBe("safe");
    expect(READ_SCREEN_TEXT_TOOL.requiresUserConfirmation).toBe(false);
  });

  test("ANALYZE_SCREEN_TOOL is safe", () => {
    expect(ANALYZE_SCREEN_TOOL.name).toBe("analyze_screen");
    expect(ANALYZE_SCREEN_TOOL.riskLevel).toBe("safe");
    expect(ANALYZE_SCREEN_TOOL.requiresUserConfirmation).toBe(false);
  });

  test("all vision tool schemas have no required parameters", () => {
    for (const tool of tools) {
      const schema = tool.inputSchema as any;
      expect(Array.isArray(schema.required)).toBe(true);
      expect(schema.required.length).toBe(0);
    }
  });

  test("all vision tools have execute functions", () => {
    for (const tool of tools) {
      expect(typeof tool.execute).toBe("function");
    }
  });

  test("vision tools are included in getBuiltinTools", () => {
    const { getBuiltinTools } = require("@/lib/tools/registry");
    const builtinNames = getBuiltinTools().map((t: any) => t.name);
    expect(builtinNames).toContain("get_screen_context");
    expect(builtinNames).toContain("capture_screen");
    expect(builtinNames).toContain("read_screen_text");
    expect(builtinNames).toContain("analyze_screen");
  });
});
