/**
 * macOS Window Management
 * Safe, structured window operations using fixed AppleScript programs.
 * All scripts are hardcoded — user input is never interpolated.
 * Requires macOS Accessibility permission for System Events.
 *
 * Uses execFileSync (no shell) for security.
 */

import type { ActiveWindowResult } from "./types";
import { getFrontmostApplication } from "./applications";

// Lazy-load child_process only when needed (server-side)
let execFileSync: typeof import("child_process").execFileSync | null = null;

function getExecFileSync() {
  if (execFileSync === null) {
    try {
      execFileSync = require("child_process").execFileSync;
    } catch {
      return null;
    }
  }
  return execFileSync;
}

function isMacOS(): boolean {
  return process.platform === "darwin";
}

const WINDOW_TIMEOUT_MS = 5000;
const MAX_TITLE_LENGTH = 200;

/**
 * Fixed AppleScript program. Never includes user input.
 */
const FIXED_ACTIVE_WINDOW_SCRIPT = [
  'tell application "System Events"',
  "  set frontProcess to first application process whose frontmost is true",
  "  set windowName to name of front window of frontProcess",
  "  return windowName",
  "end tell",
].join("\n");

function getFrontmostApplicationFallback(): ActiveWindowResult {
  const frontmost = getFrontmostApplication();
  if (frontmost.available && frontmost.name) {
    return {
      available: true,
      title: frontmost.name.slice(0, MAX_TITLE_LENGTH),
      source: "application",
    };
  }
  return { available: false, error: "active_window_unavailable" };
}

/**
 * List all visible windows with their app and title.
 */
const FIXED_LIST_WINDOWS_SCRIPT = [
  'tell application "System Events"',
  "  set output to {}",
  "  set procs to every application process whose visible is true",
  "  repeat with proc in procs",
  "    set procName to name of proc",
  "    try",
  "      set wins to every window of proc",
  "      repeat with win in wins",
  "        set winName to name of win",
  "        set end of output to procName & \"|\" & winName",
  "      end repeat",
  "    end try",
  "  end repeat",
  "  set AppleScript's text item delimiters to \"\\n\"",
  "  return output as text",
  "end tell",
].join("\n");

/**
 * Focus (bring to front) a window by application name.
 * Returns the AppleScript result.
 */
function focusApplicationScript(appName: string): string {
  return [
    `tell application "${appName}"`,
    "  activate",
    "end tell",
  ].join("\n");
}

/**
 * Minimize the front window of an application.
 */
function minimizeWindowScript(appName: string): string {
  return [
    'tell application "System Events"',
    `  tell process "${appName}"`,
    "    set visible of front window to false",
    "  end tell",
    "end tell",
  ].join("\n");
}

/**
 * Close the front window of an application.
 */
function closeWindowScript(appName: string): string {
  return [
    `tell application "${appName}"`,
    "  close front window",
    "end tell",
  ].join("\n");
}

/**
 * Get the title of the currently active application window.
 */
export function getActiveWindow(): ActiveWindowResult {
  if (!isMacOS()) {
    return { available: false, error: "active_window_unavailable" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { available: false, error: "active_window_unavailable" };
    }

    const output = exec("osascript", [], {
      input: FIXED_ACTIVE_WINDOW_SCRIPT,
      encoding: "utf8",
      shell: false,
      timeout: WINDOW_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const title = (output || "").toString().trim();
    if (!title) {
      return getFrontmostApplicationFallback();
    }

    return { available: true, title: title.slice(0, MAX_TITLE_LENGTH), source: "window" };
  } catch {
    // Accessibility can withhold window titles even when macOS still exposes
    // the frontmost application through lsappinfo. Label this fallback so
    // callers never mistake it for a verified window title.
    return getFrontmostApplicationFallback();
  }
}

export interface WindowInfo {
  application: string;
  title: string;
}

export interface WindowListResult {
  available: boolean;
  windows: WindowInfo[];
  count: number;
  error?: string;
}

/**
 * List all visible windows across all applications.
 * Returns an array of { application, title } pairs.
 */
export function listWindows(): WindowListResult {
  if (!isMacOS()) {
    return { available: false, windows: [], count: 0, error: "Not running on macOS" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { available: false, windows: [], count: 0, error: "child_process not available" };
    }

    const output = exec("osascript", [], {
      input: FIXED_LIST_WINDOWS_SCRIPT,
      encoding: "utf8",
      shell: false,
      timeout: WINDOW_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();

    if (!output) {
      return { available: true, windows: [], count: 0 };
    }

    const windows: WindowInfo[] = output.split("\n").filter(Boolean).map((line) => {
      const [application, ...titleParts] = line.split("|");
      return {
        application: application || "",
        title: (titleParts.join("|") || "").slice(0, MAX_TITLE_LENGTH),
      };
    });

    return { available: true, windows, count: windows.length };
  } catch {
    return { available: false, windows: [], count: 0, error: "Could not list windows" };
  }
}

export interface WindowActionResult {
  success: boolean;
  application: string;
  message: string;
  error?: string;
}

/**
 * Focus (bring to front) an application by name.
 */
export function focusApplication(appName: string): WindowActionResult {
  if (!isMacOS()) {
    return { success: false, application: appName, message: "Not running on macOS" };
  }

  if (!appName || typeof appName !== "string") {
    return { success: false, application: appName, message: "Application name required" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, application: appName, message: "child_process not available" };
    }

    exec("osascript", [], {
      input: focusApplicationScript(appName),
      encoding: "utf8",
      shell: false,
      timeout: WINDOW_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, application: appName, message: `Brought ${appName} to front` };
  } catch {
    return { success: false, application: appName, message: `Could not focus ${appName}` };
  }
}

/**
 * Minimize the front window of an application.
 */
export function minimizeWindow(appName: string): WindowActionResult {
  if (!isMacOS()) {
    return { success: false, application: appName, message: "Not running on macOS" };
  }

  if (!appName || typeof appName !== "string") {
    return { success: false, application: appName, message: "Application name required" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, application: appName, message: "child_process not available" };
    }

    exec("osascript", [], {
      input: minimizeWindowScript(appName),
      encoding: "utf8",
      shell: false,
      timeout: WINDOW_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, application: appName, message: `Minimized ${appName} window` };
  } catch {
    return { success: false, application: appName, message: `Could not minimize ${appName}` };
  }
}

/**
 * Close the front window of an application.
 */
export function closeWindow(appName: string): WindowActionResult {
  if (!isMacOS()) {
    return { success: false, application: appName, message: "Not running on macOS" };
  }

  if (!appName || typeof appName !== "string") {
    return { success: false, application: appName, message: "Application name required" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, application: appName, message: "child_process not available" };
    }

    exec("osascript", [], {
      input: closeWindowScript(appName),
      encoding: "utf8",
      shell: false,
      timeout: WINDOW_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, application: appName, message: `Closed ${appName} front window` };
  } catch {
    return { success: false, application: appName, message: `Could not close ${appName} window` };
  }
}

/**
 * Get the screen dimensions (width, height) via system_profiler.
 */
export interface ScreenDimensions {
  width: number;
  height: number;
}

export function getScreenDimensions(): ScreenDimensions | null {
  if (!isMacOS()) return null;

  try {
    const exec = getExecFileSync();
    if (!exec) return null;

    const output = exec("system_profiler SPDisplaysDataType", {
      encoding: "utf8",
      timeout: WINDOW_TIMEOUT_MS,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString();

    const resMatch = output.match(/Resolution:\s+(\d+)\s+x\s+(\d+)/);
    if (resMatch) {
      return { width: parseInt(resMatch[1], 10), height: parseInt(resMatch[2], 10) };
    }

    return null;
  } catch {
    return null;
  }
}
