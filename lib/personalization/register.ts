/**
 * JARVIS Personalization — Tool Registration
 *
 * Registers personalization tools into the shared ToolRegistry.
 * Idempotent: safe to call multiple times.
 */

import { getToolRegistry } from "@/lib/tools/registry";
import type { ToolDefinition } from "@/lib/tools/types";

import {
  getUserPreferences,
  setUserPreference,
  updateUserPreference,
  disableUserPreference,
  deleteUserPreference,
  getUsagePatterns,
  getRecommendations,
  dismissRecommendationById,
  acceptRecommendationById,
} from "./tools";

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_user_preferences",
    description: "Get the user's stored personalization preferences, optionally filtered by category. Returns preference key/value pairs with source and confidence.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Filter by category: response_style, voice_preferences, interaction_preferences, application_preferences, workflow_preferences, schedule_preferences, notification_preferences, display_preferences",
        },
      },
      additionalProperties: false,
    },
    riskLevel: "safe",
    requiresUserConfirmation: false,
    execute: async (args: Record<string, unknown>) =>
      getUserPreferences({ category: args.category as any }),
  },
  {
    name: "set_user_preference",
    description: "Save or update a user preference. REQUIRES explicit user intent — never call this based solely on an inference. The user must have explicitly asked to set this preference.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Preference category: response_style, voice_preferences, interaction_preferences, application_preferences, workflow_preferences, schedule_preferences, notification_preferences, display_preferences",
        },
        key: {
          type: "string",
          description: "Preference key (e.g. 'preferred_browser', 'detail_level', 'voice_response_enabled')",
        },
        value: {
          type: "string",
          description: "Preference value",
        },
      },
      required: ["category", "key", "value"],
      additionalProperties: false,
    },
    riskLevel: "confirmation",
    requiresUserConfirmation: true,
    execute: async (args: Record<string, unknown>) =>
      setUserPreference({
        category: args.category as any,
        key: args.key as string,
        value: args.value as string,
      }),
  },
  {
    name: "update_user_preference",
    description: "Update an existing user preference. Requires explicit user intent to change.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Preference category" },
        key: { type: "string", description: "Preference key" },
        value: { type: "string", description: "New value" },
      },
      required: ["category", "key", "value"],
      additionalProperties: false,
    },
    riskLevel: "confirmation",
    requiresUserConfirmation: true,
    execute: async (args: Record<string, unknown>) =>
      updateUserPreference({
        category: args.category as any,
        key: args.key as string,
        value: args.value as string,
      }),
  },
  {
    name: "disable_user_preference",
    description: "Disable a user preference without deleting it.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Preference category" },
        key: { type: "string", description: "Preference key" },
      },
      required: ["category", "key"],
      additionalProperties: false,
    },
    riskLevel: "confirmation",
    requiresUserConfirmation: true,
    execute: async (args: Record<string, unknown>) =>
      disableUserPreference({
        category: args.category as any,
        key: args.key as string,
      }),
  },
  {
    name: "delete_user_preference",
    description: "Permanently delete a user preference.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Preference category" },
        key: { type: "string", description: "Preference key" },
      },
      required: ["category", "key"],
      additionalProperties: false,
    },
    riskLevel: "confirmation",
    requiresUserConfirmation: true,
    execute: async (args: Record<string, unknown>) =>
      deleteUserPreference({
        category: args.category as any,
        key: args.key as string,
      }),
  },
  {
    name: "get_usage_patterns",
    description: "Get observed behavioral patterns (application usage, tool usage, time preferences). Patterns are aggregated and privacy-safe.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Filter by pattern type: application_usage, time_preference, tool_usage, routine_usage, response_preference, workflow_completion",
        },
        metric: { type: "string", description: "Filter by metric (e.g. 'Safari')" },
        minConfidence: { type: "number", description: "Minimum confidence threshold (0.0-1.0)" },
      },
      additionalProperties: false,
    },
    riskLevel: "safe",
    requiresUserConfirmation: false,
    execute: async (args: Record<string, unknown>) =>
      getUsagePatterns({
        type: args.type as any,
        metric: args.metric as string,
        minConfidence: args.minConfidence as number,
      }),
  },
  {
    name: "get_recommendations",
    description: "Get current active recommendations. These are optional suggestions based on observed patterns. The user can accept, dismiss, or snooze them.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    riskLevel: "safe",
    requiresUserConfirmation: false,
    execute: async () => getRecommendations(),
  },
  {
    name: "dismiss_recommendation",
    description: "Dismiss a recommendation. The user chose not to act on it.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Recommendation ID" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    riskLevel: "safe",
    requiresUserConfirmation: false,
    execute: async (args: Record<string, unknown>) =>
      dismissRecommendationById({ id: args.id as string }),
  },
  {
    name: "accept_recommendation",
    description: "Accept a recommendation. This may create the suggested preference with approved_pattern source.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Recommendation ID" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    riskLevel: "confirmation",
    requiresUserConfirmation: true,
    execute: async (args: Record<string, unknown>) =>
      acceptRecommendationById({ id: args.id as string }),
  },
];

let registered = false;

export function registerPersonalizationTools(): void {
  if (registered) return;
  const registry = getToolRegistry();
  for (const def of TOOL_DEFINITIONS) {
    registry.register(def);
  }
  registered = true;
}

export function resetPersonalizationTools(): void {
  registered = false;
}
