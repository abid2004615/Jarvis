/**
 * P9 Tests — Window Management
 */

import { getActiveWindow, listWindows, focusApplication, minimizeWindow, closeWindow, getScreenDimensions } from "@/lib/macos/window";

describe("P9 — Window Management", () => {
  test("getActiveWindow returns structured result", () => {
    const result = getActiveWindow();
    expect(typeof result.available).toBe("boolean");
    if (result.available) {
      expect(typeof result.title).toBe("string");
      expect(result.title!.length).toBeGreaterThan(0);
      expect(result.title!.length).toBeLessThanOrEqual(200);
    }
  });

  test("listWindows returns structured result on macOS", () => {
    if (process.platform !== "darwin") return;
    const result = listWindows();
    expect(typeof result.available).toBe("boolean");
    expect(Array.isArray(result.windows)).toBe(true);
    expect(typeof result.count).toBe("number");
    if (result.available && result.windows.length > 0) {
      expect(typeof result.windows[0].application).toBe("string");
      expect(typeof result.windows[0].title).toBe("string");
    }
  });

  test("focusApplication returns structured result", () => {
    const result = focusApplication("");
    expect(result.success).toBe(false);
  });

  test("minimizeWindow returns structured result", () => {
    const result = minimizeWindow("");
    expect(result.success).toBe(false);
  });

  test("closeWindow returns structured result", () => {
    const result = closeWindow("");
    expect(result.success).toBe(false);
  });

  test("getScreenDimensions returns dimensions or null", () => {
    if (process.platform !== "darwin") return;
    const dims = getScreenDimensions();
    if (dims) {
      expect(typeof dims.width).toBe("number");
      expect(typeof dims.height).toBe("number");
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    }
  });
});
