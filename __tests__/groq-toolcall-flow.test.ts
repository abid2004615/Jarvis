/**
 * End-to-end regression for the Groq "open safari" flow:
 * GroqProvider (mocked Groq tool_calls) -> AssistantService -> ToolRegistry
 * -> JarvisPipeline -> immediate tool execution with results returned.
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
        const call = fetchMock.mock.calls[0];
        return call[0];
      },
    };
  }

  test("Grok-style launch_application tool call executes immediately and returns results", async () => {
    const { pipeline, requestedUrl } = buildPipeline();

    const result = await pipeline.processUserInput("open safari");

    expect(requestedUrl()).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.pendingConfirmation).toBeUndefined();
    expect(safariLaunchSpy).toHaveBeenCalledTimes(1);
    expect(safariLaunchSpy).toHaveBeenCalledWith({ application: "Safari" });
    expect(result.toolsExecuted?.[0]).toMatchObject({
      toolName: "launch_application",
      success: true,
    });
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
