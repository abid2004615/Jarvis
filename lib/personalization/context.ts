/**
 * JARVIS Personalization — Context Assembly
 *
 * Builds bounded, relevant personalization context for AI requests.
 * Only injects relevant preferences and patterns, never the entire profile.
 * Context is separate from memory context (lib/memory/context.ts).
 */

import type { UserPreference, BehavioralPattern, PersonalizationContext } from "./types";

/**
 * Build a compact personalization context string for AI injection.
 * Returns null when there is nothing relevant.
 */
export function buildPersonalizationContext(context: PersonalizationContext): string | null {
  if (!context.enabled) return null;

  const lines: string[] = [];

  // Explicit preferences
  if (context.explicitPreferences.length > 0) {
    lines.push("User preferences (explicitly set):");
    for (const pref of context.explicitPreferences) {
      const src = pref.source === "explicit_user" ? "explicitly requested"
        : pref.source === "user_correction" ? "user correction"
        : pref.source === "approved_pattern" ? "user approved"
        : "default";
      lines.push(`  - ${pref.key}: ${pref.value} (${src})`);
    }
  }

  // Relevant patterns
  if (context.relevantPatterns.length > 0) {
    lines.push("Observed patterns:");
    for (const pattern of context.relevantPatterns) {
      lines.push(`  - ${pattern.type.replace(/_/g, " ")}: ${pattern.metric} (${pattern.count}x, confidence: ${(pattern.confidence * 100).toFixed(0)}%)`);
    }
  }

  if (lines.length === 0) return null;

  lines.push("Use these to personalize responses, but do NOT invent preferences or patterns not listed above.");

  return lines.join("\n");
}

/**
 * Check if a preference is relevant to a given user query.
 */
export function isPreferenceRelevant(pref: UserPreference, query: string): boolean {
  const lower = query.toLowerCase();

  // Check if the query mentions the preference key or category
  if (lower.includes(pref.key.toLowerCase())) return true;
  if (lower.includes(pref.category.replace(/_/g, " "))) return true;

  // Category-specific relevance
  switch (pref.category) {
    case "response_style":
      return /\b(answer|respond|reply|format|concise|detailed|brief|tone)\b/i.test(lower);
    case "voice_preferences":
      return /\b(voice|speak|say|audio|wake)\b/i.test(lower);
    case "application_preferences":
      return /\b(open|launch|browser|editor|app|safari|chrome|code)\b/i.test(lower);
    case "interaction_preferences":
      return /\b(confirm|interact|mode|auto)\b/i.test(lower);
    case "notification_preferences":
      return /\b(notif|alert|remind|sound)\b/i.test(lower);
    case "display_preferences":
      return /\b(theme|dark|light|font|size|display)\b/i.test(lower);
    case "workflow_preferences":
      return /\b(workflow|briefing|routine|shortcut)\b/i.test(lower);
    case "schedule_preferences":
      return /\b(schedule|time|hour|quiet|timezone)\b/i.test(lower);
    default:
      return false;
  }
}

/**
 * Filter preferences to only those relevant to a query.
 */
export function filterRelevantPreferences(
  preferences: UserPreference[],
  query: string,
  maxResults: number = 6,
): UserPreference[] {
  return preferences
    .filter((p) => p.enabled && isPreferenceRelevant(p, query))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxResults);
}

/**
 * Insert personalization context into AI messages.
 * Returns a NEW array; the input is never mutated.
 */
export function insertPersonalizationContext<T extends { role: string; content: string }>(
  messages: readonly T[],
  personalizationContent: string,
): T[] {
  const message = { role: "system", content: personalizationContent } as unknown as T;
  if (messages.length === 0) return [message];
  return [...messages.slice(0, -1), message, messages[messages.length - 1]];
}
