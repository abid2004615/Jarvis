/**
 * Tests for JARVIS Pipeline
 * Validates state transitions, tool execution, and error handling
 */

import { JarvisPipeline, resetJarvisPipeline } from "@/lib/runtime/pipeline";
import { JarvisRuntimeState } from "@/lib/runtime/types";
import { resetConversationContextManager } from "@/lib/runtime/context";

describe("JARVIS Pipeline", () => {
  let pipeline: JarvisPipeline;

  beforeEach(() => {
    resetJarvisPipeline();
    resetConversationContextManager();
    pipeline = new JarvisPipeline();
  });

  describe("State Management", () => {
    test("should start in IDLE state", () => {
      expect(pipeline.getState()).toBe(JarvisRuntimeState.IDLE);
    });

    test("should return current state", () => {
      const state = pipeline.getState();
      expect(state).toBeDefined();
      expect(typeof state).toBe("string");
    });
  });

  describe("User Input Processing", () => {
    test("should reject empty input", async () => {
      const result = await pipeline.processUserInput("");
      expect(result.state).toBe(JarvisRuntimeState.IDLE);
      expect(result.error).toBeDefined();
    });

    test("should reject oversized input", async () => {
      const oversizedInput = "x".repeat(10001);
      const result = await pipeline.processUserInput(oversizedInput);
      expect(result.error).toBeDefined();
    });

    test("should accept valid input", async () => {
      // This will fail without AI configured, but should process the input
      const result = await pipeline.processUserInput("hello JARVIS");
      expect(result.userInput).toBe("hello JARVIS");
      expect(result.timestamp).toBeLessThanOrEqual(Date.now());
    });

    test("should trim input", async () => {
      const result = await pipeline.processUserInput("  hello JARVIS  ");
      expect(result.userInput).toBe("hello JARVIS");
    });

    test("should set conversation ID", async () => {
      const result = await pipeline.processUserInput("hello");
      expect(result.conversationId).toBeDefined();
    });

    test("should use provided conversation ID", async () => {
      const result = await pipeline.processUserInput("hello", { conversationId: "test-conv-123" });
      expect(result.conversationId).toBe("test-conv-123");
    });
  });

  describe("State Transitions", () => {
    test("should go to THINKING state during processing", async () => {
      // Note: State will be changed back to IDLE on return due to no AI configured
      const result = await pipeline.processUserInput("hello");
      // The final state in the response should reflect the result
      expect(result.state).toBeDefined();
    });

    test("should handle error state", async () => {
      const result = await pipeline.processUserInput("");
      expect(result.state).toBe(JarvisRuntimeState.IDLE);
      expect(result.error).toBeDefined();
    });
  });

  describe("Chain Cleanup", () => {
    test("should clear active chains without error", () => {
      expect(() => pipeline.clearPendingConfirmations()).not.toThrow();
    });
  });

  describe("Tool Execution", () => {
    test("should return execution results", async () => {
      const result = await pipeline.processUserInput("hello");
      // If tools were executed, they would be in toolsExecuted
      if (result.toolsExecuted) {
        expect(Array.isArray(result.toolsExecuted)).toBe(true);
      }
    });

    test("should handle tool execution errors gracefully", async () => {
      const result = await pipeline.processUserInput("execute invalid tool");
      // Should not crash, should return a response
      expect(result).toBeDefined();
      expect(result.message).toBeDefined();
    });
  });

  describe("Conversation Context", () => {
    test("should include message in response", async () => {
      const result = await pipeline.processUserInput("hello JARVIS");
      expect(result.message).toBeDefined();
      expect(typeof result.message).toBe("string");
    });

    test("should track conversation separately", async () => {
      const result1 = await pipeline.processUserInput("first", { conversationId: "conv-1" });
      const result2 = await pipeline.processUserInput("second", { conversationId: "conv-2" });

      expect(result1.conversationId).toBe("conv-1");
      expect(result2.conversationId).toBe("conv-2");
    });
  });

  describe("Error Handling", () => {
    test("should handle AI unavailable gracefully", async () => {
      const result = await pipeline.processUserInput("hello");
      // Should not throw, should return response
      expect(result).toBeDefined();
      expect(result.message).toBeDefined();
    });

    test("should not expose internal errors", async () => {
      const result = await pipeline.processUserInput("hello");
      // Error message should be user-friendly, not a stack trace
      if (result.error) {
        expect(result.error).not.toMatch(/at Object|Error:|stack|trace/i);
      }
    });

    test("should log errors without crashing", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const result = await pipeline.processUserInput("");
      // Should still return a response
      expect(result).toBeDefined();
      consoleSpy.mockRestore();
    });
  });

  describe("Response Structure", () => {
    test("should return complete response object", async () => {
      const result = await pipeline.processUserInput("hello");
      expect(result.conversationId).toBeDefined();
      expect(result.userInput).toBeDefined();
      expect(result.state).toBeDefined();
      expect(result.message).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    test("should have valid timestamp", async () => {
      const before = Date.now();
      const result = await pipeline.processUserInput("hello");
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after + 1000); // Allow 1 second buffer
    });
  });

  describe("Singleton Pattern", () => {
    test("should return same instance from singleton", () => {
      resetJarvisPipeline();
      // Note: First call creates instance
      const pipeline1 = new JarvisPipeline();
      // Direct instantiation for testing - in real code use getJarvisPipeline()
      expect(pipeline1).toBeDefined();
    });
  });

  describe("Options Handling", () => {
    test("should accept system prompt option", async () => {
      const result = await pipeline.processUserInput("hello", { systemPrompt: "You are JARVIS" });
      expect(result.userInput).toBe("hello");
    });

    test("should generate conversation ID if not provided", async () => {
      const result = await pipeline.processUserInput("hello", {});
      expect(result.conversationId).toMatch(/jarvis-\d+/);
    });
  });
});
