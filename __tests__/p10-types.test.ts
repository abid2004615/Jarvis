/**
 * P10 Tests — Computer Use Types
 */

import {
  ALLOWED_KEYS,
  DEFAULT_RATE_LIMITS,
  HIGH_RISK_LABELS,
} from "@/lib/computer-use/types";
import type {
  ComputerAction,
  UIElementTarget,
  ResolvedTarget,
  UIRole,
  TargetSource,
  ComputerActionType,
  ScrollDirection,
  ConfirmationLevel,
  RateLimitConfig,
  ComputerUseHUDState,
  AccessibilityPermissionStatus,
} from "@/lib/computer-use/types";

describe("P10 Computer Use Types", () => {
  describe("ALLOWED_KEYS", () => {
    it("should contain enter, escape, tab, space", () => {
      expect(ALLOWED_KEYS.has("enter")).toBe(true);
      expect(ALLOWED_KEYS.has("escape")).toBe(true);
      expect(ALLOWED_KEYS.has("tab")).toBe(true);
      expect(ALLOWED_KEYS.has("space")).toBe(true);
    });

    it("should contain arrow keys", () => {
      expect(ALLOWED_KEYS.has("arrow_up")).toBe(true);
      expect(ALLOWED_KEYS.has("arrow_down")).toBe(true);
      expect(ALLOWED_KEYS.has("arrow_left")).toBe(true);
      expect(ALLOWED_KEYS.has("arrow_right")).toBe(true);
    });

    it("should contain common cmd shortcuts", () => {
      expect(ALLOWED_KEYS.has("cmd+c")).toBe(true);
      expect(ALLOWED_KEYS.has("cmd+v")).toBe(true);
      expect(ALLOWED_KEYS.has("cmd+w")).toBe(true);
      expect(ALLOWED_KEYS.has("cmd+q")).toBe(true);
      expect(ALLOWED_KEYS.has("cmd+s")).toBe(true);
    });

    it("should contain delete and backspace", () => {
      expect(ALLOWED_KEYS.has("delete")).toBe(true);
      expect(ALLOWED_KEYS.has("backspace")).toBe(true);
    });

    it("should not contain arbitrary keys", () => {
      expect(ALLOWED_KEYS.has("f1")).toBe(false);
      expect(ALLOWED_KEYS.has("ctrl+shift+alt+x")).toBe(false);
      expect(ALLOWED_KEYS.has("super+f12")).toBe(false);
    });

    it("should have at least 20 allowed keys", () => {
      expect(ALLOWED_KEYS.size).toBeGreaterThanOrEqual(20);
    });
  });

  describe("DEFAULT_RATE_LIMITS", () => {
    it("should have sensible defaults", () => {
      expect(DEFAULT_RATE_LIMITS.maxActionsPerChain).toBe(10);
      expect(DEFAULT_RATE_LIMITS.maxClicksPerChain).toBe(8);
      expect(DEFAULT_RATE_LIMITS.maxTypingOperations).toBe(5);
      expect(DEFAULT_RATE_LIMITS.maxTargetResolutionAttempts).toBe(3);
      expect(DEFAULT_RATE_LIMITS.maxRetriesPerAction).toBe(2);
      expect(DEFAULT_RATE_LIMITS.maxScreenshotsPerAction).toBe(2);
    });

    it("should have all positive values", () => {
      for (const value of Object.values(DEFAULT_RATE_LIMITS)) {
        expect(value).toBeGreaterThan(0);
      }
    });
  });

  describe("HIGH_RISK_LABELS", () => {
    it("should include payment-related labels", () => {
      expect(HIGH_RISK_LABELS).toContain("buy");
      expect(HIGH_RISK_LABELS).toContain("purchase");
      expect(HIGH_RISK_LABELS).toContain("place order");
      expect(HIGH_RISK_LABELS).toContain("pay");
      expect(HIGH_RISK_LABELS).toContain("checkout");
    });

    it("should include destructive labels", () => {
      expect(HIGH_RISK_LABELS).toContain("delete account");
      expect(HIGH_RISK_LABELS).toContain("close account");
      expect(HIGH_RISK_LABELS).toContain("uninstall");
      expect(HIGH_RISK_LABELS).toContain("erase");
    });

    it("should have at least 10 high-risk labels", () => {
      expect(HIGH_RISK_LABELS.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe("ComputerAction type shape", () => {
    it("should accept valid click action", () => {
      const action: ComputerAction = {
        type: "click",
        target: {
          role: "button",
          label: "Save",
          source: "accessibility",
        },
      };
      expect(action.type).toBe("click");
      expect(action.target?.role).toBe("button");
    });

    it("should accept valid type action", () => {
      const action: ComputerAction = {
        type: "type",
        value: "hello world",
      };
      expect(action.type).toBe("type");
      expect(action.value).toBe("hello world");
    });

    it("should accept valid scroll action", () => {
      const action: ComputerAction = {
        type: "scroll",
        direction: "down",
        amount: 5,
      };
      expect(action.direction).toBe("down");
      expect(action.amount).toBe(5);
    });

    it("should accept valid keypress action", () => {
      const action: ComputerAction = {
        type: "keypress",
        key: "cmd+c",
      };
      expect(action.key).toBe("cmd+c");
    });

    it("should accept valid focus_window action", () => {
      const action: ComputerAction = {
        type: "focus_window",
        application: "Safari",
      };
      expect(action.application).toBe("Safari");
    });

    it("should accept valid open_url action", () => {
      const action: ComputerAction = {
        type: "open_url",
        value: "https://example.com",
      };
      expect(action.value).toBe("https://example.com");
    });
  });

  describe("UIElementTarget type shape", () => {
    it("should accept minimal target", () => {
      const target: UIElementTarget = {
        role: "button",
        source: "accessibility",
      };
      expect(target.role).toBe("button");
    });

    it("should accept full target", () => {
      const target: UIElementTarget = {
        role: "button",
        label: "Submit",
        application: "Safari",
        windowTitle: "Login",
        bounds: { x: 100, y: 200, width: 80, height: 30 },
        confidence: 0.95,
        source: "ocr",
      };
      expect(target.confidence).toBe(0.95);
    });
  });

  describe("ResolvedTarget type shape", () => {
    it("should have all required fields", () => {
      const target: ResolvedTarget = {
        x: 100,
        y: 200,
        width: 80,
        height: 30,
        centerX: 140,
        centerY: 215,
        role: "button",
        source: "accessibility",
        confidence: 0.95,
        validated: true,
      };
      expect(target.centerX).toBe(140);
      expect(target.validated).toBe(true);
    });
  });
});
