/**
 * JARVIS Personal Routines — Validation
 *
 * Strict, server-authoritative validation. Every routine step must reference a
 * REGISTERED ToolRegistry tool with arguments that match that tool's own
 * schema. Forbidden keys (command/path/url/etc.) and secrets are rejected.
 * Unknown fields are rejected. No step can ever become an arbitrary command.
 */

import { ROUTINE_LIMITS, type RoutineInput, type RoutineStep, type RoutineValidationResult } from "./types";
import { getToolRegistry } from "@/lib/tools/registry";
import { ToolInputValidator } from "@/lib/tools/types";

const FORBIDDEN_ARGUMENT_KEYS = new Set([
  "command",
  "cmd",
  "shell",
  "script",
  "executable",
  "binary",
  "path",
  "filePath",
  "url",
  "uri",
  "appleScript",
  "osascript",
  "python",
  "node",
  "bash",
  "sh",
  "zsh",
  "perl",
  "ruby",
]);

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

/** Detect secret-like content in any serialized routine text. */
export function containsSecret(text: string): { found: boolean; label?: string } {
  for (const { re, label } of SECRET_KEY_PATTERNS) {
    if (re.test(text)) return { found: true, label };
  }
  for (const { re, label } of SECRET_VALUE_PATTERNS) {
    if (re.test(text)) return { found: true, label };
  }
  return { found: false };
}

function validateNoSecrets(input: unknown): RoutineValidationResult {
  const values: string[] = [];
  collectStringValues(input, values);
  for (const value of values) {
    const result = containsSecret(value);
    if (result.found) {
      return { valid: false, error: `Routine rejected: contains ${result.label}` };
    }
  }
  return { valid: true };
}

/** Validate a single routine step against the live ToolRegistry. */
export function validateRoutineStep(step: unknown): RoutineValidationResult {
  if (!isRecord(step)) {
    return { valid: false, error: "Each routine step must be an object" };
  }
  for (const key of Object.keys(step)) {
    if (key !== "toolId" && key !== "arguments" && key !== "label") {
      return { valid: false, error: `Unknown step field '${key}'` };
    }
  }

  const toolId = step.toolId;
  if (!isString(toolId) || toolId.length === 0) {
    return { valid: false, error: "Each routine step requires a 'toolId'" };
  }

  const label = step.label;
  if (label !== undefined && (!isString(label) || label.length > ROUTINE_LIMITS.MAX_LABEL)) {
    return { valid: false, error: `Step label exceeds ${ROUTINE_LIMITS.MAX_LABEL} characters` };
  }

  const args = step.arguments;
  if (!isRecord(args)) {
    return { valid: false, error: `Step '${toolId}' arguments must be an object` };
  }

  for (const key of Object.keys(args)) {
    if (FORBIDDEN_ARGUMENT_KEYS.has(key)) {
      return { valid: false, error: `Argument key '${key}' is not allowed in routines` };
    }
  }

  const tool = getToolRegistry().getTool(toolId);
  if (!tool) {
    return { valid: false, error: `Tool '${toolId}' is not registered` };
  }
  const validation = ToolInputValidator.validate(args, tool.inputSchema);
  if (!validation.valid) {
    return { valid: false, error: `Invalid arguments for ${toolId}: ${validation.error}` };
  }

  return { valid: true };
}

/**
 * Validate a routine input. The client can never set id/timestamps/enabled/
 * lastRun* — unknown root fields are rejected.
 */
export function validateRoutineInput(input: unknown): RoutineValidationResult {
  if (!isRecord(input)) {
    return { valid: false, error: "Routine must be an object" };
  }

  const allowedRootKeys = new Set(["name", "description", "steps"]);
  for (const key of Object.keys(input)) {
    if (!allowedRootKeys.has(key)) {
      return { valid: false, error: `Unknown routine field '${key}' (cannot be set)` };
    }
  }

  const name = input.name;
  if (!isString(name) || name.trim().length === 0) {
    return { valid: false, error: "Routine requires a non-empty 'name'" };
  }
  if (name.length > ROUTINE_LIMITS.MAX_NAME) {
    return { valid: false, error: `Name exceeds ${ROUTINE_LIMITS.MAX_NAME} characters` };
  }

  const description = input.description;
  if (description !== undefined && !isString(description)) {
    return { valid: false, error: "'description' must be a string" };
  }
  if (isString(description) && description.length > ROUTINE_LIMITS.MAX_DESCRIPTION) {
    return { valid: false, error: `Description exceeds ${ROUTINE_LIMITS.MAX_DESCRIPTION} characters` };
  }

  const steps = input.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    return { valid: false, error: "Routine requires at least one step" };
  }
  if (steps.length > ROUTINE_LIMITS.MAX_STEPS) {
    return { valid: false, error: `Routines are limited to ${ROUTINE_LIMITS.MAX_STEPS} steps` };
  }

  for (const step of steps) {
    const result = validateRoutineStep(step);
    if (!result.valid) return result;
  }

  const secretCheck = validateNoSecrets(input);
  if (!secretCheck.valid) return secretCheck;

  return { valid: true };
}
