/**
 * AI Router - Initializes and manages the AI provider and tool system
 * Used on the server side only
 */

import { AssistantService } from "./assistant";
import { createAIProvider } from "./provider";
import { JARVIS_SYSTEM_PROMPT } from "./system-prompt";
import type { AIProvider, AIProviderConfig } from "./types";
import type { ToolRegistry } from "@/lib/tools/types";
import { ToolPermissionManager } from "@/lib/tools/types";
import { getToolRegistry as getSharedRegistry } from "@/lib/tools/registry";

let assistantService: AssistantService | null = null;
let permissionManager: ToolPermissionManager | null = null;
let initializedEnvKey: string | null = null;

/**
 * Initialize the AI router with a provider
 * Re-initializes only when the provider/model/baseUrl configuration changes,
 * so an earlier (stale or empty) configuration is never silently reused.
 */
export function initializeAIRouter(providerName: string, config?: AIProviderConfig): boolean {
  try {
    const envKey = JSON.stringify({
      provider: providerName,
      model: config?.model ?? null,
      baseUrl: config?.baseUrl ?? null,
    });

    if (assistantService && initializedEnvKey === envKey) {
      return true;
    }

    const provider = createAIProvider(providerName, config);

    if (!provider.isConfigured()) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`AI provider ${providerName} is not configured`);
      }
      return false;
    }

    const toolRegistry = getToolRegistry();
    permissionManager = new ToolPermissionManager(toolRegistry);

    assistantService = new AssistantService({
      provider,
      toolRegistry,
      systemPrompt: JARVIS_SYSTEM_PROMPT,
      maxTokens: 4096,
    });
    initializedEnvKey = envKey;

    return true;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error(`Failed to initialize AI router: ${error instanceof Error ? error.message : String(error)}`);
    }
    return false;
  }
}

/**
 * Get the assistant service instance
 */
export function getAssistantService(): AssistantService | null {
  return assistantService;
}

/**
 * Get the tool registry instance
 */
export function getToolRegistry(): ToolRegistry {
  return getSharedRegistry();
}

/**
 * Get the permission manager instance
 */
export function getPermissionManager(): ToolPermissionManager | null {
  return permissionManager;
}

/**
 * Check if AI is ready
 */
export function isAIReady(): boolean {
  return assistantService !== null && assistantService !== undefined;
}
