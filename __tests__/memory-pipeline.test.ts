/**
 * JARVIS Persistent Memory — Pipeline & Groq Integration Tests
 *
 * Verifies the full path:
 *  - explicit-intent gate on remember_user_preference
 *  - secret rejection end-to-end (nothing stored, nothing logged)
 *  - audit-log redaction of memory-tool arguments
 *  - immediate execution of forget/clear memory tools
 *  - relevant-memory injection into the Groq request (system message placed
 *    before the current user message, no duplicate user messages)
 *  - irrelevant memories are NOT injected
 *  - conversation expiry never deletes persistent memory
 */

import { GroqProvider } from "@/lib/ai/provider";
import { AssistantService } from "@/lib/ai/assistant";
import type { AssistantContext, AssistantProcessResult, ToolCall } from "@/lib/ai/types";
import { JarvisPipeline, type AssistantLike } from "@/lib/runtime/pipeline";
import { JarvisRuntimeState } from "@/lib/runtime/types";
import { ToolRegistry } from "@/lib/tools/types";
import { getBuiltinTools } from "@/lib/tools/registry";
import { resetConversationContextManager, getConversationContextManager, ConversationContextManager } from "@/lib/runtime/context";
import {
  setMemoryManager,
  getMemoryManager,
  MemoryManager,
  InMemoryMemoryStore,
} from "@/lib/memory";
import { clearAuditLog, getAuditLogForTool } from "@/lib/audit/logger";

function makeRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of getBuiltinTools()) {
    registry.register(tool);
  }
  return registry;
}

function rememberCall(key: string, value: string, category?: string): ToolCall {
  return {
    id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "remember_user_preference",
    arguments: { key, value, ...(category ? { category } : {}) },
  };
}

describe("JARVIS memory pipeline", () => {
  let manager: MemoryManager;

  beforeEach(() => {
    resetConversationContextManager();
    clearAuditLog();
    manager = new MemoryManager(new InMemoryMemoryStore());
    setMemoryManager(manager);
  });

  afterEach(() => {
    setMemoryManager(null);
    delete (global as Record<string, unknown>).fetch;
  });

  test("explicit remember intent persists a preference", async () => {
    const fake: AssistantLike = {
      processMessage: jest.fn(async (): Promise<AssistantProcessResult> => ({
        response: "I'll remember that you prefer concise answers.",
        toolsUsed: ["remember_user_preference"],
        toolCalls: [rememberCall("answer style", "concise bullet points", "communication_style")],
      })),
    };
    const pipeline = new JarvisPipeline({ assistant: fake, registry: makeRegistry() });

    const result = await pipeline.processUserInput("Remember that I prefer concise answers");

    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.toolsExecuted?.[0]).toMatchObject({
      toolName: "remember_user_preference",
      success: true,
    });
    expect(manager.count()).toBe(1);
    expect(manager.recall("concise")).toHaveLength(1);
  });

  test("ordinary statements are blocked from creating memory", async () => {
    const fake: AssistantLike = {
      processMessage: jest.fn(async (): Promise<AssistantProcessResult> => ({
        response: "Got it.",
        toolsUsed: ["remember_user_preference"],
        toolCalls: [rememberCall("theme", "dark mode")],
      })),
    };
    const pipeline = new JarvisPipeline({ assistant: fake, registry: makeRegistry() });

    const result = await pipeline.processUserInput("I prefer dark mode");

    expect(result.toolsExecuted?.[0]).toMatchObject({
      success: false,
      error: "explicit_remember_intent_required",
    });
    expect(manager.count()).toBe(0);
  });

  test("remember with a secret is rejected end-to-end and not stored or logged", async () => {
    const fake: AssistantLike = {
      processMessage: jest.fn(async (): Promise<AssistantProcessResult> => ({
        response: "I'll remember that.",
        toolsUsed: ["remember_user_preference"],
        toolCalls: [rememberCall("api credentials", "gsk_test_AbCdEfGh123456")],
      })),
    };
    const pipeline = new JarvisPipeline({ assistant: fake, registry: makeRegistry() });

    const result = await pipeline.processUserInput("Remember my API key is gsk_test_AbCdEfGh123456");

    expect(result.toolsExecuted?.[0]).toMatchObject({
      toolName: "remember_user_preference",
      success: true,
    });
    expect(result.toolsExecuted?.[0]?.result).toMatchObject({
      success: false,
      code: "secret_rejected",
    });
    expect(manager.count()).toBe(0);
    expect(getMemoryManager().list().some((m) => m.value.includes("gsk"))).toBe(false);

    const auditRecords = getAuditLogForTool("remember_user_preference");
    expect(auditRecords.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(auditRecords.map((r) => r.arguments));
    expect(serialized).not.toContain("gsk");
    expect(serialized).not.toContain("AbCdEfGh123456");
    expect(serialized).toContain("[REDACTED]");
  });

  test("audit log never stores the raw value of any memory tool argument", async () => {
    const fake: AssistantLike = {
      processMessage: jest.fn(async (): Promise<AssistantProcessResult> => ({
        response: "Remembered.",
        toolsUsed: ["remember_user_preference"],
        toolCalls: [rememberCall("coffee order", "small oat latte with one sugar")],
      })),
    };
    const pipeline = new JarvisPipeline({ assistant: fake, registry: makeRegistry() });
    await pipeline.processUserInput("Remember my coffee order is a small oat latte with one sugar");

    const auditRecords = getAuditLogForTool("remember_user_preference");
    expect(auditRecords.length).toBeGreaterThan(0);
    expect(JSON.stringify(auditRecords.map((r) => r.arguments))).not.toContain("latte");
  });

  test("recall tool executes and surfaces saved memories", async () => {
    manager.remember({ key: "theme", value: "dark mode" });
    const fake: AssistantLike = {
      processMessage: jest.fn(async (input: string): Promise<AssistantProcessResult> => {
        if (input.includes("tool results")) {
          return { response: "You prefer dark mode.", toolsUsed: ["recall_user_memory"] };
        }
        return {
          response: "",
          toolsUsed: ["recall_user_memory"],
          toolCalls: [
            {
              id: "tc-recall",
              name: "recall_user_memory",
              arguments: { query: "theme" },
            },
          ],
        };
      }),
    };
    const pipeline = new JarvisPipeline({ assistant: fake, registry: makeRegistry() });

    const result = await pipeline.processUserInput("What do you remember about my theme?");
    expect(result.toolsExecuted?.[0]).toMatchObject({
      toolName: "recall_user_memory",
      success: true,
    });
    expect(manager.count()).toBe(1);
  });

  test("forget executes immediately and deletes the memory", async () => {
    manager.remember({ key: "theme", value: "dark mode" });
    expect(manager.count()).toBe(1);

    const fake: AssistantLike = {
      processMessage: jest.fn(async (): Promise<AssistantProcessResult> => ({
        response: "",
        toolsUsed: ["forget_user_memory"],
        toolCalls: [{ id: "tc-forget", name: "forget_user_memory", arguments: { memory_key: "theme" } }],
      })),
    };
    const pipeline = new JarvisPipeline({ assistant: fake, registry: makeRegistry() });

    const result = await pipeline.processUserInput("forget my theme preference");
    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.pendingConfirmation).toBeUndefined();
    expect(result.toolsExecuted?.[0]).toMatchObject({
      toolName: "forget_user_memory",
      success: true,
    });
    expect(manager.count()).toBe(0);
  });

  test("clear executes immediately and deletes all memories", async () => {
    manager.remember({ key: "theme", value: "dark mode" });
    manager.remember({ key: "voice", value: "natural" });
    expect(manager.count()).toBe(2);

    const fake: AssistantLike = {
      processMessage: jest.fn(async (): Promise<AssistantProcessResult> => ({
        response: "",
        toolsUsed: ["clear_user_memory"],
        toolCalls: [{ id: "tc-clear", name: "clear_user_memory", arguments: {} }],
      })),
    };
    const pipeline = new JarvisPipeline({ assistant: fake, registry: makeRegistry() });

    const result = await pipeline.processUserInput("forget everything");
    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.pendingConfirmation).toBeUndefined();
    expect(result.toolsExecuted?.[0]).toMatchObject({
      toolName: "clear_user_memory",
      success: true,
    });
    expect(manager.count()).toBe(0);
  });

  test("conversation expiry does not delete persistent memory", async () => {
    manager.remember({ key: "theme", value: "dark mode" });

    const contextManager = new ConversationContextManager({ conversationTimeoutMs: 50 });
    contextManager.addMessage("conv-expired", "user", "hello");
    expect(contextManager.size()).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(contextManager.cleanupExpired()).toBe(1);
    expect(contextManager.size()).toBe(0);
    contextManager.dispose();

    expect(getMemoryManager().count()).toBe(1);
    expect(getMemoryManager().recall("theme")).toHaveLength(1);
  });
});

describe("Groq integration — relevant memory injection", () => {
  let manager: MemoryManager;

  beforeEach(() => {
    resetConversationContextManager();
    clearAuditLog();
    manager = new MemoryManager(new InMemoryMemoryStore());
    setMemoryManager(manager);
  });

  afterEach(() => {
    setMemoryManager(null);
    delete (global as Record<string, unknown>).fetch;
  });

  function buildGroqPipeline() {
    const fetchMock: jest.Mock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [{ message: { content: "You prefer dark mode." } }],
        usage: { prompt_tokens: 8, completion_tokens: 5 },
        model: "llama-3.3-70b-versatile",
      }),
    });
    global.fetch = fetchMock;

    const registry = makeRegistry();
    const provider = new GroqProvider({ apiKey: "test-groq-key", maxRetries: 1 });
    const assistant = new AssistantService({ provider, toolRegistry: registry });
    const pipeline = new JarvisPipeline({ assistant, registry });

    return {
      pipeline,
      lastRequestBody: (): { messages: Array<{ role: string; content: string }> } => {
        const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
        return JSON.parse((call[1] as { body: string }).body);
      },
    };
  }

  test("relevant memory is injected as a system message before the current user message", async () => {
    manager.remember({ category: "preference", key: "preferred theme", value: "dark mode" });
    const { pipeline, lastRequestBody } = buildGroqPipeline();

    const result = await pipeline.processUserInput("what theme do I prefer?");
    expect(result.message).toContain("dark");

    const body = lastRequestBody();
    const roles = body.messages.map((m) => m.role);
    // JARVIS system prompt (provider) + memory system message + current user message.
    expect(roles).toEqual(["system", "system", "user"]);

    const memoryMessage = body.messages.find(
      (m) => m.role === "system" && m.content.includes("preferred theme"),
    );
    expect(memoryMessage).toBeDefined();

    const userMessages = body.messages.filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0].content).toBe("what theme do I prefer?");

    const memoryIndex = body.messages.indexOf(memoryMessage!);
    expect(memoryIndex).toBe(body.messages.length - 2);
  });

  test("memory message is not persisted into conversation history", async () => {
    manager.remember({ key: "preferred theme", value: "dark mode" });
    const { pipeline } = buildGroqPipeline();

    const result = await pipeline.processUserInput("what theme do I prefer?");

    const messages = getConversationContextManager().getMessages(result.conversationId);
    const hasMemory = messages.some((m) => m.content.includes("preferred theme"));
    expect(hasMemory).toBe(false);
    expect(messages).toHaveLength(2); // user message + assistant response only
  });

  test("irrelevant memories are not injected", async () => {
    manager.remember({ key: "coffee brand", value: "dunkin" });
    const { pipeline, lastRequestBody } = buildGroqPipeline();

    await pipeline.processUserInput("what is the capital of france?");

    const body = lastRequestBody();
    const memoryInjected = body.messages.some(
      (m) => m.role === "system" && m.content.includes("coffee brand"),
    );
    expect(memoryInjected).toBe(false);
  });
});
