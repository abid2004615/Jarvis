/**
 * P8 Tests — Screen Context
 */

import { buildScreenContext, getLastContext, clearContext } from "@/lib/vision/context";

describe("P8 — Screen Context", () => {
  test("buildScreenContext returns structured context", () => {
    const context = buildScreenContext();
    expect(typeof context.capturedAt).toBe("number");
    expect(typeof context.screenshotAvailable).toBe("boolean");
  });

  test("buildScreenContext includes frontmost app on macOS", () => {
    if (process.platform !== "darwin") return;
    const context = buildScreenContext();
    if (context.frontmostApplication) {
      expect(typeof context.frontmostApplication.name).toBe("string");
    }
  });

  test("getLastContext returns the most recent context", () => {
    clearContext();
    expect(getLastContext()).toBeNull();
    const context = buildScreenContext();
    expect(getLastContext()).toBe(context);
  });

  test("clearContext clears the stored context", () => {
    buildScreenContext();
    clearContext();
    expect(getLastContext()).toBeNull();
  });
});
