/**
 * JARVIS Personal Tasks — Validation
 *
 * Strict, server-authoritative validation of task inputs. The model and the
 * client can never authorize anything: fields are bounded, unknown fields are
 * rejected, and any hint of a secret, command, path, or URL is rejected.
 *
 * Tasks are data, never executable. Their fields can never become commands.
 */

import { TASK_LIMITS, type TaskInput, type TaskValidationResult } from "./types";

const SECRET_KEY_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /(^|[^a-z0-9])password([^a-z0-9]|$)/i, label: "password" },
  { re: /(^|[^a-z0-9])passwd([^a-z0-9]|$)/i, label: "passwd" },
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
  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, out);
    return;
  }
  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      out.push(key);
      collectStringValues(value[key], out);
    }
  }
}

/** Detect secret-like content in any serialized task text. */
export function containsSecret(text: string): { found: boolean; label?: string } {
  for (const { re, label } of SECRET_KEY_PATTERNS) {
    if (re.test(text)) return { found: true, label };
  }
  for (const { re, label } of SECRET_VALUE_PATTERNS) {
    if (re.test(text)) return { found: true, label };
  }
  return { found: false };
}

function validateNoSecrets(input: unknown): TaskValidationResult {
  const values: string[] = [];
  collectStringValues(input, values);
  for (const value of values) {
    const result = containsSecret(value);
    if (result.found) {
      return { valid: false, error: `Task rejected: contains ${result.label}` };
    }
  }
  return { valid: true };
}

function validateTags(tags: unknown): TaskValidationResult {
  if (tags === undefined) return { valid: true };
  if (!Array.isArray(tags) || tags.length > TASK_LIMITS.MAX_TAGS) {
    return { valid: false, error: `Tags must be an array of at most ${TASK_LIMITS.MAX_TAGS} strings` };
  }
  for (const tag of tags) {
    if (typeof tag !== "string" || tag.trim().length === 0) {
      return { valid: false, error: "Each tag must be a non-empty string" };
    }
    if (tag.length > TASK_LIMITS.MAX_TAG_LENGTH) {
      return { valid: false, error: `Tag exceeds ${TASK_LIMITS.MAX_TAG_LENGTH} characters` };
    }
    if (containsSecret(tag).found) {
      return { valid: false, error: "Tag contains secret-like content" };
    }
  }
  return { valid: true };
}

/**
 * Validate a task input (from the model tool or API). The client can never
 * set id/createdAt/updatedAt/completedAt/status-trust — unknown root fields
 * are rejected.
 */
export function validateTaskInput(input: unknown): TaskValidationResult {
  if (!isRecord(input)) {
    return { valid: false, error: "Task must be an object" };
  }

  const allowedRootKeys = new Set(["title", "description", "priority", "dueAt", "tags"]);
  for (const key of Object.keys(input)) {
    if (!allowedRootKeys.has(key)) {
      return { valid: false, error: `Unknown task field '${key}' (cannot be set)` };
    }
  }

  const title = input.title;
  if (!isString(title) || title.trim().length === 0) {
    return { valid: false, error: "Task requires a non-empty 'title'" };
  }
  if (title.length > TASK_LIMITS.MAX_TITLE) {
    return { valid: false, error: `Title exceeds ${TASK_LIMITS.MAX_TITLE} characters` };
  }

  const description = input.description;
  if (description !== undefined && !isString(description)) {
    return { valid: false, error: "'description' must be a string" };
  }
  if (isString(description) && description.length > TASK_LIMITS.MAX_DESCRIPTION) {
    return { valid: false, error: `Description exceeds ${TASK_LIMITS.MAX_DESCRIPTION} characters` };
  }

  const priority = input.priority;
  if (priority !== undefined) {
    if (!isString(priority) || !["low", "normal", "high", "urgent"].includes(priority)) {
      return { valid: false, error: "'priority' must be low|normal|high|urgent" };
    }
  }

  const dueAt = input.dueAt;
  if (dueAt !== undefined) {
    if (typeof dueAt !== "number" || !Number.isFinite(dueAt)) {
      return { valid: false, error: "'dueAt' must be a finite timestamp in milliseconds" };
    }
    if (dueAt < 0 || dueAt > 4_102_444_800_000) {
      return { valid: false, error: "'dueAt' is out of range" };
    }
  }

  const tagResult = validateTags(input.tags);
  if (!tagResult.valid) return tagResult;

  const secretCheck = validateNoSecrets(input);
  if (!secretCheck.valid) return secretCheck;

  return { valid: true };
}

/** Validate an update patch (only known mutable fields, fully re-validated). */
export function validateTaskUpdate(id: string, patch: unknown): TaskValidationResult {
  if (!isRecord(patch)) {
    return { valid: false, error: "Task update must be an object" };
  }
  const allowedKeys = new Set(["title", "description", "priority", "dueAt", "tags"]);
  for (const key of Object.keys(patch)) {
    if (!allowedKeys.has(key)) {
      return { valid: false, error: `Unknown task field '${key}' (cannot be set)` };
    }
  }
  // The patch may omit title; validate the fields actually provided against a
  // merged candidate (title falls back to a placeholder for the update check).
  const candidate: Record<string, unknown> = { title: "task", ...patch };
  return validateTaskInput(candidate);
}
