/**
 * P10 Tests — Accessibility Permission + Element Discovery
 */

import {
  checkAccessibilityPermission,
  queryAccessibilityElements,
  findAccessibilityElement,
  countAccessibilityElements,
  mapAccessibilityRole,
} from "@/lib/computer-use/accessibility";

describe("P10 Accessibility", () => {
  describe("checkAccessibilityPermission", () => {
    it("should return a valid permission status", () => {
      const status = checkAccessibilityPermission();
      expect(["granted", "denied", "unknown"]).toContain(status);
    });

    it("should return denied on non-macOS", () => {
      if (process.platform !== "darwin") {
        expect(checkAccessibilityPermission()).toBe("denied");
      }
    });
  });

  describe("mapAccessibilityRole", () => {
    it("should map AXButton to button", () => {
      expect(mapAccessibilityRole("AXButton")).toBe("button");
    });

    it("should map AXLink to link", () => {
      expect(mapAccessibilityRole("AXLink")).toBe("link");
    });

    it("should map AXStaticText to text", () => {
      expect(mapAccessibilityRole("AXStaticText")).toBe("text");
    });

    it("should map AXTextField to input", () => {
      expect(mapAccessibilityRole("AXTextField")).toBe("input");
    });

    it("should map AXMenu to menu", () => {
      expect(mapAccessibilityRole("AXMenu")).toBe("menu");
    });

    it("should map AXTab to tab", () => {
      expect(mapAccessibilityRole("AXTab")).toBe("tab");
    });

    it("should map AXCheckBox to checkbox", () => {
      expect(mapAccessibilityRole("AXCheckBox")).toBe("checkbox");
    });

    it("should map AXWindow to window", () => {
      expect(mapAccessibilityRole("AXWindow")).toBe("window");
    });

    it("should map unknown roles to unknown", () => {
      expect(mapAccessibilityRole("AXCustomRole")).toBe("unknown");
      expect(mapAccessibilityRole("")).toBe("unknown");
    });
  });

  describe("queryAccessibilityElements", () => {
    it("should return a valid tree structure", () => {
      if (process.platform !== "darwin") return;
      const tree = queryAccessibilityElements();
      expect(tree).toHaveProperty("available");
      expect(tree).toHaveProperty("elements");
      expect(tree).toHaveProperty("elementCount");
      expect(tree).toHaveProperty("permissionStatus");
      expect(Array.isArray(tree.elements)).toBe(true);
    });

    it("should return denied on non-macOS", () => {
      if (process.platform !== "darwin") {
        const tree = queryAccessibilityElements();
        expect(tree.permissionStatus).toBe("denied");
        expect(tree.available).toBe(false);
      }
    });

    it("should handle role filter", () => {
      if (process.platform !== "darwin") return;
      const tree = queryAccessibilityElements("AXButton");
      expect(tree).toHaveProperty("available");
      expect(Array.isArray(tree.elements)).toBe(true);
    });

    it("should handle label filter", () => {
      if (process.platform !== "darwin") return;
      const tree = queryAccessibilityElements(undefined, "Save");
      expect(tree).toHaveProperty("available");
    });

    it("should respect maxElements limit", () => {
      if (process.platform !== "darwin") return;
      const tree = queryAccessibilityElements(undefined, undefined, 5);
      expect(tree.elements.length).toBeLessThanOrEqual(5);
    });
  });

  describe("findAccessibilityElement", () => {
    it("should return null or an element", () => {
      if (process.platform !== "darwin") return;
      const elem = findAccessibilityElement();
      // May be null if no elements found, that's fine
      if (elem) {
        expect(elem).toHaveProperty("role");
      }
    });
  });

  describe("countAccessibilityElements", () => {
    it("should return a non-negative count", () => {
      if (process.platform !== "darwin") return;
      const count = countAccessibilityElements();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
