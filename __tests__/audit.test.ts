/**
 * Tests for Audit Logger
 * Validates logging, sanitization, and statistics
 */

import {
  logToolExecution,
  getAuditLog,
  getAuditLogForTool,
  getAuditStats,
  clearAuditLog,
} from "@/lib/audit/logger";

describe("Audit Logger", () => {
  beforeEach(() => {
    // Clear log before each test
    clearAuditLog();
  });

  describe("logToolExecution", () => {
    test("should log a tool execution", () => {
      logToolExecution(
        "test_tool",
        "safe",
        { arg1: "value1" },
        { allowed: true },
        { attempted: true, success: true, duration: 100 },
      );

      const logs = getAuditLog();
      expect(logs.length).toBe(1);
      expect(logs[0].toolName).toBe("test_tool");
      expect(logs[0].riskLevel).toBe("safe");
    });

    test("should sanitize sensitive arguments", () => {
      logToolExecution(
        "test_tool",
        "safe",
        { password: "secret123", username: "user" },
        { allowed: true },
        { attempted: true, success: true, duration: 100 },
      );

      const logs = getAuditLog();
      expect(logs[0].arguments.password).toBe("[REDACTED]");
      expect(logs[0].arguments.username).toBe("user");
    });

    test("should sanitize API keys", () => {
      logToolExecution(
        "test_tool",
        "safe",
        { apiKey: "sk-123456", config: { key: "value" } },
        { allowed: true },
        { attempted: true, success: true, duration: 100 },
      );

      const logs = getAuditLog();
      expect(logs[0].arguments.apiKey).toBe("[REDACTED]");
    });

    test("should include timestamp in ISO format", () => {
      logToolExecution(
        "test_tool",
        "safe",
        {},
        { allowed: true },
        { attempted: true, success: true, duration: 100 },
      );

      const logs = getAuditLog();
      expect(logs[0].iso).toBeDefined();
      expect(logs[0].iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("getAuditLog", () => {
    test("should return empty array initially", () => {
      const logs = getAuditLog();
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBe(0);
    });

    test("should return all logged executions", () => {
      logToolExecution("tool1", "safe", {}, { allowed: true }, { attempted: true, success: true, duration: 10 });
      logToolExecution("tool2", "safe", {}, { allowed: true }, { attempted: true, success: true, duration: 10 });
      logToolExecution("tool3", "safe", {}, { allowed: false, reason: "denied" }, { attempted: false, success: false, duration: 0 });

      const logs = getAuditLog();
      expect(logs.length).toBe(3);
      expect(logs[0].toolName).toBe("tool1");
      expect(logs[1].toolName).toBe("tool2");
      expect(logs[2].toolName).toBe("tool3");
    });
  });

  describe("getAuditLogForTool", () => {
    test("should return logs for specific tool only", () => {
      logToolExecution("tool1", "safe", {}, { allowed: true }, { attempted: true, success: true, duration: 10 });
      logToolExecution("tool2", "safe", {}, { allowed: true }, { attempted: true, success: true, duration: 10 });
      logToolExecution("tool1", "safe", {}, { allowed: true }, { attempted: true, success: true, duration: 10 });

      const logs = getAuditLogForTool("tool1");
      expect(logs.length).toBe(2);
      expect(logs.every((log) => log.toolName === "tool1")).toBe(true);
    });

    test("should return empty array for tool with no logs", () => {
      logToolExecution("tool1", "safe", {}, { allowed: true }, { attempted: true, success: true, duration: 10 });

      const logs = getAuditLogForTool("nonexistent");
      expect(logs.length).toBe(0);
    });
  });

  describe("getAuditStats", () => {
    test("should return correct statistics", () => {
      logToolExecution("tool1", "safe", {}, { allowed: true }, { attempted: true, success: true, duration: 10 });
      logToolExecution("tool2", "safe", {}, { allowed: false, reason: "denied" }, { attempted: false, success: false, duration: 0 });
      logToolExecution("tool1", "confirmation", {}, { allowed: true }, { attempted: true, success: false, duration: 50 });

      const stats = getAuditStats();
      expect(stats.totalRecords).toBe(3);
      expect(stats.permissionsAllowed).toBe(2);
      expect(stats.permissionsDenied).toBe(1);
      expect(stats.executionSuccessful).toBe(1);
      expect(stats.executionFailed).toBe(1);
    });

    test("should track statistics by tool", () => {
      logToolExecution("tool1", "safe", {}, { allowed: true }, { attempted: true, success: true, duration: 10 });
      logToolExecution("tool2", "safe", {}, { allowed: false }, { attempted: false, success: false, duration: 0 });
      logToolExecution("tool1", "safe", {}, { allowed: true }, { attempted: true, success: false, duration: 20 });

      const stats = getAuditStats();
      expect(stats.byTool.tool1.allowed).toBe(2);
      expect(stats.byTool.tool1.successful).toBe(1);
      expect(stats.byTool.tool1.failed).toBe(1);
      expect(stats.byTool.tool2.denied).toBe(1);
    });

    test("should return zero stats when log is empty", () => {
      const stats = getAuditStats();
      expect(stats.totalRecords).toBe(0);
      expect(stats.permissionsAllowed).toBe(0);
      expect(stats.permissionsDenied).toBe(0);
      expect(stats.executionSuccessful).toBe(0);
      expect(stats.executionFailed).toBe(0);
    });
  });

  describe("clearAuditLog", () => {
    test("should clear all audit records", () => {
      logToolExecution("tool1", "safe", {}, { allowed: true }, { attempted: true, success: true, duration: 10 });
      logToolExecution("tool2", "safe", {}, { allowed: true }, { attempted: true, success: true, duration: 10 });

      let logs = getAuditLog();
      expect(logs.length).toBe(2);

      clearAuditLog();

      logs = getAuditLog();
      expect(logs.length).toBe(0);
    });
  });
});
