/**
 * AI Core Type Definitions
 * Defines the core interfaces for the AI provider abstraction
 */

import type { ActionChainStatus, PendingToolCall, ToolExecutionResult } from "@/lib/runtime/types";

/**
 * Structured tool call that the AI provider can request
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Result from executing a tool
 */
export interface ToolResult {
  toolCallId: string;
  success: boolean;
  output: unknown;
  error?: string;
}

/**
 * A single message in a conversation
 */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

/**
 * JSON schema for a tool's input (subset of JSON Schema)
 */
export interface AIToolSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * A tool made available to the AI provider, without its execute function
 */
export interface AITool {
  name: string;
  description: string;
  inputSchema: AIToolSchema;
}

/**
 * Context for AI processing
 */
export interface AssistantContext {
  conversationId: string;
  messages: ConversationMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  tools?: AITool[];
}

/**
 * Response from the AI provider
 */
export interface AIProviderResponse {
  text: string;
  toolCalls?: ToolCall[];
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/**
 * Result of processing a message through the assistant service
 * Includes any structured tool calls the AI requested
 */
export interface AssistantProcessResult {
  response: string;
  toolsUsed: string[];
  toolCalls?: ToolCall[];
}

/**
 * Configuration for an AI provider
 */
export interface AIProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxRetries?: number;
  timeout?: number;
}

/**
 * Interface for AI providers (OpenAI, Anthropic, etc.)
 */
export interface AIProvider {
  name: string;
  isConfigured(): boolean;
  complete(context: AssistantContext, userMessage: string): Promise<AIProviderResponse>;
}

/**
 * Request to the assistant API
 */
export interface AssistantRequest {
  message: string;
  conversationId?: string;
}

/**
 * Response from the assistant API
 * Structured JARVIS assistant response
 */
export interface AssistantAPIResponse {
  conversationId: string;
  message: string;
  state: string;
  toolsExecuted?: ToolExecutionResult[];
  pendingConfirmation?: PendingToolCall | null;
  actionChain?: ActionChainStatus;
  error?: string;
}

/**
 * Structured error response for client
 */
export interface ErrorResponse {
  error: string;
  code: "INVALID_REQUEST" | "AI_UNAVAILABLE" | "TOOL_EXECUTION_FAILED" | "INTERNAL_ERROR";
  details?: string;
}
