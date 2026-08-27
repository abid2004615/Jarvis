/**
 * JARVIS Personalization — Behavioral Patterns
 *
 * Aggregated, privacy-safe behavioral data. Patterns are NEVER automatically
 * converted to preferences. They are used only for recommendations after
 * sufficient observations and explicit user approval.
 *
 * Patterns store only minimal aggregates:
 *   application: "Safari", launches: 14, lastUsedAt, timeBucket
 *
 * Never stores: raw transcripts, screenshots, audio, clipboard, URLs, secrets.
 */

import { randomUUID } from "crypto";

import {
  type BehavioralPattern,
  type PatternType,
  PERSONALIZATION_LIMITS,
} from "./types";

/** Compute confidence from observation count. */
export function computePatternConfidence(count: number): number {
  if (count < PERSONALIZATION_LIMITS.MIN_PATTERN_OBSERVATIONS) return 0.3;
  if (count < 5) return 0.5;
  if (count < 10) return 0.65;
  if (count < 20) return 0.8;
  return 0.85;
}

/** Determine time bucket from hour of day. */
export function getTimeBucket(hour: number): string {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/**
 * Update or create a pattern in the array.
 * Returns the updated patterns array (bounded).
 */
export function upsertPattern(
  patterns: BehavioralPattern[],
  type: PatternType,
  metric: string,
  timeBucket?: string,
): BehavioralPattern[] {
  const existing = patterns.find(
    (p) => p.type === type && p.metric === metric && p.timeBucket === timeBucket,
  );

  if (existing) {
    existing.count += 1;
    existing.lastObservedAt = Date.now();
    existing.confidence = computePatternConfidence(existing.count);
    return patterns;
  }

  const newPattern: BehavioralPattern = {
    id: randomUUID(),
    type,
    metric,
    count: 1,
    lastObservedAt: Date.now(),
    timeBucket,
    confidence: computePatternConfidence(1),
    createdAt: Date.now(),
  };

  patterns.push(newPattern);

  // Enforce bounds: evict oldest by lastObservedAt
  if (patterns.length > PERSONALIZATION_LIMITS.MAX_PATTERNS) {
    patterns.sort((a, b) => a.lastObservedAt - b.lastObservedAt);
    patterns.splice(0, patterns.length - PERSONALIZATION_LIMITS.MAX_PATTERNS);
  }

  return patterns;
}

/**
 * Find patterns relevant to a context (e.g. a specific application or time).
 */
export function findRelevantPatterns(
  patterns: BehavioralPattern[],
  filters: {
    type?: PatternType;
    metric?: string;
    minConfidence?: number;
  },
): BehavioralPattern[] {
  return patterns
    .filter((p) => {
      if (filters.type && p.type !== filters.type) return false;
      if (filters.metric && p.metric !== filters.metric) return false;
      if (filters.minConfidence !== undefined && p.confidence < filters.minConfidence) return false;
      return true;
    })
    .sort((a, b) => b.confidence - a.confidence || b.count - a.count);
}

/**
 * Evict low-confidence, old patterns when at capacity.
 */
export function evictPatterns(patterns: BehavioralPattern[]): BehavioralPattern[] {
  if (patterns.length <= PERSONALIZATION_LIMITS.MAX_PATTERNS) return patterns;

  // Sort by confidence (ascending) then lastObservedAt (ascending)
  patterns.sort(
    (a, b) =>
      a.confidence - b.confidence || a.lastObservedAt - b.lastObservedAt,
  );

  const excess = patterns.length - PERSONALIZATION_LIMITS.MAX_PATTERNS;
  return patterns.slice(excess);
}
