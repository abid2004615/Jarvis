/**
 * JARVIS Computer Use — Action Executor
 *
 * Executes validated, resolved computer-use actions via safe
 * macOS System Events (osascript stdin, no shell).
 *
 * Every action:
 *   - Uses execFileSync (no shell)
 *   - Passes scripts via stdin (no command injection)
 *   - Has bounded timeout
 *   - Is read-only by default for queries
 */

import type {
  ComputerAction,
  ComputerActionResult,
  ComputerActionStatus,
  ScrollDirection,
  AllowedKey,
} from "./types";
import { ALLOWED_KEYS } from "./types";

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

const EXEC_TIMEOUT_MS = 5000;

// ── AppleScript Builders ──────────────────────────────────────────────────────

function clickScript(x: number, y: number): string {
  return [
    'tell application "System Events"',
    `  click at {${Math.round(x)}, ${Math.round(y)}}`,
    "end tell",
  ].join("\n");
}

function doubleClickScript(x: number, y: number): string {
  return [
    'tell application "System Events"',
    `  click at {${Math.round(x)}, ${Math.round(y)}}`,
    "end tell",
  ].join("\n");
}

function typeScript(text: string): string {
  // Escape backslashes and quotes for AppleScript string literals
  const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [
    'tell application "System Events"',
    `  keystroke "${escaped}"`,
    "end tell",
  ].join("\n");
}

function scrollScript(direction: ScrollDirection, amount: number): string {
  const clampedAmount = Math.min(Math.max(Math.round(amount), 1), 10);
  const scrollCode =
    direction === "up" ? `scroll area 1 of window 1 by {0, ${clampedAmount * 3}}` :
    direction === "down" ? `scroll area 1 of window 1 by {0, ${-clampedAmount * 3}}` :
    direction === "left" ? `scroll area 1 of window 1 by {${clampedAmount * 3}, 0}` :
    `scroll area 1 of window 1 by {${-clampedAmount * 3}, 0}`;

  return [
    'tell application "System Events"',
    `  ${scrollCode}`,
    "end tell",
  ].join("\n");
}

function keypressScript(key: string): string {
  const lower = key.toLowerCase();
  if (!ALLOWED_KEYS.has(lower)) {
    throw new Error(`Key "${key}" is not in the allowlist`);
  }

  const keyMap: Record<string, string> = {
    "enter": 'keystroke return',
    "return": 'keystroke return',
    "escape": 'keystroke escape',
    "tab": 'keystroke tab',
    "space": 'keystroke space',
    "delete": 'keystroke delete',
    "backspace": 'keystroke delete using command down',
    "arrow_up": 'key code 126',
    "arrow_down": 'key code 125',
    "arrow_left": 'key code 123',
    "arrow_right": 'key code 124',
    "home": 'key code 115',
    "end": 'key code 119',
    "page_up": 'key code 116',
    "page_down": 'key code 121',
    "cmd+c": 'keystroke "c" using command down',
    "cmd+v": 'keystroke "v" using command down',
    "cmd+x": 'keystroke "x" using command down',
    "cmd+a": 'keystroke "a" using command down',
    "cmd+z": 'keystroke "z" using command down',
    "cmd+shift+z": 'keystroke "z" using command down using shift down',
    "cmd+w": 'keystroke "w" using command down',
    "cmd+q": 'keystroke "q" using command down',
    "cmd+tab": 'keystroke tab using command down',
    "cmd+`": 'keystroke "`" using command down',
    "cmd+,": 'keystroke "," using command down',
    "cmd+s": 'keystroke "s" using command down',
    "cmd+n": 'keystroke "n" using command down',
    "cmd+t": 'keystroke "t" using command down',
    "ctrl+alt+cmd+esc": 'keystroke escape using {control down, option down, command down}',
  };

  const code = keyMap[lower];
  if (!code) {
    throw new Error(`Key "${key}" has no mapping`);
  }

  return [
    'tell application "System Events"',
    `  ${code}`,
    "end tell",
  ].join("\n");
}

// ── Executor ──────────────────────────────────────────────────────────────────

function executeScript(script: string): { success: boolean; error?: string } {
  if (!isMacOS()) {
    return { success: false, error: "Not running on macOS" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, error: "child_process not available" };
    }

    exec("osascript", [], {
      input: script,
      encoding: "utf8",
      shell: false,
      timeout: EXEC_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: msg.slice(0, 300) };
  }
}

/**
 * Execute a validated computer-use action.
 *
 * The action must already be:
 *   - Type-checked
 *   - Target-resolved (for click/double_click)
 *   - Permission-checked
 *   - Confirmed (if required)
 */
export function executeComputerAction(
  action: ComputerAction,
): ComputerActionResult {
  if (!isMacOS()) {
    return {
      status: "failed",
      action,
      message: "Computer use is only available on macOS",
      error: "Not running on macOS",
    };
  }

  switch (action.type) {
    case "click": {
      const target = action.target as import("./types").ResolvedTarget | undefined;
      if (!target) {
        return { status: "failed", action, message: "No target specified for click" };
      }
      const result = executeScript(clickScript(target.centerX, target.centerY));
      return {
        status: result.success ? "success" : "failed",
        action,
        resolvedTarget: target,
        message: result.success
          ? `Clicked ${target.label || "target"} at (${Math.round(target.centerX)}, ${Math.round(target.centerY)})`
          : `Click failed: ${result.error}`,
        error: result.error,
      };
    }

    case "double_click": {
      const target = action.target as import("./types").ResolvedTarget | undefined;
      if (!target) {
        return { status: "failed", action, message: "No target specified for double click" };
      }
      const x = Math.round(target.centerX);
      const y = Math.round(target.centerY);
      const dcScript = [
        'tell application "System Events"',
        `  click at {${x}, ${y}}`,
        "end tell",
      ].join("\n");
      const r1 = executeScript(dcScript);
      if (!r1.success) {
        return { status: "failed", action, resolvedTarget: target, message: `Double click failed: ${r1.error}`, error: r1.error };
      }
      const r2 = executeScript(dcScript);
      return {
        status: r2.success ? "success" : "failed",
        action,
        resolvedTarget: target,
        message: r2.success
          ? `Double-clicked ${target.label || "target"}`
          : `Double click second click failed: ${r2.error}`,
        error: r2.error,
      };
    }

    case "type": {
      if (!action.value) {
        return { status: "failed", action, message: "No text specified for typing" };
      }
      // Reject credential-like content
      if (isCredentialLike(action.value)) {
        return { status: "rejected", action, message: "Refusing to type credential-like content" };
      }
      const result = executeScript(typeScript(action.value));
      return {
        status: result.success ? "success" : "failed",
        action,
        message: result.success
          ? `Typed ${action.value.length} characters`
          : `Type failed: ${result.error}`,
        error: result.error,
      };
    }

    case "scroll": {
      const dir = action.direction || "down";
      const amt = action.amount || 3;
      const result = executeScript(scrollScript(dir, amt));
      return {
        status: result.success ? "success" : "failed",
        action,
        message: result.success
          ? `Scrolled ${dir} by ${amt} units`
          : `Scroll failed: ${result.error}`,
        error: result.error,
      };
    }

    case "keypress": {
      if (!action.key) {
        return { status: "failed", action, message: "No key specified" };
      }
      try {
        const result = executeScript(keypressScript(action.key));
        return {
          status: result.success ? "success" : "failed",
          action,
          message: result.success
            ? `Pressed ${action.key}`
            : `Keypress failed: ${result.error}`,
          error: result.error,
        };
      } catch (error) {
        return {
          status: "failed",
          action,
          message: `Key "${action.key}" is not allowed`,
          error: error instanceof Error ? error.message : "Invalid key",
        };
      }
    }

    case "focus_window": {
      if (!action.application) {
        return { status: "failed", action, message: "No application specified" };
      }
      const script = [
        `tell application "${action.application}"`,
        "  activate",
        "end tell",
      ].join("\n");
      const result = executeScript(script);
      return {
        status: result.success ? "success" : "failed",
        action,
        message: result.success
          ? `Focused ${action.application}`
          : `Focus failed: ${result.error}`,
        error: result.error,
      };
    }

    case "open_url": {
      if (!action.value) {
        return { status: "failed", action, message: "No URL specified" };
      }
      // URL validation is handled by the caller. Here we just use the safe URL.
      const escaped = action.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const script = [
        'tell application "System Events"',
        `  open location "${escaped}"`,
        "end tell",
      ].join("\n");
      const result = executeScript(script);
      return {
        status: result.success ? "success" : "failed",
        action,
        message: result.success
          ? `Opened ${action.value}`
          : `Open URL failed: ${result.error}`,
        error: result.error,
      };
    }

    default:
      return { status: "failed", action, message: `Unknown action type: ${(action as ComputerAction).type}` };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isCredentialLike(text: string): boolean {
  const lower = text.toLowerCase();
  const patterns = [
    /password/i,
    /secret/i,
    /api[_-]?key/i,
    /bearer\s/i,
    /ghp_/i,
    /sk-[a-zA-Z0-9]{20,}/i,
    /xoxb-/i,
    /xoxp-/i,
    /AKIA[A-Z0-9]{16}/i,
    /private[_-]?key/i,
  ];
  return patterns.some((p) => p.test(text)) || lower.length > 200;
}
