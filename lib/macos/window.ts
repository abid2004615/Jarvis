/**
 * macOS Active Window
 * Best-effort, read-only window metadata.
 *
 * Getting the active window's title requires macOS Accessibility permission
 * for System Events. When that permission is missing (or the call fails for
 * any reason) the result is an honest `active_window_unavailable` — window
 * data is never guessed or fabricated.
 *
 * The AppleScript program is FIXED and is passed over stdin with shell
 * execution disabled, so user input is never interpolated and no shell is
 * ever involved.
 */

import type { ActiveWindowResult } from "./types";

// Lazy-load child_process only when needed (server-side)
let execFileSync: typeof import("child_process").execFileSync | null = null;

function getExecFileSync() {
  if (execFileSync === null) {
    try {
      execFileSync = require("child_process").execFileSync;
    } catch (error) {
      return null;
    }
  }
  return execFileSync;
}

function isMacOS(): boolean {
  return process.platform === "darwin";
}

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

const ACTIVE_WINDOW_TIMEOUT_MS = 5000;
const ACTIVE_WINDOW_MAX_TITLE_LENGTH = 200;

/**
 * Get the title of the currently active application window.
 * Returns `available: false` with `active_window_unavailable` whenever the
 * data cannot be obtained safely (e.g. no Accessibility permission).
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

    // execFileSync runs `osascript` directly as an executable — no shell is
    // involved and `shell: false` is explicit about it. The AppleScript is a
    // fixed program passed over stdin, so user input is never interpolated
    // and there is no possibility of command injection.
    const output = exec(
      "osascript",
      [],
      {
        input: FIXED_ACTIVE_WINDOW_SCRIPT,
        encoding: "utf8",
        shell: false,
        timeout: ACTIVE_WINDOW_TIMEOUT_MS,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const title = (output || "").toString().trim();
    if (!title) {
      return { available: false, error: "active_window_unavailable" };
    }

    return { available: true, title: title.slice(0, ACTIVE_WINDOW_MAX_TITLE_LENGTH) };
  } catch (error) {
    return { available: false, error: "active_window_unavailable" };
  }
}
