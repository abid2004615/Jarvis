/**
 * JARVIS Automation — Validation
 *
 * Strict, server-authoritative validation of automation inputs. The client and
 * the model can NEVER authorize anything: every field is checked, unknown
 * fields are rejected, schedules/thresholds are bounded, and any hint of a
 * command, path, URL, or secret is rejected outright.
 *
 * Automations store a ToolRegistry tool ID + validated arguments — nothing else.
 */

import {
  AUTOMATION_LIMITS,
  AUTO_RUN_TOOL_IDS,
  GATED_SCHEDULED_TOOL_IDS,
  SCHEDULABLE_TOOL_IDS,
  type AutomationAction,
  type AutomationInput,
  type AutomationTrigger,
  type AutomationValidationResult,
  type ConditionMetric,
  type ConditionOperator,
  type ConditionTrigger,
  type IntervalTrigger,
} from "./types";
import { getToolRegistry } from "@/lib/tools/registry";
import { ToolInputValidator } from "@/lib/tools/types";

const TRIGGER_TYPES = new Set(["once", "daily", "weekly", "interval", "condition"]);
const NUMERIC_METRICS = new Set(["battery", "cpu", "memory", "disk"]);
const NUMERIC_OPERATORS = new Set(["<", "<=", ">", ">=", "=="]);
const APP_OPERATORS = new Set(["running", "not_running"]);

const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Argument keys that are NEVER acceptable in an automation action, even as
 * defense in depth (the tool schema's additionalProperties:false already
 * rejects unknown keys — this catches any future tool schema that accepts
 * free-form keys).
 */
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

/**
 * Detect secret-like content in any string (key names and values). Used on
 * the full serialized automation so a secret anywhere is rejected.
 */
export function containsSecret(text: string): { found: boolean; label?: string } {
  for (const { re, label } of SECRET_KEY_PATTERNS) {
    if (re.test(text)) return { found: true, label };
  }
  for (const { re, label } of SECRET_VALUE_PATTERNS) {
    if (re.test(text)) return { found: true, label };
  }
  return { found: false };
}

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

/** Reject any automation whose serialized form contains secret material. */
function validateNoSecrets(input: AutomationInput): AutomationValidationResult {
  const values: string[] = [];
  collectStringValues(input, values);
  for (const value of values) {
    const result = containsSecret(value);
    if (result.found) {
      return { valid: false, error: `Automation rejected: contains ${result.label}` };
    }
  }
  return { valid: true };
}

function validateTrigger(trigger: unknown): AutomationValidationResult {
  if (!isRecord(trigger)) {
    return { valid: false, error: "Trigger must be an object" };
  }

  const type = trigger.type;
  if (!isString(type) || !TRIGGER_TYPES.has(type)) {
    return { valid: false, error: `Unknown trigger type '${String(type)}'` };
  }

  const allowedKeys: Record<string, string[]> = {
    once: ["type", "date", "at"],
    daily: ["type", "at"],
    weekly: ["type", "at", "dayOfWeek"],
    interval: ["type", "minutes"],
    condition: ["type", "metric", "operator", "value"],
  };

  for (const key of Object.keys(trigger)) {
    if (!allowedKeys[type].includes(key)) {
      return { valid: false, error: `Unknown trigger field '${key}'` };
    }
  }

  switch (type) {
    case "once": {
      const { date, at } = trigger as { date?: unknown; at?: unknown };
      if (date !== undefined && !(isString(date) && DATE_RE.test(date))) {
        return { valid: false, error: "once trigger 'date' must be YYYY-MM-DD" };
      }
      if (at !== undefined && !(isString(at) && TIME_OF_DAY_RE.test(at))) {
        return { valid: false, error: "once trigger 'at' must be HH:MM" };
      }
      return { valid: true };
    }
    case "daily": {
      const { at } = trigger as { at?: unknown };
      if (!isString(at) || !TIME_OF_DAY_RE.test(at)) {
        return { valid: false, error: "daily trigger requires at='HH:MM'" };
      }
      return { valid: true };
    }
    case "weekly": {
      const { at, dayOfWeek } = trigger as { at?: unknown; dayOfWeek?: unknown };
      if (!isString(at) || !TIME_OF_DAY_RE.test(at)) {
        return { valid: false, error: "weekly trigger requires at='HH:MM'" };
      }
      if (typeof dayOfWeek !== "number" || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        return { valid: false, error: "weekly trigger 'dayOfWeek' must be an integer 0-6" };
      }
      return { valid: true };
    }
    case "interval": {
      const { minutes } = trigger as unknown as IntervalTrigger;
      if (typeof minutes !== "number" || !Number.isFinite(minutes)) {
        return { valid: false, error: "interval trigger requires a numeric 'minutes'" };
      }
      if (minutes < AUTOMATION_LIMITS.MIN_INTERVAL_MINUTES) {
        return {
          valid: false,
          error: `interval must be at least ${AUTOMATION_LIMITS.MIN_INTERVAL_MINUTES} minute(s)`,
        };
      }
      if (minutes > 24 * 60) {
        return { valid: false, error: "interval must be at most 1440 minutes" };
      }
      return { valid: true };
    }
    case "condition": {
      const { metric, operator, value } = trigger as unknown as ConditionTrigger;
      if (!isString(metric) || !NUMERIC_METRICS.has(metric as ConditionMetric)) {
        return { valid: false, error: `Unknown condition metric '${String(metric)}'` };
      }
      if (!isString(operator) || !NUMERIC_OPERATORS.has(operator as ConditionOperator)) {
        return { valid: false, error: `Unknown condition operator '${String(operator)}'` };
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { valid: false, error: "condition 'value' must be a finite number" };
      }
      if (value < 0 || value > 100) {
        return { valid: false, error: "condition threshold must be between 0 and 100" };
      }
      return { valid: true };
    }
    default:
      return { valid: false, error: "Unsupported trigger" };
  }
}

/** Validate an application-running condition trigger. */
export function validateApplicationCondition(trigger: unknown): AutomationValidationResult {
  if (!isRecord(trigger) || trigger.type !== "condition") {
    return { valid: false, error: "Expected a condition trigger" };
  }
  if (trigger.metric !== "application") {
    return { valid: false, error: "Expected metric 'application'" };
  }
  const operator = trigger.operator;
  if (!isString(operator) || !APP_OPERATORS.has(operator)) {
    return { valid: false, error: "application condition requires operator 'running' or 'not_running'" };
  }
  if (!isString(trigger.value) || trigger.value.trim().length === 0) {
    return { valid: false, error: "application condition requires a non-empty application name" };
  }
  if ((trigger.value as string).length > 100) {
    return { valid: false, error: "application name is too long" };
  }
  return { valid: true };
}

function validateAction(action: unknown): AutomationValidationResult {
  if (!isRecord(action)) {
    return { valid: false, error: "Action must be an object" };
  }
  for (const key of Object.keys(action)) {
    if (key !== "toolId" && key !== "arguments") {
      return { valid: false, error: `Unknown action field '${key}'` };
    }
  }

  const toolId = action.toolId;
  if (!isString(toolId) || toolId.length === 0) {
    return { valid: false, error: "Action requires a 'toolId'" };
  }
  if (!SCHEDULABLE_TOOL_IDS.includes(toolId)) {
    return { valid: false, error: `Tool '${toolId}' cannot be used in an automation` };
  }

  const args = action.arguments;
  if (!isRecord(args)) {
    return { valid: false, error: "Action 'arguments' must be an object" };
  }

  for (const key of Object.keys(args)) {
    if (FORBIDDEN_ARGUMENT_KEYS.has(key)) {
      return { valid: false, error: `Argument key '${key}' is not allowed in automations` };
    }
  }

  // Arguments must match the tool's own schema (additionalProperties: false
  // on every tool rejects unknown/extra keys at the tool level too).
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
 * Validate a full automation input (from the model tool or the API).
 * The client cannot set id/createdAt/requiresConfirmation/enabled — unknown
 * fields on the root object are rejected.
 */
export function validateAutomationInput(input: unknown): AutomationValidationResult {
  if (!isRecord(input)) {
    return { valid: false, error: "Automation must be an object" };
  }

  const allowedRootKeys = new Set(["name", "description", "trigger", "action"]);
  for (const key of Object.keys(input)) {
    if (!allowedRootKeys.has(key)) {
      return { valid: false, error: `Unknown automation field '${key}' (cannot be set)` };
    }
  }

  const name = input.name;
  if (!isString(name) || name.trim().length === 0) {
    return { valid: false, error: "Automation requires a non-empty 'name'" };
  }
  if (name.length > AUTOMATION_LIMITS.MAX_NAME_LENGTH) {
    return { valid: false, error: `Name exceeds ${AUTOMATION_LIMITS.MAX_NAME_LENGTH} characters` };
  }

  const description = input.description;
  if (description !== undefined && !isString(description)) {
    return { valid: false, error: "'description' must be a string" };
  }
  if (isString(description) && description.length > AUTOMATION_LIMITS.MAX_DESCRIPTION_LENGTH) {
    return { valid: false, error: `Description exceeds ${AUTOMATION_LIMITS.MAX_DESCRIPTION_LENGTH} characters` };
  }

  const secretCheck = validateNoSecrets(input as unknown as AutomationInput);
  if (!secretCheck.valid) {
    return secretCheck;
  }

  const triggerResult = validateTrigger(input.trigger);
  if (!triggerResult.valid) {
    return triggerResult;
  }
  const actionResult = validateAction(input.action);
  if (!actionResult.valid) {
    return actionResult;
  }

  return { valid: true };
}

/**
 * Whether a schedulable tool requires execution-time confirmation.
 * Anything not on the auto-run allowlist is gated by definition.
 */
export function toolRequiresScheduledConfirmation(toolId: string): boolean {
  if (AUTO_RUN_TOOL_IDS.includes(toolId)) return false;
  if (GATED_SCHEDULED_TOOL_IDS.includes(toolId)) return true;
  return true;
}

/** Normalize a validated action into a canonical AutomationAction. */
export function toAutomationAction(action: AutomationAction): AutomationAction {
  return {
    toolId: action.toolId,
    arguments: { ...action.arguments },
  };
}
