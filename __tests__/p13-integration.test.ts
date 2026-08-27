/**
 * P13 Tests — Integration
 */

import { PersonalizationManager, setPersonalizationManager, resetPersonalizationManager } from "@/lib/personalization/manager";
import { InMemoryPersonalizationStore } from "@/lib/personalization/store";
import {
  getPersonalizationContextForQuery,
  resolveAmbiguousRequest,
  recordApplicationUsage,
  recordToolUsage,
  getPersonalizationForAgent,
  getPersonalizationForGoal,
  wirePersonalizationToPipeline,
  resetPersonalizationWiring,
} from "@/lib/personalization/wiring";
import { buildPersonalizationContext, insertPersonalizationContext } from "@/lib/personalization/context";
import type { UserPreference } from "@/lib/personalization/types";

function createManager(): PersonalizationManager {
  const store = new InMemoryPersonalizationStore();
  const manager = new PersonalizationManager(store);
  setPersonalizationManager(manager);
  return manager;
}

describe("P13 Integration", () => {
  let manager: PersonalizationManager;

  beforeEach(() => {
    manager = createManager();
  });

  afterEach(() => {
    resetPersonalizationManager();
    resetPersonalizationWiring();
  });

  describe("wiring", () => {
    it("should wire personalization to pipeline", () => {
      wirePersonalizationToPipeline();
      // Should be idempotent
      wirePersonalizationToPipeline();
    });
  });

  describe("getPersonalizationContextForQuery", () => {
    it("should return context for relevant query", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      const context = getPersonalizationContextForQuery("Give me a brief answer");
      expect(context).toContain("detail_level");
    });

    it("should return null when disabled", () => {
      manager.disable();
      const context = getPersonalizationContextForQuery("test");
      expect(context).toBeNull();
    });
  });

  describe("resolveAmbiguousRequest", () => {
    it("should resolve browser preference", () => {
      manager.setPreference("application_preferences", "preferred_browser", "Safari");
      const prefs = resolveAmbiguousRequest("Open my browser");
      expect(prefs.some((p) => p.key === "preferred_browser")).toBe(true);
    });

    it("should return empty when disabled", () => {
      manager.disable();
      const prefs = resolveAmbiguousRequest("Open my browser");
      expect(prefs).toHaveLength(0);
    });
  });

  describe("signal collection", () => {
    it("should record application usage", () => {
      recordApplicationUsage("Safari");
      const patterns = manager.listPatterns({ type: "application_usage" });
      expect(patterns.some((p) => p.metric === "Safari")).toBe(true);
    });

    it("should record tool usage", () => {
      recordToolUsage("get_battery_status");
      const patterns = manager.listPatterns({ type: "tool_usage" });
      expect(patterns.some((p) => p.metric === "get_battery_status")).toBe(true);
    });
  });

  describe("agent integration", () => {
    it("should provide read-only context for agents", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      const context = getPersonalizationForAgent("application");
      expect(context.enabled).toBe(true);
      expect(context.explicitPreferences.length).toBeGreaterThanOrEqual(1);
    });

    it("should not include recommendations for agents", () => {
      const context = getPersonalizationForAgent("application");
      expect(context.activeRecommendations).toHaveLength(0);
    });
  });

  describe("goal integration", () => {
    it("should provide relevant preferences for goals", () => {
      manager.setPreference("application_preferences", "preferred_browser", "Safari");
      const prefs = getPersonalizationForGoal("Open my browser and check system health");
      expect(prefs.some((p) => p.key === "preferred_browser")).toBe(true);
    });

    it("should return empty for disabled personalization", () => {
      manager.disable();
      const prefs = getPersonalizationForGoal("Open my browser");
      expect(prefs).toHaveLength(0);
    });
  });

  describe("memory integration", () => {
    it("should keep personalization separate from memory", () => {
      // Personalization is a separate store from memory
      manager.setPreference("response_style", "detail_level", "concise");
      expect(manager.listPreferences()).toHaveLength(1);

      // Memory system is completely separate (lib/memory/)
      // Personalization does not affect memory
    });
  });

  describe("pipeline signal collection", () => {
    it("should collect signals from pipeline events", () => {
      manager.collectSignal("confirmation_approved", "get_battery_status");
      manager.collectSignal("confirmation_approved", "get_battery_status");
      const signals = manager.listSignals();
      expect(signals.length).toBe(2);
      expect(signals.every((s) => s.type === "confirmation_approved")).toBe(true);
    });
  });

  describe("context injection", () => {
    it("should insert personalization context into messages", () => {
      const messages = [
        { role: "system", content: "You are JARVIS" },
        { role: "user", content: "Hello" },
      ];
      const context = "User preferences:\n- detail_level: concise";
      const result = insertPersonalizationContext(messages, context);
      expect(result).toHaveLength(3);
      expect(result[1].role).toBe("system");
      expect(result[1].content).toContain("detail_level");
      expect(result[2].role).toBe("user");
    });

    it("should not mutate original messages", () => {
      const messages = [
        { role: "system", content: "You are JARVIS" },
        { role: "user", content: "Hello" },
      ];
      const original = [...messages];
      insertPersonalizationContext(messages, "test context");
      expect(messages).toEqual(original);
    });
  });

  describe("preference lifecycle", () => {
    it("should handle full create → update → disable → delete lifecycle", () => {
      // Create
      const createResult = manager.setPreference("response_style", "detail_level", "concise");
      expect(createResult.success).toBe(true);
      expect(manager.getPreference("response_style", "detail_level")?.value).toBe("concise");

      // Update
      const updateResult = manager.updatePreference("response_style", "detail_level", "detailed");
      expect(updateResult.success).toBe(true);
      expect(manager.getPreference("response_style", "detail_level")?.value).toBe("detailed");

      // Disable
      const disableResult = manager.disablePreference("response_style", "detail_level");
      expect(disableResult.success).toBe(true);
      expect(manager.getPreference("response_style", "detail_level")).toBeUndefined();

      // Delete
      const deleteResult = manager.deletePreference("response_style", "detail_level");
      expect(deleteResult.success).toBe(true);
      expect(manager.listPreferences()).toHaveLength(0);
    });

    it("should handle correction flow (higher confidence on correction)", () => {
      manager.setPreference("response_style", "detail_level", "concise");
      const pref1 = manager.getPreference("response_style", "detail_level");
      expect(pref1?.source).toBe("explicit_user");

      // User corrects
      manager.updatePreference("response_style", "detail_level", "detailed");
      const pref2 = manager.getPreference("response_style", "detail_level");
      expect(pref2?.source).toBe("user_correction");
      expect(pref2?.confidence).toBeGreaterThanOrEqual(0.95);
    });
  });

  describe("conflict resolution", () => {
    it("should supersede old preference with new one", () => {
      manager.setPreference("application_preferences", "preferred_browser", "Safari");
      manager.setPreference("application_preferences", "preferred_browser", "Chrome");
      const pref = manager.getPreference("application_preferences", "preferred_browser");
      expect(pref?.value).toBe("Chrome");
      // Only one preference should exist
      expect(manager.listPreferences("application_preferences").length).toBe(1);
    });
  });
});
