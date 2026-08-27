/**
 * JARVIS Vision — Screen Context Builder
 *
 * Combines frontmost application, active window, screenshot state,
 * and OCR text into a bounded ScreenContext.
 * Never permanently stores screenshots or injects them into conversation history.
 */

import { getFrontmostApplication } from "@/lib/macos/applications";
import { getActiveWindow } from "@/lib/macos/window";
import { captureScreenTemp, deleteTempScreenshot } from "./capture";
import type { CaptureResult } from "./capture";
import { performOCR } from "./ocr";
import { checkScreenRecordingPermission } from "./permissions";
import type { ScreenContext } from "./types";

let lastContext: ScreenContext | null = null;
let lastCaptureResult: CaptureResult | null = null;

/**
 * Build a ScreenContext by capturing the screen, reading OCR, and
 * gathering application metadata. The screenshot is deleted after OCR.
 */
export function buildScreenContext(): ScreenContext {
  const permission = checkScreenRecordingPermission();
  const frontmost = getFrontmostApplication();
  const activeWindow = getActiveWindow();

  const context: ScreenContext = {
    capturedAt: Date.now(),
    screenshotAvailable: false,
  };

  if (frontmost.available && frontmost.name) {
    context.frontmostApplication = {
      name: frontmost.name,
      bundleId: frontmost.bundleId,
    };
  }

  if (activeWindow.available && activeWindow.title) {
    context.activeWindow = {
      title: activeWindow.title,
    };
  }

  if (permission !== "granted") {
    lastContext = context;
    return context;
  }

  const capture = captureScreenTemp();
  lastCaptureResult = capture;

  if (capture.success && capture.path) {
    context.screenshotAvailable = true;
    context.screenshotPath = capture.path;

    if (capture.width && capture.height) {
      context.screenDimensions = {
        width: capture.width,
        height: capture.height,
      };
    }

    const ocr = performOCR(capture.path);
    if (!ocr.error) {
      context.ocrText = ocr.text;
      context.ocrConfidence = ocr.confidence;
      context.ocrBlockCount = ocr.blockCount;
    }

    deleteTempScreenshot(capture.path);
    context.screenshotPath = undefined;
  }

  lastContext = context;
  return context;
}

/**
 * Get the most recent screen context (short-lived, bounded).
 * Returns null if no context has been built yet.
 */
export function getLastContext(): ScreenContext | null {
  return lastContext;
}

/**
 * Clear the last context reference.
 */
export function clearContext(): void {
  lastContext = null;
  lastCaptureResult = null;
}

/**
 * Get the last capture result (for diagnostics).
 */
export function getLastCaptureResult(): CaptureResult | null {
  return lastCaptureResult;
}
