/**
 * JARVIS Runtime Client-Side Types
 * Pure, server-independent utilities that are safe to import in
 * React client components (no Node-only modules).
 */

import type { JarvisResponse, JarvisRuntimeState, PendingToolCall } from "@/lib/runtime/types";

/**
 * Client-friendly shape of a pipeline response.
 * A thin projection of JarvisResponse (no server internals).
 */
export interface JarvisClientResponse {
  conversationId: string;
  state: JarvisRuntimeState;
  message: string;
  pendingConfirmation?: PendingToolCall;
  toolsExecuted?: {
    toolName: string;
    success: boolean;
    error?: string;
    duration: number;
  }[];
  error?: string;
  timestamp: number;
}

/**
 * Project a server JarvisResponse into a client-safe shape.
 */
export function toClientResponse(response: JarvisResponse): JarvisClientResponse {
  return {
    conversationId: response.conversationId,
    state: response.state,
    message: response.message,
    pendingConfirmation: response.pendingConfirmation,
    toolsExecuted: response.toolsExecuted?.map((tool) => ({
      toolName: tool.toolName,
      success: tool.success,
      error: tool.error,
      duration: tool.duration,
    })),
    error: response.error,
    timestamp: response.timestamp,
  };
}
