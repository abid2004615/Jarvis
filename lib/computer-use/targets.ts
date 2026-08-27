/**
 * JARVIS Computer Use — Target Resolver
 *
 * Resolves UIElementTarget into validated pixel coordinates using
 * a priority cascade:
 *   1. Accessibility API (preferred)
 *   2. OCR text positions
 *   3. Screen context
 *
 * Raw model-generated coordinates are NEVER trusted.
 * Coordinates must originate from validated screen/application state.
 */

import type {
  UIElementTarget,
  ResolvedTarget,
  TargetResolutionResult,
  UIRole,
  TargetSource,
} from "./types";
import {
  queryAccessibilityElements,
  checkAccessibilityPermission,
  mapAccessibilityRole,
} from "./accessibility";
import { buildScreenContext, getLastContext } from "@/lib/vision/context";
import { getScreenDimensions } from "@/lib/macos/window";
import type { ScreenDimensions } from "@/lib/macos/window";
import { captureScreenTemp, deleteTempScreenshot } from "@/lib/vision/capture";
import { performOCR } from "@/lib/vision/ocr";

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_CONFIDENCE = 0.5;
const AMBIGUITY_THRESHOLD = 1.5;
const BOUNDS_PADDING = 5;

// ── Role Reverse Map ──────────────────────────────────────────────────────────

const reverseRoleMap: Record<string, string> = {
  "button": "AXButton",
  "link": "AXLink",
  "text": "AXStaticText",
  "input": "AXTextField",
  "menu": "AXMenu",
  "tab": "AXTab",
  "checkbox": "AXCheckBox",
  "window": "AXWindow",
};

// ── Accessibility → Resolved Target ───────────────────────────────────────────

function matchesLabel(
  element: { title?: string; description?: string; value?: string },
  labelFilter?: string,
): boolean {
  if (!labelFilter) return true;
  const lower = labelFilter.toLowerCase();
  return (
    (element.title?.toLowerCase().includes(lower) ?? false) ||
    (element.description?.toLowerCase().includes(lower) ?? false) ||
    (element.value?.toLowerCase().includes(lower) ?? false)
  );
}

function matchesRole(
  axRole: string | undefined,
  targetRole?: UIRole,
): boolean {
  if (!targetRole || targetRole === "unknown") return true;
  if (!axRole) return false;
  return mapAccessibilityRole(axRole) === targetRole;
}

/**
 * Try to resolve a target via the macOS Accessibility API.
 */
function resolveViaAccessibility(
  target: UIElementTarget,
  screenDims: ScreenDimensions,
): TargetResolutionResult {
  const axRole = target.role !== "unknown"
    ? reverseRoleMap[target.role]
    : undefined;

  const tree = queryAccessibilityElements(
    axRole,
    target.label,
    30,
  );

  if (!tree.available || tree.elements.length === 0) {
    return { status: "not_found", reason: "No matching accessibility elements" };
  }

  const candidates: ResolvedTarget[] = [];

  for (const elem of tree.elements) {
    if (!matchesRole(elem.role, target.role)) continue;
    if (!matchesLabel(elem, target.label)) continue;
    if (!elem.bounds) continue;

    // Accessibility coordinates are in screen points (not pixels on Retina).
    // Validate against screen dimensions.
    const bx = elem.bounds.x;
    const by = elem.bounds.y;
    const bw = elem.bounds.width;
    const bh = elem.bounds.height;

    if (bw <= 0 || bh <= 0) continue;
    if (bx < -100 || by < -100 || bx > screenDims.width + 100 || by > screenDims.height + 100) continue;

    const centerX = bx + bw / 2;
    const centerY = by + bh / 2;

    if (centerX < 0 || centerX > screenDims.width || centerY < 0 || centerY > screenDims.height) continue;

    candidates.push({
      x: bx,
      y: by,
      width: bw,
      height: bh,
      centerX,
      centerY,
      label: elem.title || elem.description || target.label,
      role: mapAccessibilityRole(elem.role || ""),
      source: "accessibility",
      confidence: 0.95,
      validated: true,
      application: target.application,
      windowTitle: target.windowTitle,
    });
  }

  if (candidates.length === 0) {
    return { status: "not_found", reason: "Accessibility elements found but none matched filters" };
  }

  if (candidates.length === 1) {
    return { status: "resolved", target: candidates[0] };
  }

  // Multiple candidates — check if they are ambiguous (similar positions)
  const sorted = candidates.sort((a, b) => a.centerX - b.centerX);
  const minDistance = Math.min(
    ...sorted.slice(1).map((c, i) =>
      Math.hypot(c.centerX - sorted[i].centerX, c.centerY - sorted[i].centerY),
    ),
  );

  if (minDistance < AMBIGUITY_THRESHOLD * 50) {
    return { status: "ambiguous", candidates };
  }

  return { status: "resolved", target: candidates[0] };
}

// ── OCR → Resolved Target ─────────────────────────────────────────────────────

/**
 * Try to resolve a target via OCR text bounding boxes.
 */
function resolveViaOCR(
  target: UIElementTarget,
  screenDims: ScreenDimensions,
): TargetResolutionResult {
  const context = getLastContext() || buildScreenContext();
  if (!context.ocrText) {
    return { status: "not_found", reason: "No OCR text available" };
  }

  const labelLower = target.label?.toLowerCase();
  if (!labelLower) {
    return { status: "not_found", reason: "No label to search in OCR text" };
  }

  // Perform a fresh capture → OCR → resolve → delete.
  // We need bounding boxes from OCR. The context doesn't store blocks,
  // so we need to re-run OCR on the current capture.
  const capResult = captureScreenTemp();
  if (!capResult.success || !capResult.path) {
    return { status: "not_found", reason: "Could not capture screen for OCR" };
  }

  try {
    const ocrResult = performOCR(capResult.path);
    deleteTempScreenshot(capResult.path);

    if (ocrResult.error || !ocrResult.blocks || ocrResult.blocks.length === 0) {
      return { status: "not_found", reason: "No OCR blocks returned" };
    }

    // OCR bounds are normalized (0-1). Convert to screen pixels.
    const candidates: ResolvedTarget[] = [];

    for (const block of ocrResult.blocks) {
      const text = block.text?.toLowerCase() || "";
      if (!text.includes(labelLower)) continue;

      // VNRecognizeTextRequest bounding box is normalized (0-1),
      // origin is bottom-left. Convert to top-left screen coords.
      const bx = block.bounds.x * screenDims.width;
      const rawY = block.bounds.y * screenDims.height;
      const bw = block.bounds.width * screenDims.width;
      const bh = block.bounds.height * screenDims.height;

      // Convert from bottom-left origin to top-left origin
      const by = screenDims.height - rawY - bh;

      const centerX = bx + bw / 2;
      const centerY = by + bh / 2;

      candidates.push({
        x: Math.max(0, bx - BOUNDS_PADDING),
        y: Math.max(0, by - BOUNDS_PADDING),
        width: bw + BOUNDS_PADDING * 2,
        height: bh + BOUNDS_PADDING * 2,
        centerX,
        centerY,
        label: block.text,
        role: target.role || "unknown",
        source: "ocr",
        confidence: block.confidence || 0.5,
        validated: true,
        application: target.application,
        windowTitle: target.windowTitle,
      });
    }

    if (candidates.length === 0) {
      return { status: "not_found", reason: `OCR text does not contain "${target.label}"` };
    }

    if (candidates.length === 1) {
      return { status: "resolved", target: candidates[0] };
    }

    // Multiple OCR matches — check ambiguity
    const sorted = candidates.sort((a, b) => b.confidence - a.confidence);
    const best = sorted[0];
    const secondBest = sorted[1];

    if (best && secondBest) {
      const dist = Math.hypot(
        best.centerX - secondBest.centerX,
        best.centerY - secondBest.centerY,
      );

      if (dist < AMBIGUITY_THRESHOLD * 100) {
        return { status: "ambiguous", candidates: sorted.slice(0, 5) };
      }
    }

    return { status: "resolved", target: best! };
  } catch {
    try { deleteTempScreenshot(capResult.path); } catch { /* best effort */ }
    return { status: "error", error: "OCR resolution failed" };
  }
}

// ── Main Resolver ─────────────────────────────────────────────────────────────

/**
 * Resolve a UIElementTarget into validated pixel coordinates.
 *
 * Priority:
 *   1. Accessibility API (preferred)
 *   2. OCR text positions
 *
 * Never trusts raw model-generated coordinates.
 */
export function resolveTarget(target: UIElementTarget): TargetResolutionResult {
  if (!target.label && (!target.role || target.role === "unknown")) {
    return { status: "not_found", reason: "Target must have at least a label or role" };
  }

  const screenDims = getScreenDimensions() || { width: 1440, height: 900 };

  // Step 1: Try Accessibility (preferred)
  const axPermission = checkAccessibilityPermission();
  if (axPermission === "granted") {
    const axResult = resolveViaAccessibility(target, screenDims);
    if (axResult.status === "resolved" || axResult.status === "ambiguous") {
      return axResult;
    }
  }

  // Step 2: Try OCR
  const ocrResult = resolveViaOCR(target, screenDims);
  if (ocrResult.status === "resolved" || ocrResult.status === "ambiguous") {
    return ocrResult;
  }

  // Step 3: All methods exhausted
  return { status: "not_found", reason: "Could not locate target via accessibility or OCR" };
}

/**
 * Validate that a resolved target is within screen bounds.
 */
export function validateTargetBounds(
  target: ResolvedTarget,
  screenDims?: ScreenDimensions,
): { valid: boolean; reason?: string } {
  const dims = screenDims || getScreenDimensions() || { width: 1440, height: 900 };

  if (target.x < -BOUNDS_PADDING || target.y < -BOUNDS_PADDING) {
    return { valid: false, reason: "Target is off-screen (negative position)" };
  }

  if (target.centerX > dims.width + BOUNDS_PADDING || target.centerY > dims.height + BOUNDS_PADDING) {
    return { valid: false, reason: "Target center is beyond screen dimensions" };
  }

  if (target.width <= 0 || target.height <= 0) {
    return { valid: false, reason: "Target has invalid dimensions" };
  }

  return { valid: true };
}

/**
 * Check if a target belongs to the expected application/window.
 */
export function validateTargetOwnership(
  target: ResolvedTarget,
  expectedApp?: string,
  expectedWindow?: string,
): { valid: boolean; reason?: string } {
  if (expectedApp && target.application && target.application !== expectedApp) {
    return { valid: false, reason: `Target belongs to "${target.application}", expected "${expectedApp}"` };
  }

  if (expectedWindow && target.windowTitle && target.windowTitle !== expectedWindow) {
    return { valid: false, reason: `Target window is "${target.windowTitle}", expected "${expectedWindow}"` };
  }

  return { valid: true };
}
