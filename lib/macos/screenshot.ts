/**
 * macOS Screenshot Capture
 * Uses `screencapture -x` with a fully controlled output path inside the
 * user's Pictures/JARVIS directory. Arbitrary output paths are never accepted.
 *
 * Note: This module uses child_process which is Node.js-only.
 * It cannot be used in browser/client code.
 */

import { homedir } from "os";
import path from "path";

import type { ScreenshotResult } from "./types";

// Lazy-load child_process only when needed (server-side)
let execSync: typeof import("child_process").execSync | null = null;

function getExecSync() {
  if (execSync === null) {
    try {
      execSync = require("child_process").execSync;
    } catch (error) {
      return null;
    }
  }
  return execSync;
}

function isMacOS(): boolean {
  return process.platform === "darwin";
}

export const SCREENSHOT_DIR_NAME = "JARVIS";

/**
 * The dedicated JARVIS screenshot directory (user-controlled, fixed).
 */
export function getScreenshotDirectory(): string {
  return path.join(homedir(), "Pictures", SCREENSHOT_DIR_NAME);
}

/**
 * Build a timestamped screenshot filename inside the controlled directory.
 */
export function buildScreenshotPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(getScreenshotDirectory(), `jarvis-${stamp}.png`);
}

/**
 * Capture the screen to the controlled JARVIS directory.
 * Fails with a structured error (never a fabricated success) if the capture
 * cannot be performed, e.g. when Screen Recording permission is missing.
 */
export function takeScreenshot(): ScreenshotResult {
  if (!isMacOS()) {
    return {
      success: false,
      message: "Screenshots only available on macOS",
      error: "Not running on macOS",
    };
  }

  try {
    const exec = getExecSync();
    if (!exec) {
      return { success: false, message: "Unable to take a screenshot: child_process not available" };
    }

    const directory = getScreenshotDirectory();
    exec(`mkdir -p "${directory}"`, { timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });

    const outputPath = buildScreenshotPath();
    exec(`screencapture -x "${outputPath}"`, { timeout: 15000, stdio: ["pipe", "pipe", "pipe"] });

    return { success: true, path: outputPath, message: "Screenshot captured successfully" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message: "Failed to capture screenshot", error: message.slice(0, 300) };
  }
}
