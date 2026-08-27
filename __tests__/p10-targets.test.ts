/**
 * P10 Tests — Target Resolution + Validation
 */

import {
  resolveTarget,
  validateTargetBounds,
  validateTargetOwnership,
} from "@/lib/computer-use/targets";
import type { UIElementTarget, ResolvedTarget } from "@/lib/computer-use/types";

describe("P10 Target Resolution", () => {
  describe("resolveTarget", () => {
    it("should reject target without label or role", () => {
      const target: UIElementTarget = {
        role: "unknown",
        source: "application",
      };
      const result = resolveTarget(target);
      expect(result.status).toBe("not_found");
    });

    it("should attempt resolution for target with label", () => {
      const target: UIElementTarget = {
        role: "button",
        label: "Save",
        source: "application",
      };
      const result = resolveTarget(target);
      // On macOS with accessibility, may find it; otherwise not_found
      expect(["resolved", "not_found", "ambiguous", "error"]).toContain(result.status);
    });

    it("should attempt resolution for target with role only", () => {
      const target: UIElementTarget = {
        role: "button",
        source: "application",
      };
      const result = resolveTarget(target);
      expect(["resolved", "not_found", "ambiguous", "error"]).toContain(result.status);
    });
  });

  describe("validateTargetBounds", () => {
    it("should accept valid target within bounds", () => {
      const target: ResolvedTarget = {
        x: 100,
        y: 200,
        width: 80,
        height: 30,
        centerX: 140,
        centerY: 215,
        role: "button",
        source: "accessibility",
        confidence: 0.95,
        validated: true,
      };
      const result = validateTargetBounds(target, { width: 1440, height: 900 });
      expect(result.valid).toBe(true);
    });

    it("should reject target with negative position", () => {
      const target: ResolvedTarget = {
        x: -200,
        y: -100,
        width: 80,
        height: 30,
        centerX: -160,
        centerY: -85,
        role: "button",
        source: "accessibility",
        confidence: 0.95,
        validated: true,
      };
      const result = validateTargetBounds(target, { width: 1440, height: 900 });
      expect(result.valid).toBe(false);
    });

    it("should reject target beyond screen dimensions", () => {
      const target: ResolvedTarget = {
        x: 2000,
        y: 1500,
        width: 80,
        height: 30,
        centerX: 2040,
        centerY: 1515,
        role: "button",
        source: "accessibility",
        confidence: 0.95,
        validated: true,
      };
      const result = validateTargetBounds(target, { width: 1440, height: 900 });
      expect(result.valid).toBe(false);
    });

    it("should reject target with zero dimensions", () => {
      const target: ResolvedTarget = {
        x: 100,
        y: 200,
        width: 0,
        height: 0,
        centerX: 100,
        centerY: 200,
        role: "button",
        source: "accessibility",
        confidence: 0.95,
        validated: true,
      };
      const result = validateTargetBounds(target, { width: 1440, height: 900 });
      expect(result.valid).toBe(false);
    });
  });

  describe("validateTargetOwnership", () => {
    it("should accept target without ownership constraints", () => {
      const target: ResolvedTarget = {
        x: 100,
        y: 200,
        width: 80,
        height: 30,
        centerX: 140,
        centerY: 215,
        role: "button",
        source: "accessibility",
        confidence: 0.95,
        validated: true,
      };
      const result = validateTargetOwnership(target);
      expect(result.valid).toBe(true);
    });

    it("should accept target with matching application", () => {
      const target: ResolvedTarget = {
        x: 100,
        y: 200,
        width: 80,
        height: 30,
        centerX: 140,
        centerY: 215,
        role: "button",
        source: "accessibility",
        confidence: 0.95,
        validated: true,
        application: "Safari",
      };
      const result = validateTargetOwnership(target, "Safari");
      expect(result.valid).toBe(true);
    });

    it("should reject target with mismatched application", () => {
      const target: ResolvedTarget = {
        x: 100,
        y: 200,
        width: 80,
        height: 30,
        centerX: 140,
        centerY: 215,
        role: "button",
        source: "accessibility",
        confidence: 0.95,
        validated: true,
        application: "Finder",
      };
      const result = validateTargetOwnership(target, "Safari");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Finder");
      expect(result.reason).toContain("Safari");
    });

    it("should reject target with mismatched window title", () => {
      const target: ResolvedTarget = {
        x: 100,
        y: 200,
        width: 80,
        height: 30,
        centerX: 140,
        centerY: 215,
        role: "button",
        source: "accessibility",
        confidence: 0.95,
        validated: true,
        windowTitle: "Login",
      };
      const result = validateTargetOwnership(target, undefined, "Dashboard");
      expect(result.valid).toBe(false);
    });
  });
});
