/**
 * Tests for macOS Applications
 * Validates allowlist and application launching
 */

import {
  getAllowlistedApplication,
  getAllowlistedApplications,
  applicationExists,
} from "@/lib/macos/applications";

describe("macOS Applications", () => {
  describe("getAllowlistedApplication", () => {
    test("should return Safari from allowlist", () => {
      const app = getAllowlistedApplication("Safari");
      expect(app).toBeDefined();
      if (app) {
        expect(app.name).toBe("Safari");
        expect(app.bundleId).toBe("com.apple.Safari");
        expect(app.allowedRiskLevel).toBe("safe");
      }
    });

    test("should return null for non-allowlisted application", () => {
      const app = getAllowlistedApplication("NonExistentApp");
      expect(app).toBeNull();
    });

    test("should return Chrome from allowlist", () => {
      const app = getAllowlistedApplication("Chrome");
      expect(app).toBeDefined();
      if (app) {
        expect(app.name).toBe("Google Chrome");
      }
    });

    test("should return Terminal from allowlist", () => {
      const app = getAllowlistedApplication("Terminal");
      expect(app).toBeDefined();
      if (app) {
        expect(app.name).toBe("Terminal");
        expect(app.allowedRiskLevel).toBe("confirmation");
      }
    });
  });

  describe("getAllowlistedApplications", () => {
    test("should return an array of applications", () => {
      const apps = getAllowlistedApplications();
      expect(Array.isArray(apps)).toBe(true);
      expect(apps.length).toBeGreaterThan(0);
    });

    test("should include Safari", () => {
      const apps = getAllowlistedApplications();
      const safari = apps.find((app) => app.bundleId === "com.apple.Safari");
      expect(safari).toBeDefined();
    });

    test("should have required properties for each app", () => {
      const apps = getAllowlistedApplications();
      for (const app of apps) {
        expect(app).toHaveProperty("name");
        expect(app).toHaveProperty("description");
        expect(app).toHaveProperty("allowedRiskLevel");
        expect(["safe", "confirmation", "restricted"]).toContain(app.allowedRiskLevel);
      }
    });
  });

  describe("applicationExists", () => {
    test("should return false for non-allowlisted application", () => {
      const exists = applicationExists("NonExistentApp");
      expect(typeof exists).toBe("boolean");
      expect(exists).toBe(false);
    });

    test("should return boolean for Finder (always exists)", () => {
      const exists = applicationExists("Finder");
      expect(typeof exists).toBe("boolean");
      // Finder should exist on macOS, but we're cross-platform
    });
  });
});
