/**
 * JARVIS Persistent Memory — Manager
 *
 * The MemoryManager is the single application-wide gate for reading and
 * writing persistent memory. Tools and the runtime pipeline share one
 * instance via `getMemoryManager()`. Tests inject a manager backed by an
 * in-memory store via `setMemoryManager()`.
 *
 * Rules:
 *  - Upserts by case-insensitive key.
 *  - Bounded to MEMORY_LIMITS.MAX_ENTRIES; oldest `updatedAt` is evicted.
 *  - Values pass through the sanitizer (no credentials/executables/paths).
 *  - Writes are persisted immediately after every mutation.
 */

import { randomUUID } from "crypto";

import { MemoryFileStore, type MemoryStore } from "./store";
import {
  MEMORY_LIMITS,
  type MemoryCategory,
  type MemoryEntry,
  type MemoryOperationResult,
  type RememberMemoryInput,
} from "./types";
import { validateMemoryInput } from "./sanitizer";

const STOPWORDS = new Set([
  "what", "who", "when", "where", "why", "how", "do", "does", "did", "would",
  "should", "can", "could", "the", "a", "an", "of", "to", "in", "for", "on",
  "with", "about", "my", "your", "our", "i", "you", "me", "we", "it", "is",
  "are", "was", "were", "am", "be", "been", "have", "has", "had", "remember",
  "recall", "like", "prefer", "prefers", "preferred", "use", "uses", "used",
  "using", "tell", "know", "knows", "known", "want", "wants", "remembered",
  "saved", "save", "stored", "store", "from", "and", "or", "that", "this",
  "there", "just", "please", "do you", "up", "down", "left", "right", "not",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function scoreEntry(entry: MemoryEntry, tokens: string[]): number {
  const haystack = `${entry.category} ${entry.key} ${entry.value}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 1;
      if (entry.key.toLowerCase().includes(token)) score += 1;
      if (entry.category.toLowerCase().includes(token)) score += 0.5;
    }
  }
  return score;
}

export class MemoryManager {
  private readonly store: MemoryStore;
  private readonly entries = new Map<string, MemoryEntry>();

  constructor(store?: MemoryStore) {
    this.store = store ?? new MemoryFileStore();
    this.load();
  }

  /** Reload entries from the backing store. */
  load(): void {
    this.entries.clear();
    for (const entry of this.store.load()) {
      this.entries.set(entry.id, entry);
    }
  }

  private persist(): void {
    this.store.save(Array.from(this.entries.values()));
  }

  private canonicalKey(input: string): string {
    return input.trim().toLowerCase();
  }

  /** Create or update a memory. Returns normalized data on success. */
  remember(input: RememberMemoryInput): MemoryOperationResult<MemoryEntry> {
    const validation = validateMemoryInput(input);
    if (!validation.valid || !validation.data) {
      return {
        success: false,
        error: validation.error,
        code: validation.code ?? "invalid_input",
      };
    }

    const { category, key, value, source, confidence } = validation.data;
    const categoryKey = category ?? "preference";
    const now = Date.now();

    const existing = this.findByKey(key);
    let entry: MemoryEntry;
    if (existing) {
      entry = {
        ...existing,
        category: categoryKey,
        key,
        value,
        updatedAt: now,
        confidence: Math.max(existing.confidence, confidence),
      };
      this.entries.set(entry.id, entry);
    } else {
      entry = {
        id: randomUUID(),
        category: categoryKey,
        key,
        value,
        createdAt: now,
        updatedAt: now,
        source,
        confidence,
      };
      this.entries.set(entry.id, entry);
    }

    this.enforceCapacity();
    this.persist();
    return { success: true, data: { ...entry } };
  }

  findByKey(key: string): MemoryEntry | undefined {
    const normalized = this.canonicalKey(key);
    for (const entry of this.entries.values()) {
      if (this.canonicalKey(entry.key) === normalized) {
        return entry;
      }
    }
    return undefined;
  }

  /** Search memory by relevance to a free-text query. */
  recall(query: string, limit: number = MEMORY_LIMITS.MAX_CONTEXT_MEMORIES): MemoryEntry[] {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    const scored = Array.from(this.entries.values())
      .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.entry.updatedAt - a.entry.updatedAt ||
          a.entry.id.localeCompare(b.entry.id),
      );

    const max = Math.max(1, Math.min(limit, MEMORY_LIMITS.MAX_ENTRIES));
    return scored.slice(0, max).map((item) => ({ ...item.entry }));
  }

  /** Alias for recall, kept for tool parity. */
  search(query: string, limit?: number): MemoryEntry[] {
    return this.recall(query, limit);
  }

  /** Remove a memory by exact id. */
  forget(id: string): MemoryOperationResult<void> {
    if (!this.entries.delete(id)) {
      return { success: false, error: "Memory not found", code: "not_found" };
    }
    this.persist();
    return { success: true };
  }

  /** Remove a memory by case-insensitive key. */
  forgetByKey(key: string): MemoryOperationResult<void> {
    const entry = this.findByKey(key);
    if (!entry) {
      return { success: false, error: "Memory not found", code: "not_found" };
    }
    this.entries.delete(entry.id);
    this.persist();
    return { success: true };
  }

  /** Remove every memory. Returns the number of deleted entries. */
  clear(): MemoryOperationResult<number> {
    const deleted = this.entries.size;
    this.entries.clear();
    this.persist();
    return { success: true, data: deleted };
  }

  list(): MemoryEntry[] {
    return Array.from(this.entries.values())
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
      .map((entry) => ({ ...entry }));
  }

  count(): number {
    return this.entries.size;
  }

  /** Evict oldest-updated entries when at capacity (deterministic tie-break). */
  private enforceCapacity(): void {
    if (this.entries.size <= MEMORY_LIMITS.MAX_ENTRIES) return;
    const sorted = Array.from(this.entries.values()).sort(
      (a, b) =>
        a.updatedAt - b.updatedAt ||
        a.id.localeCompare(b.id),
    );
    const excess = this.entries.size - MEMORY_LIMITS.MAX_ENTRIES;
    for (const entry of sorted.slice(0, excess)) {
      this.entries.delete(entry.id);
    }
  }
}

let currentManager: MemoryManager | null = null;

/**
 * Get the shared application-wide MemoryManager, creating it lazily.
 */
export function getMemoryManager(): MemoryManager {
  if (!currentManager) {
    currentManager = new MemoryManager();
  }
  return currentManager;
}

/**
 * Replace the shared manager (used by tests to inject an in-memory store).
 */
export function setMemoryManager(manager: MemoryManager | null): void {
  currentManager = manager;
}

export type { MemoryCategory };
