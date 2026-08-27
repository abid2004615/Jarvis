/**
 * P10 Tests — Action Verifier
 */

import {
  captureSnapshot,
  verifyAction,
} from "@/lib/computer-use/verifier";
import type { ComputerAction } from "@/lib/computer-use/types";
import type { ScreenSnapshot } from "@/lib/computer-use/verifier";

describe("P10 Verifier", () => {
  describe("captureSnapshot", () => {
    it("should capture a snapshot with timestamp", () => {
      const snapshot = captureSnapshot();
      expect(snapshot).toHaveProperty("capturedAt");
      expect(snapshot.capturedAt).toBeGreaterThan(0);
    });

    it("should have frontmostApp or undefined", () => {
      const snapshot = captureSnapshot();
      expect(snapshot.frontmostApp === undefined || typeof snapshot.frontmostApp === "string").toBe(true);
    });
  });

  describe("verifyAction", () => {
    it("should verify click with no change as valid", () => {
      const action: ComputerAction = { type: "click", target: { role: "button", label: "Save", source: "accessibility" } };
      const before: ScreenSnapshot = { capturedAt: Date.now(), frontmostApp: "Safari", windowTitle: "Page" };
      const after: ScreenSnapshot = { capturedAt: Date.now(), frontmostApp: "Safari", windowTitle: "Page" };
      const result = verifyAction(action, before, after);
      expect(result.verified).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should verify click with app change", () => {
      const action: ComputerAction = { type: "click", target: { role: "button", label: "Open", source: "accessibility" } };
      const before: ScreenSnapshot = { capturedAt: Date.now(), frontmostApp: "Finder" };
      const after: ScreenSnapshot = { capturedAt: Date.now(), frontmostApp: "Safari" };
      const result = verifyAction(action, before, after);
      expect(result.verified).toBe(true);
      expect(result.changes.length).toBeGreaterThan(0);
    });

    it("should verify click with window title change", () => {
      const action: ComputerAction = { type: "click", target: { role: "tab", label: "Settings", source: "accessibility" } };
      const before: ScreenSnapshot = { capturedAt: Date.now(), frontmostApp: "Safari", windowTitle: "Home" };
      const after: ScreenSnapshot = { capturedAt: Date.now(), frontmostApp: "Safari", windowTitle: "Settings" };
      const result = verifyAction(action, before, after);
      expect(result.verified).toBe(true);
      expect(result.changes.some(c => c.includes("Window title"))).toBe(true);
    });

    it("should verify type action", () => {
      const action: ComputerAction = { type: "type", value: "hello" };
      const before: ScreenSnapshot = { capturedAt: Date.now(), frontmostApp: "Safari" };
      const after: ScreenSnapshot = { capturedAt: Date.now(), frontmostApp: "Safari" };
      const result = verifyAction(action, before, after);
      expect(result.verified).toBe(true);
    });

    it("should verify scroll with content change", () => {
      const action: ComputerAction = { type: "scroll", direction: "down" };
      const before: ScreenSnapshot = { capturedAt: Date.now(), ocrText: "Page 1 content" };
      const after: ScreenSnapshot = { capturedAt: Date.now(), ocrText: "Page 2 content" };
      const result = verifyAction(action, before, after);
      expect(result.verified).toBe(true);
      expect(result.changes.some(c => c.includes("scroll"))).toBe(true);
    });

    it("should verify scroll with no OCR as warning", () => {
      const action: ComputerAction = { type: "scroll", direction: "down" };
      const before: ScreenSnapshot = { capturedAt: Date.now() };
      const after: ScreenSnapshot = { capturedAt: Date.now() };
      const result = verifyAction(action, before, after);
      expect(result.verified).toBe(true);
      expect(result.warnings.some(w => w.includes("unavailable"))).toBe(true);
    });

    it("should verify focus_window with correct app", () => {
      const action: ComputerAction = { type: "focus_window", application: "Safari" };
      const before: ScreenSnapshot = { capturedAt: Date.now(), frontmostApp: "Finder" };
      const after: ScreenSnapshot = { capturedAt: Date.now(), frontmostApp: "Safari" };
      const result = verifyAction(action, before, after);
      expect(result.verified).toBe(true);
    });

    it("should verify focus_window with wrong app as failed", () => {
      const action: ComputerAction = { type: "focus_window", application: "Safari" };
      const before: ScreenSnapshot = { capturedAt: Date.now(), frontmostApp: "Finder" };
      const after: ScreenSnapshot = { capturedAt: Date.now(), frontmostApp: "Finder" };
      const result = verifyAction(action, before, after);
      expect(result.verified).toBe(false);
    });
  });
});
