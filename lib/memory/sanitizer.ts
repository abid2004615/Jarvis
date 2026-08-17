/**
 * JARVIS Persistent Memory — Sanitizer
 *
 * Rejects anything that looks like a credential, token, key, or secret before
 * it can be persisted. Also enforces structural limits (length, category,
 * control characters, path traversal, executable-looking content).
 *
 * Rejected values are NEVER written to persistent storage and are never
 * returned in results.
 */

import {
  MEMORY_CATEGORIES,
  MEMORY_LIMITS,
  type MemoryCategory,
  type RememberMemoryInput,
} from "./types";

export interface SanitizationResult {
  ok: boolean;
  reason?: string;
}

export interface MemoryValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
  data?: NormalizedMemoryInput;
}

/** Fully-normalized, validated memory input (all fields required). */
export interface NormalizedMemoryInput {
  category: MemoryCategory;
  key: string;
  value: string;
  source: string;
  confidence: number;
}

/**
 * Patterns that identify credentials / secrets embedded in free text.
 * A single match means the content must not be persisted.
 */
const SECRET_PATTERNS: RegExp[] = [
  // Groq API keys
  /\bgsk_[A-Za-z0-9_-]{6,}\b/,
  // OpenAI-style keys (sk-... and sk_live_/sk_test_...)
  /\bsk-[A-Za-z0-9_-]{10,}\b/,
  /\bsk_(live|test)_[A-Za-z0-9]{10,}\b/i,
  // Stripe publishable/secret keys
  /\b(pk|rk)_(live|test)_[A-Za-z0-9]{10,}\b/i,
  // Google API keys
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  // GitHub tokens
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/i,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/i,
  // AWS access keys
  /\bAKIA[0-9A-Z]{16}\b/,
  // Slack tokens
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/i,
  // Bearer / Authorization headers
  /\bBearer\s+[A-Za-z0-9._~+/= -]{10,}\b/i,
  /\bAuthorization\s*:\s*(Bearer|Basic)\b/i,
  // PEM / OpenSSH private keys
  /-----BEGIN[ A-Z]*PRIVATE KEY-----/,
  /-----BEGIN (EC|RSA|OPENSSH) PRIVATE KEY-----/,
  /ssh-(rsa|ed25519|ecdsa)\s+AAAA[A-Za-z0-9+/=]{20,}/,
  // Labeled secrets: "password is X", "api key: X", "token=Y", "secret ..."
  /\b(password|passwd|pwd|token)\b[^\n.]{0,60}?(is|:=|=|:)\s*["']?[\S]{3,}/i,
  /\b(api[\s_-]?key|access[\s_-]?token|refresh[\s_-]?token|session[\s_-]?token|auth[\s_-]?token|client[\s_-]?secret|private[\s_-]?key)\b[^\n.]{0,60}?(is|:=|=|:)\s*["']?[\S]{3,}/i,
  /\bsecret\b[^\n.]{0,60}?(is|:=|=|:)\s*["']?[\S]{3,}/i,
  // gsk_ prefix anywhere (Groq key material)
  /\bgsk_[^\s]{3,}/,
];

/**
 * Check a piece of text for anything that looks like a credential/secret.
 * Returns the matched context or null when the text is safe.
 */
export function containsSecret(text: string): string | null {
  if (!text) return null;
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      return pattern.source;
    }
  }
  return null;
}

/**
 * Commands that look like arbitrary code execution. Stored values must never
 * be executable content.
 */
const EXECUTABLE_PATTERNS: RegExp[] = [
  /^\s*(sudo|rm|rmdir|sh|bash|zsh|osascript|curl|wget|kill|pkill|killall|dd|mkfs|chmod|chown|nc|telnet|python|python3|node|perl|ruby)\b/i,
  /(\r\n|\n|\r)\s*(sudo|rm|osascript|sh|bash|curl|wget|kill)\b/i,
];

function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    if (char.charCodeAt(0) < 32 && char !== "\n" && char !== "\t" && char !== "\r") {
      return true;
    }
  }
  return false;
}

function looksLikePathTraversal(value: string): boolean {
  return /\.\.(\/|\\)/.test(value) || value.split(/[\/\\]/).some((part) => part === "..");
}

/**
 * Classify a (key, value) pair as safe or secret-bearing.
 */
export function classifyMemoryContent(key: string, value: string): SanitizationResult {
  const combined = `${key} ${value}`;
  const hit = containsSecret(combined);
  if (hit) {
    return { ok: false, reason: "secret" };
  }
  return { ok: true };
}

/**
 * Validate and normalize a remember request. Never returns rejected values in
 * the normalized data.
 */
export function validateMemoryInput(input: RememberMemoryInput): MemoryValidationResult {
  if (!input || typeof input !== "object") {
    return { valid: false, error: "Memory input is required", code: "invalid_input" };
  }

  if (typeof input.key !== "string" || !input.key.trim()) {
    return { valid: false, error: "Memory key is required", code: "invalid_key" };
  }

  const key = input.key.trim();
  if (key.length > MEMORY_LIMITS.MAX_KEY_LENGTH) {
    return {
      valid: false,
      error: `Memory key exceeds maximum length of ${MEMORY_LIMITS.MAX_KEY_LENGTH}`,
      code: "key_too_long",
    };
  }

  if (typeof input.value !== "string" || !input.value.trim()) {
    return { valid: false, error: "Memory value is required", code: "invalid_value" };
  }

  const value = input.value.trim();
  if (value.length > MEMORY_LIMITS.MAX_VALUE_LENGTH) {
    return {
      valid: false,
      error: `Memory value exceeds maximum length of ${MEMORY_LIMITS.MAX_VALUE_LENGTH}`,
      code: "value_too_long",
    };
  }

  if (looksLikePathTraversal(key) || looksLikePathTraversal(value)) {
    return { valid: false, error: "Memory content must not contain path traversal", code: "path_traversal" };
  }

  if (hasControlCharacters(key) || hasControlCharacters(value)) {
    return { valid: false, error: "Memory content contains invalid characters", code: "invalid_characters" };
  }

  for (const pattern of EXECUTABLE_PATTERNS) {
    if (pattern.test(value) || pattern.test(key)) {
      return { valid: false, error: "Memory content must not contain executable commands", code: "executable_content" };
    }
  }

  if (input.category !== undefined) {
    if (!MEMORY_CATEGORIES.includes(input.category)) {
      return { valid: false, error: "Invalid memory category", code: "invalid_category" };
    }
  }

  const classification = classifyMemoryContent(key, value);
  if (!classification.ok) {
    return {
      valid: false,
      error: "I can't store passwords, API keys, or authentication secrets in memory.",
      code: "secret_rejected",
    };
  }

  return {
    valid: true,
    data: {
      category: (input.category as MemoryCategory | undefined) ?? "preference",
      key,
      value,
      source: typeof input.source === "string" && input.source.trim() ? input.source.trim().slice(0, 40) : "user",
      confidence:
        typeof input.confidence === "number" && input.confidence > 0 && input.confidence <= 1
          ? input.confidence
          : 1,
    },
  };
}

/**
 * Redact every string value in a set of tool arguments. Used so that memory
 * tool arguments never reach the audit log, which is documented to exclude
 * personal information.
 */
export function redactMemoryToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    out[key] = typeof value === "string" ? "[REDACTED]" : value;
  }
  return out;
}
