/**
 * JARVIS Vision — Controlled Screen Capture
 *
 * Captures screenshots to a temporary directory with automatic cleanup.
 * Never permanently stores screenshots unless explicitly requested.
 * Never logs image contents.
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const VISION_TEMP_DIR = join(tmpdir(), "jarvis-vision");
const MAX_TEMP_AGE_MS = 60_000;

let execSyncRef: typeof import("child_process").execSync | null = null;

function getExec() {
  if (execSyncRef === null) {
    try {
      execSyncRef = require("child_process").execSync;
    } catch {
      return null;
    }
  }
  return execSyncRef;
}

function isMacOS(): boolean {
  return process.platform === "darwin";
}

function ensureTempDir(): string {
  if (!existsSync(VISION_TEMP_DIR)) {
    mkdirSync(VISION_TEMP_DIR, { recursive: true });
  }
  return VISION_TEMP_DIR;
}

export interface CaptureResult {
  success: boolean;
  path?: string;
  error?: string;
  width?: number;
  height?: number;
}

/**
 * Capture the current screen to a temporary file.
 * The file is intended to be analyzed and then deleted.
 */
export function captureScreenTemp(): CaptureResult {
  if (!isMacOS()) {
    return { success: false, error: "Screen capture only available on macOS" };
  }

  const exec = getExec();
  if (!exec) {
    return { success: false, error: "child_process not available" };
  }

  try {
    const dir = ensureTempDir();
    const stamp = Date.now();
    const outputPath = join(dir, `frame-${stamp}.png`);

    exec(`screencapture -x "${outputPath}"`, {
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (!existsSync(outputPath)) {
      return { success: false, error: "Screen capture failed — file not created. Screen Recording permission may be required." };
    }

    let width = 0;
    let height = 0;
    try {
      const info = exec(`sips -g pixelWidth -g pixelHeight "${outputPath}" 2>/dev/null`, {
        timeout: 5000,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const wMatch = info.match(/pixelWidth:\s*(\d+)/);
      const hMatch = info.match(/pixelHeight:\s*(\d+)/);
      if (wMatch) width = parseInt(wMatch[1], 10);
      if (hMatch) height = parseInt(hMatch[1], 10);
    } catch {
      // dimensions are optional
    }

    return { success: true, path: outputPath, width, height };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg.includes("not allowed") || msg.includes("permission")) {
      return { success: false, error: "Screen Recording permission is required to see your screen." };
    }
    return { success: false, error: `Screen capture failed: ${msg.slice(0, 200)}` };
  }
}

/**
 * Delete a temporary screenshot file. Safe to call multiple times.
 */
export function deleteTempScreenshot(filePath: string): void {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // best-effort cleanup
  }
}

/**
 * Clean up all temporary vision files older than MAX_TEMP_AGE_MS.
 */
export function cleanupOldTempFiles(): number {
  if (!existsSync(VISION_TEMP_DIR)) return 0;
  let cleaned = 0;
  const now = Date.now();
  try {
    const files = readdirSync(VISION_TEMP_DIR);
    for (const file of files) {
      if (!file.startsWith("frame-") || !file.endsWith(".png")) continue;
      const filePath = join(VISION_TEMP_DIR, file);
      try {
        const stat = require("fs").statSync(filePath);
        if (now - stat.mtimeMs > MAX_TEMP_AGE_MS) {
          unlinkSync(filePath);
          cleaned++;
        }
      } catch {
        // skip
      }
    }
  } catch {
    // best-effort
  }
  return cleaned;
}
