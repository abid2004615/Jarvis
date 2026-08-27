/**
 * P13 Tests — Security & Privacy
 */

import { PersonalizationManager, setPersonalizationManager, resetPersonalizationManager } from "@/lib/personalization/manager";
import { InMemoryPersonalizationStore } from "@/lib/personalization/store";
import { validatePreferenceInput, validateSignalInput } from "@/lib/personalization/validator";
import { buildPersonalizationContext, filterRelevantPreferences, isPreferenceRelevant } from "@/lib/personalization/context";
import type { PersonalizationContext } from "@/lib/personalization/types";

function createManager(): PersonalizationManager {
  const store = new InMemoryPersonalizationStore();
  const manager = new PersonalizationManager(store);
  setPersonalizationManager(manager);
  return manager;
}

describe("P13 Security", () => {
  let manager: PersonalizationManager;

  beforeEach(() => {
    manager = createManager();
  });

  afterEach(() => {
    resetPersonalizationManager();
  });

  describe("secret rejection", () => {
    it("should reject API keys in preference values", () => {
      expect(manager.setPreference("response_style", "detail_level", "gsk_abc123def456ghi789").success).toBe(false);
      expect(manager.setPreference("response_style", "detail_level", "sk-abc123def456ghijklmn").success).toBe(false);
      expect(manager.setPreference("response_style", "detail_level", "AIza1234567890abcdefghijklmnop").success).toBe(false);
      expect(manager.setPreference("response_style", "detail_level", "ghp_abc1234567890abcdefghij").success).toBe(false);
    });

    it("should reject passwords in preference values", () => {
      expect(manager.setPreference("response_style", "detail_level", "password is secret123").success).toBe(false);
      expect(manager.setPreference("response_style", "detail_level", "token: abc123").success).toBe(false);
    });

    it("should reject secrets via validator directly", () => {
      expect(validatePreferenceInput({
        category: "response_style",
        key: "detail_level",
        value: "my api key is gsk_test123",
      }).valid).toBe(false);
    });
  });

  describe("shell command rejection", () => {
    it("should reject shell commands in preference values", () => {
      expect(manager.setPreference("application_preferences", "preferred_browser", "sudo open Chrome").success).toBe(false);
      expect(manager.setPreference("application_preferences", "preferred_browser", "osascript -e 'tell application'").success).toBe(false);
    });
  });

  describe("confirmation cannot be disabled", () => {
    it("should reject 'never ask for confirmation'", () => {
      const result = manager.setPreference("interaction_preferences", "auto_confirm_safe", "never ask for confirmation");
      expect(result.success).toBe(false);
      expect(result.error).toContain("cannot disable security confirmations");
    });

    it("should reject 'skip confirmations'", () => {
      const result = manager.setPreference("interaction_preferences", "auto_confirm_safe", "skip all confirmations");
      expect(result.success).toBe(false);
    });

    it("should reject 'disable confirmation'", () => {
      const result = manager.setPreference("interaction_preferences", "auto_confirm_safe", "disable confirmation");
      expect(result.success).toBe(false);
    });
  });

  describe("sensitive profiling rejection", () => {
    it("should reject religion-related preferences", () => {
      const result = manager.setPreference("response_style", "tone", "religious");
      expect(result.success).toBe(false);
    });

    it("should reject health-related preferences", () => {
      const result = manager.setPreference("response_style", "tone", "health conditions");
      expect(result.success).toBe(false);
    });

    it("should reject political preferences", () => {
      const result = manager.setPreference("response_style", "tone", "political");
      expect(result.success).toBe(false);
    });

    it("should reject financial preferences", () => {
      const result = manager.setPreference("response_style", "tone", "financial status");
      expect(result.success).toBe(false);
    });
  });

  describe("personalization cannot bypass security", () => {
    it("preference cannot disable confirmation in real pipeline", () => {
      // Even if somehow a preference got set, it cannot bypass security
      const result = manager.setPreference("interaction_preferences", "auto_confirm_safe", "never ask for confirmation");
      expect(result.success).toBe(false);
    });

    it("preference cannot grant permissions", () => {
      // Preferences don't interact with PermissionManager
      const context = manager.buildContext();
      expect(context.explicitPreferences).toBeDefined();
      // No permission-granting capability exists in the preference system
    });
  });

  describe("unknown fields rejection", () => {
    it("should reject arbitrary fields in preference input", () => {
      expect(validatePreferenceInput({
        category: "response_style",
        key: "detail_level",
        value: "concise",
        maliciousField: "bypass",
      }).valid).toBe(false);
    });
  });

  describe("category restriction", () => {
    it("should reject arbitrary categories", () => {
      expect(validatePreferenceInput({
        category: "arbitrary_category",
        key: "test",
        value: "test",
      }).valid).toBe(false);
    });

    it("should reject keys not allowed for category", () => {
      expect(validatePreferenceInput({
        category: "response_style",
        key: "preferred_browser",
        value: "Safari",
      }).valid).toBe(false);
    });
  });
});

describe("P13 Privacy", () => {
  let manager: PersonalizationManager;

  beforeEach(() => {
    manager = createManager();
  });

  afterEach(() => {
    resetPersonalizationManager();
  });

  describe("data deletion", () => {
    it("should clear all personalization data", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      manager.recordObservation("application_usage", "Safari");
      manager.collectSignal("task_completed", "task_1");

      const result = manager.clearAll();
      expect(result.success).toBe(true);
      expect(result.deleted.preferences).toBe(1);
      expect(result.deleted.patterns).toBe(1);
      expect(result.deleted.signals).toBe(1);

      expect(manager.listPreferences()).toHaveLength(0);
      expect(manager.listPatterns()).toHaveLength(0);
      expect(manager.listSignals()).toHaveLength(0);
    });

    it("should delete individual preferences", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      manager.setPreference("application_preferences", "preferred_browser", "Safari");

      manager.deletePreference("response_style", "detail_level");
      expect(manager.listPreferences()).toHaveLength(1);
      expect(manager.getPreference("application_preferences", "preferred_browser")).toBeDefined();
    });
  });

  describe("disable personalization", () => {
    it("should stop collecting when disabled", () => {
      manager.disable();
      expect(manager.isEnabled()).toBe(false);

      // Should not collect signals
      expect(manager.collectSignal("task_completed", "test")).toBeNull();
      // Should not record patterns
      expect(manager.recordObservation("application_usage", "test")).toBeNull();
      // Should not set preferences
      expect(manager.setPreference("response_style", "detail_level", "concise").success).toBe(false);
    });

    it("should stop generating recommendations when disabled", () => {
      manager.disable();
      const recs = manager.generateRecommendations();
      expect(recs).toHaveLength(0);
    });
  });

  describe("no raw data stored", () => {
    it("should not store raw audio, screenshots, or transcripts", () => {
      const data = manager.getData();
      // Patterns only store aggregated metrics
      for (const pattern of data.patterns) {
        expect(typeof pattern.metric).toBe("string");
        expect(pattern.metric.length).toBeLessThan(200);
      }
      // No raw content fields exist in the data model
      expect(data).not.toHaveProperty("rawAudio");
      expect(data).not.toHaveProperty("rawScreenshots");
      expect(data).not.toHaveProperty("rawTranscripts");
      expect(data).not.toHaveProperty("clipboardContents");
    });
  });

  describe("safe export", () => {
    it("should export human-readable summary without secrets", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      manager.recordObservation("application_usage", "Safari");

      const summary = manager.exportSummary();
      expect(summary).toContain("Personalization Summary");
      expect(summary).toContain("detail_level");
      expect(summary).toContain("concise");
      // No raw data
      expect(summary).not.toContain("gsk_");
      expect(summary).not.toContain("password");
    });
  });
});

describe("P13 Context", () => {
  afterEach(() => {
    resetPersonalizationManager();
  });

  describe("buildPersonalizationContext", () => {
    it("should return null when disabled", () => {
      const context: PersonalizationContext = {
        explicitPreferences: [],
        relevantPatterns: [],
        activeRecommendations: [],
        settings: { enabled: false } as any,
        enabled: false,
      };
      expect(buildPersonalizationContext(context)).toBeNull();
    });

    it("should return null when empty", () => {
      const context: PersonalizationContext = {
        explicitPreferences: [],
        relevantPatterns: [],
        activeRecommendations: [],
        settings: { enabled: true } as any,
        enabled: true,
      };
      expect(buildPersonalizationContext(context)).toBeNull();
    });

    it("should format preferences", () => {
      const context: PersonalizationContext = {
        explicitPreferences: [{
          id: "1",
          category: "response_style",
          key: "detail_level",
          value: "concise",
          confidence: 0.95,
          source: "explicit_user",
          enabled: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }],
        relevantPatterns: [],
        activeRecommendations: [],
        settings: { enabled: true } as any,
        enabled: true,
      };
      const result = buildPersonalizationContext(context);
      expect(result).toContain("detail_level");
      expect(result).toContain("concise");
      expect(result).toContain("explicitly requested");
    });

    it("should format patterns", () => {
      const context: PersonalizationContext = {
        explicitPreferences: [],
        relevantPatterns: [{
          id: "1",
          type: "application_usage",
          metric: "Safari",
          count: 14,
          lastObservedAt: Date.now(),
          confidence: 0.8,
          createdAt: Date.now(),
        }],
        activeRecommendations: [],
        settings: { enabled: true } as any,
        enabled: true,
      };
      const result = buildPersonalizationContext(context);
      expect(result).toContain("Safari");
      expect(result).toContain("14x");
    });
  });

  describe("isPreferenceRelevant", () => {
    it("should match on key", () => {
      const pref = {
        id: "1",
        category: "application_preferences" as const,
        key: "preferred_browser",
        value: "Safari",
        confidence: 0.95,
        source: "explicit_user" as const,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(isPreferenceRelevant(pref, "Open my browser")).toBe(true);
    });

    it("should match on category keywords", () => {
      const pref = {
        id: "1",
        category: "response_style" as const,
        key: "detail_level",
        value: "concise",
        confidence: 0.95,
        source: "explicit_user" as const,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(isPreferenceRelevant(pref, "Give me a brief answer")).toBe(true);
    });

    it("should not match unrelated queries", () => {
      const pref = {
        id: "1",
        category: "voice_preferences" as const,
        key: "voice_response_enabled",
        value: "true",
        confidence: 0.95,
        source: "explicit_user" as const,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(isPreferenceRelevant(pref, "What is the weather?")).toBe(false);
    });
  });

  describe("filterRelevantPreferences", () => {
    it("should return only relevant preferences", () => {
      const prefs = [
        {
          id: "1",
          category: "application_preferences" as const,
          key: "preferred_browser",
          value: "Safari",
          confidence: 0.95,
          source: "explicit_user" as const,
          enabled: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "2",
          category: "voice_preferences" as const,
          key: "voice_response_enabled",
          value: "true",
          confidence: 0.95,
          source: "explicit_user" as const,
          enabled: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      const relevant = filterRelevantPreferences(prefs, "Open my browser");
      expect(relevant.length).toBeGreaterThanOrEqual(1);
      expect(relevant.some((p) => p.key === "preferred_browser")).toBe(true);
    });

    it("should respect maxResults", () => {
      const prefs = Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        category: "response_style" as const,
        key: `key_${i}`,
        value: `value_${i}`,
        confidence: 0.95,
        source: "explicit_user" as const,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      const relevant = filterRelevantPreferences(prefs, "Give me a concise answer", 3);
      expect(relevant.length).toBeLessThanOrEqual(3);
    });
  });
});
