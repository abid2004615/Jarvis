/**
 * JARVIS Computer Use — Rate Limiter
 *
 * Limits computer-use actions to prevent abuse:
 *   - Max actions per chain
 *   - Max target resolution attempts
 *   - Max retries per action
 *   - Max clicks per chain
 *   - Max typing operations
 *   - Max screenshots per action
 */

import { DEFAULT_RATE_LIMITS, type RateLimitConfig } from "./types";

// ── State ─────────────────────────────────────────────────────────────────────

interface ChainCounter {
  actions: number;
  clicks: number;
  typingOps: number;
  resolutionAttempts: number;
  retries: number;
  screenshots: number;
}

let currentChain: ChainCounter = {
  actions: 0,
  clicks: 0,
  typingOps: 0,
  resolutionAttempts: 0,
  retries: 0,
  screenshots: 0,
};

let config: RateLimitConfig = { ...DEFAULT_RATE_LIMITS };

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * Reset counters for a new action chain.
 */
export function resetChainCounters(): void {
  currentChain = {
    actions: 0,
    clicks: 0,
    typingOps: 0,
    resolutionAttempts: 0,
    retries: 0,
    screenshots: 0,
  };
}

/**
 * Update the rate limit configuration.
 */
export function setRateLimitConfig(newConfig: Partial<RateLimitConfig>): void {
  config = { ...DEFAULT_RATE_LIMITS, ...newConfig };
}

/**
 * Get the current rate limit configuration.
 */
export function getRateLimitConfig(): RateLimitConfig {
  return { ...config };
}

/**
 * Increment and check if action is allowed.
 */
export function canPerformAction(actionType: string): { allowed: boolean; reason?: string } {
  currentChain.actions++;

  if (currentChain.actions > config.maxActionsPerChain) {
    return {
      allowed: false,
      reason: `Rate limit: maximum ${config.maxActionsPerChain} actions per chain reached`,
    };
  }

  if ((actionType === "click" || actionType === "double_click") && currentChain.clicks >= config.maxClicksPerChain) {
    return {
      allowed: false,
      reason: `Rate limit: maximum ${config.maxClicksPerChain} clicks per chain reached`,
    };
  }

  if (actionType === "click" || actionType === "double_click") {
    currentChain.clicks++;
  }

  if (actionType === "type" && currentChain.typingOps >= config.maxTypingOperations) {
    return {
      allowed: false,
      reason: `Rate limit: maximum ${config.maxTypingOperations} typing operations per chain reached`,
    };
  }

  if (actionType === "type") {
    currentChain.typingOps++;
  }

  return { allowed: true };
}

/**
 * Increment and check if a target resolution attempt is allowed.
 */
export function canAttemptResolution(): { allowed: boolean; reason?: string } {
  currentChain.resolutionAttempts++;

  if (currentChain.resolutionAttempts > config.maxTargetResolutionAttempts) {
    return {
      allowed: false,
      reason: `Rate limit: maximum ${config.maxTargetResolutionAttempts} target resolution attempts reached`,
    };
  }

  return { allowed: true };
}

/**
 * Increment and check if a retry is allowed.
 */
export function canRetry(): { allowed: boolean; reason?: string } {
  currentChain.retries++;

  if (currentChain.retries > config.maxRetriesPerAction) {
    return {
      allowed: false,
      reason: `Rate limit: maximum ${config.maxRetriesPerAction} retries per action reached`,
    };
  }

  return { allowed: true };
}

/**
 * Check if a screenshot capture is allowed.
 */
export function canCaptureScreenshot(): { allowed: boolean; reason?: string } {
  currentChain.screenshots++;

  if (currentChain.screenshots > config.maxScreenshotsPerAction) {
    return {
      allowed: false,
      reason: `Rate limit: maximum ${config.maxScreenshotsPerAction} screenshots per action reached`,
    };
  }

  return { allowed: true };
}

/**
 * Get current chain counters (for diagnostics).
 */
export function getCurrentCounters(): ChainCounter {
  return { ...currentChain };
}
