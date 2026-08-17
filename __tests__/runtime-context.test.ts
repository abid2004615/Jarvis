/**
 * Tests for JARVIS Conversation Context Manager
 * Validates conversation storage, history management, and cleanup
 */

import {
  ConversationContextManager,
  getConversationContextManager,
  resetConversationContextManager,
} from "@/lib/runtime/context";

describe("Conversation Context Manager", () => {
  let manager: ConversationContextManager;

  beforeEach(() => {
    resetConversationContextManager();
    manager = new ConversationContextManager({
      maxConversations: 5,
      maxMessagesPerConversation: 10,
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  describe("Conversation Creation", () => {
    test("should create new conversation on getConversation", () => {
      const conv = manager.getConversation("test-conv-1");
      expect(conv).toBeDefined();
      expect(conv.conversationId).toBe("test-conv-1");
      expect(conv.messages).toHaveLength(0);
      expect(conv.createdAt).toBeLessThanOrEqual(Date.now());
    });

    test("should return existing conversation on second access", () => {
      const conv1 = manager.getConversation("test-conv-1");
      const conv2 = manager.getConversation("test-conv-1");
      expect(conv1.conversationId).toBe(conv2.conversationId);
      expect(conv1.createdAt).toBe(conv2.createdAt);
    });

    test("should update lastAccessAt on access", () => {
      const conv1 = manager.getConversation("test-conv-1");
      const firstAccessTime = conv1.lastAccessAt;

      // Wait a bit to ensure time difference
      const start = Date.now();
      while (Date.now() - start < 10);

      const conv2 = manager.getConversation("test-conv-1");
      expect(conv2.lastAccessAt).toBeGreaterThanOrEqual(firstAccessTime);
    });
  });

  describe("Message Management", () => {
    test("should add user message to conversation", () => {
      manager.addMessage("test-conv-1", "user", "Hello JARVIS");
      const messages = manager.getMessages("test-conv-1");
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("Hello JARVIS");
    });

    test("should add assistant message to conversation", () => {
      manager.addMessage("test-conv-1", "assistant", "I am ready");
      const messages = manager.getMessages("test-conv-1");
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("assistant");
      expect(messages[0].content).toBe("I am ready");
    });

    test("should maintain message order", () => {
      manager.addMessage("test-conv-1", "user", "First");
      manager.addMessage("test-conv-1", "assistant", "Response");
      manager.addMessage("test-conv-1", "user", "Second");

      const messages = manager.getMessages("test-conv-1");
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe("First");
      expect(messages[1].content).toBe("Response");
      expect(messages[2].content).toBe("Second");
    });

    test("should update updatedAt when adding message", () => {
      const conv1 = manager.getConversation("test-conv-1");
      const firstUpdate = conv1.updatedAt;

      const start = Date.now();
      while (Date.now() - start < 10);

      manager.addMessage("test-conv-1", "user", "Message");
      const conv2 = manager.getConversation("test-conv-1");
      expect(conv2.updatedAt).toBeGreaterThan(firstUpdate);
    });

    test("should include toolCalls and toolResults if provided", () => {
      const toolCalls = [{ id: "1", name: "test", arguments: {} }];
      manager.addMessage("test-conv-1", "assistant", "Done", toolCalls);

      const messages = manager.getMessages("test-conv-1");
      expect(messages[0].toolCalls).toBe(toolCalls);
    });
  });

  describe("Memory Management", () => {
    test("should limit messages per conversation", () => {
      for (let i = 0; i < 15; i++) {
        manager.addMessage("test-conv-1", "user", `Message ${i}`);
      }

      const messages = manager.getMessages("test-conv-1");
      expect(messages.length).toBeLessThanOrEqual(10);
      expect(messages.length).toBeGreaterThan(0);
    });

    test("should keep recent messages when limiting", () => {
      for (let i = 0; i < 15; i++) {
        manager.addMessage("test-conv-1", "user", `Message ${i}`);
      }

      const messages = manager.getMessages("test-conv-1");
      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.content).toContain("Message 14");
    });

    test("should evict oldest conversation when max reached", () => {
      for (let i = 0; i < 7; i++) {
        manager.getConversation(`conv-${i}`);
      }

      expect(manager.size()).toBeLessThanOrEqual(5);
    });
  });

  describe("Conversation Deletion", () => {
    test("should delete conversation", () => {
      manager.getConversation("test-conv-1");
      manager.deleteConversation("test-conv-1");

      const result = manager.getContext("test-conv-1");
      expect(result).toBeNull();
    });

    test("should clear all conversations", () => {
      manager.getConversation("test-conv-1");
      manager.getConversation("test-conv-2");
      manager.clear();

      expect(manager.size()).toBe(0);
    });
  });

  describe("Conversation Cleanup", () => {
    test("cleanupExpired removes conversations past their timeout", () => {
      const shortManager = new ConversationContextManager({ conversationTimeoutMs: 50 });
      try {
        shortManager.getConversation("stale-1");
        shortManager.getConversation("stale-2");
        expect(shortManager.size()).toBe(2);

        const start = Date.now();
        while (Date.now() - start < 60);

        const removed = shortManager.cleanupExpired();
        expect(removed).toBe(2);
        expect(shortManager.size()).toBe(0);
      } finally {
        shortManager.dispose();
      }
    });

    test("cleanupExpired keeps conversations still within their timeout", () => {
      manager.getConversation("fresh-1");
      const removed = manager.cleanupExpired();
      expect(removed).toBe(0);
      expect(manager.size()).toBe(1);
    });
  });

  describe("Assistant Message Updates", () => {
    test("updateLastAssistantMessage replaces the last assistant message content", () => {
      manager.getConversation("test-conv-1");
      manager.addMessage("test-conv-1", "user", "What is my CPU usage?");
      manager.addMessage("test-conv-1", "assistant", "", [
        { id: "tool-1", name: "get_cpu_usage", arguments: {} },
      ]);

      manager.updateLastAssistantMessage("test-conv-1", "Your CPU usage is currently 18%.");

      const messages = manager.getMessages("test-conv-1");
      expect(messages[messages.length - 1].role).toBe("assistant");
      expect(messages[messages.length - 1].content).toBe("Your CPU usage is currently 18%.");
      expect(messages[messages.length - 1].toolCalls).toHaveLength(1);
    });

    test("updateLastAssistantMessage is a no-op when the last message is a user message", () => {
      manager.getConversation("test-conv-1");
      manager.addMessage("test-conv-1", "user", "hello");

      manager.updateLastAssistantMessage("test-conv-1", "ignored");

      const messages = manager.getMessages("test-conv-1");
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("hello");
    });
  });

  describe("Singleton Pattern", () => {
    test("should return same instance from singleton", () => {
      resetConversationContextManager();
      const mgr1 = getConversationContextManager();
      const mgr2 = getConversationContextManager();
      expect(mgr1).toBe(mgr2);
    });

    test("should create new instance after reset", () => {
      const mgr1 = getConversationContextManager();
      mgr1.getConversation("test-conv-1");

      resetConversationContextManager();
      const mgr2 = getConversationContextManager();

      expect(mgr1).not.toBe(mgr2);
      expect(mgr2.size()).toBe(0);
    });
  });

  describe("List Operations", () => {
    test("should list conversation IDs", () => {
      manager.getConversation("test-conv-1");
      manager.getConversation("test-conv-2");
      manager.getConversation("test-conv-3");

      const ids = manager.listConversationIds();
      expect(ids).toContain("test-conv-1");
      expect(ids).toContain("test-conv-2");
      expect(ids).toContain("test-conv-3");
    });

    test("should return correct size", () => {
      manager.getConversation("test-conv-1");
      manager.getConversation("test-conv-2");

      expect(manager.size()).toBe(2);
    });
  });
});
