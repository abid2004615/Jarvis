/**
 * JARVIS Personalization — Storage
 *
 * File-backed personalization store with atomic writes, corruption quarantine,
 * and bounded storage. Separate from memory store (lib/memory/store.ts).
 *
 * Storage location: .jarvis/personalization.json (fixed, application-controlled).
 */

import fs from "fs";
import path from "path";

import {
  PERSONALIZATION_STORAGE_DIR,
  PERSONALIZATION_STORAGE_FILE,
  PERSONALIZATION_LIMITS,
  DEFAULT_SETTINGS,
  type PersonalizationStoreData,
  type UserPreference,
  type BehavioralPattern,
  type LearningSignal,
  type Recommendation,
  type PersonalizationSettings,
} from "./types";

export interface PersonalizationStore {
  load(): PersonalizationStoreData;
  save(data: PersonalizationStoreData): void;
}

/** Canonical on-disk path. */
export function getDefaultPersonalizationFilePath(): string {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    PERSONALIZATION_STORAGE_DIR,
    PERSONALIZATION_STORAGE_FILE,
  );
}

function isValidPreference(v: unknown): v is UserPreference {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.category === "string" &&
    typeof p.key === "string" &&
    typeof p.value === "string" &&
    typeof p.confidence === "number" &&
    typeof p.source === "string" &&
    typeof p.enabled === "boolean" &&
    typeof p.createdAt === "number" &&
    typeof p.updatedAt === "number"
  );
}

function isValidPattern(v: unknown): v is BehavioralPattern {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.type === "string" &&
    typeof p.metric === "string" &&
    typeof p.count === "number" &&
    typeof p.lastObservedAt === "number" &&
    typeof p.confidence === "number" &&
    typeof p.createdAt === "number"
  );
}

function isValidSignal(v: unknown): v is LearningSignal {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.type === "string" &&
    typeof s.metric === "string" &&
    typeof s.timestamp === "number"
  );
}

function isValidRecommendation(v: unknown): v is Recommendation {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    typeof r.description === "string" &&
    typeof r.reason === "string" &&
    typeof r.confidence === "number" &&
    typeof r.status === "string" &&
    typeof r.createdAt === "number" &&
    typeof r.updatedAt === "number"
  );
}

function defaultData(): PersonalizationStoreData {
  return {
    version: 1,
    updatedAt: Date.now(),
    settings: { ...DEFAULT_SETTINGS },
    preferences: [],
    patterns: [],
    signals: [],
    recommendations: [],
  };
}

export class PersonalizationFileStore implements PersonalizationStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? getDefaultPersonalizationFilePath();
  }

  getFilePath(): string {
    return this.filePath;
  }

  load(): PersonalizationStoreData {
    if (!fs.existsSync(/* turbopackIgnore: true */ this.filePath)) {
      return defaultData();
    }
    try {
      const raw = fs.readFileSync(/* turbopackIgnore: true */ this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PersonalizationStoreData>;
      if (!parsed || typeof parsed !== "object") {
        return this.recoverCorrupt();
      }
      return {
        version: 1,
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
        settings: parsed.settings ?? DEFAULT_SETTINGS,
        preferences: Array.isArray(parsed.preferences)
          ? parsed.preferences.filter(isValidPreference).slice(0, PERSONALIZATION_LIMITS.MAX_PREFERENCES)
          : [],
        patterns: Array.isArray(parsed.patterns)
          ? parsed.patterns.filter(isValidPattern).slice(0, PERSONALIZATION_LIMITS.MAX_PATTERNS)
          : [],
        signals: Array.isArray(parsed.signals)
          ? parsed.signals.filter(isValidSignal).slice(-PERSONALIZATION_LIMITS.MAX_SIGNALS)
          : [],
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations.filter(isValidRecommendation).slice(0, PERSONALIZATION_LIMITS.MAX_RECOMMENDATION_HISTORY)
          : [],
      };
    } catch {
      return this.recoverCorrupt();
    }
  }

  save(data: PersonalizationStoreData): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });

    const payload: PersonalizationStoreData = {
      version: 1,
      updatedAt: Date.now(),
      settings: data.settings,
      preferences: data.preferences.slice(0, PERSONALIZATION_LIMITS.MAX_PREFERENCES),
      patterns: data.patterns.slice(0, PERSONALIZATION_LIMITS.MAX_PATTERNS),
      signals: data.signals.slice(-PERSONALIZATION_LIMITS.MAX_SIGNALS),
      recommendations: data.recommendations.slice(0, PERSONALIZATION_LIMITS.MAX_RECOMMENDATION_HISTORY),
    };

    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(/* turbopackIgnore: true */ tempPath, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(/* turbopackIgnore: true */ tempPath, this.filePath);
  }

  private recoverCorrupt(): PersonalizationStoreData {
    try {
      if (fs.existsSync(/* turbopackIgnore: true */ this.filePath)) {
        fs.renameSync(
          /* turbopackIgnore: true */ this.filePath,
          `${this.filePath}.corrupt-${Date.now()}`,
        );
      }
    } catch {
      // Nothing safe to do if quarantine also fails.
    }
    return defaultData();
  }
}

/**
 * In-memory store for tests. Never touches the filesystem.
 */
export class InMemoryPersonalizationStore implements PersonalizationStore {
  private data: PersonalizationStoreData = defaultData();

  load(): PersonalizationStoreData {
    return JSON.parse(JSON.stringify(this.data)) as PersonalizationStoreData;
  }

  save(data: PersonalizationStoreData): void {
    this.data = {
      version: 1,
      updatedAt: Date.now(),
      settings: data.settings,
      preferences: data.preferences.slice(0, PERSONALIZATION_LIMITS.MAX_PREFERENCES),
      patterns: data.patterns.slice(0, PERSONALIZATION_LIMITS.MAX_PATTERNS),
      signals: data.signals.slice(-PERSONALIZATION_LIMITS.MAX_SIGNALS),
      recommendations: data.recommendations.slice(0, PERSONALIZATION_LIMITS.MAX_RECOMMENDATION_HISTORY),
    };
  }

  /** Test helper: seed raw data. */
  seed(data: Partial<PersonalizationStoreData>): void {
    this.data = { ...defaultData(), ...data };
  }

  get raw(): PersonalizationStoreData {
    return this.data;
  }
}
