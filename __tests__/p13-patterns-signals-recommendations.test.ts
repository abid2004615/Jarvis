/**
 * P13 Tests — Patterns, Signals, Recommendations
 */

import {
  computePatternConfidence,
  getTimeBucket,
  upsertPattern,
  findRelevantPatterns,
} from "@/lib/personalization/patterns";
import {
  createSignal,
  trimSignals,
  aggregateSignals,
  countRecentSignals,
} from "@/lib/personalization/signals";
import {
  generateRecommendations,
  dismissRecommendation,
  snoozeRecommendation,
  acceptRecommendation,
  trimRecommendationHistory,
} from "@/lib/personalization/recommendations";
import { PERSONALIZATION_LIMITS } from "@/lib/personalization/types";
import type { BehavioralPattern, LearningSignal, Recommendation } from "@/lib/personalization/types";

describe("P13 Patterns", () => {
  describe("computePatternConfidence", () => {
    it("should return low confidence for few observations", () => {
      expect(computePatternConfidence(1)).toBe(0.3);
      expect(computePatternConfidence(2)).toBe(0.3);
    });

    it("should increase confidence with more observations", () => {
      expect(computePatternConfidence(3)).toBe(0.5);
      expect(computePatternConfidence(5)).toBe(0.65);
      expect(computePatternConfidence(10)).toBe(0.8);
      expect(computePatternConfidence(20)).toBe(0.85);
    });
  });

  describe("getTimeBucket", () => {
    it("should classify hours correctly", () => {
      expect(getTimeBucket(6)).toBe("morning");
      expect(getTimeBucket(11)).toBe("morning");
      expect(getTimeBucket(12)).toBe("afternoon");
      expect(getTimeBucket(16)).toBe("afternoon");
      expect(getTimeBucket(17)).toBe("evening");
      expect(getTimeBucket(20)).toBe("evening");
      expect(getTimeBucket(21)).toBe("night");
      expect(getTimeBucket(3)).toBe("night");
    });
  });

  describe("upsertPattern", () => {
    it("should create new pattern", () => {
      const patterns: BehavioralPattern[] = [];
      upsertPattern(patterns, "application_usage", "Safari", "morning");
      expect(patterns).toHaveLength(1);
      expect(patterns[0].metric).toBe("Safari");
      expect(patterns[0].count).toBe(1);
    });

    it("should increment existing pattern", () => {
      const patterns: BehavioralPattern[] = [];
      upsertPattern(patterns, "application_usage", "Safari", "morning");
      upsertPattern(patterns, "application_usage", "Safari", "morning");
      upsertPattern(patterns, "application_usage", "Safari", "morning");
      expect(patterns).toHaveLength(1);
      expect(patterns[0].count).toBe(3);
    });

    it("should create separate patterns for different time buckets", () => {
      const patterns: BehavioralPattern[] = [];
      upsertPattern(patterns, "application_usage", "Safari", "morning");
      upsertPattern(patterns, "application_usage", "Safari", "evening");
      expect(patterns).toHaveLength(2);
    });

    it("should enforce bounds by evicting oldest", () => {
      const patterns: BehavioralPattern[] = [];
      for (let i = 0; i < PERSONALIZATION_LIMITS.MAX_PATTERNS + 5; i++) {
        upsertPattern(patterns, "application_usage", `App_${i}`, "morning");
      }
      expect(patterns.length).toBeLessThanOrEqual(PERSONALIZATION_LIMITS.MAX_PATTERNS);
    });
  });

  describe("findRelevantPatterns", () => {
    it("should filter by type", () => {
      const patterns: BehavioralPattern[] = [];
      upsertPattern(patterns, "application_usage", "Safari", "morning");
      upsertPattern(patterns, "tool_usage", "get_battery_status", "morning");
      const result = findRelevantPatterns(patterns, { type: "application_usage" });
      expect(result).toHaveLength(1);
      expect(result[0].metric).toBe("Safari");
    });

    it("should filter by metric", () => {
      const patterns: BehavioralPattern[] = [];
      upsertPattern(patterns, "application_usage", "Safari", "morning");
      upsertPattern(patterns, "application_usage", "Chrome", "morning");
      const result = findRelevantPatterns(patterns, { metric: "Safari" });
      expect(result).toHaveLength(1);
    });

    it("should filter by minConfidence", () => {
      const patterns: BehavioralPattern[] = [];
      upsertPattern(patterns, "application_usage", "Safari", "morning");
      // Pattern has count=1, confidence=0.3
      const result = findRelevantPatterns(patterns, { minConfidence: 0.5 });
      expect(result).toHaveLength(0);
    });
  });
});

describe("P13 Signals", () => {
  describe("createSignal", () => {
    it("should create valid signal", () => {
      const signal = createSignal("task_completed", "task_123");
      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("task_completed");
      expect(signal?.metric).toBe("task_123");
      expect(signal?.id).toBeDefined();
      expect(signal?.timestamp).toBeGreaterThan(0);
    });

    it("should reject invalid type", () => {
      const signal = createSignal("invalid_type" as any, "test");
      expect(signal).toBeNull();
    });

    it("should reject empty metric", () => {
      const signal = createSignal("task_completed", "");
      expect(signal).toBeNull();
    });
  });

  describe("trimSignals", () => {
    it("should trim to bounded limit", () => {
      const signals: LearningSignal[] = Array.from(
        { length: PERSONALIZATION_LIMITS.MAX_SIGNALS + 10 },
        (_, i) => ({
          id: `sig_${i}`,
          type: "task_completed" as const,
          metric: `task_${i}`,
          timestamp: Date.now() + i,
        }),
      );
      const trimmed = trimSignals(signals);
      expect(trimmed.length).toBe(PERSONALIZATION_LIMITS.MAX_SIGNALS);
    });

    it("should keep most recent signals", () => {
      const signals: LearningSignal[] = Array.from({ length: 5 }, (_, i) => ({
        id: `sig_${i}`,
        type: "task_completed" as const,
        metric: `task_${i}`,
        timestamp: 1000 + i,
      }));
      const trimmed = trimSignals(signals);
      expect(trimmed[0].metric).toBe("task_0");
      expect(trimmed[4].metric).toBe("task_4");
    });
  });

  describe("aggregateSignals", () => {
    it("should count by type:metric", () => {
      const signals: LearningSignal[] = [
        { id: "1", type: "task_completed", metric: "t1", timestamp: 1 },
        { id: "2", type: "task_completed", metric: "t1", timestamp: 2 },
        { id: "3", type: "goal_completed", metric: "g1", timestamp: 3 },
      ];
      const counts = aggregateSignals(signals);
      expect(counts.get("task_completed:t1")).toBe(2);
      expect(counts.get("goal_completed:g1")).toBe(1);
    });
  });

  describe("countRecentSignals", () => {
    it("should count signals in window", () => {
      const now = Date.now();
      const signals: LearningSignal[] = [
        { id: "1", type: "task_completed", metric: "t1", timestamp: now - 1000 },
        { id: "2", type: "task_completed", metric: "t2", timestamp: now - 5000 },
        { id: "3", type: "goal_completed", metric: "g1", timestamp: now - 1000 },
      ];
      expect(countRecentSignals(signals, "task_completed", 3000)).toBe(1);
      expect(countRecentSignals(signals, "task_completed", 10000)).toBe(2);
    });
  });
});

describe("P13 Recommendations", () => {
  function makePattern(overrides?: Partial<BehavioralPattern>): BehavioralPattern {
    return {
      id: "pat-1",
      type: "application_usage",
      metric: "Safari",
      count: 14,
      lastObservedAt: Date.now(),
      timeBucket: "evening",
      confidence: 0.8,
      createdAt: Date.now(),
      ...overrides,
    };
  }

  const settings = {
    maxRecommendationsPerInteraction: 1,
    maxRecommendationsPerDay: 3,
    recommendationCooldownMs: 60 * 60 * 1000,
  };

  describe("generateRecommendations", () => {
    it("should generate recommendation from high-confidence pattern", () => {
      const patterns = [makePattern()];
      const recs = generateRecommendations(patterns, [], settings);
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].title).toContain("Safari");
      expect(recs[0].reason).toContain("confidence");
    });

    it("should not generate from low-confidence patterns", () => {
      const patterns = [makePattern({ count: 1, confidence: 0.3 })];
      const recs = generateRecommendations(patterns, [], settings);
      expect(recs).toHaveLength(0);
    });

    it("should respect max per interaction", () => {
      const patterns = [
        makePattern({ id: "p1", metric: "Safari", confidence: 0.8 }),
        makePattern({ id: "p2", metric: "Chrome", confidence: 0.8 }),
      ];
      const recs = generateRecommendations(patterns, [], settings);
      expect(recs.length).toBeLessThanOrEqual(1);
    });

    it("should not repeat active recommendations", () => {
      const patterns = [makePattern()];
      const existing: Recommendation[] = [{
        id: "existing",
        title: "Frequent Safari usage",
        description: "test",
        reason: "test",
        confidence: 0.8,
        sourcePatternIds: [],
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }];
      const recs = generateRecommendations(patterns, existing, settings);
      expect(recs).toHaveLength(0);
    });
  });

  describe("dismissRecommendation", () => {
    it("should mark as dismissed", () => {
      const recs: Recommendation[] = [{
        id: "rec-1",
        title: "Test",
        description: "test",
        reason: "test",
        confidence: 0.8,
        sourcePatternIds: [],
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }];
      const result = dismissRecommendation(recs, "rec-1");
      expect(result[0].status).toBe("dismissed");
    });
  });

  describe("snoozeRecommendation", () => {
    it("should mark as snoozed with future time", () => {
      const recs: Recommendation[] = [{
        id: "rec-1",
        title: "Test",
        description: "test",
        reason: "test",
        confidence: 0.8,
        sourcePatternIds: [],
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }];
      const result = snoozeRecommendation(recs, "rec-1", 60000);
      expect(result[0].status).toBe("snoozed");
      expect(result[0].snoozedUntil).toBeGreaterThan(Date.now());
    });
  });

  describe("acceptRecommendation", () => {
    it("should mark as accepted", () => {
      const recs: Recommendation[] = [{
        id: "rec-1",
        title: "Test",
        description: "test",
        reason: "test",
        confidence: 0.8,
        sourcePatternIds: [],
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }];
      const result = acceptRecommendation(recs, "rec-1");
      expect(result[0].status).toBe("accepted");
    });
  });

  describe("trimRecommendationHistory", () => {
    it("should trim to bounded limit", () => {
      const recs: Recommendation[] = Array.from(
        { length: PERSONALIZATION_LIMITS.MAX_RECOMMENDATION_HISTORY + 10 },
        (_, i) => ({
          id: `rec-${i}`,
          title: `Rec ${i}`,
          description: "test",
          reason: "test",
          confidence: 0.8,
          sourcePatternIds: [],
          status: "accepted" as const,
          createdAt: Date.now() + i,
          updatedAt: Date.now() + i,
        }),
      );
      const trimmed = trimRecommendationHistory(recs);
      expect(trimmed.length).toBe(PERSONALIZATION_LIMITS.MAX_RECOMMENDATION_HISTORY);
    });
  });
});
