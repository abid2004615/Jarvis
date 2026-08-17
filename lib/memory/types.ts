/**
 * JARVIS Persistent Memory — Type Definitions
 *
 * Persistent user memory is DISTINCT from temporary conversation context:
 *  - Conversation context: temporary, bounded, TTL-based (runtime/context.ts)
 *  - Persistent memory: explicit, long-lived, bounded, user-controlled
 *
 * Only explicit memory intent (e.g. "remember that ...") creates memory.
 * Sensitive data (passwords, API keys, tokens, credentials) is never stored.
 */

export type MemoryCategory =
  | "preference"
  | "personal_fact"
  | "workflow"
  | "communication_style"
  | "project_context";

export const MEMORY_CATEGORIES: readonly MemoryCategory[] = [
  "preference",
  "personal_fact",
  "workflow",
  "communication_style",
  "project_context",
];

export const MEMORY_LIMITS = {
  /** Maximum number of persistent memories. */
  MAX_ENTRIES: 100,
  /** Maximum length of a memory key. */
  MAX_KEY_LENGTH: 100,
  /** Maximum length of a memory value. */
  MAX_VALUE_LENGTH: 1000,
  /** Rough upper bound on the serialized store (characters). */
  MAX_TOTAL_STORAGE: 200_000,
  /** Recommended cap for relevant memories injected into an AI request. */
  MAX_CONTEXT_MEMORIES: 6,
} as const;

/** Fixed, application-controlled storage location (never user-supplied). */
export const MEMORY_STORAGE_DIR = ".jarvis";
export const MEMORY_STORAGE_FILE = "memory.json";

/**
 * A single persistent memory entry.
 */
export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  key: string;
  value: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  /** Origin of the memory, e.g. "user". */
  source: string;
  /** Confidence in the memory (1.0 for explicit statements). */
  confidence: number;
}

/**
 * Input to create or update a memory entry.
 */
export interface RememberMemoryInput {
  category?: MemoryCategory;
  key: string;
  value: string;
  source?: string;
  confidence?: number;
}

/**
 * Serialized on-disk shape of the memory store.
 */
export interface MemoryStoreData {
  version: number;
  updatedAt: number;
  entries: MemoryEntry[];
}

/**
 * Structured result of a memory operation.
 */
export interface MemoryOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
