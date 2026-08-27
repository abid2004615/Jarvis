/**
 * JARVIS Goal-Oriented Workflows — Validation
 *
 * Strict, server-authoritative validation of goal inputs, plans, and steps.
 * The model and the client can never authorize anything: fields are bounded,
 * unknown fields are rejected, and any hint of a secret, command, path,
 * or URL is rejected.
 *
 * Goals execute through the existing ActionChain → PermissionManager →
 * Confirmation flow. Goals never bypass the existing safety architecture.
 */

import {
  GOAL_LIMITS,
  GOAL_STATUSES,
  type GoalInput,
  type GoalStep,
  type GoalType,
  type GoalPriority,
} from "./types";
import { getToolRegistry } from "@/lib/tools/registry";

// ── Secret Detection ──────────────────────────────────────────────────────────

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

// ── Forbidden Patterns ────────────────────────────────────────────────────────

const SHELL_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\brm\s+(-[a-zA-Z]*f|-[a-zA-Z]*r)/i, label: "force delete" },
  { re: /\bsudo\b/i, label: "sudo" },
  { re: /\bchmod\s+777\b/i, label: "chmod 777" },
  { re: /\bdel\s+\/[a-zA-Z]/i, label: "Windows delete" },
  { re: /\bformat\b.*\b[a-zA-Z]:/i, label: "format drive" },
  { re: /\bmkfs\b/i, label: "format filesystem" },
  { re: /\bdd\s+.*of=\/dev\//i, label: "dd write to device" },
  { re: /\bkill\s+-9\s+1\b/i, label: "kill init" },
  { re: /\bshutdown\b/i, label: "shutdown" },
  { re: /\breboot\b/i, label: "reboot" },
];

const SCRIPT_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bosascript\b/i, label: "osascript" },
  { re: /\bapplescript\b/i, label: "AppleScript" },
  { re: /\brun\s+script\b/i, label: "run script" },
  { re: /\beval\s*\(/i, label: "eval" },
  { re: /\bexec\s*\(/i, label: "exec" },
  { re: /\bspawn\b/i, label: "spawn" },
];

const URL_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /javascript:/i, label: "javascript URL" },
  { re: /file:\/\//i, label: "file URL" },
  { re: /data:/i, label: "data URL" },
  { re: /ftp:\/\//i, label: "ftp URL" },
];

const PATH_TRAVERSAL_RE = /\.\.[/\\]/;
const ARBITRARY_COORDINATE_RE = /\bclick\b.*\b(\d{2,4})\s*[,x]\s*(\d{2,4})\b/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function containsSecret(text: string): { found: boolean; label?: string } {
  for (const { re, label } of SECRET_KEY_PATTERNS) {
    if (re.test(text)) return { found: true, label };
  }
  for (const { re, label } of SECRET_VALUE_PATTERNS) {
    if (re.test(text)) return { found: true, label };
  }
  return { found: false };
}

function containsShellCommand(text: string): { found: boolean; label?: string } {
  for (const { re, label } of SHELL_PATTERNS) {
    if (re.test(text)) return { found: true, label };
  }
  return { found: false };
}

function containsScriptInjection(text: string): { found: boolean; label?: string } {
  for (const { re, label } of SCRIPT_PATTERNS) {
    if (re.test(text)) return { found: true, label };
  }
  return { found: false };
}

function containsUnsafeUrl(text: string): { found: boolean; label?: string } {
  for (const { re, label } of URL_PATTERNS) {
    if (re.test(text)) return { found: true, label };
  }
  return { found: false };
}

// ── Validation Result ─────────────────────────────────────────────────────────

export interface GoalValidationResult {
  valid: boolean;
  error?: string;
}

// ── Goal Input Validation ─────────────────────────────────────────────────────

export function validateGoalInput(input: unknown): GoalValidationResult {
  if (!isRecord(input)) {
    return { valid: false, error: "Goal must be an object" };
  }

  const allowedRootKeys = new Set(["title", "description", "type", "priority"]);
  for (const key of Object.keys(input)) {
    if (!allowedRootKeys.has(key)) {
      return { valid: false, error: `Unknown goal field '${key}' (cannot be set)` };
    }
  }

  const title = input.title;
  if (!isString(title) || title.trim().length === 0) {
    return { valid: false, error: "Goal requires a non-empty 'title'" };
  }
  if (title.length > GOAL_LIMITS.MAX_TITLE) {
    return { valid: false, error: `Title exceeds ${GOAL_LIMITS.MAX_TITLE} characters` };
  }

  const description = input.description;
  if (description !== undefined && !isString(description)) {
    return { valid: false, error: "'description' must be a string" };
  }
  if (isString(description) && description.length > GOAL_LIMITS.MAX_DESCRIPTION) {
    return { valid: false, error: `Description exceeds ${GOAL_LIMITS.MAX_DESCRIPTION} characters` };
  }

  const type = input.type;
  if (type !== undefined) {
    if (!isString(type) || !["one_shot", "multi_step", "conditional", "monitoring"].includes(type)) {
      return { valid: false, error: "'type' must be one_shot|multi_step|conditional|monitoring" };
    }
  }

  const priority = input.priority;
  if (priority !== undefined) {
    if (!isString(priority) || !["low", "normal", "high", "urgent"].includes(priority)) {
      return { valid: false, error: "'priority' must be low|normal|high|urgent" };
    }
  }

  const secretCheck = validateNoSecrets(input);
  if (!secretCheck.valid) return secretCheck;

  const shellCheck = validateNoShellCommands(input);
  if (!shellCheck.valid) return shellCheck;

  const scriptCheck = validateNoScriptInjection(input);
  if (!scriptCheck.valid) return scriptCheck;

  return { valid: true };
}

// ── Plan Validation ───────────────────────────────────────────────────────────

export function validateGoalPlan(steps: unknown): GoalValidationResult {
  if (!Array.isArray(steps)) {
    return { valid: false, error: "Plan must be an array of steps" };
  }

  if (steps.length === 0) {
    return { valid: false, error: "Plan must have at least one step" };
  }

  if (steps.length > GOAL_LIMITS.MAX_STEPS) {
    return { valid: false, error: `Plan exceeds ${GOAL_LIMITS.MAX_STEPS} steps` };
  }

  const ids = new Set<string>();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepResult = validateGoalStep(step, i);
    if (!stepResult.valid) return stepResult;

    const s = step as GoalStep;
    if (ids.has(s.id)) {
      return { valid: false, error: `Duplicate step id '${s.id}' at position ${i}` };
    }
    ids.add(s.id);
  }

  const depResult = validateDependencies(steps as GoalStep[]);
  if (!depResult.valid) return depResult;

  const cycleResult = validateNoCyclicDependencies(steps as GoalStep[]);
  if (!cycleResult.valid) return cycleResult;

  const secretResult = validateNoSecrets(steps);
  if (!secretResult.valid) return secretResult;

  const shellResult = validateNoShellCommands(steps);
  if (!shellResult.valid) return shellResult;

  const scriptResult = validateNoScriptInjection(steps);
  if (!scriptResult.valid) return scriptResult;

  const coordResult = validateNoArbitraryCoordinates(steps);
  if (!coordResult.valid) return coordResult;

  const pathResult = validateNoPathTraversal(steps);
  if (!pathResult.valid) return pathResult;

  const urlResult = validateNoUnsafeUrls(steps);
  if (!urlResult.valid) return urlResult;

  return { valid: true };
}

// ── Step Validation ───────────────────────────────────────────────────────────

function validateGoalStep(step: unknown, index: number): GoalValidationResult {
  if (!isRecord(step)) {
    return { valid: false, error: `Step ${index} must be an object` };
  }

  const allowedKeys = new Set([
    "id",
    "description",
    "toolId",
    "arguments",
    "dependencies",
    "risk",
    "requiresConfirmation",
    "verification",
  ]);

  for (const key of Object.keys(step)) {
    if (!allowedKeys.has(key)) {
      return { valid: false, error: `Step ${index}: unknown field '${key}'` };
    }
  }

  if (!isString(step.id) || step.id.trim().length === 0) {
    return { valid: false, error: `Step ${index}: requires a non-empty 'id'` };
  }

  if (!isString(step.description) || step.description.trim().length === 0) {
    return { valid: false, error: `Step ${index}: requires a non-empty 'description'` };
  }
  if (isString(step.description) && step.description.length > GOAL_LIMITS.MAX_STEP_DESCRIPTION) {
    return { valid: false, error: `Step ${index}: description exceeds ${GOAL_LIMITS.MAX_STEP_DESCRIPTION} characters` };
  }

  if (step.toolId !== undefined) {
    if (!isString(step.toolId)) {
      return { valid: false, error: `Step ${index}: 'toolId' must be a string` };
    }
    const registry = getToolRegistry();
    if (!registry.hasTool(step.toolId)) {
      return { valid: false, error: `Step ${index}: unknown tool '${step.toolId}'` };
    }
  }

  if (step.arguments !== undefined) {
    if (!isRecord(step.arguments)) {
      return { valid: false, error: `Step ${index}: 'arguments' must be an object` };
    }
  }

  if (step.dependencies !== undefined) {
    if (!Array.isArray(step.dependencies)) {
      return { valid: false, error: `Step ${index}: 'dependencies' must be an array` };
    }
    for (const dep of step.dependencies) {
      if (!isString(dep)) {
        return { valid: false, error: `Step ${index}: dependency must be a string` };
      }
    }
  }

  if (step.risk !== undefined) {
    if (!isString(step.risk) || !["safe", "confirmation", "restricted"].includes(step.risk)) {
      return { valid: false, error: `Step ${index}: 'risk' must be safe|confirmation|restricted` };
    }
  }

  if (step.requiresConfirmation !== undefined && typeof step.requiresConfirmation !== "boolean") {
    return { valid: false, error: `Step ${index}: 'requiresConfirmation' must be a boolean` };
  }

  if (!isString(step.verification) || step.verification.trim().length === 0) {
    return { valid: false, error: `Step ${index}: requires a non-empty 'verification'` };
  }
  if (isString(step.verification) && step.verification.length > GOAL_LIMITS.MAX_VERIFICATION_DESCRIPTION) {
    return { valid: false, error: `Step ${index}: verification exceeds ${GOAL_LIMITS.MAX_VERIFICATION_DESCRIPTION} characters` };
  }

  return { valid: true };
}

// ── Dependency Validation ─────────────────────────────────────────────────────

function validateDependencies(steps: GoalStep[]): GoalValidationResult {
  const ids = new Set(steps.map((s) => s.id));
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.dependencies) {
      for (const dep of step.dependencies) {
        if (!ids.has(dep)) {
          return { valid: false, error: `Step ${i} references unknown dependency '${dep}'` };
        }
      }
    }
  }
  return { valid: true };
}

// ── Cycle Detection ───────────────────────────────────────────────────────────

function validateNoCyclicDependencies(steps: GoalStep[]): GoalValidationResult {
  const indexMap = new Map(steps.map((s, i) => [s.id, i]));
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string): boolean {
    if (inStack.has(id)) return true; // cycle
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    const step = steps.find((s) => s.id === id);
    if (step?.dependencies) {
      for (const dep of step.dependencies) {
        if (dfs(dep)) return true;
      }
    }
    inStack.delete(id);
    return false;
  }

  for (const step of steps) {
    if (dfs(step.id)) {
      return { valid: false, error: `Circular dependency detected involving step '${step.id}'` };
    }
  }
  return { valid: true };
}

// ── Security Validators ───────────────────────────────────────────────────────

function validateNoSecrets(input: unknown): GoalValidationResult {
  const values: string[] = [];
  collectStringValues(input, values);
  for (const value of values) {
    const result = containsSecret(value);
    if (result.found) {
      return { valid: false, error: `Rejected: contains ${result.label}` };
    }
  }
  return { valid: true };
}

function validateNoShellCommands(input: unknown): GoalValidationResult {
  const values: string[] = [];
  collectStringValues(input, values);
  for (const value of values) {
    const result = containsShellCommand(value);
    if (result.found) {
      return { valid: false, error: `Rejected: contains shell command (${result.label})` };
    }
  }
  return { valid: true };
}

function validateNoScriptInjection(input: unknown): GoalValidationResult {
  const values: string[] = [];
  collectStringValues(input, values);
  for (const value of values) {
    const result = containsScriptInjection(value);
    if (result.found) {
      return { valid: false, error: `Rejected: contains script injection (${result.label})` };
    }
  }
  return { valid: true };
}

function validateNoArbitraryCoordinates(input: unknown): GoalValidationResult {
  const values: string[] = [];
  collectStringValues(input, values);
  for (const value of values) {
    if (ARBITRARY_COORDINATE_RE.test(value)) {
      return { valid: false, error: "Rejected: arbitrary coordinates not allowed" };
    }
  }
  return { valid: true };
}

function validateNoPathTraversal(input: unknown): GoalValidationResult {
  const values: string[] = [];
  collectStringValues(input, values);
  for (const value of values) {
    if (PATH_TRAVERSAL_RE.test(value)) {
      return { valid: false, error: "Rejected: path traversal not allowed" };
    }
  }
  return { valid: true };
}

function validateNoUnsafeUrls(input: unknown): GoalValidationResult {
  const values: string[] = [];
  collectStringValues(input, values);
  for (const value of values) {
    const result = containsUnsafeUrl(value);
    if (result.found) {
      return { valid: false, error: `Rejected: unsafe URL (${result.label})` };
    }
  }
  return { valid: true };
}
