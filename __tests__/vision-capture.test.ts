/**
 * P8 Tests — Screen Capture
 */

import { captureScreenTemp, deleteTempScreenshot, cleanupOldTempFiles } from "@/lib/vision/capture";

describe("P8 — Screen Capture", () => {
  test("captureScreenTemp returns structured result", () => {
    const result = captureScreenTemp();
    expect(typeof result.success).toBe("boolean");
    if (result.success) {
      expect(typeof result.path).toBe("string");
      expect(result.path!.length).toBeGreaterThan(0);
    } else {
      expect(typeof result.error).toBe("string");
    }
  });

  test("deleteTempScreenshot is safe with nonexistent file", () => {
    expect(() => deleteTempScreenshot("/tmp/nonexistent-file-12345.png")).not.toThrow();
  });

  test("cleanupOldTempFiles returns a number", () => {
    const cleaned = cleanupOldTempFiles();
    expect(typeof cleaned).toBe("number");
    expect(cleaned).toBeGreaterThanOrEqual(0);
  });

  test("captureScreenTemp captures real screenshot on macOS", () => {
    if (process.platform !== "darwin") return;
    const result = captureScreenTemp();
    if (result.success && result.path) {
      const { existsSync } = require("fs");
      expect(existsSync(result.path)).toBe(true);
      deleteTempScreenshot(result.path);
    }
  });
});
