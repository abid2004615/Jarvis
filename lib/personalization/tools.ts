/**
 * JARVIS Personalization — AI-Facing Tools
 *
 * Controlled tools for the AI to interact with the personalization system.
 * IMPORTANT: All mutation tools require explicit user intent.
 * The model cannot silently persist preferences based on inference.
 */

import { getPersonalizationManager } from "./manager";
import type { PreferenceCategory, PatternType, RecommendationAction } from "./types";

// ── get_user_preferences ─────────────────────────────────────────────────────

export function getUserPreferences(args: {
  category?: PreferenceCategory;
}): { success: boolean; result?: unknown; error?: string } {
  try {
    const manager = getPersonalizationManager();
    const preferences = manager.listPreferences(args.category);
    return {
      success: true,
      result: preferences.map((p) => ({
        id: p.id,
        category: p.category,
        key: p.key,
        value: p.value,
        confidence: p.confidence,
        source: p.source,
        enabled: p.enabled,
      })),
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── set_user_preference ──────────────────────────────────────────────────────

export function setUserPreference(args: {
  category: PreferenceCategory;
  key: string;
  value: string;
}): { success: boolean; result?: unknown; error?: string } {
  try {
    const manager = getPersonalizationManager();
    const result = manager.setPreference(args.category, args.key, args.value);
    return result;
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── update_user_preference ───────────────────────────────────────────────────

export function updateUserPreference(args: {
  category: PreferenceCategory;
  key: string;
  value: string;
}): { success: boolean; error?: string } {
  try {
    const manager = getPersonalizationManager();
    return manager.updatePreference(args.category, args.key, args.value);
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── disable_user_preference ──────────────────────────────────────────────────

export function disableUserPreference(args: {
  category: PreferenceCategory;
  key: string;
}): { success: boolean; error?: string } {
  try {
    const manager = getPersonalizationManager();
    return manager.disablePreference(args.category, args.key);
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── delete_user_preference ───────────────────────────────────────────────────

export function deleteUserPreference(args: {
  category: PreferenceCategory;
  key: string;
}): { success: boolean; error?: string } {
  try {
    const manager = getPersonalizationManager();
    return manager.deletePreference(args.category, args.key);
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── get_usage_patterns ───────────────────────────────────────────────────────

export function getUsagePatterns(args?: {
  type?: PatternType;
  metric?: string;
  minConfidence?: number;
}): { success: boolean; result?: unknown; error?: string } {
  try {
    const manager = getPersonalizationManager();
    const patterns = manager.listPatterns(args);
    return {
      success: true,
      result: patterns.map((p) => ({
        id: p.id,
        type: p.type,
        metric: p.metric,
        count: p.count,
        confidence: p.confidence,
        timeBucket: p.timeBucket,
        lastObservedAt: p.lastObservedAt,
      })),
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── get_recommendations ──────────────────────────────────────────────────────

export function getRecommendations(): { success: boolean; result?: unknown; error?: string } {
  try {
    const manager = getPersonalizationManager();
    const recs = manager.generateRecommendations();
    const active = manager.getActiveRecommendations();
    return {
      success: true,
      result: active.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        reason: r.reason,
        confidence: r.confidence,
      })),
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── dismiss_recommendation ───────────────────────────────────────────────────

export function dismissRecommendationById(args: {
  id: string;
}): { success: boolean; error?: string } {
  try {
    const manager = getPersonalizationManager();
    return manager.dismissRecommendation(args.id);
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── accept_recommendation ────────────────────────────────────────────────────

export function acceptRecommendationById(args: {
  id: string;
}): { success: boolean; error?: string } {
  try {
    const manager = getPersonalizationManager();
    const result = manager.acceptRecommendation(args.id);
    // When accepted, create the suggested preference
    if (result.success) {
      const rec = manager.getData().recommendations.find((r) => r.id === args.id);
      if (rec?.suggestedPreference) {
        manager.setPreference(
          rec.suggestedPreference.category,
          rec.suggestedPreference.key,
          rec.suggestedPreference.value,
          "approved_pattern",
          rec.confidence,
        );
      }
    }
    return result;
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
