/**
 * P12 Tests — Goal Planner
 */

import { generateSimplePlan } from "@/lib/goals/planner";

describe("P12 Goal Planner", () => {
  describe("generateSimplePlan", () => {
    it("should generate plan for battery check", () => {
      const result = generateSimplePlan("Check battery", "Check my battery status");
      expect(result.success).toBe(true);
      expect(result.steps).toBeDefined();
      expect(result.steps!.length).toBeGreaterThan(0);
      expect(result.steps![0].toolId).toBe("get_battery_status");
    });

    it("should generate plan for system summary", () => {
      const result = generateSimplePlan("System health", "Check system health");
      expect(result.success).toBe(true);
      expect(result.steps!.some((s) => s.toolId === "get_system_summary")).toBe(true);
    });

    it("should generate plan for opening application", () => {
      const result = generateSimplePlan("Open Safari", "Open Safari browser");
      expect(result.success).toBe(true);
      expect(result.steps!.some((s) => s.toolId === "launch_application")).toBe(true);
    });

    it("should generate plan for CPU check", () => {
      const result = generateSimplePlan("Check CPU", "What's my CPU usage?");
      expect(result.success).toBe(true);
      expect(result.steps!.some((s) => s.toolId === "get_cpu_usage")).toBe(true);
    });

    it("should generate plan for memory check", () => {
      const result = generateSimplePlan("Check memory", "How much RAM am I using?");
      expect(result.success).toBe(true);
      expect(result.steps!.some((s) => s.toolId === "get_memory_usage")).toBe(true);
    });

    it("should generate plan for disk check", () => {
      const result = generateSimplePlan("Check disk", "How much storage do I have?");
      expect(result.success).toBe(true);
      expect(result.steps!.some((s) => s.toolId === "get_disk_usage")).toBe(true);
    });

    it("should generate plan for running apps", () => {
      const result = generateSimplePlan("Running apps", "What applications are running?");
      expect(result.success).toBe(true);
      expect(result.steps!.some((s) => s.toolId === "get_running_applications")).toBe(true);
    });

    it("should generate plan for volume", () => {
      const result = generateSimplePlan("Set volume", "Set volume to 50");
      expect(result.success).toBe(true);
      expect(result.steps!.some((s) => s.toolId === "set_volume")).toBe(true);
    });

    it("should generate plan for URL navigation", () => {
      const result = generateSimplePlan("Go to URL", "Go to https://example.com");
      expect(result.success).toBe(true);
      expect(result.steps!.some((s) => s.toolId === "open_safari_url")).toBe(true);
    });

    it("should fail for unrecognized requests", () => {
      const result = generateSimplePlan("Mystery", "asdfghjkl");
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should generate multi-step plan for combined requests", () => {
      const result = generateSimplePlan("Full check", "Check my battery and CPU and memory");
      expect(result.success).toBe(true);
      expect(result.steps!.length).toBeGreaterThanOrEqual(2);
    });

    it("should generate safe steps for read-only tools", () => {
      const result = generateSimplePlan("Check battery", "Check battery");
      const batteryStep = result.steps!.find((s) => s.toolId === "get_battery_status");
      expect(batteryStep!.risk).toBe("safe");
      expect(batteryStep!.requiresConfirmation).toBe(false);
    });

    it("should generate confirmation steps for control tools", () => {
      const result = generateSimplePlan("Launch Safari", "Open Safari");
      const launchStep = result.steps!.find((s) => s.toolId === "launch_application");
      expect(launchStep!.risk).toBe("confirmation");
      expect(launchStep!.requiresConfirmation).toBe(true);
    });

    it("should generate steps with verification descriptions", () => {
      const result = generateSimplePlan("Check battery", "Check battery");
      for (const step of result.steps!) {
        expect(step.verification).toBeDefined();
        expect(step.verification.length).toBeGreaterThan(0);
      }
    });

    it("should generate steps with sequential IDs", () => {
      const result = generateSimplePlan("Full check", "Check battery and CPU");
      for (let i = 0; i < result.steps!.length; i++) {
        expect(result.steps![i].id).toBe(`step_${i + 1}`);
      }
    });
  });
});
