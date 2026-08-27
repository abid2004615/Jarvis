/**
 * JARVIS Personalization — Manager
 *
 * Single application-wide gate for reading and writing personalization data.
 * Manages preferences, patterns, signals, and recommendations.
 *
 * Rules:
 *  - Preferences require explicit user intent (never AI assumptions).
 *  - Patterns are collected from trusted server-side events only.
 *  - Recommendations are optional, explainable, rate-limited.
 *  - Personalization can be disabled entirely.
 *  - Secrets, shell commands, and sensitive profiling are always rejected.
 *  - Confirmation cannot be disabled via preferences.
 */

import { randomUUID } from "crypto";

import {
  type UserPreference,
  type BehavioralPattern,
  type LearningSignal,
  type Recommendation,
  type PersonalizationSettings,
  type PersonalizationContext,
  type PersonalizationStoreData,
  type PreferenceCategory,
  type PreferenceSource,
  type SignalType,
  type PatternType,
  PERSONALIZATION_LIMITS,
  DEFAULT_SETTINGS,
} from "./types";
import { validatePreferenceInput, validateSignalInput } from "./validator";
import { createSignal, trimSignals, aggregateSignals } from "./signals";
import {
  upsertPattern,
  findRelevantPatterns,
  evictPatterns,
  getTimeBucket,
  computePatternConfidence,
} from "./patterns";
import {
  generateRecommendations,
  dismissRecommendation,
  snoozeRecommendation,
  acceptRecommendation,
  trimRecommendationHistory,
} from "./recommendations";
import { PersonalizationFileStore, type PersonalizationStore } from "./store";

type Listener = (data: PersonalizationStoreData) => void;

export class PersonalizationManager {
  private readonly store: PersonalizationStore;
  private data: PersonalizationStoreData;
  private readonly listeners: Listener[] = [];

  constructor(store?: PersonalizationStore) {
    this.store = store ?? new PersonalizationFileStore();
    this.data = this.store.load();
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  getSettings(): PersonalizationSettings {
    return { ...this.data.settings };
  }

  updateSettings(settings: Partial<PersonalizationSettings>): void {
    this.data.settings = { ...this.data.settings, ...settings };
    this.persist();
  }

  isEnabled(): boolean {
    return this.data.settings.enabled;
  }

  // ── Preferences ──────────────────────────────────────────────────────────

  /** Create or update a preference. Requires validated input. */
  setPreference(
    category: PreferenceCategory,
    key: string,
    value: string,
    source: PreferenceSource = "explicit_user",
    confidence?: number,
  ): { success: boolean; data?: UserPreference; error?: string } {
    if (!this.data.settings.enabled) {
      return { success: false, error: "Personalization is disabled" };
    }

    const validation = validatePreferenceInput({ category, key, value });
    if (!validation.valid || !validation.data) {
      return { success: false, error: validation.error };
    }

    const { category: cat, key: k, value: v } = validation.data;
    const now = Date.now();
    const conf = confidence ?? (source === "explicit_user" ? 0.95 : source === "user_correction" ? 0.95 : source === "approved_pattern" ? 0.9 : 0.5);

    // Find existing by category + key (case-insensitive)
    const existingIdx = this.data.preferences.findIndex(
      (p) => p.category === cat && p.key.toLowerCase() === k.toLowerCase(),
    );

    let pref: UserPreference;
    if (existingIdx >= 0) {
      // Conflict resolution: new explicit preference supersedes old
      const existing = this.data.preferences[existingIdx];
      pref = {
        ...existing,
        value: v,
        confidence: Math.max(existing.confidence, conf),
        source,
        enabled: true,
        updatedAt: now,
      };
      this.data.preferences[existingIdx] = pref;
    } else {
      pref = {
        id: randomUUID(),
        category: cat,
        key: k,
        value: v,
        confidence: conf,
        source,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      this.data.preferences.push(pref);
    }

    // Enforce bounds
    if (this.data.preferences.length > PERSONALIZATION_LIMITS.MAX_PREFERENCES) {
      this.data.preferences.sort((a, b) => a.updatedAt - b.updatedAt);
      this.data.preferences.splice(0, this.data.preferences.length - PERSONALIZATION_LIMITS.MAX_PREFERENCES);
    }

    this.persist();
    return { success: true, data: { ...pref } };
  }

  /** Get a preference by category and key. */
  getPreference(category: PreferenceCategory, key: string): UserPreference | undefined {
    return this.data.preferences.find(
      (p) => p.category === category && p.key.toLowerCase() === key.toLowerCase() && p.enabled,
    );
  }

  /** Get all preferences, optionally filtered by category. */
  listPreferences(category?: PreferenceCategory): UserPreference[] {
    return this.data.preferences
      .filter((p) => {
        if (category && p.category !== category) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Update a preference's value. */
  updatePreference(
    category: PreferenceCategory,
    key: string,
    value: string,
  ): { success: boolean; error?: string } {
    const existing = this.data.preferences.find(
      (p) => p.category === category && p.key.toLowerCase() === key.toLowerCase(),
    );
    if (!existing) {
      return { success: false, error: "Preference not found" };
    }

    const validation = validatePreferenceInput({ category, key, value });
    if (!validation.valid || !validation.data) {
      return { success: false, error: validation.error };
    }

    existing.value = validation.data.value;
    existing.updatedAt = Date.now();
    existing.confidence = Math.max(existing.confidence, 0.95);
    existing.source = "user_correction";
    this.persist();
    return { success: true };
  }

  /** Disable a preference (soft delete). */
  disablePreference(category: PreferenceCategory, key: string): { success: boolean; error?: string } {
    const existing = this.data.preferences.find(
      (p) => p.category === category && p.key.toLowerCase() === key.toLowerCase(),
    );
    if (!existing) {
      return { success: false, error: "Preference not found" };
    }
    existing.enabled = false;
    existing.updatedAt = Date.now();
    this.persist();
    return { success: true };
  }

  /** Delete a preference (hard delete). */
  deletePreference(category: PreferenceCategory, key: string): { success: boolean; error?: string } {
    const idx = this.data.preferences.findIndex(
      (p) => p.category === category && p.key.toLowerCase() === key.toLowerCase(),
    );
    if (idx === -1) {
      return { success: false, error: "Preference not found" };
    }
    this.data.preferences.splice(idx, 1);
    this.persist();
    return { success: true };
  }

  // ── Patterns ─────────────────────────────────────────────────────────────

  /** Record a behavioral observation. Only from trusted events. */
  recordObservation(type: PatternType, metric: string): BehavioralPattern | null {
    if (!this.data.settings.enabled || !this.data.settings.collectPatterns) {
      return null;
    }

    const hour = new Date().getHours();
    const timeBucket = getTimeBucket(hour);
    this.data.patterns = upsertPattern(this.data.patterns, type, metric, timeBucket);

    // Enforce bounds
    this.data.patterns = evictPatterns(this.data.patterns);

    this.persist();
    return this.data.patterns.find(
      (p) => p.type === type && p.metric === metric && p.timeBucket === timeBucket,
    ) ?? null;
  }

  /** Get patterns, optionally filtered. */
  listPatterns(filters?: { type?: PatternType; metric?: string; minConfidence?: number }): BehavioralPattern[] {
    if (!filters) return [...this.data.patterns];
    return findRelevantPatterns(this.data.patterns, filters);
  }

  // ── Signals ──────────────────────────────────────────────────────────────

  /** Collect a learning signal from a trusted event. */
  collectSignal(type: SignalType, metric: string, metadata?: Record<string, unknown>): LearningSignal | null {
    if (!this.data.settings.enabled) return null;

    const signal = createSignal(type, metric, metadata);
    if (!signal) return null;

    this.data.signals.push(signal);
    this.data.signals = trimSignals(this.data.signals);
    this.persist();
    return signal;
  }

  /** Get recent signals. */
  listSignals(limit?: number): LearningSignal[] {
    const signals = [...this.data.signals].reverse();
    return limit ? signals.slice(0, limit) : signals;
  }

  /** Get aggregated signal counts. */
  getSignalSummary(): Map<string, number> {
    return aggregateSignals(this.data.signals);
  }

  // ── Recommendations ──────────────────────────────────────────────────────

  /** Generate new recommendations based on patterns. */
  generateRecommendations(): Recommendation[] {
    if (!this.data.settings.enabled || !this.data.settings.showRecommendations) {
      return [];
    }

    const newRecs = generateRecommendations(
      this.data.patterns,
      this.data.recommendations,
      this.data.settings,
    );

    if (newRecs.length > 0) {
      this.data.recommendations.push(...newRecs);
      this.data.recommendations = trimRecommendationHistory(this.data.recommendations);
      this.persist();
    }

    return newRecs;
  }

  /** Get active recommendations. */
  getActiveRecommendations(): Recommendation[] {
    const now = Date.now();
    return this.data.recommendations.filter((r) => {
      if (r.status !== "active" && r.status !== "snoozed") return false;
      if (r.status === "snoozed" && r.snoozedUntil && r.snoozedUntil > now) return false;
      return true;
    });
  }

  /** Dismiss a recommendation. */
  dismissRecommendation(id: string): { success: boolean; error?: string } {
    const rec = this.data.recommendations.find((r) => r.id === id);
    if (!rec) return { success: false, error: "Recommendation not found" };

    this.data.recommendations = dismissRecommendation(this.data.recommendations, id);
    this.persist();
    return { success: true };
  }

  /** Snooze a recommendation. */
  snoozeRecommendation(id: string, durationMs: number): { success: boolean; error?: string } {
    const rec = this.data.recommendations.find((r) => r.id === id);
    if (!rec) return { success: false, error: "Recommendation not found" };

    this.data.recommendations = snoozeRecommendation(this.data.recommendations, id, durationMs);
    this.persist();
    return { success: true };
  }

  /** Accept a recommendation. */
  acceptRecommendation(id: string): { success: boolean; error?: string } {
    const rec = this.data.recommendations.find((r) => r.id === id);
    if (!rec) return { success: false, error: "Recommendation not found" };

    this.data.recommendations = acceptRecommendation(this.data.recommendations, id);
    this.persist();
    return { success: true };
  }

  // ── Context ──────────────────────────────────────────────────────────────

  /** Build a bounded personalization context for injection. */
  buildContext(options?: {
    maxPreferences?: number;
    maxPatterns?: number;
    maxRecommendations?: number;
  }): PersonalizationContext {
    const maxPrefs = options?.maxPreferences ?? 6;
    const maxPatterns = options?.maxPatterns ?? 4;
    const maxRecs = options?.maxRecommendations ?? 1;

    return {
      explicitPreferences: this.data.preferences
        .filter((p) => p.enabled && p.confidence >= 0.6)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxPrefs),
      relevantPatterns: this.data.patterns
        .filter((p) => p.confidence >= 0.5)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxPatterns),
      activeRecommendations: this.getActiveRecommendations().slice(0, maxRecs),
      settings: this.getSettings(),
      enabled: this.data.settings.enabled,
    };
  }

  // ── Privacy Controls ─────────────────────────────────────────────────────

  /** Clear all personalization data. */
  clearAll(): { success: boolean; deleted: { preferences: number; patterns: number; signals: number; recommendations: number } } {
    const deleted = {
      preferences: this.data.preferences.length,
      patterns: this.data.patterns.length,
      signals: this.data.signals.length,
      recommendations: this.data.recommendations.length,
    };

    this.data.preferences = [];
    this.data.patterns = [];
    this.data.signals = [];
    this.data.recommendations = [];
    this.persist();

    return { success: true, deleted };
  }

  /** Disable personalization entirely. */
  disable(): void {
    this.data.settings.enabled = false;
    this.data.settings.collectPatterns = false;
    this.data.settings.showRecommendations = false;
    this.persist();
  }

  /** Enable personalization. */
  enable(): void {
    this.data.settings.enabled = true;
    this.data.settings.collectPatterns = true;
    this.data.settings.showRecommendations = true;
    this.persist();
  }

  /** Export a safe human-readable summary (no secrets). */
  exportSummary(): string {
    const lines: string[] = ["Personalization Summary", "========================", ""];

    lines.push(`Enabled: ${this.data.settings.enabled}`);
    lines.push(`Preferences: ${this.data.preferences.length}`);
    lines.push(`Patterns: ${this.data.patterns.length}`);
    lines.push(`Signals: ${this.data.signals.length}`);
    lines.push(`Recommendations: ${this.data.recommendations.length}`);
    lines.push("");

    lines.push("Preferences:");
    for (const p of this.data.preferences) {
      const status = p.enabled ? "enabled" : "disabled";
      lines.push(`  [${status}] ${p.category}/${p.key} = ${p.value} (source: ${p.source}, confidence: ${p.confidence.toFixed(2)})`);
    }
    lines.push("");

    lines.push("Patterns:");
    for (const p of this.data.patterns) {
      lines.push(`  ${p.type}/${p.metric}: ${p.count}x (confidence: ${p.confidence.toFixed(2)})`);
    }

    return lines.join("\n");
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /** Get the raw data for testing. */
  getData(): PersonalizationStoreData {
    return JSON.parse(JSON.stringify(this.data)) as PersonalizationStoreData;
  }

  private persist(): void {
    this.store.save(this.data);
    this.notify();
  }

  private notify(): void {
    const snapshot = JSON.parse(JSON.stringify(this.data)) as PersonalizationStoreData;
    for (const listener of this.listeners) {
      try { listener(snapshot); } catch { /* listener errors are swallowed */ }
    }
  }

  addListener(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let defaultManager: PersonalizationManager | null = null;

export function getPersonalizationManager(): PersonalizationManager {
  if (!defaultManager) {
    defaultManager = new PersonalizationManager();
  }
  return defaultManager;
}

/** Replace the shared manager (used by tests). */
export function setPersonalizationManager(manager: PersonalizationManager | null): void {
  defaultManager = manager;
}

/** Reset singleton (used by tests). */
export function resetPersonalizationManager(): void {
  defaultManager = null;
}
