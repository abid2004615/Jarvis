/**
 * JARVIS Personal Reminders — Validation
 *
 * Strict, server-authoritative validation of reminder inputs. Unknown fields
 * are rejected; title is bounded; dueAt is a bounded timestamp; secrets are
 * rejected. Reminders are data — their fields can never become commands.
 */

import { REMINDER_LIMITS, type ReminderInput, type ReminderValidationResult } from "./types";

const SECRET_KEY_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /(^|[^a-z0-9])password([^a-z0-9]|$)/i, label: "password" },
  { re: /(^|[^a-z0-9])api[_-]?key([^a-z0-9]|$)/i, label: "api key" },
  { re: /(^|[^a-z0-9])secret([^a-z0-9]|$)/i, label: "secret" },
  { re: /(^|[^a-z0-9])token([^a-z0-9]|$)/i, label: "token" },
  { re: /(^|[^a-z0-9])authorization([^a-z0-9]|$)/i, label: "authorization" },
  { re: /(^|[^a-z0-9])credential([^a-z0-9]|$)/i, label: "credential" },
  { re: /(^|[^a-z0-9])bearer([^a-z0-9]|$)/i, label: "bearer" },
];

const SECRET_VALUE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /sk-[a-zA-Z0-9]{8,}/, label: "OpenAI-style key" },
  { re: /gsk_[a-zA-Z0-9]{8,}/, label: "Groq key" },
  { re: /ghp_[a-zA-Z0-9]{16,}/, label: "GitHub token" },
  { re: /AIza[0-9A-Za-z_-]{20,}/, label: "Google key" },
  { re: /AKIA[0-9A-Z]{16}/, label: "AWS key" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: "private key" },
  { re: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, label: "JWT" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function collectStringValues(value: unknown, out: string[]): void {
  if (isString(value)) {
    out.push(value);
    return;
  }
  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      out.push(key);
      collectStringValues(value[key], out);
    }
  }
}

/** Detect secret-like content in any serialized reminder text. */
export function containsSecret(text: string): { found: boolean; label?: string } {
  for (const { re, label } of SECRET_KEY_PATTERNS) {
    if (re.test(text)) return { found: true, label };
  }
  for (const { re, label } of SECRET_VALUE_PATTERNS) {
    if (re.test(text)) return { found: true, label };
  }
  return { found: false };
}

function validateNoSecrets(input: unknown): ReminderValidationResult {
  const values: string[] = [];
  collectStringValues(input, values);
  for (const value of values) {
    const result = containsSecret(value);
    if (result.found) {
      return { valid: false, error: `Reminder rejected: contains ${result.label}` };
    }
  }
  return { valid: true };
}

/**
 * Validate a reminder input. The client can never set id/timestamps/firedAt/
 * triggeredTimes — unknown root fields are rejected.
 */
export function validateReminderInput(input: unknown): ReminderValidationResult {
  if (!isRecord(input)) {
    return { valid: false, error: "Reminder must be an object" };
  }

  const allowedRootKeys = new Set(["title", "dueAt", "repeat", "taskId"]);
  for (const key of Object.keys(input)) {
    if (!allowedRootKeys.has(key)) {
      return { valid: false, error: `Unknown reminder field '${key}' (cannot be set)` };
    }
  }

  const title = input.title;
  if (!isString(title) || title.trim().length === 0) {
    return { valid: false, error: "Reminder requires a non-empty 'title'" };
  }
  if (title.length > REMINDER_LIMITS.MAX_TITLE) {
    return { valid: false, error: `Title exceeds ${REMINDER_LIMITS.MAX_TITLE} characters` };
  }

  const dueAt = input.dueAt;
  if (typeof dueAt !== "number" || !Number.isFinite(dueAt)) {
    return { valid: false, error: "'dueAt' must be a finite timestamp in milliseconds" };
  }
  if (dueAt < 0 || dueAt > REMINDER_LIMITS.MAX_DUE_AT) {
    return { valid: false, error: "'dueAt' is out of range" };
  }

  const repeat = input.repeat;
  if (repeat !== undefined && (!isString(repeat) || !["none", "daily", "weekly"].includes(repeat))) {
    return { valid: false, error: "'repeat' must be none|daily|weekly" };
  }

  const taskId = input.taskId;
  if (taskId !== undefined && (!isString(taskId) || taskId.length === 0 || taskId.length > 100)) {
    return { valid: false, error: "'taskId' must be a short string when present" };
  }

  const secretCheck = validateNoSecrets(input);
  if (!secretCheck.valid) return secretCheck;

  return { valid: true };
}

/** Validate an update patch (only known mutable fields, fully re-validated). */
export function validateReminderUpdate(patch: unknown): ReminderValidationResult {
  if (!isRecord(patch)) {
    return { valid: false, error: "Reminder update must be an object" };
  }
  const allowedKeys = new Set(["title", "dueAt", "repeat", "taskId", "enabled"]);
  for (const key of Object.keys(patch)) {
    if (!allowedKeys.has(key)) {
      return { valid: false, error: `Unknown reminder field '${key}' (cannot be set)` };
    }
  }
  if ("enabled" in patch && typeof (patch as { enabled: unknown }).enabled !== "boolean") {
    return { valid: false, error: "'enabled' must be a boolean" };
  }
  // An update is a partial patch: it may omit dueAt (unlike full create, where
  // it is required) and may toggle 'enabled'. Build the merged candidate with
  // a dueAt placeholder (validated only when actually provided) and without
  // 'enabled', then re-validate with the same rules as create.
  const candidate: Record<string, unknown> = { title: "reminder", dueAt: 0, ...patch };
  if ("enabled" in patch) {
    delete candidate.enabled;
  }
  return validateReminderInput(candidate);
}
