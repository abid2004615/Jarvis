/**
 * P4 — Action Chain Security Tests.
 * Verifies that action chains never bypass the safety model:
 *  - unallowlisted / arbitrary application names are rejected
 *  - confirmation-gated steps never execute before explicit approval
 *  - denial never executes the tool
 *  - malformed arguments are never executed
 *  - a paused confirmation cannot be triggered by unrelated messages
 *  - pending confirmations are scoped to their conversation
 */

import { JarvisPipeline } from "@/lib/runtime/pipeline";
import type { AssistantLike } from "@/lib/runtime/pipeline";
import { JarvisRuntimeState } from "@/lib/runtime/types";
import { ToolRegistry } from "@/lib/tools/types";
import type { ToolDefinition } from "@/lib/tools/types";
import { getBuiltinTools } from "@/lib/tools/registry";
import type { AssistantContext, AssistantProcessResult } from "@/lib/ai/types";
import { resetConversationContextManager } from "@/lib/runtime/context";

const gatedTool = (spy: jest.Mock): ToolDefinition => ({
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

const echoTool = (spy: jest.Mock): ToolDefinition => ({
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
  execute: spy,
});

function createFake(result: AssistantProcessResult): AssistantLike {
  return {
    async processMessage(_input: string, _context: AssistantContext): Promise<AssistantProcessResult> {
      return result;
    },
  };
}

function gatedResult(application: string): AssistantProcessResult {
  return {
    response: "Launching.",
    toolsUsed: ["launch_application"],
    toolCalls: [{ id: "l1", name: "launch_application", arguments: { application } }],
  };
}

describe("P4 action chain security", () => {
  beforeEach(() => {
    resetConversationContextManager();
  });

  test("unallowlisted application names are rejected by the allowlist", async () => {
    const registry = new ToolRegistry();
    for (const tool of getBuiltinTools()) registry.register(tool);
    const assistant = createFake(gatedResult("/bin/sh"));
    const pipeline = new JarvisPipeline({ assistant, registry });

    const pending = await pipeline.processUserInput("launch /bin/sh");
    expect(pending.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);

    const result = await pipeline.handleConfirmation({ toolId: pending.pendingConfirmation!.id, approved: true });
    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.toolsExecuted?.[0].success).toBe(true);
    expect(result.toolsExecuted?.[0].result).toMatchObject({
      success: false,
      message: expect.stringContaining("allowlist") as string,
    });
  });

  test("path traversal application names are rejected by the allowlist", async () => {
    const registry = new ToolRegistry();
    for (const tool of getBuiltinTools()) registry.register(tool);
    const assistant = createFake(gatedResult("../../usr/bin/sh"));
    const pipeline = new JarvisPipeline({ assistant, registry });

    const pending = await pipeline.processUserInput("launch it");
    expect(pending.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);

    const result = await pipeline.handleConfirmation({ toolId: pending.pendingConfirmation!.id, approved: true });
    expect(result.toolsExecuted?.[0].result).toMatchObject({
      success: false,
      message: expect.stringContaining("allowlist") as string,
    });
  });

  test("a confirmation-gated step never executes before explicit approval", async () => {
    const spy = jest.fn(async () => ({ launched: "Safari" }));
    const registry = new ToolRegistry();
    registry.register(gatedTool(spy));
    const assistant = createFake(gatedResult("Safari"));
    const pipeline = new JarvisPipeline({ assistant, registry });

    const pending = await pipeline.processUserInput("open safari");
    expect(pending.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);
    expect(spy).not.toHaveBeenCalled();

    const result = await pipeline.handleConfirmation({ toolId: pending.pendingConfirmation!.id, approved: true });
    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("denying a confirmation never executes the tool", async () => {
    const spy = jest.fn(async () => ({ launched: "Safari" }));
    const registry = new ToolRegistry();
    registry.register(gatedTool(spy));
    const assistant = createFake(gatedResult("Safari"));
    const pipeline = new JarvisPipeline({ assistant, registry });

    const pending = await pipeline.processUserInput("open safari");
    const result = await pipeline.handleConfirmation({ toolId: pending.pendingConfirmation!.id, approved: false });

    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.message).toContain("Cancelled");
    expect(spy).not.toHaveBeenCalled();
  });

  test("a paused confirmation cannot be triggered by an unrelated message", async () => {
    const spy = jest.fn(async () => ({ launched: "Safari" }));
    const registry = new ToolRegistry();
    registry.register(gatedTool(spy));
    const assistant = createFake(gatedResult("Safari"));
    const pipeline = new JarvisPipeline({ assistant, registry });

    const pending = await pipeline.processUserInput("open safari");
    expect(pending.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);

    const originalId = pending.pendingConfirmation!.id;
    const result = await pipeline.processUserInput("tell me a joke", {
      conversationId: pending.conversationId,
    });
    expect(spy).not.toHaveBeenCalled();
    // The original pending confirmation is untouched and still awaiting a
    // decision — an unrelated message cannot silently trigger it.
    expect(pipeline.getPendingConfirmations().some((p) => p.id === originalId)).toBe(true);
  });

  test("malformed arguments are never executed", async () => {
    const spy = jest.fn(async () => ({ echoed: "hi" }));
    const registry = new ToolRegistry();
    registry.register(echoTool(spy));
    const assistant = createFake({
      response: "Done.",
      toolsUsed: ["echo"],
      toolCalls: [{ id: "b1", name: "echo", arguments: { wrong: "field" } }],
    });
    const pipeline = new JarvisPipeline({ assistant, registry });

    const result = await pipeline.processUserInput("echo hello");

    expect(result.toolsExecuted?.[0]).toMatchObject({ success: false });
    expect(spy).not.toHaveBeenCalled();
  });

  test("a new message in a different conversation does not approve the other conversation's pending tool", async () => {
    const spy = jest.fn(async () => ({ launched: "Safari" }));
    const registry = new ToolRegistry();
    registry.register(gatedTool(spy));
    const assistant = createFake(gatedResult("Safari"));
    const pipeline = new JarvisPipeline({ assistant, registry });

    const pending = await pipeline.processUserInput("open safari");
    expect(pending.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);
    const originalId = pending.pendingConfirmation!.id;

    // A different conversation saying "yes" must not resolve conversation A's
    // pending tool.
    const other = await pipeline.processUserInput("yes", { conversationId: "conversation-B" });
    expect(spy).not.toHaveBeenCalled();
    expect(pipeline.getPendingConfirmations().some((p) => p.id === originalId)).toBe(true);
    void other;
  });
});
