/**
 * P13 Tests — Personalization Manager
 */

import { PersonalizationManager, setPersonalizationManager, resetPersonalizationManager } from "@/lib/personalization/manager";
import { InMemoryPersonalizationStore } from "@/lib/personalization/store";

function createManager(): { manager: PersonalizationManager; store: InMemoryPersonalizationStore } {
  const store = new InMemoryPersonalizationStore();
  const manager = new PersonalizationManager(store);
  setPersonalizationManager(manager);
  return { manager, store };
}

describe("P13 Personalization Manager", () => {
  let manager: PersonalizationManager;

  beforeEach(() => {
    const { manager: m } = createManager();
    manager = m;
  });

  afterEach(() => {
    resetPersonalizationManager();
  });

  describe("settings", () => {
    it("should return default settings", () => {
      const settings = manager.getSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.collectPatterns).toBe(true);
      expect(settings.showRecommendations).toBe(true);
    });

    it("should update settings", () => {
      manager.updateSettings({ enabled: false });
      expect(manager.getSettings().enabled).toBe(false);
    });

    it("should check enabled state", () => {
      expect(manager.isEnabled()).toBe(true);
      manager.disable();
      expect(manager.isEnabled()).toBe(false);
      manager.enable();
      expect(manager.isEnabled()).toBe(true);
    });
  });

  describe("preferences", () => {
    it("should create a preference", () => {
      const result = manager.setPreference("response_style", "detail_level", "concise");
      expect(result.success).toBe(true);
      expect(result.data?.key).toBe("detail_level");
      expect(result.data?.value).toBe("concise");
      expect(result.data?.source).toBe("explicit_user");
      expect(result.data?.confidence).toBe(0.95);
    });

    it("should upsert preference by category+key", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      manager.setPreference("response_style", "detail_level", "detailed");
      const prefs = manager.listPreferences("response_style");
      expect(prefs.length).toBe(1);
      expect(prefs[0].value).toBe("detailed");
    });

    it("should get preference by category and key", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      const pref = manager.getPreference("response_style", "detail_level");
      expect(pref).toBeDefined();
      expect(pref?.value).toBe("concise");
    });

    it("should list preferences", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      manager.setPreference("application_preferences", "preferred_browser", "Safari");
      expect(manager.listPreferences()).toHaveLength(2);
      expect(manager.listPreferences("response_style")).toHaveLength(1);
    });

    it("should update preference", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      const result = manager.updatePreference("response_style", "detail_level", "detailed");
      expect(result.success).toBe(true);
      expect(manager.getPreference("response_style", "detail_level")?.value).toBe("detailed");
    });

    it("should update preference source to user_correction", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      manager.updatePreference("response_style", "detail_level", "detailed");
      const pref = manager.getPreference("response_style", "detail_level");
      expect(pref?.source).toBe("user_correction");
    });

    it("should disable preference", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      const result = manager.disablePreference("response_style", "detail_level");
      expect(result.success).toBe(true);
      expect(manager.getPreference("response_style", "detail_level")).toBeUndefined();
      // Listed as disabled
      const all = manager.listPreferences();
      expect(all.length).toBe(1);
      expect(all[0].enabled).toBe(false);
    });

    it("should delete preference", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      const result = manager.deletePreference("response_style", "detail_level");
      expect(result.success).toBe(true);
      expect(manager.listPreferences()).toHaveLength(0);
    });

    it("should not set preference when disabled", () => {
      manager.disable();
      const result = manager.setPreference("response_style", "detail_level", "concise");
      expect(result.success).toBe(false);
      expect(result.error).toContain("disabled");
    });

    it("should enforce preference bounds", () => {
      for (let i = 0; i < 105; i++) {
        manager.setPreference("response_style", `key_${i}`, `value_${i}`);
      }
      expect(manager.listPreferences().length).toBeLessThanOrEqual(100);
    });
  });

  describe("patterns", () => {
    it("should record observation", () => {
      const pattern = manager.recordObservation("application_usage", "Safari");
      expect(pattern).toBeDefined();
      expect(pattern?.metric).toBe("Safari");
      expect(pattern?.count).toBe(1);
    });

    it("should increment count on repeated observation", () => {
      manager.recordObservation("application_usage", "Safari");
      manager.recordObservation("application_usage", "Safari");
      manager.recordObservation("application_usage", "Safari");
      const patterns = manager.listPatterns({ metric: "Safari" });
      expect(patterns.length).toBe(1);
      expect(patterns[0].count).toBe(3);
    });

    it("should not record when disabled", () => {
      manager.disable();
      const pattern = manager.recordObservation("application_usage", "Safari");
      expect(pattern).toBeNull();
    });

    it("should not record when collectPatterns is false", () => {
      manager.updateSettings({ collectPatterns: false });
      const pattern = manager.recordObservation("application_usage", "Safari");
      expect(pattern).toBeNull();
    });

    it("should list patterns with filters", () => {
      manager.recordObservation("application_usage", "Safari");
      manager.recordObservation("tool_usage", "get_battery_status");
      expect(manager.listPatterns({ type: "application_usage" })).toHaveLength(1);
      expect(manager.listPatterns({ metric: "Safari" })).toHaveLength(1);
    });
  });

  describe("signals", () => {
    it("should collect signal", () => {
      const signal = manager.collectSignal("task_completed", "task_123");
      expect(signal).toBeDefined();
      expect(signal?.type).toBe("task_completed");
      expect(signal?.metric).toBe("task_123");
    });

    it("should not collect when disabled", () => {
      manager.disable();
      const signal = manager.collectSignal("task_completed", "task_123");
      expect(signal).toBeNull();
    });

    it("should list signals", () => {
      manager.collectSignal("task_completed", "task_1");
      manager.collectSignal("goal_completed", "goal_1");
      const signals = manager.listSignals();
      expect(signals.length).toBe(2);
    });

    it("should get signal summary", () => {
      manager.collectSignal("task_completed", "task_1");
      manager.collectSignal("task_completed", "task_2");
      manager.collectSignal("goal_completed", "goal_1");
      const summary = manager.getSignalSummary();
      expect(summary.get("task_completed:task_1")).toBe(1);
      expect(summary.get("task_completed:task_2")).toBe(1);
      expect(summary.get("goal_completed:goal_1")).toBe(1);
    });
  });

  describe("recommendations", () => {
    it("should generate recommendations from patterns", () => {
      // Build up enough observations to trigger recommendations
      for (let i = 0; i < 5; i++) {
        manager.recordObservation("application_usage", "Safari");
      }
      const recs = manager.generateRecommendations();
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].title).toContain("Safari");
    });

    it("should not generate when disabled", () => {
      manager.disable();
      const recs = manager.generateRecommendations();
      expect(recs).toHaveLength(0);
    });

    it("should dismiss recommendation", () => {
      for (let i = 0; i < 5; i++) {
        manager.recordObservation("application_usage", "Safari");
      }
      manager.generateRecommendations();
      const active = manager.getActiveRecommendations();
      expect(active.length).toBeGreaterThan(0);
      const result = manager.dismissRecommendation(active[0].id);
      expect(result.success).toBe(true);
      expect(manager.getActiveRecommendations().length).toBe(0);
    });

    it("should accept recommendation", () => {
      for (let i = 0; i < 5; i++) {
        manager.recordObservation("application_usage", "Safari");
      }
      manager.generateRecommendations();
      const active = manager.getActiveRecommendations();
      expect(active.length).toBeGreaterThan(0);
      const result = manager.acceptRecommendation(active[0].id);
      expect(result.success).toBe(true);
    });
  });

  describe("context", () => {
    it("should build bounded context", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      manager.recordObservation("application_usage", "Safari");
      const context = manager.buildContext();
      expect(context.enabled).toBe(true);
      expect(context.explicitPreferences.length).toBeGreaterThanOrEqual(1);
    });

    it("should respect bounds in context", () => {
      for (let i = 0; i < 10; i++) {
        manager.setPreference("response_style", `key_${i}`, `value_${i}`);
      }
      const context = manager.buildContext({ maxPreferences: 3 });
      expect(context.explicitPreferences.length).toBeLessThanOrEqual(3);
    });
  });

  describe("privacy", () => {
    it("should clear all data", () => {
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
    });

    it("should export safe summary", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      const summary = manager.exportSummary();
      expect(summary).toContain("Personalization Summary");
      expect(summary).toContain("detail_level");
      expect(summary).toContain("concise");
    });
  });

  describe("listeners", () => {
    it("should notify listeners on mutation", () => {
      const calls: string[] = [];
      manager.addListener((data) => {
        calls.push(`updated:${data.preferences.length}`);
      });
      manager.setPreference("response_style", "detail_level", "concise");
      expect(calls).toHaveLength(1);
    });

    it("should unsubscribe listener", () => {
      const calls: number[] = [];
      const unsub = manager.addListener(() => { calls.push(1); });
      manager.setPreference("response_style", "detail_level", "concise");
      unsub();
      manager.setPreference("response_style", "detail_level", "detailed");
      expect(calls).toHaveLength(1);
    });
  });
});
