/**
 * AI API Request Validation
 * Pure, framework-independent validation shared by the API route and tests.
 */

import type { AssistantRequest } from "@/lib/ai/types";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: AssistantRequest;
}

export const MAX_INPUT_LENGTH = 10000;

/**
 * Validate an assistant API request body.
 */
export function validateAssistantRequest(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { valid: false, error: "Request body must be JSON" };
  }

  const req = body as Record<string, unknown>;

  if (typeof req.message !== "string") {
    return { valid: false, error: "message field is required and must be a string" };
  }

  if (!req.message.trim()) {
    return { valid: false, error: "message cannot be empty" };
  }

  if (req.message.length > MAX_INPUT_LENGTH) {
    return { valid: false, error: `message exceeds maximum length of ${MAX_INPUT_LENGTH} characters` };
  }

  return {
    valid: true,
    data: {
      message: req.message.trim(),
      conversationId: typeof req.conversationId === "string" ? req.conversationId : undefined,
    },
  };
}
