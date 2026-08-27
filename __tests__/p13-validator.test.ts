/**
 * P13 Tests — Personalization Types & Validator
 */

import {
  PREFERENCE_CATEGORIES,
  PERSONALIZATION_LIMITS,
  CATEGORY_LABELS,
  VALID_SOURCES,
  DEFAULT_SETTINGS,
} from "@/lib/personalization/types";
import { validatePreferenceInput, validateSignalInput } from "@/lib/personalization/validator";

describe("P13 Personalization Types", () => {
  it("should have all 8 preference categories", () => {
    expect(PREFERENCE_CATEGORIES.length).toBe(8);
    expect(PREFERENCE_CATEGORIES).toContain("response_style");
    expect(PREFERENCE_CATEGORIES).toContain("voice_preferences");
    expect(PREFERENCE_CATEGORIES).toContain("interaction_preferences");
    expect(PREFERENCE_CATEGORIES).toContain("application_preferences");
    expect(PREFERENCE_CATEGORIES).toContain("workflow_preferences");
    expect(PREFERENCE_CATEGORIES).toContain("schedule_preferences");
    expect(PREFERENCE_CATEGORIES).toContain("notification_preferences");
    expect(PREFERENCE_CATEGORIES).toContain("display_preferences");
  });

  it("should have labels for all categories", () => {
    for (const cat of PREFERENCE_CATEGORIES) {
      expect(CATEGORY_LABELS[cat]).toBeDefined();
      expect(typeof CATEGORY_LABELS[cat]).toBe("string");
    }
  });

  it("should have bounded limits", () => {
    expect(PERSONALIZATION_LIMITS.MAX_PREFERENCES).toBeGreaterThan(0);
    expect(PERSONALIZATION_LIMITS.MAX_PATTERNS).toBeGreaterThan(0);
    expect(PERSONALIZATION_LIMITS.MAX_SIGNALS).toBeGreaterThan(0);
    expect(PERSONALIZATION_LIMITS.MAX_RECOMMENDATIONS).toBeGreaterThan(0);
    expect(PERSONALIZATION_LIMITS.MIN_PATTERN_OBSERVATIONS).toBeGreaterThanOrEqual(2);
  });

  it("should have valid sources", () => {
    expect(VALID_SOURCES).toContain("explicit_user");
    expect(VALID_SOURCES).toContain("user_correction");
    expect(VALID_SOURCES).toContain("approved_pattern");
    expect(VALID_SOURCES).toContain("system_default");
    expect(VALID_SOURCES).not.toContain("ai_assumption");
  });

  it("should have safe defaults", () => {
    expect(DEFAULT_SETTINGS.enabled).toBe(true);
    expect(DEFAULT_SETTINGS.collectPatterns).toBe(true);
    expect(DEFAULT_SETTINGS.showRecommendations).toBe(true);
    expect(DEFAULT_SETTINGS.maxRecommendationsPerInteraction).toBe(1);
    expect(DEFAULT_SETTINGS.maxRecommendationsPerDay).toBe(3);
  });
});

describe("P13 Preference Validation", () => {
  it("should accept valid preferences", () => {
    const result = validatePreferenceInput({
      category: "response_style",
      key: "detail_level",
      value: "concise",
    });
    expect(result.valid).toBe(true);
    expect(result.data?.category).toBe("response_style");
    expect(result.data?.key).toBe("detail_level");
    expect(result.data?.value).toBe("concise");
  });

  it("should accept all valid categories with allowed keys", () => {
    const validPairs: Array<[string, string]> = [
      ["response_style", "detail_level"],
      ["voice_preferences", "voice_response_enabled"],
      ["interaction_preferences", "preferred_mode"],
      ["application_preferences", "preferred_browser"],
      ["workflow_preferences", "preferred_briefing"],
      ["schedule_preferences", "timezone"],
      ["notification_preferences", "notification_style"],
      ["display_preferences", "theme"],
    ];
    for (const [cat, key] of validPairs) {
      const result = validatePreferenceInput({ category: cat, key, value: "test" });
      expect(result.valid).toBe(true);
    }
  });

  it("should reject invalid category", () => {
    const result = validatePreferenceInput({
      category: "invalid_category",
      key: "test",
      value: "test",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid category");
  });

  it("should reject unknown fields", () => {
    const result = validatePreferenceInput({
      category: "response_style",
      key: "detail_level",
      value: "concise",
      evilField: true,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unknown field");
  });

  it("should reject key not allowed for category", () => {
    const result = validatePreferenceInput({
      category: "response_style",
      key: "preferred_browser",
      value: "Safari",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  it("should reject secrets in value", () => {
    const result = validatePreferenceInput({
      category: "response_style",
      key: "detail_level",
      value: "my password is secret123",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("secret");
  });

  it("should reject shell commands", () => {
    const result = validatePreferenceInput({
      category: "application_preferences",
      key: "preferred_browser",
      value: "sudo open Safari",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("shell command");
  });

  it("should reject sensitive profiling", () => {
    const result = validatePreferenceInput({
      category: "response_style",
      key: "tone",
      value: "religious",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("sensitive profiling");
  });

  it("should reject confirmation override", () => {
    const result = validatePreferenceInput({
      category: "interaction_preferences",
      key: "auto_confirm_safe",
      value: "never ask for confirmation",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("cannot disable security confirmations");
  });

  it("should reject empty key", () => {
    const result = validatePreferenceInput({
      category: "response_style",
      key: "",
      value: "concise",
    });
    expect(result.valid).toBe(false);
  });

  it("should reject empty value", () => {
    const result = validatePreferenceInput({
      category: "response_style",
      key: "detail_level",
      value: "",
    });
    expect(result.valid).toBe(false);
  });

  it("should reject non-object input", () => {
    expect(validatePreferenceInput(null).valid).toBe(false);
    expect(validatePreferenceInput("string").valid).toBe(false);
    expect(validatePreferenceInput(42).valid).toBe(false);
  });
});

describe("P13 Signal Validation", () => {
  it("should accept valid signals", () => {
    const result = validateSignalInput({
      type: "task_completed",
      metric: "task_123",
    });
    expect(result.valid).toBe(true);
  });

  it("should accept all valid signal types", () => {
    const types = [
      "task_completed", "goal_completed", "goal_failed",
      "application_launched", "application_used", "voice_used",
      "text_used", "confirmation_approved", "confirmation_denied",
      "preference_explicitly_set", "preference_corrected",
    ];
    for (const type of types) {
      expect(validateSignalInput({ type, metric: "test" }).valid).toBe(true);
    }
  });

  it("should reject invalid signal type", () => {
    const result = validateSignalInput({ type: "invalid", metric: "test" });
    expect(result.valid).toBe(false);
  });

  it("should reject empty metric", () => {
    const result = validateSignalInput({ type: "task_completed", metric: "" });
    expect(result.valid).toBe(false);
  });

  it("should reject secret in metric", () => {
    const result = validateSignalInput({ type: "task_completed", metric: "gsk_abc123" });
    expect(result.valid).toBe(false);
  });
});
