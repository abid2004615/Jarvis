/**
 * Tests for JARVIS Pipeline Flow (with injected fakes)
 * Validates tool success/failure (including immediate execution of
 * confirmation-gated tools), offline mode, and AI failure degradation —
 * without touching real macOS tools, the microphone, or any live AI provider.
 */

import { JarvisPipeline } from "@/lib/runtime/pipeline";
import type { AssistantLike } from "@/lib/runtime/pipeline";
import { JarvisRuntimeState } from "@/lib/runtime/types";
import { ToolRegistry } from "@/lib/tools/types";
import type { ToolDefinition } from "@/lib/tools/types";
import type { AssistantContext, AssistantProcessResult } from "@/lib/ai/types";
import { resetConversationContextManager } from "@/lib/runtime/context";

const ECHO_TOOL: ToolDefinition = {
  name: "echo",
  description: "Echo a message back",
  inputSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => ({ echoed: input.message }),
};

const CONFIRM_TOOL: ToolDefinition = {
  name: "launch_application",
  description: "Launch an allowlisted application",
  inputSchema: {
    type: "object",
    properties: { application: { type: "string" } },
    required: ["application"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => ({ launched: input.application }),
};

const FAILING_TOOL: ToolDefinition = {
  name: "fail_tool",
  description: "A tool that always fails",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    throw new Error("internal boom");
  },
};

function createRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(ECHO_TOOL);
  registry.register(CONFIRM_TOOL);
  registry.register(FAILING_TOOL);
  return registry;
}

function createFakeAssistant(result: AssistantProcessResult | Error): AssistantLike {
  return {
    async processMessage(_input: string, _context: AssistantContext): Promise<AssistantProcessResult> {
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
  };
}

describe("JARVIS Pipeline Flow", () => {
  beforeEach(() => {
    resetConversationContextManager();
  });

  describe("Tool Execution", () => {
    test("should execute a safe tool and include the result", async () => {
      const registry = createRegistry();
      const assistant = createFakeAssistant({
        response: "Done.",
        toolsUsed: ["echo"],
        toolCalls: [{ id: "c1", name: "echo", arguments: { message: "hi" } }],
      });
      const pipeline = new JarvisPipeline({ assistant, registry });

      const result = await pipeline.processUserInput("echo hi");

      expect(result.state).toBe(JarvisRuntimeState.IDLE);
      expect(result.toolsExecuted).toBeDefined();
      expect(result.toolsExecuted?.[0]).toMatchObject({
        toolName: "echo",
        success: true,
      });
      expect(result.toolsExecuted?.[0].result).toEqual({ echoed: "hi" });
    });

    test("should record a failed tool execution without throwing", async () => {
      const registry = createRegistry();
      const assistant = createFakeAssistant({
        response: "Something went wrong.",
        toolsUsed: ["fail_tool"],
        toolCalls: [{ id: "c1", name: "fail_tool", arguments: {} }],
      });
      const pipeline = new JarvisPipeline({ assistant, registry });

      const result = await pipeline.processUserInput("run fail");

      expect(result.message).toBe("Something went wrong.");
      expect(result.toolsExecuted?.[0]).toMatchObject({
        toolName: "fail_tool",
        success: false,
      });
      expect(result.toolsExecuted?.[0].error).toBe("internal boom");
    });

    test("should record unknown tool failure without executing", async () => {
      const registry = createRegistry();
      const assistant = createFakeAssistant({
        response: "Ok.",
        toolsUsed: ["nope"],
        toolCalls: [{ id: "c1", name: "nope", arguments: {} }],
      });
      const pipeline = new JarvisPipeline({ assistant, registry });

      const result = await pipeline.processUserInput("unknown tool");

      expect(result.toolsExecuted?.[0]).toMatchObject({
        toolName: "nope",
        success: false,
      });
    });
  });

  describe("Gated Tool Execution", () => {
    test("should execute a confirmation-gated tool immediately", async () => {
      const registry = createRegistry();
      const assistant = createFakeAssistant({
        response: "Launching.",
        toolsUsed: ["launch_application"],
        toolCalls: [{ id: "c1", name: "launch_application", arguments: { application: "Safari" } }],
      });
      const pipeline = new JarvisPipeline({ assistant, registry });

      const result = await pipeline.processUserInput("launch Safari");

      expect(result.state).toBe(JarvisRuntimeState.IDLE);
      expect(result.pendingConfirmation).toBeUndefined();
      expect(result.toolsExecuted?.[0]).toMatchObject({
        toolName: "launch_application",
        success: true,
      });
      expect(result.toolsExecuted?.[0].result).toEqual({ launched: "Safari" });
    });
  });

  describe("Degradation", () => {
    test("should return OFFLINE state when offline", async () => {
      const pipeline = new JarvisPipeline({ assistant: null, registry: createRegistry() });
      pipeline.setOnline(false);

      const result = await pipeline.processUserInput("hello");

      expect(result.state).toBe(JarvisRuntimeState.OFFLINE);
    });

    test("should degrade to fallback when AI throws", async () => {
      const assistant = createFakeAssistant(new Error("provider exploded"));
      const pipeline = new JarvisPipeline({ assistant, registry: createRegistry() });

      const result = await pipeline.processUserInput("status report");

      expect(result.state).toBe(JarvisRuntimeState.IDLE);
      expect(result.message).toBeDefined();
      expect(result.message).not.toMatch(/exploded|stack|Error:/);
    });

    test("should respond with a natural rate-limit message when the provider is rate-limited", async () => {
      const assistant = createFakeAssistant(new Error("429: rate limit exceeded"));
      const pipeline = new JarvisPipeline({ assistant, registry: createRegistry() });

      const result = await pipeline.processUserInput("what is my cpu");

      expect(result.state).toBe(JarvisRuntimeState.IDLE);
      expect(result.message).toContain("rate-limited");
      expect(result.message).not.toMatch(/429|rate limit exceeded/);
      expect(result.error).toBeUndefined();
    });

    test("should degrade to fallback when no AI is configured", async () => {
      const pipeline = new JarvisPipeline({ assistant: null, registry: createRegistry() });

      const result = await pipeline.processUserInput("what is my cpu");

      expect(result.state).toBe(JarvisRuntimeState.IDLE);
      expect(result.message).toContain("CPU");
    });
  });

  describe("State Subscription", () => {
    test("should notify listeners of state transitions", async () => {
      const assistant = createFakeAssistant({
        response: "Done.",
        toolsUsed: ["echo"],
        toolCalls: [{ id: "c1", name: "echo", arguments: { message: "hi" } }],
      });
      const pipeline = new JarvisPipeline({ assistant, registry: createRegistry() });
      const seen: JarvisRuntimeState[] = [];
      pipeline.subscribe((s) => seen.push(s));

      await pipeline.processUserInput("echo hi");

      expect(seen).toContain(JarvisRuntimeState.THINKING);
      expect(seen).toContain(JarvisRuntimeState.EXECUTING);
      expect(seen).toContain(JarvisRuntimeState.RESPONDING);
    });

    test("should support unsubscribe", async () => {
      const pipeline = new JarvisPipeline({ assistant: null, registry: createRegistry() });
      const seen: JarvisRuntimeState[] = [];
      const unsubscribe = pipeline.subscribe((s) => seen.push(s));

      unsubscribe();
      await pipeline.processUserInput("hello");

      expect(seen).toHaveLength(0);
    });
  });
});
