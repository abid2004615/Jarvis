/**
 * End-to-end regression for the xAI tool-calling path:
 * XAIProvider (mocked Grok tool_calls) -> AssistantService -> ToolRegistry
 * -> JarvisPipeline -> immediate tool execution with results returned.
 *
 * This is the "exact failure" regression: a Grok tool call must NOT be
 * dropped and must NOT silently fall back to the offline message — it must
 * reach the pipeline and execute, surfacing the executed results.
 * No real network calls and no real application launches happen here.
 */

import { XAIProvider } from "@/lib/ai/provider";
import { AssistantService } from "@/lib/ai/assistant";
import { JarvisPipeline } from "@/lib/runtime/pipeline";
import { JarvisRuntimeState } from "@/lib/runtime/types";
import { ToolRegistry } from "@/lib/tools/types";
import type { ToolDefinition } from "@/lib/tools/types";
import { resetConversationContextManager } from "@/lib/runtime/context";

const LAUNCH_TOOL: ToolDefinition = {
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
  execute: async () => ({ launched: "Safari" }),
};

function grokToolCallResponse(toolName: string, argsJson: string): unknown {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            { id: "toolcall_x1", type: "function", function: { name: toolName, arguments: argsJson } },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 8, completion_tokens: 4 },
    model: "grok-4.6",
  };
}

function buildPipeline(fetchBody: unknown): {
  pipeline: JarvisPipeline;
  requestBody: () => Record<string, unknown>;
} {
  const fetchMock: jest.Mock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => fetchBody,
  });
  global.fetch = fetchMock;

  const registry = new ToolRegistry();
  registry.register(LAUNCH_TOOL);

  const provider = new XAIProvider({ apiKey: "test-xai-key", maxRetries: 1 });
  const assistant = new AssistantService({ provider, toolRegistry: registry });

  const pipeline = new JarvisPipeline({ assistant, registry });

  const requestBody = () => {
    const call = fetchMock.mock.calls[0];
    const [url, init] = call;
    return { url, ...JSON.parse((init as { body: string }).body) };
  };

  return { pipeline, requestBody };
}

describe("xAI tool-calling end-to-end flow", () => {
  beforeEach(() => {
    resetConversationContextManager();
  });

  afterEach(() => {
    delete (global as Record<string, unknown>).fetch;
  });

  test("a Grok launch_application tool call reaches the pipeline and executes immediately", async () => {
    const { pipeline, requestBody } = buildPipeline(
      grokToolCallResponse("launch_application", '{"application":"Safari"}'),
    );

    const result = await pipeline.processUserInput("open safari");

    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.pendingConfirmation).toBeUndefined();
    expect(result.toolsExecuted?.[0]).toMatchObject({
      toolName: "launch_application",
      success: true,
    });

    const sent = requestBody();
    expect(sent.url).toBe("https://api.x.ai/v1/chat/completions");
    expect(sent.model).toBe("grok-4.6");
    expect(sent.max_completion_tokens).toBeDefined();
    expect(sent.tools).toHaveLength(1);
    expect((sent.tools[0] as { function: { name: string } }).function.name).toBe("launch_application");
    expect((sent.tools[0] as { function: { parameters: { additionalProperties?: boolean } } }).function.parameters.additionalProperties).toBe(false);
  });

  test("a Grok plain-text response completes normally without confirmation", async () => {
    const { pipeline } = buildPipeline({
      choices: [{ message: { content: "Hello! I am ready." } }],
      usage: { prompt_tokens: 4, completion_tokens: 2 },
      model: "grok-4.6",
    });

    const result = await pipeline.processUserInput("hello");

    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.message).toBe("Hello! I am ready.");
    expect(result.pendingConfirmation).toBeUndefined();
  });
});
