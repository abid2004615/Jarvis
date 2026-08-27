/**
 * JARVIS Computer Use — Type Definitions
 *
 * All computer-use actions are represented as structured data.
 * Raw model-generated coordinates are NEVER trusted.
 * Coordinates must originate from validated screen/application state.
 */

// ── Action Types ──────────────────────────────────────────────────────────────

export type ComputerActionType =
  | "click"
  | "double_click"
  | "type"
  | "scroll"
  | "keypress"
  | "focus_window"
  | "open_url";

// ── UI Element Target ─────────────────────────────────────────────────────────

export type UIRole =
  | "button"
  | "link"
  | "text"
  | "input"
  | "menu"
  | "tab"
  | "checkbox"
  | "window"
  | "unknown";

export type TargetSource = "ocr" | "accessibility" | "vision" | "application";

export interface UIElementTarget {
  role: UIRole;
  label?: string;
  application?: string;
  windowTitle?: string;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence?: number;
  source: TargetSource;
}

// ── Computer Action ───────────────────────────────────────────────────────────

export type ScrollDirection = "up" | "down" | "left" | "right";

export interface ComputerAction {
  type: ComputerActionType;
  target?: UIElementTarget;
  value?: string;
  application?: string;
  windowTitle?: string;
  direction?: ScrollDirection;
  key?: string;
  amount?: number;
}

// ── Resolution ────────────────────────────────────────────────────────────────

export interface ResolvedTarget {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  label?: string;
  role: UIRole;
  source: TargetSource;
  confidence: number;
  validated: boolean;
  application?: string;
  windowTitle?: string;
}

export type TargetResolutionResult =
  | { status: "resolved"; target: ResolvedTarget }
  | { status: "ambiguous"; candidates: ResolvedTarget[] }
  | { status: "not_found"; reason: string }
  | { status: "stale"; reason: string }
  | { status: "out_of_bounds"; reason: string }
  | { status: "error"; error: string };

// ── Execution ─────────────────────────────────────────────────────────────────

export type ComputerActionStatus =
  | "pending"
  | "resolving_target"
  | "awaiting_confirmation"
  | "executing"
  | "verifying"
  | "success"
  | "failed"
  | "rejected"
  | "stale"
  | "ambiguous";

export interface ComputerActionResult {
  status: ComputerActionStatus;
  action: ComputerAction;
  resolvedTarget?: ResolvedTarget;
  message: string;
  error?: string;
  verified?: boolean;
}

// ── Confirmation ──────────────────────────────────────────────────────────────

export type ConfirmationLevel =
  | "read_only"
  | "low_risk"
  | "external_effect"
  | "destructive";

export interface ConfirmationRequest {
  level: ConfirmationLevel;
  description: string;
  action: ComputerAction;
  resolvedTarget?: ResolvedTarget;
}

// ── Rate Limiting ─────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  maxActionsPerChain: number;
  maxTargetResolutionAttempts: number;
  maxRetriesPerAction: number;
  maxClicksPerChain: number;
  maxTypingOperations: number;
  maxScreenshotsPerAction: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  maxActionsPerChain: 10,
  maxTargetResolutionAttempts: 3,
  maxRetriesPerAction: 2,
  maxClicksPerChain: 8,
  maxTypingOperations: 5,
  maxScreenshotsPerAction: 2,
};

// ── High Risk ─────────────────────────────────────────────────────────────────

export const HIGH_RISK_LABELS = [
  "buy",
  "purchase",
  "place order",
  "confirm purchase",
  "pay",
  "checkout",
  "submit payment",
  "transfer",
  "send money",
  "delete account",
  "close account",
  "remove account",
  "deactivate account",
  "uninstall",
  "erase",
  "format",
  "factory reset",
];

export const HIGH_RISK_ROLES: UIRole[] = [];

// ── Keyboard Allowlist ────────────────────────────────────────────────────────

export type AllowedKey =
  | "enter"
  | "return"
  | "escape"
  | "tab"
  | "space"
  | "delete"
  | "backspace"
  | "arrow_up"
  | "arrow_down"
  | "arrow_left"
  | "arrow_right"
  | "home"
  | "end"
  | "page_up"
  | "page_down"
  | "cmd+c"
  | "cmd+v"
  | "cmd+x"
  | "cmd+a"
  | "cmd+z"
  | "cmd+shift+z"
  | "cmd+w"
  | "cmd+q"
  | "cmd+tab"
  | "cmd+`"
  | "cmd+,"
  | "cmd+s"
  | "cmd+n"
  | "cmd+t"
  | "ctrl+alt+cmd+esc";

export const ALLOWED_KEYS: Set<string> = new Set([
  "enter",
  "return",
  "escape",
  "tab",
  "space",
  "delete",
  "backspace",
  "arrow_up",
  "arrow_down",
  "arrow_left",
  "arrow_right",
  "home",
  "end",
  "page_up",
  "page_down",
  "cmd+c",
  "cmd+v",
  "cmd+x",
  "cmd+a",
  "cmd+z",
  "cmd+shift+z",
  "cmd+w",
  "cmd+q",
  "cmd+tab",
  "cmd+`",
  "cmd+,",
  "cmd+s",
  "cmd+n",
  "cmd+t",
  "ctrl+alt+cmd+esc",
]);

// ── Accessibility ─────────────────────────────────────────────────────────────

export type AccessibilityPermissionStatus = "granted" | "denied" | "unknown";

export interface AccessibilityElement {
  role?: string;
  title?: string;
  description?: string;
  value?: string;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  children?: AccessibilityElement[];
}

export interface AccessibilityTree {
  available: boolean;
  elements: AccessibilityElement[];
  elementCount: number;
  permissionStatus: AccessibilityPermissionStatus;
  error?: string;
}

// ── HUD State ─────────────────────────────────────────────────────────────────

export type ComputerUseHUDState =
  | "off"
  | "ready"
  | "locating_target"
  | "target_found"
  | "target_ambiguous"
  | "target_invalid"
  | "awaiting_confirmation"
  | "executing"
  | "verifying"
  | "success"
  | "failed"
  | "accessibility_required";
