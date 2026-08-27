/**
 * JARVIS Personalization — Wiring
 *
 * Connects personalization to the runtime pipeline:
 *  - Injects personalization context into AI messages
 *  - Collects learning signals from pipeline events
 *  - Provides read-only access for agents and goals
 *
 * Does NOT create a second scheduler or permission system.
 */

import { getPersonalizationManager } from "./manager";
import { buildPersonalizationContext, filterRelevantPreferences } from "./context";
import { registerPersonalizationTools } from "./register";
import type { PersonalizationContext, UserPreference } from "./types";

let wired = false;

/** Wire personalization into the pipeline. Idempotent. */
export function wirePersonalizationToPipeline(): void {
  if (wired) return;
  registerPersonalizationTools();
  wired = true;
}

export function resetPersonalizationWiring(): void {
  wired = false;
}

/**
 * Get personalization context for a specific user query.
 * Returns bounded, relevant context only.
 */
export function getPersonalizationContextForQuery(query: string): string | null {
  const manager = getPersonalizationManager();
  if (!manager.isEnabled()) return null;

  const context = manager.buildContext({
    maxPreferences: 4,
    maxPatterns: 3,
    maxRecommendations: 1,
  });

  return buildPersonalizationContext(context);
}

/**
 * Get relevant preferences for resolving ambiguous requests.
 * Example: "Open my editor" → preferred_editor = VS Code
 */
export function resolveAmbiguousRequest(query: string): UserPreference[] {
  const manager = getPersonalizationManager();
  if (!manager.isEnabled()) return [];

  const allPrefs = manager.listPreferences();
  return filterRelevantPreferences(allPrefs, query, 3);
}

/**
 * Collect a learning signal from a pipeline event.
 * Only called from trusted server-side code. Silently no-ops if the
 * personalization manager is not initialized (e.g. in tests).
 */
export function collectPipelineSignal(
  type: "task_completed" | "goal_completed" | "goal_failed" | "application_launched" | "application_used" | "voice_used" | "text_used" | "confirmation_approved" | "confirmation_denied",
  metric: string,
): void {
  try {
    const manager = getPersonalizationManager();
    manager.collectSignal(type, metric);
  } catch {
    // Manager not initialized (e.g. in tests) — silently ignore
  }
}

/**
 * Record an application observation (called from pipeline on app launch).
 */
export function recordApplicationUsage(appName: string): void {
  const manager = getPersonalizationManager();
  manager.recordObservation("application_usage", appName);
}

/**
 * Record a tool usage observation.
 */
export function recordToolUsage(toolName: string): void {
  const manager = getPersonalizationManager();
  manager.recordObservation("tool_usage", toolName);
}

/**
 * Read-only access for agents (P11 integration).
 * Agents may READ relevant personalization but may NOT modify it.
 */
export function getPersonalizationForAgent(agentType: string): PersonalizationContext {
  const manager = getPersonalizationManager();
  return manager.buildContext({
    maxPreferences: 4,
    maxPatterns: 3,
    maxRecommendations: 0, // Agents don't show recommendations
  });
}

/**
 * Read-only access for goals (P12 integration).
 * Goals may READ relevant personalization but may NOT modify it.
 */
export function getPersonalizationForGoal(goalDescription: string): UserPreference[] {
  const manager = getPersonalizationManager();
  if (!manager.isEnabled()) return [];

  const allPrefs = manager.listPreferences();
  return filterRelevantPreferences(allPrefs, goalDescription, 4);
}
