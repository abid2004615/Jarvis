/**
 * Assistant Service - Main orchestrator
 * Coordinates AI provider, tool registry, and execution
 */

import type { AIProvider, AssistantProcessResult } from "./types";
import type { ToolDefinition, ToolRegistry } from "@/lib/tools/types";
import type { AssistantContext } from "./types";
import { executeToolSafely } from "@/lib/tools/registry";
import { JARVIS_SYSTEM_PROMPT } from "./system-prompt";

export interface AssistantOptions {
  provider: AIProvider;
  toolRegistry: ToolRegistry;
  systemPrompt?: string;
  maxTokens?: number;
}

export class AssistantService {
  private provider: AIProvider;
  private toolRegistry: ToolRegistry;
  private systemPrompt: string;
  private maxTokens: number;

  constructor(options: AssistantOptions) {
    this.provider = options.provider;
    this.toolRegistry = options.toolRegistry;
    this.systemPrompt = options.systemPrompt || JARVIS_SYSTEM_PROMPT;
    this.maxTokens = options.maxTokens || 1024;
  }

  /**
   * Process a user message and generate a response
   */
  async processMessage(userMessage: string, context: AssistantContext): Promise<AssistantProcessResult> {
    if (!userMessage.trim()) {
      throw new Error("User message cannot be empty");
    }

    if (userMessage.length > 10000) {
      throw new Error("User message exceeds maximum length of 10000 characters");
    }

    if (!this.provider.isConfigured()) {
      throw new Error("AI provider is not configured");
    }

    try {
      const aiResponse = await this.provider.complete(
        {
          ...context,
          systemPrompt: this.systemPrompt,
          maxTokens: this.maxTokens,
          tools: this.toolRegistry.getToolsForAI(),
        },
        userMessage,
      );

      return {
        response: aiResponse.text,
        toolsUsed: aiResponse.toolCalls?.map((call) => call.name) || [],
        toolCalls: aiResponse.toolCalls,
      };
    } catch (error) {
      throw new Error(`Assistant failed to process message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get available tools for the AI
   */
  getAvailableTools(): Array<{
    name: string;
    description: string;
  }> {
    return this.toolRegistry.getToolsForAI().map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  /**
   * Execute a specific tool (validated + confirmation-gated)
   */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    this.toolRegistry.getToolOrThrow(toolName);
    const result = await executeToolSafely(toolName, args, { registry: this.toolRegistry });
    if (!result.success) {
      throw new Error(result.error || `Tool '${toolName}' failed`);
    }
    return result.result;
  }
}
