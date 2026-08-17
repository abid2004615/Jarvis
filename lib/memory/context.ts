/**
 * JARVIS Persistent Memory — Context Assembly
 *
 * Builds the system-style text that carries relevant memories into the Groq
 * request, and knows where to insert it: immediately BEFORE the last (current)
 * user message, never after it. This keeps the provider's duplicate-user
 * message guard intact and never appends a user message.
 */

import { MEMORY_LIMITS, type MemoryEntry } from "./types";

/**
 * Insert a memory system message before the final (current) user message.
 * Returns a NEW array; the input is never mutated. The inserted system message
 * is carried as a structural message whose runtime role is "system"; callers
 * pass it through to the chat provider unchanged.
 */
export function insertMemorySystemMessage<T extends { role: string; content: string }>(
  messages: readonly T[],
  memoryContent: string,
): T[] {
  const memoryMessage = { role: "system", content: memoryContent } as unknown as T;
  if (messages.length === 0) {
    return [memoryMessage];
  }
  return [...messages.slice(0, -1), memoryMessage, messages[messages.length - 1]];
}

/**
 * Render relevant memories as a compact system-style context block.
 * Returns null when there is nothing relevant (nothing injected).
 */
export function buildMemoryContext(
  entries: readonly MemoryEntry[],
  maxEntries: number = MEMORY_LIMITS.MAX_CONTEXT_MEMORIES,
): string | null {
  if (!entries.length) return null;
  const lines = entries
    .slice(0, maxEntries)
    .map((entry) => `- ${entry.key}: ${entry.value}`)
    .join("\n");
  return [
    "Known user memories (saved only from explicit requests):",
    lines,
    "Use them to personalize answers, but never invent memories that are not listed.",
  ].join("\n");
}
