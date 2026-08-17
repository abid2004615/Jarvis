/**
 * End-to-end regression for the Groq "open safari" flow:
 * GroqProvider (mocked Groq tool_calls) -> AssistantService -> ToolRegistry
 * -> JarvisPipeline -> pendingConfirmation / WAITING_FOR_CONFIRMATION,
 * then ALLOW executes via the server-side path and DENY does not.
 * No real network calls and no real application launches happen here.
 */

import { GroqProvider } from "@/lib/ai/provider";
import { AssistantService } from "@/lib/ai/assistant";
import { JarvisPipeline } from "@/lib/runtime/pipeline";
import { JarvisRuntimeState } from "@/lib/runtime/types";
import { ToolRegistry } from "@/lib/tools/types";
import type { ToolDefinition } from "@/lib/tools/types";
import { resetConversationContextManager } from "@/lib/runtime/context";

function groqToolCallResponse(toolName: string, argsJson: string): unknown {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            { id: "toolcall_g1", type: "function", function: { name: toolName, arguments: argsJson } },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 8, completion_tokens: 4 },
    model: "llama-3.3-70b-versatile",
  };
}

describe("Groq tool-calling end-to-end flow ('open safari')", () => {
  let safariLaunchSpy: jest.Mock;

  beforeEach(() => {
    resetConversationContextManager();
    safariLaunchSpy = jest.fn(async () => ({ launched: "Safari" }));
  });

  afterEach(() => {
    delete (global as Record<string, unknown>).fetch;
  });

  function buildPipeline(): { pipeline: JarvisPipeline; requestedUrl: () => string } {
    const fetchMock: jest.Mock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => groqToolCallResponse("launch_application", '{"application":"Safari"}'),
    });
    global.fetch = fetchMock;

    const launchTool: ToolDefinition = {
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
      execute: safariLaunchSpy,
    };

    const registry = new ToolRegistry();
    registry.register(launchTool);

    const provider = new GroqProvider({ apiKey: "test-groq-key", maxRetries: 1 });
    const assistant = new AssistantService({ provider, toolRegistry: registry });

    const pipeline = new JarvisPipeline({ assistant, registry });

    return {
      pipeline,
      requestedUrl: () => {
        const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
        return call[0];
      },
    };
  }

  test("Grok-style launch_application tool call yields pendingConfirmation + WAITING_FOR_CONFIRMATION", async () => {
    const { pipeline, requestedUrl } = buildPipeline();

    const result = await pipeline.processUserInput("open safari");

    expect(requestedUrl()).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(result.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);
    expect(result.pendingConfirmation).toBeDefined();
    expect(result.pendingConfirmation?.name).toBe("launch_application");
    expect(result.pendingConfirmation?.humanReadableAction).toContain("Safari");
    expect(result.toolsExecuted).toBeUndefined();
    expect(safariLaunchSpy).not.toHaveBeenCalled();
  });

  test("ALLOW executes the tool through the server-side path", async () => {
    const { pipeline } = buildPipeline();

    const pending = await pipeline.processUserInput("open safari");
    expect(pending.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);

    const result = await pipeline.handleConfirmation({
      toolId: pending.pendingConfirmation!.id,
      approved: true,
    });

    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(safariLaunchSpy).toHaveBeenCalledTimes(1);
    expect(safariLaunchSpy).toHaveBeenCalledWith({ application: "Safari" });
    expect(result.toolsExecuted?.[0]).toMatchObject({
      toolName: "launch_application",
      success: true,
    });
    expect(pipeline.getPendingConfirmations()).toHaveLength(0);
  });

  test("DENY does not execute the tool and produces no side effect", async () => {
    const { pipeline } = buildPipeline();

    const pending = await pipeline.processUserInput("open safari");
    expect(pending.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);

    const result = await pipeline.handleConfirmation({
      toolId: pending.pendingConfirmation!.id,
      approved: false,
      reason: "Not now",
    });

    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(safariLaunchSpy).not.toHaveBeenCalled();
    expect(result.toolsExecuted).toBeUndefined();
    expect(result.message).toContain("Cancelled");
    expect(pipeline.getPendingConfirmations()).toHaveLength(0);
  });

  test("a Groq plain-text response completes normally without confirmation", async () => {
    const fetchMock: jest.Mock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [{ message: { content: "Hello! I am ready." } }],
        usage: { prompt_tokens: 4, completion_tokens: 2 },
        model: "llama-3.3-70b-versatile",
      }),
    });
    global.fetch = fetchMock;

    const launchTool: ToolDefinition = {
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
      execute: safariLaunchSpy,
    };
    const registry = new ToolRegistry();
    registry.register(launchTool);

    const provider = new GroqProvider({ apiKey: "test-groq-key", maxRetries: 1 });
    const assistant = new AssistantService({ provider, toolRegistry: registry });
    const pipeline = new JarvisPipeline({ assistant, registry });

    const result = await pipeline.processUserInput("hello");

    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.message).toBe("Hello! I am ready.");
    expect(result.pendingConfirmation).toBeUndefined();
    expect(safariLaunchSpy).not.toHaveBeenCalled();
  });
});
