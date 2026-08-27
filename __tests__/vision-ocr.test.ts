/**
 * P8 Tests — OCR
 */

import { performOCR } from "@/lib/vision/ocr";
import { captureScreenTemp, deleteTempScreenshot } from "@/lib/vision/capture";

describe("P8 — OCR", () => {
  test("performOCR returns structured result for nonexistent file", () => {
    const result = performOCR("/tmp/nonexistent-image-12345.png");
    expect(typeof result.text).toBe("string");
    expect(typeof result.confidence).toBe("number");
    expect(typeof result.blockCount).toBe("number");
    expect(result.error).toBeDefined();
  });

  test("performOCR on real screenshot on macOS", () => {
    if (process.platform !== "darwin") return;
    const capture = captureScreenTemp();
    if (!capture.success || !capture.path) return;

    const result = performOCR(capture.path);
    deleteTempScreenshot(capture.path);

    expect(typeof result.text).toBe("string");
    expect(typeof result.confidence).toBe("number");
    expect(typeof result.blockCount).toBe("number");
    expect(Array.isArray(result.blocks)).toBe(true);
  });

  test("performOCR returns empty result gracefully", () => {
    const result = performOCR("/dev/null");
    expect(result).toHaveProperty("text");
    expect(result).toHaveProperty("blocks");
    expect(result).toHaveProperty("confidence");
  });
});
