/**
 * Tests for the xAI Grok provider.
 * No real network calls — global.fetch is mocked for every test.
 */

import { XAIProvider, createAIProvider } from "@/lib/ai/provider";
import type { AssistantContext } from "@/lib/ai/types";

const LAUNCH_TOOL = {
  name: "launch_application",
  description: "Launch an allowlisted macOS application",
  inputSchema: {
    type: "object",
    properties: { application: { type: "string" } },
    required: ["application"],
    additionalProperties: false,
  },
};

const CONTEXT: AssistantContext = {
  conversationId: "conv-xai",
  messages: [],
  systemPrompt: "You are JARVIS, an advanced AI assistant for macOS.",
  maxTokens: 64,
  tools: [LAUNCH_TOOL],
};

const TEXT_RESPONSE = {
  choices: [{ message: { content: "Grok says hello." } }],
  usage: { prompt_tokens: 9, completion_tokens: 4 },
  model: "grok-4.6",
};

function makeProvider(maxRetries = 1, timeout = 500): XAIProvider {
  return new XAIProvider({ apiKey: "test-xai-key", maxRetries, timeout });
}

function mockFetch(ok: boolean, body: unknown, status = 200): jest.Mock {
  const fn: jest.Mock = jest.fn().mockResolvedValue({
    ok,
    status,
    statusText: status === 401 ? "Unauthorized" : "OK",
    headers: { get: () => null },
    json: async () => body,
  });
  global.fetch = fn;
  return fn;
}

function lastRequest(fetchMock: jest.Mock): { url: string; body: Record<string, unknown> } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url, body: JSON.parse(init.body) };
}

describe("XAIProvider (Grok) - tool calling", () => {
  afterEach(() => {
    delete (global as Record<string, unknown>).fetch;
  });

  test("returns a normal text response when there are no tool calls", async () => {
    const fetchMock = mockFetch(true, TEXT_RESPONSE);
    const result = await makeProvider().complete(CONTEXT, "hello");

    expect(result.text).toBe("Grok says hello.");
    expect(result.toolCalls).toBeUndefined();
    expect(result.inputTokens).toBe(9);
    expect(result.outputTokens).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("parses a single Grok tool call into the internal ToolCall shape", async () => {
    mockFetch(true, {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "toolcall_abc", type: "function", function: { name: "launch_application", arguments: '{"application":"Safari"}' } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      model: "grok-4.6",
    });

    const result = await makeProvider().complete(CONTEXT, "open safari");

    expect(result.toolCalls).toEqual([
      { id: "toolcall_abc", name: "launch_application", arguments: { application: "Safari" } },
    ]);
  });

  test("parses multiple parallel tool calls in order", async () => {
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
      model: "grok-4.6",
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
      model: "grok-4.6",
    });

    await expect(makeProvider().complete(CONTEXT, "open safari")).rejects.toThrow(/arguments/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("includes tools in the request using the OpenAI-compatible function format", async () => {
    const fetchMock = mockFetch(true, TEXT_RESPONSE);
    await makeProvider().complete(CONTEXT, "open safari");

    const { url, body } = lastRequest(fetchMock);
    expect(url).toBe("https://api.x.ai/v1/chat/completions");
    expect(body.tools).toHaveLength(1);
    const fn = (body.tools as Array<{ function: Record<string, unknown> }>)[0];
    expect(fn.function.name).toBe("launch_application");
    expect(fn.function.description).toBe(LAUNCH_TOOL.description);
    const parameters = fn.function.parameters as { additionalProperties?: boolean; required?: string[] };
    expect(parameters.additionalProperties).toBe(false);
    expect(parameters.required).toContain("application");
  });

  test("places the system prompt as the first message", async () => {
    const fetchMock = mockFetch(true, TEXT_RESPONSE);
    await makeProvider().complete(CONTEXT, "hello");

    const { body } = lastRequest(fetchMock);
    expect(body.messages[0]).toEqual({ role: "system", content: CONTEXT.systemPrompt });
    expect(body.messages[body.messages.length - 1]).toEqual({ role: "user", content: "hello" });
  });

  test("omits tools when none are supplied", async () => {
    const fetchMock = mockFetch(true, TEXT_RESPONSE);
    await makeProvider().complete({ ...CONTEXT, tools: [] }, "hello");

    const { body } = lastRequest(fetchMock);
    expect(body.tools).toBeUndefined();
  });

  test("surfaces API errors as a controlled rejection", async () => {
    mockFetch(false, { error: { message: "Invalid API key provided" } }, 401);

    await expect(makeProvider().complete(CONTEXT, "hello")).rejects.toThrow(/xAI API error/);
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

  test("is created by the provider factory", () => {
    const provider = createAIProvider("xai", { apiKey: "k" });
    expect(provider.name).toBe("xai");
    expect(provider.isConfigured()).toBe(true);
  });
});
