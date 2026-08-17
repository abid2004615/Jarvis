/**
 * macOS Screen Brightness
 * macOS exposes NO public API for display brightness control. This module
 * reads the backlight level from IORegistry where possible (best effort) and
 * ALWAYS returns a structured "unavailable" result for writes — it never
 * fakes a brightness change it could not perform.
 *
 * Note: This module uses child_process which is Node.js-only.
 * It cannot be used in browser/client code.
 */

import type { BrightnessStatus } from "./types";

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

function safeExecSync(command: string): string {
  if (!isMacOS()) return "";
  try {
    const exec = getExecSync();
    if (!exec) return "";
    return exec(command, {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

/**
 * Get the current screen brightness percentage (0-100).
 * Reads the backlight value from IORegistry. On systems where it is not
 * readable (many Macs without a supported backlight entry), returns
 * available:false — never a fabricated number.
 */
export function getBrightnessStatus(): BrightnessStatus {
  const timestamp = Date.now();
  if (!isMacOS()) {
    return { available: false, error: "Not running on macOS", timestamp };
  }

  const output = safeExecSync("ioreg -r -c AppleBacklightDisplay -d 1");
  let brightness: number | null = null;
  for (const line of output.split("\n")) {
    const match = line.match(/"brightness"\s*=\s*(\d+(?:\.\d+)?)/);
    if (match) {
      brightness = parseFloat(match[1]);
      if (brightness > 1) {
        // Some systems report 0-100 instead of 0-1
        brightness = brightness / 100;
      }
      break;
    }
  }

  if (brightness === null) {
    return {
      available: false,
      error: "Screen brightness is not readable on this system",
      timestamp,
    };
  }

  return {
    available: true,
    brightnessPercent: Math.round(Math.min(1, Math.max(0, brightness)) * 100),
    timestamp,
  };
}

export interface SetBrightnessOptions {
  level?: number;
  delta?: number;
}

export type SetBrightnessValidation =
  | { valid: true; options: SetBrightnessOptions }
  | { valid: false; error: string };

/**
 * Validate brightness arguments (same constraints as volume).
 */
export function validateSetBrightness(input: Record<string, unknown>): SetBrightnessValidation {
  const options: SetBrightnessOptions = {};

  if (input.level !== undefined) {
    if (typeof input.level !== "number" || !Number.isInteger(input.level)) {
      return { valid: false, error: "level must be an integer" };
    }
    if (input.level < 0 || input.level > 100) {
      return { valid: false, error: "level must be between 0 and 100" };
    }
    options.level = input.level;
  }

  if (input.delta !== undefined) {
    if (typeof input.delta !== "number" || !Number.isInteger(input.delta)) {
      return { valid: false, error: "delta must be an integer" };
    }
    if (input.delta < -100 || input.delta > 100) {
      return { valid: false, error: "delta must be between -100 and 100" };
    }
    options.delta = input.delta;
  }

  if (options.level === undefined && options.delta === undefined) {
    return { valid: false, error: "one of level or delta is required" };
  }

  return { valid: true, options };
}

export interface SetBrightnessResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Change the screen brightness. macOS has no safe public mechanism for this,
 * so JARVIS ALWAYS returns a structured "unavailable" result instead of
 * claiming success. Input is still validated for a consistent interface.
 */
export function setBrightness(input: Record<string, unknown>): SetBrightnessResult {
  if (!isMacOS()) {
    return { success: false, message: "Brightness control only available on macOS", error: "Not running on macOS" };
  }

  const validation = validateSetBrightness(input);
  if (!validation.valid) {
    return { success: false, message: validation.error, error: validation.error };
  }

  return {
    success: false,
    message:
      "Screen brightness cannot be changed safely on this Mac. Apple does not expose a public API for display brightness.",
    error: "brightness_control_unavailable",
  };
}
