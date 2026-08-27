/**
 * JARVIS Computer Use — High-Risk Action Detector
 *
 * Detects actions that require additional confirmation:
 *   - Payment / purchase buttons
 *   - Financial transactions
 *   - Account deletion
 *   - Destructive confirmations
 *
 * Never automatically interacts with high-risk targets.
 */

import type { ComputerAction, ConfirmationLevel, UIElementTarget } from "./types";
import { HIGH_RISK_LABELS } from "./types";

// ── Detection ─────────────────────────────────────────────────────────────────

export interface HighRiskCheck {
  isHighRisk: boolean;
  reason?: string;
  confirmationLevel: ConfirmationLevel;
}

/**
 * Check if a computer-use action targets a high-risk element.
 */
export function detectHighRiskAction(action: ComputerAction): HighRiskCheck {
  // Default to external_effect for any computer-use action
  let level: ConfirmationLevel = "external_effect";

  // Check if action type is destructive
  if (action.type === "keypress" && action.key === "cmd+q") {
    return {
      isHighRisk: false,
      confirmationLevel: "low_risk",
    };
  }

  // Check target label against high-risk patterns
  if (action.target?.label) {
    const labelLower = action.target.label.toLowerCase();

    for (const riskLabel of HIGH_RISK_LABELS) {
      if (labelLower.includes(riskLabel)) {
        return {
          isHighRisk: true,
          reason: `Target "${action.target.label}" matches high-risk pattern "${riskLabel}"`,
          confirmationLevel: "destructive",
        };
      }
    }
  }

  // Check if typing into a password field (if target role is input and label suggests password)
  if (action.type === "type" && action.target) {
    const labelLower = action.target.label?.toLowerCase() || "";
    const roleLower = action.target.role?.toLowerCase() || "";

    if (
      labelLower.includes("password") ||
      labelLower.includes("secret") ||
      labelLower.includes("token") ||
      roleLower.includes("password")
    ) {
      return {
        isHighRisk: true,
        reason: "Typing into a password/secret field",
        confirmationLevel: "destructive",
      };
    }
  }

  return { isHighRisk: false, confirmationLevel: level };
}

/**
 * Determine the confirmation level for a computer-use action.
 */
export function getConfirmationLevel(action: ComputerAction): ConfirmationLevel {
  const highRisk = detectHighRiskAction(action);
  if (highRisk.isHighRisk) {
    return highRisk.confirmationLevel;
  }

  switch (action.type) {
    case "click":
    case "double_click":
      return "external_effect";
    case "type":
      return "external_effect";
    case "scroll":
      return "low_risk";
    case "keypress":
      return "low_risk";
    case "focus_window":
      return "low_risk";
    case "open_url":
      return "external_effect";
    default:
      return "external_effect";
  }
}

/**
 * Get a human-readable description of why an action needs confirmation.
 */
export function getConfirmationDescription(action: ComputerAction): string {
  const highRisk = detectHighRiskAction(action);
  if (highRisk.isHighRisk) {
    return `High-risk action: ${highRisk.reason}. This requires your explicit approval.`;
  }

  switch (action.type) {
    case "click": {
      const rt = action.target as import("./types").ResolvedTarget | undefined;
      return `Click ${rt?.label || "target"} at (${Math.round(rt?.centerX ?? 0)}, ${Math.round(rt?.centerY ?? 0)})?`;
    }
    case "double_click":
      return `Double-click ${action.target?.label || "target"}?`;
    case "type":
      return `Type text into ${action.target?.label || "the active field"}?`;
    case "scroll":
      return `Scroll ${action.direction || "down"}?`;
    case "keypress":
      return `Press ${action.key}?`;
    case "focus_window":
      return `Switch to ${action.application || "application"}?`;
    case "open_url":
      return `Open ${action.value || "URL"}?`;
    default:
      return "Execute computer action?";
  }
}
