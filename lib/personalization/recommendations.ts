/**
 * JARVIS Personalization — Recommendations
 *
 * Generates optional, explainable, rate-limited recommendations based on
 * behavioral patterns. Recommendations are NEVER automatically applied.
 * The user must explicitly accept, dismiss, or snooze them.
 *
 * Rate limiting:
 * - Max 1 per interaction
 * - Max 3 per day
 * - Cooldown between repeated recommendations
 * - Dismissed recommendations not re-shown immediately
 */

import { randomUUID } from "crypto";

import {
  type BehavioralPattern,
  type Recommendation,
  PERSONALIZATION_LIMITS,
} from "./types";

/** Check if a recommendation was recently dismissed. */
function wasRecentlyDismissed(
  recommendations: Recommendation[],
  title: string,
  cooldownMs: number,
): boolean {
  const now = Date.now();
  return recommendations.some(
    (r) =>
      r.title === title &&
      r.status === "dismissed" &&
      now - r.updatedAt < cooldownMs,
  );
}

/** Check if we've hit the daily recommendation limit. */
function hitDailyLimit(recommendations: Recommendation[], maxPerDay: number): boolean {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const cutoff = todayStart.getTime();

  return recommendations.filter(
    (r) =>
      (r.status === "active" || r.status === "accepted") &&
      r.createdAt >= cutoff,
  ).length >= maxPerDay;
}

/**
 * Generate recommendations from patterns.
 * Returns an empty array when rate limits are hit or patterns are insufficient.
 */
export function generateRecommendations(
  patterns: BehavioralPattern[],
  existingRecommendations: Recommendation[],
  settings: {
    maxRecommendationsPerInteraction: number;
    maxRecommendationsPerDay: number;
    recommendationCooldownMs: number;
  },
): Recommendation[] {
  if (hitDailyLimit(existingRecommendations, settings.maxRecommendationsPerDay)) {
    return [];
  }

  const candidates: Recommendation[] = [];

  // Find high-confidence patterns that don't have an active recommendation
  const highConfidencePatterns = patterns
    .filter((p) => p.confidence >= 0.6)
    .sort((a, b) => b.confidence - a.confidence);

  for (const pattern of highConfidencePatterns) {
    if (candidates.length >= settings.maxRecommendationsPerInteraction) break;

    const title = buildRecommendationTitle(pattern);
    if (!title) continue;

    // Skip if already has active recommendation with same title
    if (existingRecommendations.some((r) => r.title === title && r.status === "active")) continue;

    // Skip if recently dismissed
    if (wasRecentlyDismissed(existingRecommendations, title, settings.recommendationCooldownMs)) continue;

    candidates.push({
      id: randomUUID(),
      title,
      description: buildRecommendationDescription(pattern),
      reason: buildRecommendationReason(pattern),
      confidence: pattern.confidence,
      sourcePatternIds: [pattern.id],
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  return candidates.slice(0, settings.maxRecommendationsPerInteraction);
}

function buildRecommendationTitle(pattern: BehavioralPattern): string | null {
  switch (pattern.type) {
    case "application_usage":
      if (pattern.count >= 5) {
        return `Frequent ${pattern.metric} usage`;
      }
      return null;
    case "tool_usage":
      if (pattern.count >= 5) {
        return `Frequent ${pattern.metric} tool usage`;
      }
      return null;
    case "routine_usage":
      if (pattern.count >= 3) {
        return `Routine pattern: ${pattern.metric}`;
      }
      return null;
    case "time_preference":
      return `Activity pattern at ${pattern.timeBucket ?? "this time"}`;
    default:
      return null;
  }
}

function buildRecommendationDescription(pattern: BehavioralPattern): string {
  switch (pattern.type) {
    case "application_usage":
      return `You've used ${pattern.metric} ${pattern.count} times. Consider making it your preferred application.`;
    case "tool_usage":
      return `You've used the ${pattern.metric} tool ${pattern.count} times. Would you like a shortcut?`;
    case "routine_usage":
      return `The ${pattern.metric} routine has been used ${pattern.count} times. Consider automating it.`;
    case "time_preference":
      return `You tend to be active during the ${pattern.timeBucket ?? "current time period"}.`;
    default:
      return `Observed pattern: ${pattern.metric} (${pattern.count} times).`;
  }
}

function buildRecommendationReason(pattern: BehavioralPattern): string {
  return `Based on ${pattern.count} observed ${pattern.type.replace(/_/g, " ")} events (confidence: ${(pattern.confidence * 100).toFixed(0)}%).`;
}

/**
 * Dismiss a recommendation by ID.
 */
export function dismissRecommendation(
  recommendations: Recommendation[],
  id: string,
): Recommendation[] {
  return recommendations.map((r) =>
    r.id === id ? { ...r, status: "dismissed" as const, updatedAt: Date.now() } : r,
  );
}

/**
 * Snooze a recommendation by ID.
 */
export function snoozeRecommendation(
  recommendations: Recommendation[],
  id: string,
  durationMs: number,
): Recommendation[] {
  return recommendations.map((r) =>
    r.id === id
      ? { ...r, status: "snoozed" as const, snoozedUntil: Date.now() + durationMs, updatedAt: Date.now() }
      : r,
  );
}

/**
 * Accept a recommendation by ID.
 */
export function acceptRecommendation(
  recommendations: Recommendation[],
  id: string,
): Recommendation[] {
  return recommendations.map((r) =>
    r.id === id ? { ...r, status: "accepted" as const, updatedAt: Date.now() } : r,
  );
}

/**
 * Trim recommendation history (keep accepted + dismissed, drop oldest).
 */
export function trimRecommendationHistory(recommendations: Recommendation[]): Recommendation[] {
  if (recommendations.length <= PERSONALIZATION_LIMITS.MAX_RECOMMENDATION_HISTORY) {
    return recommendations;
  }
  // Keep most recent
  return recommendations.slice(-PERSONALIZATION_LIMITS.MAX_RECOMMENDATION_HISTORY);
}
