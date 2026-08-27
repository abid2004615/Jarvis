/**
 * P10 Tests — Live Mac Tests
 *
 * Real-world tests on the Mac. These verify actual system integration.
 */

import { checkAccessibilityPermission, queryAccessibilityElements } from "@/lib/computer-use/accessibility";
import { resolveTarget, validateTargetBounds, validateTargetOwnership } from "@/lib/computer-use/targets";
import { detectHighRiskAction, getConfirmationLevel } from "@/lib/computer-use/high-risk";
import { captureSnapshot, verifyAction } from "@/lib/computer-use/verifier";
import { canPerformAction, resetChainCounters, getCurrentCounters } from "@/lib/computer-use/rate-limiter";
import { getToolRegistry, resetToolRegistry } from "@/lib/tools/registry";
import { getFrontmostApplication } from "@/lib/macos/applications";
import { getActiveWindow, getScreenDimensions } from "@/lib/macos/window";
import { buildScreenContext } from "@/lib/vision/context";
import type { ComputerAction, UIElementTarget, ResolvedTarget } from "@/lib/computer-use/types";

describe("P10 Live Mac Tests", () => {
  beforeEach(() => {
    resetChainCounters();
  });

  // TEST 1: Current application detection
  it("TEST 1: should detect current frontmost application", () => {
    const app = getFrontmostApplication();
    console.log(`  → Frontmost app: ${app.name || "unknown"}`);
    expect(app.available).toBe(true);
    expect(app.name).toBeTruthy();
  });

  // TEST 2: Accessibility permission status
  it("TEST 2: should report accessibility permission status", () => {
    const status = checkAccessibilityPermission();
    console.log(`  → Accessibility permission: ${status}`);
    expect(["granted", "denied", "unknown"]).toContain(status);
  });

  // TEST 3: Screen dimensions
  it("TEST 3: should get screen dimensions", () => {
    const dims = getScreenDimensions();
    if (dims) {
      console.log(`  → Screen: ${dims.width}x${dims.height}`);
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    }
  });

  // TEST 4: Active window
  it("TEST 4: should get active window title", () => {
    const win = getActiveWindow();
    console.log(`  → Active window: ${win.title || "none"}`);
    // Window may or may not be available depending on accessibility permission
    if (win.available) {
      expect(win.title).toBeTruthy();
    }
  });

  // TEST 5: Accessibility element query
  it("TEST 5: should query accessibility elements", () => {
    if (process.platform !== "darwin") return;
    const tree = queryAccessibilityElements();
    console.log(`  → Accessibility elements: ${tree.elementCount} (permission: ${tree.permissionStatus})`);
    expect(tree).toHaveProperty("available");
    expect(tree).toHaveProperty("permissionStatus");
  });

  // TEST 6: Screen context build
  it("TEST 6: should build screen context", () => {
    const ctx = buildScreenContext();
    console.log(`  → Screen context: app=${ctx.frontmostApplication?.name}, window=${ctx.activeWindow?.title}, ocr=${ctx.ocrBlockCount ?? 0} blocks`);
    expect(ctx).toHaveProperty("capturedAt");
    expect(ctx).toHaveProperty("frontmostApplication");
  });

  // TEST 7: Target resolution (may or may not find)
  it("TEST 7: should attempt target resolution", () => {
    const target: UIElementTarget = {
      role: "button",
      label: "Nonexistent Test Button 12345",
      source: "application",
    };
    const result = resolveTarget(target);
    console.log(`  → Target resolution: ${result.status}`);
    expect(["resolved", "not_found", "ambiguous", "error"]).toContain(result.status);
  });

  // TEST 8: Target bounds validation
  it("TEST 8: should validate target bounds", () => {
    const target: ResolvedTarget = {
      x: 100, y: 200, width: 80, height: 30,
      centerX: 140, centerY: 215,
      role: "button", source: "accessibility", confidence: 0.95, validated: true,
    };
    const dims = getScreenDimensions() || { width: 1440, height: 900 };
    const result = validateTargetBounds(target, dims);
    console.log(`  → Bounds valid: ${result.valid}`);
    expect(result.valid).toBe(true);
  });

  // TEST 9: High-risk detection
  it("TEST 9: should detect high-risk actions", () => {
    const action: ComputerAction = {
      type: "click",
      target: { role: "button", label: "Buy Now", source: "ocr" },
    };
    const result = detectHighRiskAction(action);
    console.log(`  → Buy Now high-risk: ${result.isHighRisk}`);
    expect(result.isHighRisk).toBe(true);
    expect(result.confirmationLevel).toBe("destructive");
  });

  // TEST 10: Normal action not flagged
  it("TEST 10: should not flag normal actions as high-risk", () => {
    const action: ComputerAction = {
      type: "click",
      target: { role: "button", label: "Save", source: "accessibility" },
    };
    const result = detectHighRiskAction(action);
    console.log(`  → Save high-risk: ${result.isHighRisk}`);
    expect(result.isHighRisk).toBe(false);
  });

  // TEST 11: Snapshot capture
  it("TEST 11: should capture a screen snapshot", () => {
    const snap = captureSnapshot();
    console.log(`  → Snapshot: app=${snap.frontmostApp}, window=${snap.windowTitle}`);
    expect(snap.capturedAt).toBeGreaterThan(0);
  });

  // TEST 12: Rate limiting
  it("TEST 12: should enforce rate limits", () => {
    resetChainCounters();
    for (let i = 0; i < 10; i++) {
      canPerformAction("scroll");
    }
    const result = canPerformAction("scroll");
    console.log(`  → Rate limit hit after 10: ${!result.allowed}`);
    expect(result.allowed).toBe(false);
  });

  // TEST 13: Tool registry has all computer-use tools
  it("TEST 13: should have all computer-use tools in registry", () => {
    resetToolRegistry();
    const registry = getToolRegistry();
    const tools = ["computer_click", "computer_type", "computer_scroll", "computer_keypress", "computer_use_status"];
    for (const tool of tools) {
      expect(registry.hasTool(tool)).toBe(true);
      console.log(`  → Tool ${tool}: registered`);
    }
  });

  // TEST 14: All P9 tools still present
  it("TEST 14: should preserve all P9 tools", () => {
    resetToolRegistry();
    const registry = getToolRegistry();
    const p9Tools = [
      "get_clipboard", "set_clipboard", "clear_clipboard",
      "list_windows", "focus_application", "minimize_window", "close_window",
      "list_files", "search_files", "open_file", "reveal_file",
      "get_safari_state", "open_url_in_safari", "new_safari_tab", "close_safari_tab",
      "get_music_state", "control_music", "play_track",
      "get_system_snapshot",
      "get_today_events", "get_upcoming_events", "create_calendar_event",
      "get_vscode_state", "focus_vscode",
    ];
    for (const tool of p9Tools) {
      expect(registry.hasTool(tool)).toBe(true);
    }
    console.log(`  → All ${p9Tools.length} P9 tools preserved`);
  });

  // TEST 15: Credential rejection
  it("TEST 15: should reject password typing as high-risk", () => {
    const action: ComputerAction = {
      type: "type",
      value: "secret123",
      target: { role: "input", label: "Password", source: "accessibility" },
    };
    const result = detectHighRiskAction(action);
    console.log(`  → Password typing high-risk: ${result.isHighRisk}`);
    expect(result.isHighRisk).toBe(true);
  });

  // TEST 16: Screen context has OCR capability
  it("TEST 16: should have OCR capability", () => {
    const ctx = buildScreenContext();
    if (ctx.ocrText) {
      console.log(`  → OCR text length: ${ctx.ocrText.length} chars, ${ctx.ocrBlockCount} blocks`);
      expect(ctx.ocrText.length).toBeGreaterThan(0);
    } else {
      console.log("  → OCR not available (screen recording permission may be needed)");
    }
  });
});
