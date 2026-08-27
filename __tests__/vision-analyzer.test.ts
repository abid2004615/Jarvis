/**
 * P8 Tests — Vision Analyzer
 */

import { analyzeScreenContext, hasVisualContent, getScreenSummary } from "@/lib/vision/analyzer";
import type { ScreenContext } from "@/lib/vision/types";

describe("P8 — Vision Analyzer", () => {
  const mockContext: ScreenContext = {
    capturedAt: Date.now(),
    frontmostApplication: { name: "Safari", bundleId: "com.apple.Safari" },
    activeWindow: { title: "Google Search" },
    screenshotAvailable: true,
    screenDimensions: { width: 2560, height: 1440 },
    ocrText: "Hello World\nSearch...",
    ocrConfidence: 0.95,
    ocrBlockCount: 2,
  };

  test("analyzeScreenContext returns structured analysis", () => {
    const analysis = analyzeScreenContext(mockContext);
    expect(analysis.description).toContain("Safari");
    expect(analysis.description).toContain("Google Search");
    expect(analysis.description).toContain("Hello World");
    expect(analysis.untrustedContent).toBe("Hello World\nSearch...");
    expect(typeof analysis.analyzedAt).toBe("number");
  });

  test("hasVisualContent detects OCR text", () => {
    expect(hasVisualContent(mockContext)).toBe(true);
    expect(hasVisualContent({ ...mockContext, ocrText: "" })).toBe(false);
    expect(hasVisualContent({ ...mockContext, ocrText: undefined })).toBe(false);
  });

  test("getScreenSummary returns bounded summary", () => {
    const summary = getScreenSummary(mockContext);
    expect(summary).toContain("Safari");
    expect(summary).toContain("Google Search");
    expect(summary.length).toBeLessThan(500);
  });

  test("analyzeScreenContext handles empty context", () => {
    const empty: ScreenContext = {
      capturedAt: Date.now(),
      screenshotAvailable: false,
    };
    const analysis = analyzeScreenContext(empty);
    expect(analysis.description).toContain("No screenshot available");
    expect(analysis.untrustedContent).toBe("");
  });
});
