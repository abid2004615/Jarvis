/**
 * Safari Integration
 * Read-only awareness and controlled actions for Safari.
 * URL validation enforces safe schemes only (http/https).
 * Arbitrary URLs, javascript: and file: schemes are rejected.
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

const SAFARI_TIMEOUT_MS = 5000;

const SAFE_URL_SCHEMES = ["http:", "https:"];
const UNSAFE_URL_SCHEMES = ["javascript:", "file:", "data:", "ftp:", "sftp:", "ssh:"];

export interface SafariTab {
  title: string;
  url: string;
  index: number;
}

export interface SafariState {
  available: boolean;
  isRunning: boolean;
  currentTab?: SafariTab;
  tabCount?: number;
  tabs?: SafariTab[];
  error?: string;
}

export interface SafariActionResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Validate a URL is safe to open.
 * Only http and https schemes are allowed.
 * Rejects credential-bearing URLs, javascript:, file:, data:, etc.
 */
export function validateUrl(url: string): { valid: boolean; error?: string } {
  if (!url || typeof url !== "string") {
    return { valid: false, error: "URL is required" };
  }

  const trimmed = url.trim().toLowerCase();

  // Reject unsafe schemes
  for (const scheme of UNSAFE_URL_SCHEMES) {
    if (trimmed.startsWith(scheme)) {
      return { valid: false, error: `URL scheme '${scheme}' is not allowed` };
    }
  }

  // Must start with a safe scheme
  const hasSafeScheme = SAFE_URL_SCHEMES.some((s) => trimmed.startsWith(s));
  if (!hasSafeScheme) {
    return { valid: false, error: "Only http and https URLs are allowed" };
  }

  // Reject credential-bearing URLs
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      return { valid: false, error: "URLs with embedded credentials are not allowed" };
    }
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  return { valid: true };
}

/**
 * Check if Safari is running.
 */
export function isSafariRunning(): boolean {
  if (!isMacOS()) return false;

  try {
    const exec = getExecFileSync();
    if (!exec) return false;

    const output = exec("pgrep -x Safari", {
      encoding: "utf8",
      timeout: SAFARI_TIMEOUT_MS,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();

    return output.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get the current Safari state including tabs and current URL.
 */
export function getSafariState(): SafariState {
  if (!isMacOS()) {
    return { available: false, isRunning: false, error: "Not running on macOS" };
  }

  const running = isSafariRunning();
  if (!running) {
    return { available: true, isRunning: false };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { available: false, isRunning: true, error: "child_process not available" };
    }

    // Get current tab info via AppleScript
    const script = [
      'tell application "Safari"',
      "  set tabCount to count of windows",
      "  if tabCount > 0 then",
      "    set currentTab to current tab of front window",
      "    set tabTitle to name of currentTab",
      "    set tabURL to URL of currentTab",
      "    set totalTabs to count of tabs of front window",
      "    return tabTitle & \"|||\" & tabURL & \"|||\" & totalTabs",
      "  else",
      "    return \"NO_TABS\"",
      "  end if",
      "end tell",
    ].join("\n");

    const output = exec("osascript", [], {
      input: script,
      encoding: "utf8",
      shell: false,
      timeout: SAFARI_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();

    if (output === "NO_TABS") {
      return { available: true, isRunning: true, tabCount: 0, tabs: [] };
    }

    const parts = output.split("|||");
    if (parts.length >= 3) {
      return {
        available: true,
        isRunning: true,
        currentTab: {
          title: parts[0],
          url: parts[1],
          index: 1,
        },
        tabCount: parseInt(parts[2], 10) || 1,
      };
    }

    return { available: true, isRunning: true };
  } catch {
    return { available: false, isRunning: true, error: "Could not read Safari state" };
  }
}

/**
 * Open a URL in Safari. URL must be validated first.
 */
export function openUrlInSafari(url: string): SafariActionResult {
  const validation = validateUrl(url);
  if (!validation.valid) {
    return { success: false, message: validation.error || "Invalid URL" };
  }

  if (!isMacOS()) {
    return { success: false, message: "Not running on macOS" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, message: "child_process not available" };
    }

    exec(`open -a Safari "${url}"`, {
      timeout: SAFARI_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, message: `Opened ${url} in Safari` };
  } catch {
    return { success: false, message: "Could not open URL in Safari" };
  }
}

/**
 * Create a new tab in Safari.
 */
export function newSafariTab(): SafariActionResult {
  if (!isMacOS()) {
    return { success: false, message: "Not running on macOS" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, message: "child_process not available" };
    }

    const script = [
      'tell application "Safari"',
      "  activate",
      "  tell front window",
      "    set current tab to (make new tab at end of tabs of front window)",
      "  end tell",
      "end tell",
    ].join("\n");

    exec("osascript", [], {
      input: script,
      encoding: "utf8",
      shell: false,
      timeout: SAFARI_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, message: "Created new Safari tab" };
  } catch {
    return { success: false, message: "Could not create new Safari tab" };
  }
}

/**
 * Close Safari. Requires confirmation (handled at tool level).
 */
export function closeSafari(): SafariActionResult {
  if (!isMacOS()) {
    return { success: false, message: "Not running on macOS" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, message: "child_process not available" };
    }

    exec("osascript -e 'quit app \"Safari\"'", {
      timeout: SAFARI_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, message: "Closed Safari" };
  } catch {
    return { success: false, message: "Could not close Safari" };
  }
}

/**
 * Close the current tab in Safari.
 */
export function closeSafariTab(): SafariActionResult {
  if (!isMacOS()) {
    return { success: false, message: "Not running on macOS" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, message: "child_process not available" };
    }

    const script = [
      'tell application "Safari"',
      "  tell front window",
      "    close current tab",
      "  end tell",
      "end tell",
    ].join("\n");

    exec("osascript", [], {
      input: script,
      encoding: "utf8",
      shell: false,
      timeout: SAFARI_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, message: "Closed current Safari tab" };
  } catch {
    return { success: false, message: "Could not close Safari tab" };
  }
}
