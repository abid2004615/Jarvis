/**
 * Tests for macOS Telemetry
 * Validates real system data collection with mocking
 */

import {
  getCPUUsage,
  getMemoryUsage,
  getDiskUsage,
  getBatteryStatus,
  getNetworkStatus,
  getSystemUptime,
  getProcessSummary,
} from "@/lib/macos/telemetry";

describe("macOS Telemetry", () => {
  // Note: These tests run on the actual system
  // On non-macOS systems, they will return available: false
  // On macOS systems, they will return real data

  describe("getCPUUsage", () => {
    test("should return a valid telemetry result structure", () => {
      const result = getCPUUsage();
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
    });

    test("should return percentUsed if available", () => {
      const result = getCPUUsage();
      if (result.available) {
        expect(result.percentUsed).toBeDefined();
        expect(typeof result.percentUsed).toBe("number");
        expect(result.percentUsed).toBeGreaterThanOrEqual(0);
        expect(result.percentUsed).toBeLessThanOrEqual(100);
      }
    });

    test("should return coreCount if available", () => {
      const result = getCPUUsage();
      if (result.available && result.coreCount) {
        expect(typeof result.coreCount).toBe("number");
        expect(result.coreCount).toBeGreaterThan(0);
      }
    });

    test("should return error message if unavailable", () => {
      const result = getCPUUsage();
      if (!result.available) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe("string");
      }
    });
  });

  describe("getMemoryUsage", () => {
    test("should return a valid telemetry result structure", () => {
      const result = getMemoryUsage();
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
    });

    test("should return memory metrics if available", () => {
      const result = getMemoryUsage();
      if (result.available) {
        expect(result.usedGB).toBeDefined();
        expect(result.totalGB).toBeDefined();
        expect(result.percentUsed).toBeDefined();

        expect(typeof result.usedGB).toBe("number");
        expect(typeof result.totalGB).toBe("number");
        expect(typeof result.percentUsed).toBe("number");

        expect(result.usedGB).toBeGreaterThanOrEqual(0);
        expect(result.totalGB).toBeGreaterThan(0);
        expect(result.percentUsed).toBeGreaterThanOrEqual(0);
        expect(result.percentUsed).toBeLessThanOrEqual(100);
        expect(result.usedGB).toBeLessThanOrEqual(result.totalGB);
      }
    });
  });

  describe("getDiskUsage", () => {
    test("should return a valid telemetry result structure", () => {
      const result = getDiskUsage();
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
    });

    test("should return disk metrics if available", () => {
      const result = getDiskUsage();
      if (result.available) {
        expect(result.usedGB).toBeDefined();
        expect(result.totalGB).toBeDefined();
        expect(result.percentUsed).toBeDefined();

        expect(result.usedGB).toBeGreaterThanOrEqual(0);
        expect(result.totalGB).toBeGreaterThan(0);
        expect(result.percentUsed).toBeGreaterThanOrEqual(0);
        expect(result.percentUsed).toBeLessThanOrEqual(100);
        expect(result.usedGB).toBeLessThanOrEqual(result.totalGB);
      }
    });
  });

  describe("getBatteryStatus", () => {
    test("should return a valid telemetry result structure", () => {
      const result = getBatteryStatus();
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
    });

    test("should return battery metrics if available", () => {
      const result = getBatteryStatus();
      if (result.available) {
        expect(result.percentCharged).toBeDefined();
        expect(result.isCharging).toBeDefined();

        expect(typeof result.percentCharged).toBe("number");
        expect(typeof result.isCharging).toBe("boolean");

        expect(result.percentCharged).toBeGreaterThanOrEqual(0);
        expect(result.percentCharged).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("getNetworkStatus", () => {
    test("should return a valid telemetry result structure", () => {
      const result = getNetworkStatus();
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
    });

    test("should return network metrics if available", () => {
      const result = getNetworkStatus();
      if (result.available) {
        expect(result.bytesReceivedPerSecond).toBeDefined();
        expect(result.bytesSentPerSecond).toBeDefined();

        expect(typeof result.bytesReceivedPerSecond).toBe("number");
        expect(typeof result.bytesSentPerSecond).toBe("number");

        expect(result.bytesReceivedPerSecond).toBeGreaterThanOrEqual(0);
        expect(result.bytesSentPerSecond).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("getSystemUptime", () => {
    test("should return a valid telemetry result structure", () => {
      const result = getSystemUptime();
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
    });

    test("should return uptime in seconds if available", () => {
      const result = getSystemUptime();
      if (result.available) {
        expect(result.uptimeSeconds).toBeDefined();
        expect(typeof result.uptimeSeconds).toBe("number");
        expect(result.uptimeSeconds).toBeGreaterThan(0);
      }
    });
  });

  describe("getProcessSummary", () => {
    test("should return a valid telemetry result structure", () => {
      const result = getProcessSummary();
      expect(result).toHaveProperty("available");
      expect(typeof result.available).toBe("boolean");
    });

    test("should return process count if available", () => {
      const result = getProcessSummary();
      if (result.available) {
        expect(result.totalProcessCount).toBeDefined();
        expect(typeof result.totalProcessCount).toBe("number");
        expect(result.totalProcessCount).toBeGreaterThan(0);
      }
    });
  });
});
