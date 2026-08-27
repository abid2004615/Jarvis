/**
 * P14 — Error Taxonomy and Recovery
 *
 * Structured error classification with retry policies.
 * Maps errors into categories for consistent handling.
 */

import type { ErrorCategory, ErrorClassification } from "./types";

/**
 * Retry configuration per error category.
 */
const RETRY_POLICY: Record<ErrorCategory, { maxRetries: number; backoffMs: number }> = {
  configuration_error: { maxRetries: 0, backoffMs: 0 },
  authentication_error: { maxRetries: 0, backoffMs: 0 },
  rate_limit_error: { maxRetries: 2, backoffMs: 2000 },
  network_error: { maxRetries: 2, backoffMs: 1000 },
  timeout_error: { maxRetries: 2, backoffMs: 1500 },
  validation_error: { maxRetries: 0, backoffMs: 0 },
  permission_error: { maxRetries: 0, backoffMs: 0 },
  confirmation_required: { maxRetries: 0, backoffMs: 0 },
  execution_error: { maxRetries: 2, backoffMs: 1000 },
  verification_error: { maxRetries: 1, backoffMs: 1000 },
  agent_error: { maxRetries: 2, backoffMs: 1500 },
  goal_error: { maxRetries: 1, backoffMs: 1000 },
  vision_error: { maxRetries: 1, backoffMs: 2000 },
  voice_error: { maxRetries: 1, backoffMs: 1000 },
  storage_error: { maxRetries: 1, backoffMs: 1000 },
  security_error: { maxRetries: 0, backoffMs: 0 },
  user_input_required: { maxRetries: 0, backoffMs: 0 },
  unknown_error: { maxRetries: 1, backoffMs: 1000 },
};

/**
 * Get the retry policy for an error category.
 */
export function getRetryPolicy(category: ErrorCategory): { maxRetries: number; backoffMs: number } {
  return RETRY_POLICY[category] || RETRY_POLICY.unknown_error;
}

/**
 * Check if an error should be retried based on category and attempt count.
 */
export function shouldRetry(category: ErrorCategory, attempt: number): boolean {
  const policy = getRetryPolicy(category);
  return attempt < policy.maxRetries;
}

/**
 * Get the backoff delay for a retry attempt.
 * Uses exponential backoff: backoffMs * 2^attempt
 */
export function getRetryDelay(category: ErrorCategory, attempt: number): number {
  const policy = getRetryPolicy(category);
  return policy.backoffMs * Math.pow(2, attempt);
}

/**
 * Map an HTTP status code to an error category.
 */
export function httpStatusToCategory(status: number): ErrorCategory {
  switch (status) {
    case 400: return "validation_error";
    case 401: return "authentication_error";
    case 403: return "permission_error";
    case 404: return "validation_error";
    case 408: return "timeout_error";
    case 429: return "rate_limit_error";
    case 500: return "network_error";
    case 502: return "network_error";
    case 503: return "network_error";
    case 504: return "timeout_error";
    default:
      return status >= 500 ? "network_error" : "unknown_error";
  }
}

/**
 * Get user-friendly message for an HTTP status code.
 */
export function httpStatusMessage(status: number): string {
  switch (status) {
    case 400: return "Invalid request. Please try again.";
    case 401: return "Authentication failed. Please check your API key.";
    case 403: return "Access denied.";
    case 404: return "Service not found.";
    case 408: return "Request timed out. Please try again.";
    case 429: return "Service is temporarily busy. Please try again shortly.";
    case 500: return "Server error. Please try again later.";
    case 502: return "Service temporarily unavailable. Please try again.";
    case 503: return "Service is currently unavailable. Please try again later.";
    case 504: return "Service timed out. Please try again later.";
    default: return "An error occurred. Please try again.";
  }
}

/**
 * Create an ErrorClassification from an error category.
 */
export function classifyFromCategory(category: ErrorCategory): ErrorClassification {
  const isRetryable = getRetryPolicy(category).maxRetries > 0;

  return {
    category,
    recoverable: isRetryable,
    retryable: isRetryable,
    severity: getSeverityForCategory(category),
    userMessage: getGenericUserMessage(category),
  };
}

function getSeverityForCategory(category: ErrorCategory): ErrorClassification["severity"] {
  switch (category) {
    case "security_error":
    case "authentication_error":
    case "configuration_error":
      return "critical";
    case "storage_error":
    case "permission_error":
      return "error";
    case "rate_limit_error":
    case "timeout_error":
    case "network_error":
      return "warn";
    default:
      return "error";
  }
}

function getGenericUserMessage(category: ErrorCategory): string {
  switch (category) {
    case "rate_limit_error": return "The AI service is temporarily busy. Please try again shortly.";
    case "timeout_error": return "The request took too long. Please try again.";
    case "network_error": return "A network issue occurred. Please check your connection.";
    case "authentication_error": return "Authentication failed. Please check your API configuration.";
    case "validation_error": return "The request was invalid. Please rephrase.";
    case "permission_error": return "You don't have permission to perform this action.";
    case "confirmation_required": return "This action requires your confirmation.";
    case "execution_error": return "The action could not be completed.";
    case "verification_error": return "The result could not be verified.";
    case "storage_error": return "A storage issue occurred.";
    case "security_error": return "A security concern was detected. The action was blocked.";
    case "vision_error": return "Screen analysis is temporarily unavailable.";
    case "voice_error": return "Voice features are temporarily unavailable.";
    case "agent_error": return "An agent task encountered an issue.";
    case "goal_error": return "A goal step could not be completed.";
    case "configuration_error": return "System configuration is incomplete.";
    case "user_input_required": return "I need more information to proceed.";
    default: return "An unexpected error occurred. Please try again.";
  }
}
