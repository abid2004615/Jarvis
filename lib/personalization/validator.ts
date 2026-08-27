/**
 * JARVIS Personalization — Validator
 *
 * Validates all personalization inputs before they reach the store.
 * Rejects secrets, shell commands, script injection, sensitive profiling,
 * and unknown fields. Never stores arbitrary categories from model output.
 */

import {
  PREFERENCE_CATEGORIES,
  PERSONALIZATION_LIMITS,
  VALID_SOURCES,
  type PreferenceCategory,
  type PreferenceSource,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// ── Secret Detection ─────────────────────────────────────────────────────────

const SECRET_PATTERNS: RegExp[] = [
  /\bgsk_[A-Za-z0-9_-]{6,}\b/,
  /\bsk-[A-Za-z0-9_-]{10,}\b/,
  /\bsk_(live|test)_[A-Za-z0-9]{10,}\b/i,
  /\b(pk|rk)_(live|test)_[A-Za-z0-9]{10,}\b/i,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/i,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/i,
  /-----BEGIN[ A-Z]*PRIVATE KEY-----/,
  /\b(password|passwd|pwd|token)\b[^\n.]{0,60}?(is|:=|=|:)\s*["']?[\S]{3,}/i,
  /\b(api[\s_-]?key|access[\s_-]?token|refresh[\s_-]?token|session[\s_-]?token|auth[\s_-]?token|client[\s_-]?secret|private[\s_-]?key)\b[^\n.]{0,60}?(is|:=|=|:)\s*["']?[\S]{3,}/i,
  /\bgsk_[^\s]{3,}/,
];

function containsSecret(text: string): boolean {
  if (!text) return false;
  return SECRET_PATTERNS.some((p) => p.test(text));
}

// ── Shell / Script Detection ─────────────────────────────────────────────────

const SHELL_PATTERNS: RegExp[] = [
  /^\s*(sudo|rm|rmdir|sh|bash|zsh|osascript|curl|wget|kill|pkill|killall|dd|mkfs|chmod|chown|nc|telnet)\b/i,
  /\bosascript\b/i,
  /\bsudo\b/i,
];

function containsShell(text: string): boolean {
  return SHELL_PATTERNS.some((p) => p.test(text));
}

// ── Sensitive Profiling Detection ────────────────────────────────────────────

const SENSITIVE_KEYWORDS: string[] = [
  "religio",
  "race",
  "ethnicit",
  "sexual",
  "orientat",
  "politi",
  "health",
  "medica",
  "disabilit",
  "crimina",
  "financia",
  "incom",
  "salari",
  "debt",
  "credit",
];

function containsSensitiveProfiling(text: string): boolean {
  const lower = text.toLowerCase();
  return SENSITIVE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Confirmation Override Detection ──────────────────────────────────────────

const CONFIRMATION_OVERRIDE_PATTERNS: RegExp[] = [
  /never\s+(ask|confirm|verify)\s+(for|me)/i,
  /disable\s+(confirmation|confirmations|security)/i,
  /skip\s+(all\s+)?confirm(ation)?s?/i,
  /don'?t\s+(ask|confirm|verify)\s+(me\s+)?(for\s+)?(confirmation|confirm)/i,
  /no\s+(more\s+)?confirm(ation)?s?/i,
];

function attemptsConfirmationOverride(text: string): boolean {
  return CONFIRMATION_OVERRIDE_PATTERNS.some((p) => p.test(text));
}

// ── Preference Validation ────────────────────────────────────────────────────

export interface PreferenceValidationResult {
  valid: boolean;
  error?: string;
  data?: {
    category: PreferenceCategory;
    key: string;
    value: string;
  };
}

/** Allowed keys per category — prevents arbitrary keys from model output. */
const ALLOWED_KEYS: Record<PreferenceCategory, readonly string[]> = {
  response_style: ["detail_level", "tone", "format", "language"],
  voice_preferences: ["voice_response_enabled", "preferred_voice", "speaking_speed", "wake_word_enabled"],
  interaction_preferences: ["preferred_mode", "auto_confirm_safe", "suggestion_frequency"],
  application_preferences: ["preferred_browser", "preferred_editor", "preferred_calendar", "preferred_music"],
  workflow_preferences: ["preferred_briefing", "preferred_workflow", "preferred_shortcut"],
  schedule_preferences: ["quiet_hours_start", "quiet_hours_end", "timezone", "working_hours"],
  notification_preferences: ["notification_style", "notification_sound", "notification_verbosity"],
  display_preferences: ["theme", "font_size", "sidebar_position"],
};

export function validatePreferenceInput(input: unknown): PreferenceValidationResult {
  if (!isRecord(input)) {
    return { valid: false, error: "Preference input must be an object" };
  }

  // Reject unknown fields
  const allowedFields = new Set(["category", "key", "value"]);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) {
      return { valid: false, error: `Unknown field '${field}'` };
    }
  }

  const { category, key, value } = input;

  // Category
  if (!isString(category) || !PREFERENCE_CATEGORIES.includes(category as PreferenceCategory)) {
    return {
      valid: false,
      error: `Invalid category. Must be one of: ${PREFERENCE_CATEGORIES.join(", ")}`,
    };
  }
  const cat = category as PreferenceCategory;

  // Key
  if (!isString(key) || key.trim().length === 0) {
    return { valid: false, error: "Key is required" };
  }
  if (key.length > PERSONALIZATION_LIMITS.MAX_KEY_LENGTH) {
    return { valid: false, error: `Key exceeds ${PERSONALIZATION_LIMITS.MAX_KEY_LENGTH} characters` };
  }

  // Check key is allowed for this category
  const allowed = ALLOWED_KEYS[cat];
  if (!allowed.includes(key)) {
    return {
      valid: false,
      error: `Key '${key}' is not allowed for category '${cat}'. Allowed: ${allowed.join(", ")}`,
    };
  }

  // Value
  if (!isString(value) || value.trim().length === 0) {
    return { valid: false, error: "Value is required" };
  }
  if (value.length > PERSONALIZATION_LIMITS.MAX_VALUE_LENGTH) {
    return { valid: false, error: `Value exceeds ${PERSONALIZATION_LIMITS.MAX_VALUE_LENGTH} characters` };
  }

  // Security checks
  const combined = `${key} ${value}`;
  if (containsSecret(combined)) {
    return { valid: false, error: "Rejected: contains secret or credential" };
  }
  if (containsShell(combined)) {
    return { valid: false, error: "Rejected: contains shell command" };
  }
  if (containsSensitiveProfiling(combined)) {
    return { valid: false, error: "Rejected: sensitive profiling not allowed" };
  }
  if (attemptsConfirmationOverride(combined)) {
    return {
      valid: false,
      error: "Rejected: cannot disable security confirmations via preferences",
    };
  }

  return {
    valid: true,
    data: {
      category: cat,
      key: key.trim(),
      value: value.trim(),
    },
  };
}

// ── Signal Validation ────────────────────────────────────────────────────────

const VALID_SIGNAL_TYPES = new Set([
  "task_completed",
  "goal_completed",
  "goal_failed",
  "application_launched",
  "application_used",
  "voice_used",
  "text_used",
  "confirmation_approved",
  "confirmation_denied",
  "preference_explicitly_set",
  "preference_corrected",
]);

export interface SignalValidationResult {
  valid: boolean;
  error?: string;
  data?: { type: string; metric: string };
}

export function validateSignalInput(input: unknown): SignalValidationResult {
  if (!isRecord(input)) {
    return { valid: false, error: "Signal input must be an object" };
  }

  const { type, metric } = input;

  if (!isString(type) || !VALID_SIGNAL_TYPES.has(type)) {
    return { valid: false, error: `Invalid signal type. Must be one of: ${[...VALID_SIGNAL_TYPES].join(", ")}` };
  }

  if (!isString(metric) || metric.trim().length === 0) {
    return { valid: false, error: "Metric is required" };
  }

  // No secrets in metrics
  if (containsSecret(metric)) {
    return { valid: false, error: "Rejected: metric contains secret" };
  }

  return { valid: true, data: { type, metric: metric.trim() } };
}

// ── Recommendation Validation ────────────────────────────────────────────────

export function validateRecommendationTitle(title: unknown): string | null {
  if (!isString(title) || title.trim().length === 0) return "Title is required";
  if (title.length > PERSONALIZATION_LIMITS.MAX_RECOMMENDATION_TITLE) {
    return `Title exceeds ${PERSONALIZATION_LIMITS.MAX_RECOMMENDATION_TITLE} characters`;
  }
  if (containsSecret(title)) return "Title contains secret";
  return null;
}

export function validateRecommendationDescription(desc: unknown): string | null {
  if (!isString(desc) || desc.trim().length === 0) return "Description is required";
  if (desc.length > PERSONALIZATION_LIMITS.MAX_RECOMMENDATION_DESCRIPTION) {
    return `Description exceeds ${PERSONALIZATION_LIMITS.MAX_RECOMMENDATION_DESCRIPTION} characters`;
  }
  if (containsSecret(desc)) return "Description contains secret";
  return null;
}
