/**
 * P10 Tests — High-Risk Action Detection
 */

import {
  detectHighRiskAction,
  getConfirmationLevel,
  getConfirmationDescription,
} from "@/lib/computer-use/high-risk";
import type { ComputerAction } from "@/lib/computer-use/types";

describe("P10 High-Risk Detection", () => {
  describe("detectHighRiskAction", () => {
    it("should detect payment buttons as high risk", () => {
      const action: ComputerAction = {
        type: "click",
        target: { role: "button", label: "Buy Now", source: "ocr" },
      };
      const result = detectHighRiskAction(action);
      expect(result.isHighRisk).toBe(true);
      expect(result.confirmationLevel).toBe("destructive");
    });

    it("should detect purchase buttons as high risk", () => {
      const action: ComputerAction = {
        type: "click",
        target: { role: "button", label: "Complete Purchase", source: "ocr" },
      };
      const result = detectHighRiskAction(action);
      expect(result.isHighRisk).toBe(true);
    });

    it("should detect place order as high risk", () => {
      const action: ComputerAction = {
        type: "click",
        target: { role: "button", label: "Place Order", source: "ocr" },
      };
      const result = detectHighRiskAction(action);
      expect(result.isHighRisk).toBe(true);
    });

    it("should detect delete account as high risk", () => {
      const action: ComputerAction = {
        type: "click",
        target: { role: "button", label: "Delete Account", source: "ocr" },
      };
      const result = detectHighRiskAction(action);
      expect(result.isHighRisk).toBe(true);
    });

    it("should detect checkout as high risk", () => {
      const action: ComputerAction = {
        type: "click",
        target: { role: "button", label: "Checkout", source: "ocr" },
      };
      const result = detectHighRiskAction(action);
      expect(result.isHighRisk).toBe(true);
    });

    it("should detect typing into password field as high risk", () => {
      const action: ComputerAction = {
        type: "type",
        value: "secret123",
        target: { role: "input", label: "Password", source: "accessibility" },
      };
      const result = detectHighRiskAction(action);
      expect(result.isHighRisk).toBe(true);
    });

    it("should not flag normal buttons as high risk", () => {
      const action: ComputerAction = {
        type: "click",
        target: { role: "button", label: "Save", source: "accessibility" },
      };
      const result = detectHighRiskAction(action);
      expect(result.isHighRisk).toBe(false);
    });

    it("should not flag normal typing as high risk", () => {
      const action: ComputerAction = {
        type: "type",
        value: "hello world",
        target: { role: "input", label: "Search", source: "accessibility" },
      };
      const result = detectHighRiskAction(action);
      expect(result.isHighRisk).toBe(false);
    });

    it("should not flag scroll as high risk", () => {
      const action: ComputerAction = {
        type: "scroll",
        direction: "down",
      };
      const result = detectHighRiskAction(action);
      expect(result.isHighRisk).toBe(false);
    });
  });

  describe("getConfirmationLevel", () => {
    it("should return destructive for high-risk actions", () => {
      const action: ComputerAction = {
        type: "click",
        target: { role: "button", label: "Buy Now", source: "ocr" },
      };
      expect(getConfirmationLevel(action)).toBe("destructive");
    });

    it("should return external_effect for clicks", () => {
      const action: ComputerAction = {
        type: "click",
        target: { role: "button", label: "Submit", source: "accessibility" },
      };
      expect(getConfirmationLevel(action)).toBe("external_effect");
    });

    it("should return low_risk for scroll", () => {
      const action: ComputerAction = {
        type: "scroll",
        direction: "down",
      };
      expect(getConfirmationLevel(action)).toBe("low_risk");
    });

    it("should return low_risk for keypress", () => {
      const action: ComputerAction = {
        type: "keypress",
        key: "enter",
      };
      expect(getConfirmationLevel(action)).toBe("low_risk");
    });

    it("should return external_effect for type", () => {
      const action: ComputerAction = {
        type: "type",
        value: "hello",
      };
      expect(getConfirmationLevel(action)).toBe("external_effect");
    });
  });

  describe("getConfirmationDescription", () => {
    it("should describe click action", () => {
      const action: ComputerAction = {
        type: "click",
        target: { role: "button", label: "Save", source: "accessibility", centerX: 100, centerY: 200 } as any,
      };
      const desc = getConfirmationDescription(action);
      expect(desc).toContain("Click");
      expect(desc).toContain("Save");
    });

    it("should describe type action", () => {
      const action: ComputerAction = {
        type: "type",
        value: "hello",
      };
      const desc = getConfirmationDescription(action);
      expect(desc).toContain("Type");
    });

    it("should describe scroll action", () => {
      const action: ComputerAction = {
        type: "scroll",
        direction: "down",
      };
      const desc = getConfirmationDescription(action);
      expect(desc).toContain("Scroll");
      expect(desc).toContain("down");
    });

    it("should describe keypress action", () => {
      const action: ComputerAction = {
        type: "keypress",
        key: "enter",
      };
      const desc = getConfirmationDescription(action);
      expect(desc).toContain("Press");
      expect(desc).toContain("enter");
    });

    it("should describe high-risk action with warning", () => {
      const action: ComputerAction = {
        type: "click",
        target: { role: "button", label: "Buy Now", source: "ocr" },
      };
      const desc = getConfirmationDescription(action);
      expect(desc).toContain("High-risk");
    });
  });
});
