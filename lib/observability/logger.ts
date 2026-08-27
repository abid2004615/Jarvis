/**
 * P14 — Structured Logger
 *
 * Centralized structured event logger for JARVIS observability.
 * Records structured events and outcomes, never chain-of-thought or private prompts.
 * All output is redacted before being written.
 */

import type {
  ObservabilityEvent,
  EventCategory,
  EventSeverity,
  ObservabilityEventType,
  ErrorCategory,
  CorrelationIds,
} from "./types";
import { redactSecrets, redactErrorMessage } from "./redaction";
import { generateCorrelationId } from "./correlation";

const MAX_EVENTS = 5000;
const MAX_MESSAGE_LENGTH = 500;

const events: ObservabilityEvent[] = [];
const listeners: Set<(event: ObservabilityEvent) => void> = new Set();

/**
 * Emit a structured observability event.
 */
export function emitEvent(params: {
  category: EventCategory;
  eventType: ObservabilityEventType;
  severity?: EventSeverity;
  message: string;
  correlationIds?: CorrelationIds;
  metadata?: Record<string, unknown>;
  duration?: number;
  error?: unknown;
}): ObservabilityEvent {
  const severity = params.severity || "info";
  let message = params.message.length > MAX_MESSAGE_LENGTH
    ? params.message.substring(0, MAX_MESSAGE_LENGTH)
    : params.message;

  // Redact any secrets from the message
  message = redactSecrets(message).redacted;

  // Classify error if present
  let errorField: ObservabilityEvent["error"];
  if (params.error) {
    const category = classifyError(params.error);
    errorField = {
      name: params.error instanceof Error ? params.error.name : "UnknownError",
      message: redactErrorMessage(params.error),
      category: category.category,
      recoverable: category.recoverable,
    };
  }

  const event: ObservabilityEvent = {
    id: generateCorrelationId("req"),
    timestamp: Date.now(),
    iso: new Date().toISOString(),
    category: params.category,
    eventType: params.eventType,
    severity,
    requestId: params.correlationIds?.requestId,
    conversationId: params.correlationIds?.conversationId,
    goalId: params.correlationIds?.goalId,
    chainId: params.correlationIds?.chainId,
    agentRunId: params.correlationIds?.agentRunId,
    toolExecutionId: params.correlationIds?.toolExecutionId,
    confirmationId: params.correlationIds?.confirmationId,
    verificationId: params.correlationIds?.verificationId,
    message,
    metadata: params.metadata,
    duration: params.duration,
    error: errorField,
  };

  // Store in bounded buffer
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.shift();
  }

  // Notify listeners
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Listener errors must not propagate
    }
  }

  // Console output in development (with redaction)
  if (process.env.NODE_ENV === "development") {
    const prefix = `[${event.severity.toUpperCase()}][${event.category}]`;
    console.log(`${prefix} ${event.message}`);
  }

  return event;
}

/**
 * Subscribe to events. Returns unsubscribe function.
 */
export function onEvent(listener: (event: ObservabilityEvent) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Get all stored events.
 */
export function getEvents(filter?: {
  category?: EventCategory;
  severity?: EventSeverity;
  requestId?: string;
  since?: number;
  limit?: number;
}): ObservabilityEvent[] {
  let result = events;

  if (filter) {
    if (filter.category) {
      result = result.filter((e) => e.category === filter.category);
    }
    if (filter.severity) {
      result = result.filter((e) => e.severity === filter.severity);
    }
    if (filter.requestId) {
      result = result.filter((e) => e.requestId === filter.requestId);
    }
    if (filter.since !== undefined && filter.since !== null) {
      const since = filter.since;
      result = result.filter((e) => e.timestamp >= since);
    }
    if (filter.limit) {
      result = result.slice(-filter.limit);
    }
  }

  return [...result];
}

/**
 * Get event count by category.
 */
export function getEventCounts(): Record<EventCategory, number> {
  const counts: Record<EventCategory, number> = {
    request: 0, ai: 0, agent: 0, goal: 0, tool: 0,
    confirmation: 0, verification: 0, voice: 0, vision: 0,
    automation: 0, memory: 0, personalization: 0, system: 0,
    security: 0, error: 0,
  };

  for (const event of events) {
    counts[event.category]++;
  }

  return counts;
}

/**
 * Clear all events (for testing).
 */
export function clearEvents(): void {
  events.length = 0;
}

/**
 * Clear all listeners (for testing).
 */
export function clearEventListeners(): void {
  listeners.clear();
}

// Error classification logic

const RETRYABLE_ERROR_PATTERNS: Array<{ pattern: RegExp; category: ErrorCategory }> = [
  { pattern: /timeout|timed?\s*out/i, category: "timeout_error" },
  { pattern: /rate\s*limit|429|too\s*many\s*requests/i, category: "rate_limit_error" },
  { pattern: /ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|fetch\s*failed/i, category: "network_error" },
  { pattern: /500|502|503|504|internal\s*server\s*error/i, category: "network_error" },
  { pattern: /408|request\s*timeout/i, category: "timeout_error" },
];

const NON_RETRYABLE_ERROR_PATTERNS: Array<{ pattern: RegExp; category: ErrorCategory }> = [
  { pattern: /401|403|unauthorized|forbidden|invalid.*api.*key|authentication/i, category: "authentication_error" },
  { pattern: /invalid.*argument|validation|malformed|parse.*error|unexpected\s*token/i, category: "validation_error" },
  { pattern: /permission|access\s*denied|not\s*allowed|not\s*permitted/i, category: "permission_error" },
  { pattern: /confirmation.*denied|user.*denied|rejected.*by.*user/i, category: "confirmation_required" },
  { pattern: /not\s*found|does\s*not\s*exist|unknown\s*tool|unrecognized/i, category: "validation_error" },
  { pattern: /unsupported|not\s*implemented|unavailable/i, category: "execution_error" },
  { pattern: /storage|corrupt|disk|file\s*system/i, category: "storage_error" },
  { pattern: /secret|credential|api\s*key|password|token.*reject/i, category: "security_error" },
  { pattern: /injection|malicious|prompt\s*inject/i, category: "security_error" },
  { pattern: /config|missing.*env|not\s*configured/i, category: "configuration_error" },
  { pattern: /vision.*unavailable|screen.*permission|ocr.*fail/i, category: "vision_error" },
  { pattern: /voice|microphone|speech|tts/i, category: "voice_error" },
  { pattern: /agent.*fail|agent.*timeout/i, category: "agent_error" },
  { pattern: /goal.*fail|step.*fail/i, category: "goal_error" },
  { pattern: /verify|mismatch|unexpected.*result/i, category: "verification_error" },
];

/**
 * Classify an error into structured categories.
 */
export function classifyError(error: unknown): {
  category: ErrorCategory;
  recoverable: boolean;
  retryable: boolean;
  severity: "info" | "warn" | "error" | "critical";
  userMessage: string;
} {
  let message: string;
  if (error instanceof Error) {
    message = `${error.name}: ${error.message}`;
  } else if (typeof error === "string") {
    message = error;
  } else {
    message = "Unknown error";
  }

  // Check non-retryable patterns first (more specific)
  for (const { pattern, category } of NON_RETRYABLE_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return {
        category,
        recoverable: false,
        retryable: false,
        severity: getSeverityForCategory(category),
        userMessage: getUserMessageForCategory(category),
      };
    }
  }

  // Check retryable patterns
  for (const { pattern, category } of RETRYABLE_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return {
        category,
        recoverable: true,
        retryable: true,
        severity: "warn",
        userMessage: getUserMessageForCategory(category),
      };
    }
  }

  // Default classification
  return {
    category: "unknown_error",
    recoverable: false,
    retryable: false,
    severity: "error",
    userMessage: "An unexpected error occurred. Please try again.",
  };
}

function getSeverityForCategory(category: ErrorCategory): "info" | "warn" | "error" | "critical" {
  switch (category) {
    case "authentication_error":
    case "security_error":
    case "configuration_error":
      return "critical";
    case "permission_error":
    case "storage_error":
      return "error";
    case "validation_error":
    case "execution_error":
      return "error";
    default:
      return "error";
  }
}

function getUserMessageForCategory(category: ErrorCategory): string {
  switch (category) {
    case "rate_limit_error":
      return "The AI service is temporarily busy. Please try again shortly.";
    case "timeout_error":
      return "The request took too long. Please try again.";
    case "network_error":
      return "A network issue occurred. Please check your connection and try again.";
    case "authentication_error":
      return "Authentication failed. Please check your API configuration.";
    case "validation_error":
      return "The request was invalid. Please rephrase and try again.";
    case "permission_error":
      return "You don't have permission to perform this action.";
    case "confirmation_required":
      return "This action requires your confirmation.";
    case "execution_error":
      return "The action could not be completed. Please try again.";
    case "verification_error":
      return "The action result could not be verified.";
    case "storage_error":
      return "A storage issue occurred. Some data may not have been saved.";
    case "security_error":
      return "A security concern was detected. The action was blocked.";
    case "vision_error":
      return "Screen analysis is temporarily unavailable.";
    case "voice_error":
      return "Voice features are temporarily unavailable.";
    case "agent_error":
      return "An agent task encountered an issue.";
    case "goal_error":
      return "A goal step could not be completed.";
    case "configuration_error":
      return "System configuration is incomplete. Please check your setup.";
    default:
      return "An unexpected error occurred. Please try again.";
  }
}
