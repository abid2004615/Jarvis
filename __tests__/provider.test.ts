/**
 * Tests for the OpenAI provider's tool-calling request/response handling.
 * No real network calls — global.fetch is mocked for every test.
 */

import { OpenAIProvider } from "@/lib/ai/provider";
import { AssistantService } from "@/lib/ai/assistant";
import type { AssistantContext, AIProvider, AIProviderResponse } from "@/lib/ai/types";
import { ToolRegistry } from "@/lib/tools/types";
import type { ToolDefinition } from "@/lib/tools/types";

const LAUNCH_TOOL: ToolDefinition = {
  name: "launch_application",
  description: "Launch an allowlisted macOS application",
  inputSchema: {
    type: "object",
    properties: { application: { type: "string" } },
    required: ["application"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async () => ({ success: true }),
};

const CONTEXT: AssistantContext = {
  conversationId: "conv-1",
  messages: [],
  systemPrompt: "You are JARVIS, an advanced AI assistant for macOS.",
  maxTokens: 64,
  tools: [
    {
      name: LAUNCH_TOOL.name,
      description: LAUNCH_TOOL.description,
      inputSchema: LAUNCH_TOOL.inputSchema,
    },
  ],
};

const TEXT_RESPONSE = {
  choices: [{ message: { content: "Hello there." } }],
  usage: { prompt_tokens: 12, completion_tokens: 6 },
  model: "gpt-4-turbo",
};

function makeProvider(): OpenAIProvider {
  return new OpenAIProvider({ apiKey: "test-key", maxRetries: 1, timeout: 500 });
}

function mockFetch(ok: boolean, body: unknown, status = 200): jest.Mock {
  const fn: jest.Mock = jest.fn().mockResolvedValue({
    ok,
    status,
    statusText: status === 401 ? "Unauthorized" : "OK",
    json: async () => body,
  });
  global.fetch = fn;
  return fn;
}

function lastRequest(fetchMock: jest.Mock): { url: string; body: Record<string, unknown> } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url, body: JSON.parse(init.body) };
}

describe("OpenAIProvider - tool calling", () => {
  afterEach(() => {
    delete (global as Record<string, unknown>).fetch;
  });

  test("returns a normal text response when there are no tool calls", async () => {
    const fetchMock = mockFetch(true, TEXT_RESPONSE);
    const result = await makeProvider().complete(CONTEXT, "hello");

    expect(result.text).toBe("Hello there.");
    expect(result.toolCalls).toBeUndefined();
    expect(result.inputTokens).toBe(12);
    expect(result.outputTokens).toBe(6);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("parses a single tool_calls entry into a ToolCall", async () => {
    mockFetch(true, {
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "launch_application", arguments: '{"application":"Safari"}' },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      model: "gpt-4-turbo",
    });

    const result = await makeProvider().complete(CONTEXT, "open safari");

    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "launch_application", arguments: { application: "Safari" } },
    ]);
    expect(result.text).toBe("");
  });

  test("parses multiple tool_calls in order", async () => {
    mockFetch(true, {
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              { id: "c1", function: { name: "get_cpu_usage", arguments: "{}" } },
              { id: "c2", function: { name: "launch_application", arguments: '{"application":"Chrome"}' } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 8, completion_tokens: 4 },
      model: "gpt-4-turbo",
    });

    const result = await makeProvider().complete(CONTEXT, "run both");

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls?.[0].id).toBe("c1");
    expect(result.toolCalls?.[0].name).toBe("get_cpu_usage");
    expect(result.toolCalls?.[1]).toEqual({
      id: "c2",
      name: "launch_application",
      arguments: { application: "Chrome" },
    });
  });

  test("malformed tool arguments produce a controlled error without retrying", async () => {
    const fetchMock = mockFetch(true, {
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              { id: "c1", function: { name: "launch_application", arguments: "{not valid json" } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
      model: "gpt-4-turbo",
    });

    const provider = makeProvider();
    await expect(provider.complete(CONTEXT, "open safari")).rejects.toThrow(/arguments/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("places the system instruction as the first message and drops the legacy system field", async () => {
    const fetchMock = mockFetch(true, TEXT_RESPONSE);
    await makeProvider().complete(CONTEXT, "hello");

    const { body } = lastRequest(fetchMock);
    expect(body.messages[0]).toEqual({ role: "system", content: CONTEXT.systemPrompt });
    expect(body.messages[body.messages.length - 1]).toEqual({ role: "user", content: "hello" });
    expect(body.system).toBeUndefined();
  });

  test("includes tools in the OpenAI request format", async () => {
    const fetchMock = mockFetch(true, TEXT_RESPONSE);
    await makeProvider().complete(CONTEXT, "open safari");

    const { body } = lastRequest(fetchMock);
    expect(body.tools).toHaveLength(1);
    expect((body.tools as Array<{ type: string; function: Record<string, unknown> }>)[0].type).toBe("function");
    const fn = (body.tools as Array<{ function: Record<string, unknown> }>)[0].function;
    expect(fn.name).toBe("launch_application");
    expect(fn.description).toBe(LAUNCH_TOOL.description);
    const parameters = fn.parameters as { additionalProperties?: boolean; required?: string[] };
    expect(parameters.additionalProperties).toBe(false);
    expect(parameters.required).toContain("application");
  });

  test("omits tools from the request when none are supplied", async () => {
    const fetchMock = mockFetch(true, TEXT_RESPONSE);
    await makeProvider().complete({ ...CONTEXT, tools: [] }, "hello");

    const { body } = lastRequest(fetchMock);
    expect(body.tools).toBeUndefined();
  });

  test("surfaces API errors as a controlled rejection", async () => {
    mockFetch(false, { error: { message: "Incorrect API key provided" } }, 401);
    const provider = makeProvider();

    await expect(provider.complete(CONTEXT, "hello")).rejects.toThrow(/OpenAI API error/);
  });
});

describe("AssistantService - forwards tools to the provider", () => {
  test("passes registry tools into the provider context", async () => {
    let receivedContext: AssistantContext | null = null;
    const fakeProvider: AIProvider = {
      name: "fake",
      isConfigured: () => true,
      async complete(context: AssistantContext): Promise<AIProviderResponse> {
        receivedContext = context;
        return { text: "ok", inputTokens: 1, outputTokens: 1, model: "fake" };
      },
    };

    const registry = new ToolRegistry();
    registry.register(LAUNCH_TOOL);

    const service = new AssistantService({ provider: fakeProvider, toolRegistry: registry });
    await service.processMessage("open safari", { conversationId: "c", messages: [] });

    expect(receivedContext?.tools).toEqual([
      {
        name: "launch_application",
        description: LAUNCH_TOOL.description,
        inputSchema: LAUNCH_TOOL.inputSchema,
      },
    ]);
  });
});
