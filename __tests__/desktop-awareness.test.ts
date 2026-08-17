/**
 * P4 — Desktop Awareness Tests
 * Validates the read-only macOS awareness tools:
 *  - get_frontmost_application (name required, bundle id best-effort)
 *  - get_running_applications (bounded to 15)
 *  - get_system_summary (combined snapshot with all telemetry sections)
 *  - get_active_window (honest unavailable result rather than fabricated data)
 *
 * These run against the real (or test) host: on non-macOS hosts they must
 * still return well-formed, honest structured results and never throw.
 */

import {
  GET_FRONTMOST_APPLICATION_TOOL,
  GET_RUNNING_APPLICATIONS_TOOL,
  GET_SYSTEM_SUMMARY_TOOL,
  GET_ACTIVE_WINDOW_TOOL,
  getBuiltinTools,
} from "@/lib/tools/registry";

describe("P4 Desktop Awareness", () => {
  describe("get_frontmost_application", () => {
    test("should be a safe, read-only tool", () => {
      expect(GET_FRONTMOST_APPLICATION_TOOL.name).toBe("get_frontmost_application");
      expect(GET_FRONTMOST_APPLICATION_TOOL.riskLevel).toBe("safe");
      expect(GET_FRONTMOST_APPLICATION_TOOL.requiresUserConfirmation).toBe(false);
      expect(GET_FRONTMOST_APPLICATION_TOOL.inputSchema.additionalProperties).toBe(false);
    });

    test("should return a well-formed result", async () => {
      const result = await GET_FRONTMOST_APPLICATION_TOOL.execute({});
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");

      if (result.available) {
        expect(typeof result.name).toBe("string");
        expect((result.name as string).length).toBeGreaterThan(0);
        // bundle id is optional (best-effort) but must be a string when present
        if (result.bundleId !== undefined) {
          expect(typeof result.bundleId).toBe("string");
        }
      } else {
        expect(typeof result.error).toBe("string");
      }
    });
  });

  describe("get_running_applications", () => {
    test("should be a safe, read-only tool", () => {
      expect(GET_RUNNING_APPLICATIONS_TOOL.name).toBe("get_running_applications");
      expect(GET_RUNNING_APPLICATIONS_TOOL.riskLevel).toBe("safe");
      expect(GET_RUNNING_APPLICATIONS_TOOL.requiresUserConfirmation).toBe(false);
    });

    test("should return at most 15 applications", async () => {
      const result = await GET_RUNNING_APPLICATIONS_TOOL.execute({});
      expect(result).toHaveProperty("available");

      if (result.available && Array.isArray(result.applications)) {
        expect(result.applications.length).toBeLessThanOrEqual(15);
        for (const app of result.applications as Array<{ name: string }>) {
          expect(typeof app.name).toBe("string");
        }
      } else {
        // On non-macOS hosts the honest result is available: false
        expect(typeof result.error).toBe("string");
      }
    });
  });

  describe("get_system_summary", () => {
    test("should be a safe, read-only tool", () => {
      expect(GET_SYSTEM_SUMMARY_TOOL.name).toBe("get_system_summary");
      expect(GET_SYSTEM_SUMMARY_TOOL.riskLevel).toBe("safe");
      expect(GET_SYSTEM_SUMMARY_TOOL.requiresUserConfirmation).toBe(false);
    });

    test("should return a combined snapshot with all sections", async () => {
      const result = await GET_SYSTEM_SUMMARY_TOOL.execute({});
      expect(result.available).toBe(true);
      expect(result).toHaveProperty("cpu");
      expect(result).toHaveProperty("memory");
      expect(result).toHaveProperty("disk");
      expect(result).toHaveProperty("battery");
      expect(result).toHaveProperty("network");
      expect(result).toHaveProperty("uptime");
      expect(result).toHaveProperty("frontmost");
      expect(result).toHaveProperty("timestamp");

      for (const section of ["cpu", "memory", "disk", "battery", "network", "uptime"] as const) {
        const value = result[section];
        expect(value).toHaveProperty("available");
        expect(typeof value.available).toBe("boolean");
      }

      expect(result.frontmost).toHaveProperty("available");
      expect(typeof result.timestamp).toBe("string");
    });
  });

  describe("get_active_window", () => {
    test("should be a safe, read-only tool", () => {
      expect(GET_ACTIVE_WINDOW_TOOL.name).toBe("get_active_window");
      expect(GET_ACTIVE_WINDOW_TOOL.riskLevel).toBe("safe");
      expect(GET_ACTIVE_WINDOW_TOOL.requiresUserConfirmation).toBe(false);
    });

    test("should return honest data or active_window_unavailable", async () => {
      const result = await GET_ACTIVE_WINDOW_TOOL.execute({});

      if (result.success === true) {
        expect(typeof result.title).toBe("string");
        expect((result.title as string).length).toBeGreaterThan(0);
      } else {
        // Never fabricate: when the window can't be read we say so.
        expect(result.error).toBe("active_window_unavailable");
      }
    });

    test("should never leak internal errors", async () => {
      const result = await GET_ACTIVE_WINDOW_TOOL.execute({});
      const serialized = JSON.stringify(result);
      expect(serialized).not.toMatch(/spawnSync|ENOENT|osascript/i);
      expect(serialized).not.toMatch(/\/(Users|System|Applications)/);
    });
  });

  describe("Registry integration", () => {
    test("should register both new tools in the builtin list", () => {
      const tools = getBuiltinTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain("get_system_summary");
      expect(names).toContain("get_active_window");
      expect(names).toContain("get_frontmost_application");
      expect(names).toContain("get_running_applications");
      expect(new Set(names).size).toBe(names.length);
    });
  });
});
