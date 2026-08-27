/**
 * JARVIS Computer Use — macOS Accessibility
 *
 * Queries the macOS Accessibility API (via System Events AppleScript)
 * to discover UI elements by role and label. Used as the preferred
 * target-resolution method before OCR/vision fallback.
 *
 * Requires macOS Accessibility permission.
 */

import type {
  AccessibilityTree,
  AccessibilityElement,
  AccessibilityPermissionStatus,
  UIRole,
} from "./types";

// Lazy-load child_process only when needed (server-side)
let execFileSync: typeof import("child_process").execFileSync | null = null;

function getExecFileSync() {
  if (execFileSync === null) {
    try {
      execFileSync = require("child_process").execFileSync;
    } catch {
      return null;
    }
  }
  return execFileSync;
}

function isMacOS(): boolean {
  return process.platform === "darwin";
}

const AX_TIMEOUT_MS = 5000;

// ── Permission Detection ──────────────────────────────────────────────────────

/**
 * Detect macOS Accessibility permission by attempting a read-only
 * System Events query. If it fails, permission is not granted.
 */
export function checkAccessibilityPermission(): AccessibilityPermissionStatus {
  if (!isMacOS()) return "denied";

  try {
    const exec = getExecFileSync();
    if (!exec) return "unknown";

    // A minimal read-only query — just get the frontmost app name.
    // If Accessibility is not granted, System Events will throw.
    const script = [
      'tell application "System Events"',
      "  set frontProcess to first application process whose frontmost is true",
      "  return name of frontProcess",
      "end tell",
    ].join("\n");

    const output = exec("osascript", [], {
      input: script,
      encoding: "utf8",
      shell: false,
      timeout: AX_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const name = (output || "").toString().trim();
    if (!name) return "denied";
    return "granted";
  } catch {
    return "denied";
  }
}

// ── Role Mapping ──────────────────────────────────────────────────────────────

/**
 * Map macOS Accessibility role string to JARVIS UI role.
 */
export function mapAccessibilityRole(axRole: string): UIRole {
  const mapping: Record<string, UIRole> = {
    "AXButton": "button",
    "AXLink": "link",
    "AXStaticText": "text",
    "AXTextField": "input",
    "AXTextArea": "input",
    "AXComboBox": "input",
    "AXMenu": "menu",
    "AXMenuBar": "menu",
    "AXMenuItem": "menu",
    "AXTab": "tab",
    "AXTabGroup": "tab",
    "AXCheckBox": "checkbox",
    "AXRadioButton": "checkbox",
    "AXWindow": "window",
    "AXToolbar": "menu",
    "AXPopUpButton": "menu",
    "AXSlider": "input",
    "AXScrollArea": "text",
    "AXImage": "unknown",
    "AXGroup": "unknown",
    "AXRow": "text",
    "AXColumn": "text",
    "AXOutline": "text",
    "AXTable": "text",
    "AXCell": "text",
    "AXApplication": "window",
    "AXUnknown": "unknown",
  };
  return mapping[axRole] || "unknown";
}

// ── Element Discovery ─────────────────────────────────────────────────────────

/**
 * Build an AppleScript that walks the Accessibility tree of the frontmost
 * application and returns elements matching the requested role and/or label.
 *
 * Returns JSON array of {role, title, description, bounds}.
 *
 * This is a read-only query — no clicks, no keystrokes.
 */
function buildElementQueryScript(
  roleFilter?: string,
  labelFilter?: string,
  maxElements: number = 50,
): string {
  const filters: string[] = [];
  if (roleFilter) {
    filters.push(`roleFilter is "${roleFilter.replace(/"/g, '\\"')}"`);
  }
  if (labelFilter) {
    filters.push(`labelFilter is "${labelFilter.replace(/"/g, '\\"')}"`);
  }

  const filterCondition = filters.length > 0 ? ` and ${filters.join(" and ")}` : "";

  return [
    'tell application "System Events"',
    "  set frontProcess to first application process whose frontmost is true",
    "  set output to {}",
    "  try",
    "    set allUI to entire contents of frontProcess",
    "    set elemCount to 0",
    "    set maxCount to " + String(maxElements),
    "    repeat with elem in allUI",
    "      if elemCount ≥ maxCount then exit repeat",
    "      try",
    "        set elemRole to role of elem",
    "        set elemTitle to title of elem",
    "        set elemDesc to description of elem",
    "        set elemValue to value of elem",
    "        set elemPos to position of elem",
    "        set elemSize to size of elem",
    `        if (elemRole is not missing value)${filterCondition} then`,
    "          set elemX to item 1 of elemPos",
    "          set elemY to item 2 of elemPos",
    "          set elemW to item 1 of elemSize",
    "          set elemH to item 2 of elemSize",
    '          set elemStr to elemRole & "|" & (elemTitle as text) & "|" & (elemDesc as text) & "|" & (elemValue as text) & "|" & elemX & "," & elemY & "," & elemW & "," & elemH',
    "          set end of output to elemStr",
    "          set elemCount to elemCount + 1",
    "        end if",
    "      end try",
    "    end repeat",
    "  end try",
    "  set AppleScript's text item delimiters to \"\\n\"",
    "  return output as text",
    "end tell",
  ].join("\n");
}

/**
 * Parse a single line from the accessibility query output.
 * Format: role|title|description|value|x,y,w,h
 */
function parseAccessibilityLine(line: string): AccessibilityElement | null {
  const parts = line.split("|");
  if (parts.length < 5) return null;

  const role = parts[0] || undefined;
  const title = parts[1] || undefined;
  const description = parts[2] || undefined;
  const value = parts[3] || undefined;
  const boundsStr = parts[4] || "";

  const [xStr, yStr, wStr, hStr] = boundsStr.split(",");
  const x = parseInt(xStr || "0", 10);
  const y = parseInt(yStr || "0", 10);
  const w = parseInt(wStr || "0", 10);
  const h = parseInt(hStr || "0", 10);

  if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) return null;

  return {
    role: role || undefined,
    title: title || undefined,
    description: description || undefined,
    value: value || undefined,
    bounds: { x, y, width: w, height: h },
  };
}

/**
 * Query the accessibility tree for UI elements matching the given filters.
 */
export function queryAccessibilityElements(
  roleFilter?: string,
  labelFilter?: string,
  maxElements: number = 50,
): AccessibilityTree {
  if (!isMacOS()) {
    return { available: false, elements: [], elementCount: 0, permissionStatus: "denied", error: "Not running on macOS" };
  }

  const permission = checkAccessibilityPermission();
  if (permission !== "granted") {
    return { available: false, elements: [], elementCount: 0, permissionStatus: permission, error: "Accessibility permission required" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { available: false, elements: [], elementCount: 0, permissionStatus: "unknown", error: "child_process not available" };
    }

    const script = buildElementQueryScript(roleFilter, labelFilter, maxElements);
    const output = exec("osascript", [], {
      input: script,
      encoding: "utf8",
      shell: false,
      timeout: AX_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const text = (output || "").toString().trim();
    if (!text) {
      return { available: true, elements: [], elementCount: 0, permissionStatus: "granted" };
    }

    const lines = text.split("\n").filter(Boolean);
    const elements: AccessibilityElement[] = [];

    for (const line of lines) {
      const parsed = parseAccessibilityLine(line);
      if (parsed) elements.push(parsed);
    }

    return {
      available: true,
      elements,
      elementCount: elements.length,
      permissionStatus: "granted",
    };
  } catch {
    return {
      available: false,
      elements: [],
      elementCount: 0,
      permissionStatus: "granted",
      error: "Failed to query accessibility elements",
    };
  }
}

/**
 * Find the first accessibility element matching a role and/or label.
 * Returns null if not found.
 */
export function findAccessibilityElement(
  roleFilter?: string,
  labelFilter?: string,
): AccessibilityElement | null {
  const tree = queryAccessibilityElements(roleFilter, labelFilter, 20);
  if (!tree.available || tree.elements.length === 0) return null;
  return tree.elements[0] ?? null;
}

/**
 * Count how many elements match the given filters.
 */
export function countAccessibilityElements(
  roleFilter?: string,
  labelFilter?: string,
): number {
  const tree = queryAccessibilityElements(roleFilter, labelFilter, 100);
  return tree.elementCount;
}
