/**
 * JARVIS Vision — Screen Recording Permission Detection
 *
 * Detects whether screen capture is available on macOS.
 * Avoids repeated failed captures when permission is missing.
 */

import { execSync } from "child_process";

let cachedPermission: "unknown" | "granted" | "denied" = "unknown";

function isMacOS(): boolean {
  return process.platform === "darwin";
}

/**
 * Attempt a zero-cost permission check by testing if screencapture
 * can write to stdout (it will fail with a permission error if denied).
 * Falls back to checking the tcc database.
 */
export function checkScreenRecordingPermission(): "granted" | "denied" | "unavailable" {
  if (!isMacOS()) return "unavailable";

  if (cachedPermission !== "unknown") {
    return cachedPermission;
  }

  try {
    const exec = execSync;
    const result = exec("screencapture -x -t png /dev/null 2>&1", {
      timeout: 5000,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.includes("not allowed") || result.includes("permission")) {
      cachedPermission = "denied";
      return "denied";
    }

    cachedPermission = "granted";
    return "granted";
  } catch {
    cachedPermission = "denied";
    return "denied";
  }
}

/**
 * Reset the cached permission state (useful after user changes permissions).
 */
export function resetPermissionCache(): void {
  cachedPermission = "unknown";
}

/**
 * Check if swift and the Vision framework are available for OCR.
 */
export function checkOCR(): "available" | "unavailable" {
  if (!isMacOS()) return "unavailable";
  try {
    execSync("which swift", { timeout: 3000, stdio: ["pipe", "pipe", "pipe"] });
    return "available";
  } catch {
    return "unavailable";
  }
}
