/**
 * VS Code Integration
 * Safe awareness only — is VS Code running, focus it, open an allowlisted project.
 * No arbitrary terminal commands, scripts, or code execution.
 *
 * Uses execFileSync (no shell) for security.
 */

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

const VSCODE_TIMEOUT_MS = 5000;

/**
 * Check if VS Code is running.
 */
export function isVSCodeRunning(): boolean {
  if (!isMacOS()) return false;

  try {
    const exec = getExecFileSync();
    if (!exec) return false;

    const output = exec("pgrep -x 'Code'", {
      encoding: "utf8",
      timeout: VSCODE_TIMEOUT_MS,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();

    return output.length > 0;
  } catch {
    return false;
  }
}

export interface VSCodeState {
  available: boolean;
  isRunning: boolean;
  error?: string;
}

export interface VSCodeActionResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Get VS Code state (running or not).
 */
export function getVSCodeState(): VSCodeState {
  if (!isMacOS()) {
    return { available: false, isRunning: false, error: "Not running on macOS" };
  }

  return { available: true, isRunning: isVSCodeRunning() };
}

/**
 * Focus (bring to front) VS Code.
 */
export function focusVSCode(): VSCodeActionResult {
  if (!isMacOS()) {
    return { success: false, message: "Not running on macOS" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, message: "child_process not available" };
    }

    exec('tell application "Visual Studio Code" to activate', {
      encoding: "utf8",
      timeout: VSCODE_TIMEOUT_MS,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, message: "Brought VS Code to front" };
  } catch {
    return { success: false, message: "Could not focus VS Code" };
  }
}

/**
 * Open VS Code with the current file or project.
 * Only allowlisted project directories may be opened.
 */
export function openVSCode(projectPath?: string): VSCodeActionResult {
  if (!isMacOS()) {
    return { success: false, message: "Not running on macOS" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, message: "child_process not available" };
    }

    if (projectPath) {
      // Validate path — must be a reasonable directory path
      if (/\.\.|~|\/etc\/|\/var\/|\/tmp\//.test(projectPath)) {
        return { success: false, message: "Invalid project path" };
      }

      exec(`open -a "Visual Studio Code" "${projectPath}"`, {
        timeout: VSCODE_TIMEOUT_MS,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } else {
      exec('open -a "Visual Studio Code"', {
        timeout: VSCODE_TIMEOUT_MS,
        stdio: ["pipe", "pipe", "pipe"],
      });
    }

    return { success: true, message: projectPath ? `Opened ${projectPath} in VS Code` : "Opened VS Code" };
  } catch {
    return { success: false, message: "Could not open VS Code" };
  }
}
