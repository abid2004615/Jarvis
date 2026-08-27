/**
 * P14 — Correlation ID Generator
 *
 * Generates and propagates correlation IDs across the request lifecycle.
 * IDs are structured: prefix-timestamp-random for easy identification.
 */

import type { CorrelationIds, CorrelationIdPrefix } from "./types";

let counter = 0;

/**
 * Generate a unique correlation ID with the given prefix.
 * Format: {prefix}-{timestamp}-{counter}
 */
export function generateCorrelationId(prefix: CorrelationIdPrefix): string {
  counter = (counter + 1) % 100000;
  return `${prefix}-${Date.now()}-${counter}`;
}

/**
 * Create a new correlation context for a request.
 */
export function createCorrelationContext(conversationId?: string): CorrelationIds {
  const requestId = generateCorrelationId("req");
  return {
    requestId,
    conversationId: conversationId || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

const PREFIX_TO_KEY: Record<string, keyof CorrelationIds> = {
  goal: "goalId",
  chain: "chainId",
  agent: "agentRunId",
  tool: "toolExecutionId",
  confirm: "confirmationId",
  verify: "verificationId",
};

/**
 * Extend a correlation context with a new ID for a child operation.
 */
export function extendCorrelation(
  parent: CorrelationIds,
  prefix: CorrelationIdPrefix,
): CorrelationIds {
  const key = PREFIX_TO_KEY[prefix];
  if (!key) {
    return { ...parent };
  }
  return {
    ...parent,
    [key]: generateCorrelationId(prefix),
  };
}

/**
 * Create a correlation context for a goal execution.
 */
export function createGoalCorrelation(
  parent: CorrelationIds,
  goalId: string,
): CorrelationIds {
  return {
    ...parent,
    goalId,
  };
}

/**
 * Create a correlation context for an action chain.
 */
export function createChainCorrelation(
  parent: CorrelationIds,
  chainId: string,
): CorrelationIds {
  return {
    ...parent,
    chainId,
  };
}

/**
 * Create a correlation context for a tool execution.
 */
export function createToolCorrelation(
  parent: CorrelationIds,
  toolExecutionId: string,
): CorrelationIds {
  return {
    ...parent,
    toolExecutionId,
  };
}

/**
 * Extract the prefix from a correlation ID.
 */
export function extractPrefix(correlationId: string): CorrelationIdPrefix | null {
  const prefix = correlationId.split("-")[0] as CorrelationIdPrefix;
  const validPrefixes: CorrelationIdPrefix[] = [
    "req", "conv", "goal", "chain", "agent", "tool", "confirm", "verify",
  ];
  return validPrefixes.includes(prefix) ? prefix : null;
}

/**
 * Reset the counter (for testing only).
 */
export function resetCorrelationCounter(): void {
  counter = 0;
}
