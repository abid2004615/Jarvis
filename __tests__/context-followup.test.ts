/**
 * P4 — Follow-up Context with Action Chains.
 * Verifies that after an action chain runs (including one resumed after a
 * confirmation), the conversation history forwarded to the provider includes
 * the tool results and prior assistant messages, so follow-up questions have
 * full context — without duplicating the current user message.
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
            { id: "toolcall_fu", type: "function", function: { name: toolName, arguments: argsJson } },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 8, completion_tokens: 4 },
    model: "llama-3.3-70b-versatile",
  };
}

type FetchRequest = { url: string; body: { messages: Array<{ role: string; content?: string }> } };

const cpuTool: ToolDefinition = {
  name: "get_cpu_usage",
  description: "Get current CPU usage percentage",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => ({ cpuUsagePercent: 18 }),
};

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
  execute: async (input) => ({ launched: input.application }),
};

describe("P4 follow-up context with action chains", () => {
  beforeEach(() => {
    resetConversationContextManager();
  });

  afterEach(() => {
    delete (global as Record<string, unknown>).fetch;
  });

  test("tool results and prior assistant messages are forwarded after a resumed chain", async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: "OK",
        json: async () => groqToolCallResponse("launch_application", '{"application":"Safari"}'),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: "OK",
        json: async () => groqTextResponse("Safari is opening."),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: "OK",
        json: async () => groqToolCallResponse("get_cpu_usage", "{}"),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: "OK",
        json: async () => groqTextResponse("Your CPU usage is 18%."),
      });
    global.fetch = fetch;

    const registry = new ToolRegistry();
    registry.register(cpuTool);
    registry.register(launchTool);
    const provider = new GroqProvider({ apiKey: "test-groq-key", maxRetries: 1 });
    const assistant = new AssistantService({ provider, toolRegistry: registry });
    const pipeline = new JarvisPipeline({ assistant, registry });

    const first = await pipeline.processUserInput("open safari");
    expect(first.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);

    const resumed = await pipeline.handleConfirmation({
      toolId: first.pendingConfirmation!.id,
      approved: true,
    });
    expect(resumed.state).toBe(JarvisRuntimeState.IDLE);
    expect(resumed.message).toBe("Safari is opening.");

    const followUp = await pipeline.processUserInput("is that high?", {
      conversationId: resumed.conversationId,
    });
    expect(followUp.state).toBe(JarvisRuntimeState.IDLE);

    const calls = fetch.mock.calls as Array<[string, { body: string }]>;
    const bodies = calls.map(([, init]) => JSON.parse(init.body));
    const followUpBody = bodies[2];

    const userTexts = followUpBody.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .filter(Boolean);
    expect(userTexts).toContain("open safari");
    expect(userTexts).toContain("is that high?");
    // The current user message is never duplicated.
    expect(userTexts.filter((t) => t === "is that high?")).toHaveLength(1);

    // The previous assistant reply is present for context.
    const assistantTexts = followUpBody.messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content)
      .filter(Boolean);
    expect(assistantTexts).toContain("Safari is opening.");

    // The launch tool result is present so the follow-up can refer to it.
    const toolMessages = followUpBody.messages.filter((m) => m.role === "tool");
    expect(toolMessages.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(followUpBody.messages)).toContain("launched");
  });
});
