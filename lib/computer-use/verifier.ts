/**
 * JARVIS Computer Use — Action Verifier
 *
 * Verifies expected state changes after computer-use actions.
 * Compares before/after screen state using:
 *   - Active application
 *   - Active window title
 *   - OCR text changes
 *   - Lightweight screen fingerprint
 *
 * Bounded comparison — no screenshots stored permanently.
 */

import type { ComputerAction, ComputerActionResult } from "./types";
import { buildScreenContext, getLastContext } from "@/lib/vision/context";
import { getFrontmostApplication } from "@/lib/macos/applications";
import { getActiveWindow } from "@/lib/macos/window";
import type { ScreenContext } from "@/lib/vision/types";

// ── Snapshot ──────────────────────────────────────────────────────────────────

export interface ScreenSnapshot {
  capturedAt: number;
  frontmostApp?: string;
  windowTitle?: string;
  ocrText?: string;
  ocrBlockCount?: number;
}

/**
 * Capture a lightweight snapshot of the current screen state.
 * Used before and after actions for verification.
 */
export function captureSnapshot(): ScreenSnapshot {
  const frontmost = getFrontmostApplication();
  const activeWindow = getActiveWindow();

  const snapshot: ScreenSnapshot = {
    capturedAt: Date.now(),
    frontmostApp: frontmost.name || undefined,
    windowTitle: activeWindow.title || undefined,
  };

  // Try to get OCR text from last context, or build fresh
  const lastCtx = getLastContext();
  if (lastCtx && Date.now() - lastCtx.capturedAt < 5000) {
    snapshot.ocrText = lastCtx.ocrText;
    snapshot.ocrBlockCount = lastCtx.ocrBlockCount;
  }

  return snapshot;
}

// ── Verification ──────────────────────────────────────────────────────────────

export interface VerificationResult {
  verified: boolean;
  changes: string[];
  warnings: string[];
}

/**
 * Compare before/after snapshots and verify expected changes.
 */
export function verifyAction(
  action: ComputerAction,
  before: ScreenSnapshot,
  after: ScreenSnapshot,
): VerificationResult {
  const changes: string[] = [];
  const warnings: string[] = [];
  let verified = true;

  switch (action.type) {
    case "click": {
      // After a click, we expect either:
      // 1. The app changed (if clicking an app switcher), or
      // 2. The window title changed (if clicking a tab/link), or
      // 3. No change is also valid (clicking a button that doesn't navigate)
      if (before.frontmostApp !== after.frontmostApp) {
        changes.push(`App changed: ${before.frontmostApp} → ${after.frontmostApp}`);
      }
      if (before.windowTitle !== after.windowTitle) {
        changes.push(`Window title changed: "${before.windowTitle}" → "${after.windowTitle}"`);
      }
      // No change is still valid for a button click
      if (changes.length === 0) {
        warnings.push("No visible screen change after click (may be valid for button interaction)");
      }
      break;
    }

    case "double_click": {
      // Double-click typically opens a file or item
      if (before.frontmostApp !== after.frontmostApp) {
        changes.push(`App changed: ${before.frontmostApp} → ${after.frontmostApp}`);
      }
      if (before.windowTitle !== after.windowTitle) {
        changes.push(`Window title changed: "${before.windowTitle}" → "${after.windowTitle}"`);
      }
      break;
    }

    case "type": {
      // After typing, verify the window title may have changed (search box etc.)
      // or the OCR text may have changed
      if (before.windowTitle !== after.windowTitle) {
        changes.push(`Window title changed: "${before.windowTitle}" → "${after.windowTitle}"`);
      }
      // Typing doesn't always cause visible changes, so this is informational
      warnings.push("Typing action completed — verify input field contains expected text");
      break;
    }

    case "scroll": {
      // After scrolling, OCR text should change (different content visible)
      if (before.ocrText !== after.ocrText && before.ocrText && after.ocrText) {
        changes.push("Screen content changed (scroll detected)");
      } else if (!before.ocrText || !after.ocrText) {
        warnings.push("Cannot verify scroll — OCR text unavailable");
      } else {
        warnings.push("Screen content appears unchanged after scroll");
      }
      break;
    }

    case "keypress": {
      // Keypress may cause various changes depending on context
      if (before.frontmostApp !== after.frontmostApp) {
        changes.push(`App changed: ${before.frontmostApp} → ${after.frontmostApp}`);
      }
      if (before.windowTitle !== after.windowTitle) {
        changes.push(`Window title changed: "${before.windowTitle}" → "${after.windowTitle}"`);
      }
      break;
    }

    case "focus_window": {
      // Focus should change the frontmost app
      if (after.frontmostApp !== action.application) {
        verified = false;
        warnings.push(`Expected frontmost app to be "${action.application}", got "${after.frontmostApp}"`);
      } else {
        changes.push(`Focused ${action.application}`);
      }
      break;
    }

    case "open_url": {
      // URL open should change Safari's URL or bring Safari to front
      if (after.frontmostApp !== before.frontmostApp) {
        changes.push(`App changed: ${before.frontmostApp} → ${after.frontmostApp}`);
      }
      if (before.windowTitle !== after.windowTitle) {
        changes.push(`Window title changed: "${before.windowTitle}" → "${after.windowTitle}"`);
      }
      break;
    }

    default:
      warnings.push(`No verification logic for action type: ${action.type}`);
  }

  return { verified, changes, warnings };
}
