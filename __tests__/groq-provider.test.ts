/**
 * Tests for the Groq provider.
 * No real network calls — global.fetch is mocked for every test.
 */

import { GroqProvider, createAIProvider } from "@/lib/ai/provider";
import { AssistantService } from "@/lib/ai/assistant";
import { ToolRegistry } from "@/lib/tools/types";
import type { ToolDefinition } from "@/lib/tools/types";
import type { AssistantContext, AIProvider, AIProviderResponse } from "@/lib/ai/types";

const TEST_KEY = "test-groq-key-12345";

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
  conversationId: "conv-groq",
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
  choices: [{ message: { content: "Groq says hello." } }],
  usage: { prompt_tokens: 9, completion_tokens: 4 },
  model: "llama-3.3-70b-versatile",
};

function makeProvider(maxRetries = 1, timeout = 500): GroqProvider {
  return new GroqProvider({ apiKey: TEST_KEY, maxRetries, timeout });
}

function mockFetch(ok: boolean, body: unknown, status = 200): jest.Mock {
  const fn: jest.Mock = jest.fn().mockResolvedValue({
    ok,
    status,
    statusText: status === 401 ? "Unauthorized" : status === 400 ? "Bad Request" : status === 429 ? "Too Many Requests" : "OK",
    json: async () => body,
  });
  global.fetch = fn;
  return fn;
}

function lastRequest(fetchMock: jest.Mock): { url: string; init: { headers: Record<string, string>; body: string } } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url, init };
}

describe("GroqProvider", () => {
  afterEach(() => {
    delete (global as Record<string, unknown>).fetch;
  });

  test("initializes with name 'groq' and a valid apiKey", () => {
    const provider = makeProvider();
    expect(provider.name).toBe("groq");
    expect(provider.isConfigured()).toBe(true);
  });

  test("is not configured without an API key", () => {
    const provider = new GroqProvider();
    expect(provider.isConfigured()).toBe(false);
  });

  test("calls the correct Groq Chat Completions endpoint", async () => {
    const fetchMock = mockFetch(true, TEXT_RESPONSE);
    await makeProvider().complete(CONTEXT, "hello");

    const { url } = lastRequest(fetchMock);
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  test("sends a Bearer Authorization header", async () => {
    const fetchMock = mockFetch(true, TEXT_RESPONSE);
    await makeProvider().complete(CONTEXT, "hello");

    const { init } = lastRequest(fetchMock);
    expect(init.headers["Authorization"]).toBe(`Bearer ${TEST_KEY}`);
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  test("never leaks the API key into responses or error messages", async () => {
    mockFetch(false, { error: { message: `Invalid API key ${TEST_KEY}` } }, 401);
    const provider = makeProvider();

    await expect(provider.complete(CONTEXT, "hello")).rejects.toThrow(/Groq API error/);
    const err = await provider.complete(CONTEXT, "hello").catch((e) => e as Error);
    expect(err.message).not.toContain(TEST_KEY);
    expect(err.message).not.toContain("Bearer");
    expect(err.message).not.toMatch(/gsk_/);
  });

  test("places the system prompt as the first message inside messages", async () => {
    const fetchMock = mockFetch(true, TEXT_RESPONSE);
    await makeProvider().complete(CONTEXT, "hello");

    const { init } = lastRequest(fetchMock);
    const body = JSON.parse(init.body);
    expect(body.messages[0]).toEqual({ role: "system", content: CONTEXT.systemPrompt });
    expect(body.messages[body.messages.length - 1]).toEqual({ role: "user", content: "hello" });
    expect(body.system).toBeUndefined();
  });

  test("returns a normal text response when there are no tool calls", async () => {
    const fetchMock = mockFetch(true, TEXT_RESPONSE);
    const result = await makeProvider().complete(CONTEXT, "hello");

    expect(result.text).toBe("Groq says hello.");
    expect(result.toolCalls).toBeUndefined();
    expect(result.inputTokens).toBe(9);
    expect(result.outputTokens).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("parses a single Groq tool call into the internal ToolCall shape", async () => {
    mockFetch(true, {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "call_abc", type: "function", function: { name: "launch_application", arguments: '{"application":"Safari"}' } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      model: "llama-3.3-70b-versatile",
    });

    const result = await makeProvider().complete(CONTEXT, "open safari");

    expect(result.toolCalls).toEqual([
      { id: "call_abc", name: "launch_application", arguments: { application: "Safari" } },
    ]);
  });

  test("parses multiple tool calls in order", async () => {
    mockFetch(true, {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "t1", function: { name: "get_cpu_usage", arguments: "{}" } },
              { id: "t2", function: { name: "launch_application", arguments: '{"application":"Chrome"}' } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 8, completion_tokens: 4 },
      model: "llama-3.3-70b-versatile",
    });

    const result = await makeProvider().complete(CONTEXT, "run both");

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls?.[0].id).toBe("t1");
    expect(result.toolCalls?.[1]).toEqual({
      id: "t2",
      name: "launch_application",
      arguments: { application: "Chrome" },
    });
  });

  test("forwards the tool schema with additionalProperties:false preserved", async () => {
    const fetchMock = mockFetch(true, TEXT_RESPONSE);
    await makeProvider().complete(CONTEXT, "open safari");

    const { init } = lastRequest(fetchMock);
    const body = JSON.parse(init.body);
    expect(body.tools).toHaveLength(1);
    const tool = body.tools[0] as { type: string; function: { name: string; description: string; parameters: Record<string, unknown> } };
    expect(tool.type).toBe("function");
    expect(tool.function.name).toBe("launch_application");
    expect(tool.function.description).toBe(LAUNCH_TOOL.description);
    expect((tool.function.parameters as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    expect((tool.function.parameters as { required?: string[] }).required).toContain("application");
    expect(body.tool_choice).toBe("auto");
  });

  test("uses max_completion_tokens for Groq", async () => {
    const fetchMock = mockFetch(true, TEXT_RESPONSE);
    await makeProvider().complete(CONTEXT, "hello");

    const { init } = lastRequest(fetchMock);
    const body = JSON.parse(init.body);
    expect(body.max_completion_tokens).toBeDefined();
    expect(body.max_tokens).toBeUndefined();
  });

  test("malformed tool arguments produce a controlled error without retrying", async () => {
    const fetchMock = mockFetch(true, {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "t1", function: { name: "launch_application", arguments: "{not json" } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
      model: "llama-3.3-70b-versatile",
    });

    await expect(makeProvider().complete(CONTEXT, "open safari")).rejects.toThrow(/arguments/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("handles API 401 with a safe generic message", async () => {
    mockFetch(false, { error: { message: "Invalid API Key" } }, 401);

    await expect(makeProvider().complete(CONTEXT, "hello")).rejects.toThrow(
      /AI provider authentication failed\./,
    );
  });

  test("handles API 400 with a sanitized message", async () => {
    mockFetch(false, { error: { message: "Invalid 'messages[0]' format" } }, 400);

    await expect(makeProvider().complete(CONTEXT, "hello")).rejects.toThrow(/Groq API error: Bad request/);
  });

  test("handles API 429 with a rate-limit message", async () => {
    mockFetch(false, { error: { message: "rate_limited" } }, 429);

    await expect(makeProvider().complete(CONTEXT, "hello")).rejects.toThrow(/Rate limit exceeded/);
  });

  test("handles API 500 with a safe server error message", async () => {
    mockFetch(false, { error: { message: "internal error" } }, 500);

    await expect(makeProvider().complete(CONTEXT, "hello")).rejects.toThrow(/server error/);
  });

  test("aborts the request when the provider timeout elapses", async () => {
    const fetchMock: jest.Mock = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );
    global.fetch = fetchMock;

    await expect(makeProvider(1, 40).complete(CONTEXT, "hello")).rejects.toThrow(/aborted/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("is registered in the provider factory under 'groq'", () => {
    const provider = createAIProvider("groq", { apiKey: TEST_KEY });
    expect(provider.name).toBe("groq");
    expect(provider.isConfigured()).toBe(true);
  });

  test("AssistantService forwards registry tools into the Groq provider context", async () => {
    let receivedContext: AssistantContext | null = null;
    const fakeProvider: AIProvider = {
      name: "groq",
      isConfigured: () => true,
      async complete(context: AssistantContext): Promise<AIProviderResponse> {
        receivedContext = context;
        return { text: "ok", inputTokens: 1, outputTokens: 1, model: "llama-3.3-70b-versatile" };
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
