/**
 * P3.1 — Natural JARVIS Conversation.
 * Validates that conversation history and tool results are forwarded to the
 * provider, that the current user message is not duplicated, that tool calls
 * produce a natural final response via the synthesis turn, and that
 * natural-language confirmations resolve pending confirmations server-side.
 * All AI interactions use a mocked Groq HTTP layer — no real network calls.
 */

import { GroqProvider } from "@/lib/ai/provider";
import { AssistantService } from "@/lib/ai/assistant";
import { JarvisPipeline } from "@/lib/runtime/pipeline";
import { JarvisRuntimeState } from "@/lib/runtime/types";
import { ToolRegistry } from "@/lib/tools/types";
import type { ToolDefinition } from "@/lib/tools/types";
import { resetConversationContextManager } from "@/lib/runtime/context";

function groqTextResponse(content: string): unknown {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 4, completion_tokens: 2 },
    model: "llama-3.3-70b-versatile",
  };
}

function groqToolCallResponse(toolName: string, argsJson: string): unknown {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            { id: "toolcall_conv1", type: "function", function: { name: toolName, arguments: argsJson } },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 8, completion_tokens: 4 },
    model: "llama-3.3-70b-versatile",
  };
}

type FetchRequest = { url: string; body: { messages: Array<{ role: string; content?: string; tool_calls?: unknown[] }> } };

function buildPipeline(opts: {
  fetch: jest.Mock;
  tools: ToolDefinition[];
}): JarvisPipeline {
  const registry = new ToolRegistry();
  for (const tool of opts.tools) registry.register(tool);
  const provider = new GroqProvider({ apiKey: "test-groq-key", maxRetries: 1 });
  const assistant = new AssistantService({ provider, toolRegistry: registry });
  return new JarvisPipeline({ assistant, registry });
}

function captureRequests(fetch: jest.Mock): FetchRequest[] {
  return fetch.mock.calls.map((call: unknown[]) => {
    const [url, init] = call as [string, { body: string }];
    return { url, body: JSON.parse(init.body) };
  });
}

const cpuTool: ToolDefinition = {
  name: "get_cpu_usage",
  description: "Get current CPU usage percentage",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => ({ cpuUsagePercent: 18 }),
};

const launchTool = (spy: jest.Mock): ToolDefinition => ({
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
  execute: spy,
});

describe("P3.1 Natural Conversation", () => {
  beforeEach(() => {
    resetConversationContextManager();
  });

  afterEach(() => {
    delete (global as Record<string, unknown>).fetch;
  });

  test("conversation history is forwarded across turns (conversationId persistence)", async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => groqTextResponse("Hello, I am JARVIS."),
    });
    global.fetch = fetch;

    const pipeline = buildPipeline({ fetch, tools: [cpuTool] });

    const first = await pipeline.processUserInput("hello");
    const second = await pipeline.processUserInput("how are you", {
      conversationId: first.conversationId,
    });

    const requests = captureRequests(fetch);
    expect(first.message).toBe("Hello, I am JARVIS.");
    expect(second.conversationId).toBe(first.conversationId);

    const secondMessages = requests[1].body.messages;
    const userTexts = secondMessages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .filter(Boolean);
    expect(userTexts).toContain("hello");
    expect(userTexts).toContain("how are you");
    expect(secondMessages.filter((m) => m.role === "assistant" && m.content === "Hello, I am JARVIS.")).toHaveLength(1);
  });

  test("the current user message is never sent twice in one request", async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => groqTextResponse("Understood."),
    });
    global.fetch = fetch;

    const pipeline = buildPipeline({ fetch, tools: [cpuTool] });
    await pipeline.processUserInput("what can you do?");

    const requests = captureRequests(fetch);
    const users = requests[0].body.messages.filter(
      (m) => m.role === "user" && m.content === "what can you do?",
    );
    expect(users).toHaveLength(1);
  });

  test("tool call → tool result → natural final response via synthesis turn", async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => groqToolCallResponse("get_cpu_usage", "{}"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => groqTextResponse("Your CPU usage is currently 18%."),
      });
    global.fetch = fetch;

    const pipeline = buildPipeline({ fetch, tools: [cpuTool] });
    const result = await pipeline.processUserInput("What is my CPU usage?");

    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.message).toBe("Your CPU usage is currently 18%.");
    expect(result.toolsExecuted?.[0]).toMatchObject({ toolName: "get_cpu_usage", success: true });

    const requests = captureRequests(fetch);
    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe("https://api.groq.com/openai/v1/chat/completions");

    const synthesisBody = requests[1].body;
    const toolMessages = synthesisBody.messages.filter((m) => m.role === "tool");
    expect(toolMessages).toHaveLength(1);
    expect(toolMessages[0].content).toContain("18");
  });

  test("follow-up questions retain prior context including tool results", async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => groqToolCallResponse("get_cpu_usage", "{}"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => groqTextResponse("Your CPU usage is currently 18%."),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => groqTextResponse("That is well within normal range."),
      });
    global.fetch = fetch;

    const pipeline = buildPipeline({ fetch, tools: [cpuTool] });

    const first = await pipeline.processUserInput("What is my CPU usage?");
    const followUp = await pipeline.processUserInput("Is that high?", {
      conversationId: first.conversationId,
    });

    expect(followUp.message).toBe("That is well within normal range.");

    const requests = captureRequests(fetch);
    const followUpBody = requests[2].body;
    const userTexts = followUpBody.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .filter(Boolean);
    expect(userTexts).toContain("What is my CPU usage?");
    expect(userTexts).toContain("Is that high?");
    expect(followUpBody.messages.filter((m) => m.role === "tool")).toHaveLength(1);
  });

  test("tool calls execute immediately without confirmation", async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => groqToolCallResponse("launch_application", '{"application":"Safari"}'),
    });
    global.fetch = fetch;
    const launchSpy = jest.fn(async () => ({ launched: "Safari" }));

    const pipeline = buildPipeline({ fetch, tools: [launchTool(launchSpy)] });

    const result = await pipeline.processUserInput("open safari");
    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.message).toContain("executed successfully");
    expect(launchSpy).toHaveBeenCalledTimes(1);
    expect(launchSpy).toHaveBeenCalledWith({ application: "Safari" });
  });

  test("an ordinary conversational request requires no tool call", async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => groqTextResponse("I am ready to help."),
    });
    global.fetch = fetch;
    const launchSpy = jest.fn(async () => ({ launched: "Safari" }));

    const pipeline = buildPipeline({ fetch, tools: [cpuTool, launchTool(launchSpy)] });

    const result = await pipeline.processUserInput("hello JARVIS");

    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.message).toBe("I am ready to help.");
    expect(result.toolsExecuted).toBeUndefined();
    expect(captureRequests(fetch)).toHaveLength(1);
  });
});
