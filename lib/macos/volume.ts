/**
 * macOS Volume Control
 * Safe, structured volume read/write using `osascript` with hardcoded
 * command templates. Input values are strictly validated (level 0-100,
 * delta -100..100, muted boolean). Arbitrary command strings are never used.
 *
 * Note: This module uses child_process which is Node.js-only.
 * It cannot be used in browser/client code.
 */

import type { VolumeStatus } from "./types";

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
 * Parse `osascript -e 'get volume settings'` output:
 * e.g. "output volume:62, input volume:74, alert volume:91, output muted:false"
 */
export function parseVolumeSettings(output: string): { volumePercent: number; muted: boolean } | null {
  const volMatch = output.match(/output volume:(\d+)/);
  if (!volMatch) return null;
  const mutedMatch = output.match(/output muted:(\w+)/);
  return {
    volumePercent: Math.min(100, Math.max(0, parseInt(volMatch[1], 10))),
    muted: mutedMatch ? mutedMatch[1] === "true" : false,
  };
}

/**
 * Get the current output volume and mute state (read-only)
 */
export function getVolumeStatus(): VolumeStatus {
  const timestamp = Date.now();
  if (!isMacOS()) {
    return { available: false, error: "Not running on macOS", timestamp };
  }

  const output = safeExecSync("osascript -e 'get volume settings'");
  const parsed = parseVolumeSettings(output);
  if (!parsed) {
    return { available: false, error: "Could not read volume settings", timestamp };
  }

  return {
    available: true,
    volumePercent: parsed.volumePercent,
    muted: parsed.muted,
    timestamp,
  };
}

export interface SetVolumeOptions {
  level?: number;
  delta?: number;
  muted?: boolean;
}

export type SetVolumeValidation =
  | { valid: true; options: SetVolumeOptions }
  | { valid: false; error: string };

/**
 * Validate user/model-supplied volume arguments. Enforces integer bounds;
 * rejects strings, out-of-range values, and missing operations.
 */
export function validateSetVolume(input: Record<string, unknown>): SetVolumeValidation {
  const options: SetVolumeOptions = {};

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

  if (input.muted !== undefined) {
    if (typeof input.muted !== "boolean") {
      return { valid: false, error: "muted must be a boolean" };
    }
    options.muted = input.muted;
  }

  if (options.level === undefined && options.delta === undefined && options.muted === undefined) {
    return { valid: false, error: "one of level, delta, or muted is required" };
  }

  return { valid: true, options };
}

export interface SetVolumeResult {
  success: boolean;
  message: string;
  volumePercent?: number;
  muted?: boolean;
  error?: string;
}

/**
 * Change the output volume. `level` sets an absolute percentage, `delta`
 * adjusts relative to the current level, and `muted` mutes/unmutes.
 * This modifies system state and must be gated behind confirmation.
 */
export function setVolume(input: Record<string, unknown>): SetVolumeResult {
  if (!isMacOS()) {
    return { success: false, message: "Volume control only available on macOS", error: "Not running on macOS" };
  }

  const validation = validateSetVolume(input);
  if (!validation.valid) {
    return { success: false, message: validation.error, error: validation.error };
  }
  const { options } = validation;

  try {
    const exec = getExecSync();
    if (!exec) {
      return { success: false, message: "Unable to change volume: child_process not available" };
    }

    const commands: string[] = [];

    if (options.muted !== undefined) {
      commands.push(`osascript -e 'set volume output muted ${options.muted ? "true" : "false"}'`);
    }

    let finalLevel: number | undefined;
    if (options.level !== undefined) {
      finalLevel = options.level;
      commands.push(`osascript -e 'set volume output volume ${finalLevel}'`);
    } else if (options.delta !== undefined) {
      const current = getVolumeStatus();
      const base = current.available && current.volumePercent !== undefined ? current.volumePercent : 0;
      finalLevel = Math.min(100, Math.max(0, base + options.delta));
      commands.push(`osascript -e 'set volume output volume ${finalLevel}'`);
    }

    for (const cmd of commands) {
      exec(cmd, { timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
    }

    return {
      success: true,
      message: "Volume updated",
      volumePercent: finalLevel,
      muted: options.muted,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message: `Failed to change volume: ${message}`, error: message.slice(0, 300) };
  }
}
