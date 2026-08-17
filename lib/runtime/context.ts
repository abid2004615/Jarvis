/**
 * JARVIS Conversation Context Manager
 * Handles in-memory conversation history and state
 * Prevents unbounded memory growth
 */

import type { ConversationMessage } from "@/lib/ai/types";

interface StoredConversation {
  conversationId: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
  lastAccessAt: number;
}

interface ConversationContextOptions {
  maxConversations?: number;
  maxMessagesPerConversation?: number;
  conversationTimeoutMs?: number;
}

/**
 * In-memory conversation context store
 * Manages multiple conversations with automatic cleanup
 */
export class ConversationContextManager {
  private conversations: Map<string, StoredConversation> = new Map();
  private maxConversations: number = 50;
  private maxMessagesPerConversation: number = 100;
  private conversationTimeoutMs: number = 3600000; // 1 hour
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor(options: ConversationContextOptions = {}) {
    this.maxConversations = options.maxConversations || 50;
    this.maxMessagesPerConversation = options.maxMessagesPerConversation || 100;
    this.conversationTimeoutMs = options.conversationTimeoutMs || 3600000;

    // Start cleanup interval
    if (typeof setInterval !== "undefined") {
      this.cleanupIntervalId = setInterval(() => {
        this.cleanup();
      }, 300000); // Run cleanup every 5 minutes
      // Allow the process to exit cleanly (Node test/CLI contexts)
      (this.cleanupIntervalId as unknown as { unref?: () => void })?.unref?.();
    }
  }

  /**
   * Get or create a conversation
   */
  getConversation(conversationId: string): StoredConversation {
    if (this.conversations.has(conversationId)) {
      const conversation = this.conversations.get(conversationId)!;
      conversation.lastAccessAt = Date.now();
      return conversation;
    }

    // Create new conversation
    const conversation: StoredConversation = {
      conversationId,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastAccessAt: Date.now(),
    };

    // Check if we need to evict old conversations
    if (this.conversations.size >= this.maxConversations) {
      this.evictOldestConversation();
    }

    this.conversations.set(conversationId, conversation);
    return conversation;
  }

  /**
   * Add a message to a conversation
   */
  addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    toolCalls?: any[],
    toolResults?: any[],
  ): void {
    const conversation = this.getConversation(conversationId);

    // Add new message
    conversation.messages.push({
      role,
      content,
      toolCalls,
      toolResults,
    });

    // Limit messages per conversation
    if (conversation.messages.length > this.maxMessagesPerConversation) {
      // Keep only the last N messages
      conversation.messages = conversation.messages.slice(-this.maxMessagesPerConversation);
    }

    conversation.updatedAt = Date.now();
  }

  /**
   * Get conversation messages
   */
  getMessages(conversationId: string): ConversationMessage[] {
    const conversation = this.conversations.get(conversationId);
    return conversation?.messages || [];
  }

  /**
   * Attach tool results to the most recent assistant message
   */
  addToolResults(conversationId: string, toolResults: ConversationMessage["toolResults"]): void {
    const conversation = this.conversations.get(conversationId);
    const last = conversation?.messages[conversation.messages.length - 1];
    if (last && last.role === "assistant" && toolResults) {
      last.toolResults = [...(last.toolResults ?? []), ...toolResults];
      conversation.updatedAt = Date.now();
    }
  }

  /**
   * Replace the content of the most recent assistant message.
   * Used to persist the final natural-language response generated from
   * tool results, replacing a hollow placeholder message.
   */
  updateLastAssistantMessage(conversationId: string, content: string): void {
    const conversation = this.conversations.get(conversationId);
    const last = conversation?.messages[conversation.messages.length - 1];
    if (last && last.role === "assistant") {
      last.content = content;
      conversation.updatedAt = Date.now();
    }
  }

  /**
   * Get conversation by ID
   */
  getContext(conversationId: string): StoredConversation | null {
    return this.conversations.get(conversationId) || null;
  }

  /**
   * Delete a conversation
   */
  deleteConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  /**
   * Clear all conversations
   */
  clear(): void {
    this.conversations.clear();
  }

  /**
   * Get conversation count
   */
  size(): number {
    return this.conversations.size;
  }

  /**
   * Get all conversation IDs
   */
  listConversationIds(): string[] {
    return Array.from(this.conversations.keys());
  }

  /**
   * Evict oldest accessed conversation
   */
  private evictOldestConversation(): void {
    let oldest: [string, StoredConversation] | null = null;
    for (const entry of this.conversations.entries()) {
      if (!oldest || entry[1].lastAccessAt < oldest[1].lastAccessAt) {
        oldest = entry;
      }
    }
    if (oldest) {
      this.conversations.delete(oldest[0]);
    }
  }

  /**
   * Remove conversations that have exceeded the timeout, returning how many
   * were deleted. Public so tests (and any future callers) can trigger it
   * deterministically.
   */
  cleanupExpired(): number {
    const now = Date.now();
    const idsToDelete: string[] = [];

    for (const [id, conversation] of this.conversations.entries()) {
      if (now - conversation.lastAccessAt > this.conversationTimeoutMs) {
        idsToDelete.push(id);
      }
    }

    for (const id of idsToDelete) {
      this.conversations.delete(id);
    }

    return idsToDelete.length;
  }

  /**
   * Clean up expired conversations
   */
  private cleanup(): void {
    this.cleanupExpired();
  }

  /**
   * Dispose and stop cleanup interval
   */
  dispose(): void {
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }
}

// Singleton instance
let instance: ConversationContextManager | null = null;

export function getConversationContextManager(): ConversationContextManager {
  if (!instance) {
    instance = new ConversationContextManager();
  }
  return instance;
}

export function resetConversationContextManager(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
