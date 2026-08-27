/**
 * macOS Clipboard Integration
 * Read, write, and clear the system clipboard.
 * Never persists or logs clipboard contents.
 * Detects credential-like values and masks them in responses.
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

const CLIPBOARD_TIMEOUT_MS = 3000;
const CLIPBOARD_MAX_LENGTH = 10000;

export interface ClipboardReadResult {
  available: boolean;
  content?: string;
  isCredentialLike?: boolean;
  maskedContent?: string;
  length?: number;
  error?: string;
}

export interface ClipboardWriteResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Patterns that suggest clipboard contains secrets/credentials.
 * These are broad heuristics — not exhaustive.
 */
const CREDENTIAL_PATTERNS: RegExp[] = [
  /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|pwd)\s*[:=]\s*\S+/i,
  /(?:bearer\s+[a-zA-Z0-9_.-]{20,})/i,
  /(?:sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16})/,
  /(?:-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/,
  /(?:xox[baprs]-[a-zA-Z0-9-]+)/,
  /(?:eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,})/,
  /(?:\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})/,
];

/**
 * Check if a string looks like it contains credentials or secrets.
 */
export function isCredentialLike(text: string): boolean {
  return CREDENTIAL_PATTERNS.some((p) => p.test(text));
}

/**
 * Read the current clipboard contents.
 * Returns the text content with credential masking when appropriate.
 * Never persists the clipboard content.
 */
export function readClipboard(): ClipboardReadResult {
  if (!isMacOS()) {
    return { available: false, error: "Clipboard reading only available on macOS" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { available: false, error: "child_process not available" };
    }

    const content = exec("pbpaste", {
      encoding: "utf8",
      timeout: CLIPBOARD_TIMEOUT_MS,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString();

    const truncated = content.length > CLIPBOARD_MAX_LENGTH
      ? content.slice(0, CLIPBOARD_MAX_LENGTH)
      : content;

    const credLike = isCredentialLike(truncated);

    return {
      available: true,
      content: truncated,
      isCredentialLike: credLike,
      maskedContent: credLike ? "[SENSITIVE CONTENT REDACTED]" : undefined,
      length: content.length,
    };
  } catch {
    return { available: false, error: "Could not read clipboard" };
  }
}

/**
 * Write text to the clipboard.
 * Does not persist the content internally.
 */
export function writeClipboard(text: string): ClipboardWriteResult {
  if (!isMacOS()) {
    return { success: false, message: "Clipboard writing only available on macOS" };
  }

  if (!text || typeof text !== "string") {
    return { success: false, message: "Text must be a non-empty string" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, message: "child_process not available" };
    }

    exec("pbcopy", {
      input: text,
      timeout: CLIPBOARD_TIMEOUT_MS,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, message: "Clipboard updated" };
  } catch {
    return { success: false, message: "Could not write to clipboard" };
  }
}

/**
 * Clear the clipboard contents.
 */
export function clearClipboard(): ClipboardWriteResult {
  return writeClipboard("");
}
