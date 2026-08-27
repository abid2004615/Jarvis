/**
 * P8 Tests — Vision Settings
 */

import { loadVisionSettings, saveVisionSettings, resetVisionSettings } from "@/lib/vision/settings";

describe("P8 — Vision Settings", () => {
  afterEach(() => {
    resetVisionSettings();
  });

  test("loadVisionSettings returns defaults when not in browser", () => {
    const settings = loadVisionSettings();
    expect(typeof settings.enabled).toBe("boolean");
    expect(typeof settings.screenAwareness).toBe("boolean");
    expect(typeof settings.autoChangeDetection).toBe("boolean");
    expect(settings.enabled).toBe(false);
    expect(settings.screenAwareness).toBe(false);
    expect(settings.autoChangeDetection).toBe(false);
  });

  test("saveVisionSettings is callable", () => {
    expect(() => saveVisionSettings({ enabled: true, screenAwareness: true, autoChangeDetection: false })).not.toThrow();
  });

  test("resetVisionSettings is callable", () => {
    expect(() => resetVisionSettings()).not.toThrow();
  });

  test("reset after save restores defaults", () => {
    saveVisionSettings({ enabled: true, screenAwareness: true, autoChangeDetection: true });
    resetVisionSettings();
    const settings = loadVisionSettings();
    expect(settings.enabled).toBe(false);
    expect(settings.screenAwareness).toBe(false);
  });
});
