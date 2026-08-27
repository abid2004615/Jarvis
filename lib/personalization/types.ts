/**
 * JARVIS Personalization — Type Definitions
 *
 * Structured personalization is DISTINCT from persistent memory:
 *  - Memory: explicit user facts/preferences (free-text key/value)
 *  - Personalization: structured interaction preferences, behavioral
 *    aggregates, learning signals, and recommendations
 *
 * Personalization never stores secrets, raw audio, screenshots, or transcripts.
 * All writes require explicit user intent or trusted server-side events.
 */

// ── Preference Categories ────────────────────────────────────────────────────

export type PreferenceCategory =
  | "response_style"
  | "voice_preferences"
  | "interaction_preferences"
  | "application_preferences"
  | "workflow_preferences"
  | "schedule_preferences"
  | "notification_preferences"
  | "display_preferences";

export const PREFERENCE_CATEGORIES: readonly PreferenceCategory[] = [
  "response_style",
  "voice_preferences",
  "interaction_preferences",
  "application_preferences",
  "workflow_preferences",
  "schedule_preferences",
  "notification_preferences",
  "display_preferences",
];

export const CATEGORY_LABELS: Record<PreferenceCategory, string> = {
  response_style: "Response Style",
  voice_preferences: "Voice Preferences",
  interaction_preferences: "Interaction Preferences",
  application_preferences: "Application Preferences",
  workflow_preferences: "Workflow Preferences",
  schedule_preferences: "Schedule Preferences",
  notification_preferences: "Notification Preferences",
  display_preferences: "Display Preferences",
};

// ── Preference Sources ───────────────────────────────────────────────────────

export type PreferenceSource =
  | "explicit_user"
  | "user_correction"
  | "approved_pattern"
  | "system_default";

export const VALID_SOURCES: readonly PreferenceSource[] = [
  "explicit_user",
  "user_correction",
  "approved_pattern",
  "system_default",
];

// ── Preference ───────────────────────────────────────────────────────────────

export interface UserPreference {
  id: string;
  category: PreferenceCategory;
  key: string;
  value: string;
  confidence: number; // 0.0–1.0
  source: PreferenceSource;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// ── Behavioral Patterns ──────────────────────────────────────────────────────

export type PatternType =
  | "application_usage"
  | "time_preference"
  | "tool_usage"
  | "routine_usage"
  | "response_preference"
  | "workflow_completion";

export interface BehavioralPattern {
  id: string;
  type: PatternType;
  /** Aggregated metric key (e.g. "Safari", "morning", "get_battery_status"). */
  metric: string;
  count: number;
  lastObservedAt: number;
  /** Optional time bucket: "morning" | "afternoon" | "evening" | "night". */
  timeBucket?: string;
  /** Confidence based on observation count. */
  confidence: number;
  createdAt: number;
}

// ── Learning Signals ─────────────────────────────────────────────────────────

export type SignalType =
  | "task_completed"
  | "goal_completed"
  | "goal_failed"
  | "application_launched"
  | "application_used"
  | "voice_used"
  | "text_used"
  | "confirmation_approved"
  | "confirmation_denied"
  | "preference_explicitly_set"
  | "preference_corrected";

export interface LearningSignal {
  id: string;
  type: SignalType;
  /** The specific metric (e.g. "Safari", "task_abc123"). */
  metric: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ── Recommendations ──────────────────────────────────────────────────────────

export type RecommendationAction =
  | "dismiss"
  | "snooze"
  | "accept";

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  /** Why this was recommended (explainability). */
  reason: string;
  /** Confidence that this recommendation is useful. */
  confidence: number;
  /** Source pattern IDs that led to this recommendation. */
  sourcePatternIds: string[];
  /** The suggested action. */
  suggestedPreference?: {
    category: PreferenceCategory;
    key: string;
    value: string;
  };
  status: "active" | "accepted" | "dismissed" | "snoozed";
  createdAt: number;
  updatedAt: number;
  /** If snoozed, when it may be re-shown. */
  snoozedUntil?: number;
}

// ── Personalization Settings ─────────────────────────────────────────────────

export interface PersonalizationSettings {
  /** Master toggle: if false, no new signals collected, no new recommendations. */
  enabled: boolean;
  /** If true, patterns are still collected but no recommendations generated. */
  collectPatterns: boolean;
  /** If true, recommendations are shown. */
  showRecommendations: boolean;
  /** Maximum recommendations per interaction. */
  maxRecommendationsPerInteraction: number;
  /** Maximum recommendations per day. */
  maxRecommendationsPerDay: number;
  /** Minimum cooldown between same recommendation (ms). */
  recommendationCooldownMs: number;
}

export const DEFAULT_SETTINGS: PersonalizationSettings = {
  enabled: true,
  collectPatterns: true,
  showRecommendations: true,
  maxRecommendationsPerInteraction: 1,
  maxRecommendationsPerDay: 3,
  recommendationCooldownMs: 60 * 60 * 1000, // 1 hour
};

// ── Limits ───────────────────────────────────────────────────────────────────

export const PERSONALIZATION_LIMITS = {
  /** Maximum preferences. */
  MAX_PREFERENCES: 100,
  /** Maximum behavioral patterns. */
  MAX_PATTERNS: 200,
  /** Maximum learning signals retained (ring buffer). */
  MAX_SIGNALS: 500,
  /** Maximum active recommendations. */
  MAX_RECOMMENDATIONS: 20,
  /** Maximum recommendation history (accepted + dismissed). */
  MAX_RECOMMENDATION_HISTORY: 100,
  /** Minimum observations before a pattern becomes recommendable. */
  MIN_PATTERN_OBSERVATIONS: 3,
  /** Maximum preference key length. */
  MAX_KEY_LENGTH: 80,
  /** Maximum preference value length. */
  MAX_VALUE_LENGTH: 500,
  /** Maximum recommendation title length. */
  MAX_RECOMMENDATION_TITLE: 100,
  /** Maximum recommendation description length. */
  MAX_RECOMMENDATION_DESCRIPTION: 300,
} as const;

// ── Storage ──────────────────────────────────────────────────────────────────

export const PERSONALIZATION_STORAGE_DIR = ".jarvis";
export const PERSONALIZATION_STORAGE_FILE = "personalization.json";

export interface PersonalizationStoreData {
  version: number;
  updatedAt: number;
  settings: PersonalizationSettings;
  preferences: UserPreference[];
  patterns: BehavioralPattern[];
  signals: LearningSignal[];
  recommendations: Recommendation[];
}

// ── Results ──────────────────────────────────────────────────────────────────

export interface PersonalizationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── Context ──────────────────────────────────────────────────────────────────

export interface PersonalizationContext {
  explicitPreferences: UserPreference[];
  relevantPatterns: BehavioralPattern[];
  activeRecommendations: Recommendation[];
  settings: PersonalizationSettings;
  enabled: boolean;
}
