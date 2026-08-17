/**
 * Tests for macOS Tools
 * Validates new tool definitions and execution
 */

import {
  GET_CPU_USAGE_TOOL,
  GET_MEMORY_USAGE_TOOL,
  GET_DISK_USAGE_TOOL,
  GET_BATTERY_STATUS_TOOL,
  GET_NETWORK_STATUS_TOOL,
  GET_SYSTEM_UPTIME_TOOL,
  GET_PROCESS_SUMMARY_TOOL,
  LAUNCH_APPLICATION_TOOL,
  getBuiltinTools,
} from "@/lib/tools/registry";

describe("macOS Tools", () => {
  describe("Tool Definitions", () => {
    test("should have correct CPU usage tool definition", () => {
      expect(GET_CPU_USAGE_TOOL.name).toBe("get_cpu_usage");
      expect(GET_CPU_USAGE_TOOL.riskLevel).toBe("safe");
      expect(GET_CPU_USAGE_TOOL.requiresUserConfirmation).toBe(false);
      expect(GET_CPU_USAGE_TOOL.inputSchema).toBeDefined();
    });

    test("should have correct memory usage tool definition", () => {
      expect(GET_MEMORY_USAGE_TOOL.name).toBe("get_memory_usage");
      expect(GET_MEMORY_USAGE_TOOL.riskLevel).toBe("safe");
    });

    test("should have correct disk usage tool definition", () => {
      expect(GET_DISK_USAGE_TOOL.name).toBe("get_disk_usage");
      expect(GET_DISK_USAGE_TOOL.riskLevel).toBe("safe");
    });

    test("should have correct battery status tool definition", () => {
      expect(GET_BATTERY_STATUS_TOOL.name).toBe("get_battery_status");
      expect(GET_BATTERY_STATUS_TOOL.riskLevel).toBe("safe");
    });

    test("should have correct network status tool definition", () => {
      expect(GET_NETWORK_STATUS_TOOL.name).toBe("get_network_status");
      expect(GET_NETWORK_STATUS_TOOL.riskLevel).toBe("safe");
    });

    test("should have correct system uptime tool definition", () => {
      expect(GET_SYSTEM_UPTIME_TOOL.name).toBe("get_system_uptime");
      expect(GET_SYSTEM_UPTIME_TOOL.riskLevel).toBe("safe");
    });

    test("should have correct process summary tool definition", () => {
      expect(GET_PROCESS_SUMMARY_TOOL.name).toBe("get_process_summary");
      expect(GET_PROCESS_SUMMARY_TOOL.riskLevel).toBe("safe");
    });

    test("should have correct launch application tool definition", () => {
      expect(LAUNCH_APPLICATION_TOOL.name).toBe("launch_application");
      expect(LAUNCH_APPLICATION_TOOL.riskLevel).toBe("confirmation");
      expect(LAUNCH_APPLICATION_TOOL.requiresUserConfirmation).toBe(true);
      expect(LAUNCH_APPLICATION_TOOL.inputSchema.required).toContain("application");
    });
  });

  describe("Tool Execution", () => {
    test("CPU usage tool should return structured response", async () => {
      const result = await GET_CPU_USAGE_TOOL.execute({});
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
      expect(result).toHaveProperty("timestamp");
    });

    test("Memory usage tool should return structured response", async () => {
      const result = await GET_MEMORY_USAGE_TOOL.execute({});
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
      expect(result).toHaveProperty("timestamp");
    });

    test("Disk usage tool should return structured response", async () => {
      const result = await GET_DISK_USAGE_TOOL.execute({});
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
    });

    test("Battery status tool should return structured response", async () => {
      const result = await GET_BATTERY_STATUS_TOOL.execute({});
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
    });

    test("Network status tool should return structured response", async () => {
      const result = await GET_NETWORK_STATUS_TOOL.execute({});
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
    });

    test("System uptime tool should return structured response", async () => {
      const result = await GET_SYSTEM_UPTIME_TOOL.execute({});
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
    });

    test("Process summary tool should return structured response", async () => {
      const result = await GET_PROCESS_SUMMARY_TOOL.execute({});
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
    });

    test("Launch application tool should require application parameter", async () => {
      const result = await LAUNCH_APPLICATION_TOOL.execute({});
      expect(result).toHaveProperty("success");
      expect(result.success).toBe(false);
    });

    test("Launch application tool should reject invalid application", async () => {
      const result = await LAUNCH_APPLICATION_TOOL.execute({ application: "NonExistentApp123" });
      expect(result).toHaveProperty("success");
      expect(result.success).toBe(false);
    });
  });

  describe("Builtin Tools", () => {
    test("should include all macOS tools in builtin tools", () => {
      const tools = getBuiltinTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain("get_cpu_usage");
      expect(toolNames).toContain("get_memory_usage");
      expect(toolNames).toContain("get_disk_usage");
      expect(toolNames).toContain("get_battery_status");
      expect(toolNames).toContain("get_network_status");
      expect(toolNames).toContain("get_system_uptime");
      expect(toolNames).toContain("get_process_summary");
      expect(toolNames).toContain("launch_application");
    });

    test("should include all basic tools", () => {
      const tools = getBuiltinTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain("get_current_time");
      expect(toolNames).toContain("get_system_status");
      expect(toolNames).toContain("get_app_status");
      expect(toolNames).toContain("echo");
      expect(toolNames).toContain("list_available_tools");
    });

    test("should have at least 13 tools total", () => {
      const tools = getBuiltinTools();
      expect(tools.length).toBeGreaterThanOrEqual(13);
    });

    test("should have no duplicate tool names", () => {
      const tools = getBuiltinTools();
      const names = tools.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe("Tool Input Schemas", () => {
    test("CPU usage tool should have empty required properties", () => {
      expect(GET_CPU_USAGE_TOOL.inputSchema.required?.length || 0).toBe(0);
    });

    test("Launch application tool should require application parameter", () => {
      expect(LAUNCH_APPLICATION_TOOL.inputSchema.required).toContain("application");
    });

    test("Launch application tool should not allow additional properties", () => {
      expect(LAUNCH_APPLICATION_TOOL.inputSchema.additionalProperties).toBe(false);
    });
  });
});
