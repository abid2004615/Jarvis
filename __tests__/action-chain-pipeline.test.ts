/**
 * JARVIS Action Chain — Pipeline Integration Tests
 * Validates multi-step action chaining end-to-end through the pipeline:
 * safe steps run in order, gated steps pause and resume, denials skip the
 * step and continue, failures surface honestly, and chain status is exposed.
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
  execute: async (input) => ({ launched: input.application }),
};

const FAILING_TOOL: ToolDefinition = {
  name: "fail_tool",
  description: "A tool that always fails",
  inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    throw new Error("internal boom");
  },
};

function createRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(ECHO_TOOL);
  registry.register(LAUNCH_TOOL);
  registry.register(FAILING_TOOL);
  return registry;
}

function createFake(result: AssistantProcessResult): AssistantLike {
  return {
    async processMessage(_input: string, _context: AssistantContext): Promise<AssistantProcessResult> {
      return result;
    },
  };
}

const echoCall = (message: string) => ({ id: "e1", name: "echo", arguments: { message } });
const launchCall = (application: string) => ({
  id: "l1",
  name: "launch_application",
  arguments: { application },
});

describe("JARVIS Action Chain pipeline", () => {
  beforeEach(() => {
    resetConversationContextManager();
  });

  test("runs multiple safe tools in order with a completed chain status", async () => {
    const assistant = createFake({
      response: "Done.",
      toolsUsed: ["echo", "echo"],
      toolCalls: [echoCall("first"), echoCall("second")],
    });
    const pipeline = new JarvisPipeline({ assistant, registry: createRegistry() });

    const result = await pipeline.processUserInput("echo first and second");

    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.toolsExecuted?.map((t) => t.toolName)).toEqual(["echo", "echo"]);
    expect(result.toolsExecuted?.[0].result).toEqual({ echoed: "first" });
    expect(result.toolsExecuted?.[1].result).toEqual({ echoed: "second" });
    expect(result.actionChain?.state).toBe("completed");
    expect(result.actionChain?.steps.map((s) => s.status)).toEqual(["executed", "executed"]);
  });

  test("a gated step pauses the chain and approval resumes remaining steps", async () => {
    const assistant = createFake({
      response: "Launching.",
      toolsUsed: ["launch_application", "echo"],
      toolCalls: [launchCall("Safari"), echoCall("after")],
    });
    const pipeline = new JarvisPipeline({ assistant, registry: createRegistry() });

    const first = await pipeline.processUserInput("launch Safari then echo after");
    expect(first.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);
    expect(first.actionChain?.state).toBe("waiting_for_confirmation");
    expect(first.actionChain?.steps.map((s) => s.toolName)).toEqual([
      "launch_application",
      "echo",
    ]);
    expect(first.toolsExecuted).toBeUndefined();

    const second = await pipeline.handleConfirmation({
      toolId: first.pendingConfirmation!.id,
      approved: true,
    });

    expect(second.state).toBe(JarvisRuntimeState.IDLE);
    expect(second.toolsExecuted?.map((t) => t.toolName)).toEqual([
      "launch_application",
      "echo",
    ]);
    expect(second.toolsExecuted?.[0].result).toEqual({ launched: "Safari" });
    expect(second.actionChain?.state).toBe("completed");
    expect(second.actionChain?.steps.map((s) => s.status)).toEqual(["executed", "executed"]);
  });

  test("denying a gated step skips it and continues with remaining steps", async () => {
    const assistant = createFake({
      response: "Launching.",
      toolsUsed: ["launch_application", "echo"],
      toolCalls: [launchCall("Safari"), echoCall("after")],
    });
    const pipeline = new JarvisPipeline({ assistant, registry: createRegistry() });

    const first = await pipeline.processUserInput("launch Safari then echo after");
    expect(first.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);

    const second = await pipeline.handleConfirmation({
      toolId: first.pendingConfirmation!.id,
      approved: false,
      reason: "Not now",
    });

    expect(second.state).toBe(JarvisRuntimeState.IDLE);
    expect(second.message).toContain("Cancelled");
    expect(second.toolsExecuted?.map((t) => t.toolName)).toEqual(["echo"]);
    expect(second.actionChain?.state).toBe("partial_success");
    expect(second.actionChain?.steps.map((s) => s.status)).toEqual(["denied", "executed"]);
    expect(pipeline.getPendingConfirmations()).toHaveLength(0);
  });

  test("multiple gated steps pause independently and each requires its own decision", async () => {
    const assistant = createFake({
      response: "Launching.",
      toolsUsed: ["launch_application", "launch_application"],
      toolCalls: [launchCall("Safari"), launchCall("Mail")],
    });
    const pipeline = new JarvisPipeline({ assistant, registry: createRegistry() });

    const first = await pipeline.processUserInput("launch Safari and Mail");
    expect(first.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);

    const second = await pipeline.handleConfirmation({
      toolId: first.pendingConfirmation!.id,
      approved: true,
    });
    expect(second.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);
    expect(second.pendingConfirmation?.name).toBe("launch_application");
    expect(second.toolsExecuted).toBeUndefined();

    const third = await pipeline.handleConfirmation({
      toolId: second.pendingConfirmation!.id,
      approved: true,
    });
    expect(third.state).toBe(JarvisRuntimeState.IDLE);
    expect(third.toolsExecuted?.map((t) => t.result)).toEqual([
      { launched: "Safari" },
      { launched: "Mail" },
    ]);
    expect(third.actionChain?.state).toBe("completed");
  });

  test("a failing step is surfaced honestly and the chain reports partial success", async () => {
    const assistant = createFake({
      response: "Done.",
      toolsUsed: ["fail_tool", "echo"],
      toolCalls: [{ id: "f1", name: "fail_tool", arguments: {} }, echoCall("after")],
    });
    const pipeline = new JarvisPipeline({ assistant, registry: createRegistry() });

    const result = await pipeline.processUserInput("run fail then echo after");

    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.toolsExecuted?.[0]).toMatchObject({
      toolName: "fail_tool",
      success: false,
      error: "internal boom",
    });
    expect(result.toolsExecuted?.[1]).toMatchObject({
      toolName: "echo",
      success: true,
    });
    expect(result.actionChain?.state).toBe("partial_success");
    expect(result.actionChain?.steps.map((s) => s.status)).toEqual(["failed", "executed"]);
  });

  test("an unknown tool in a chain fails honestly and does not block later steps", async () => {
    const assistant = createFake({
      response: "Done.",
      toolsUsed: ["nope", "echo"],
      toolCalls: [{ id: "n1", name: "nope", arguments: {} }, echoCall("after")],
    });
    const pipeline = new JarvisPipeline({ assistant, registry: createRegistry() });

    const result = await pipeline.processUserInput("run nope then echo after");

    expect(result.toolsExecuted?.[0]).toMatchObject({
      toolName: "nope",
      success: false,
    });
    expect(result.toolsExecuted?.[1]).toMatchObject({ toolName: "echo", success: true });
    expect(result.actionChain?.state).toBe("partial_success");
  });

  test("malformed arguments fail without executing that step", async () => {
    const assistant = createFake({
      response: "Done.",
      toolsUsed: ["echo", "echo"],
      toolCalls: [{ id: "b1", name: "echo", arguments: { wrong: "field" } }, echoCall("ok")],
    });
    const pipeline = new JarvisPipeline({ assistant, registry: createRegistry() });

    const result = await pipeline.processUserInput("echo broken and ok");

    expect(result.toolsExecuted?.[0]).toMatchObject({
      toolName: "echo",
      success: false,
    });
    expect(result.toolsExecuted?.[0].error).toContain("Invalid arguments");
    expect(result.toolsExecuted?.[1]).toMatchObject({ toolName: "echo", success: true });
  });

  test("a single safe tool reports a completed chain", async () => {
    const assistant = createFake({
      response: "Done.",
      toolsUsed: ["echo"],
      toolCalls: [echoCall("hi")],
    });
    const pipeline = new JarvisPipeline({ assistant, registry: createRegistry() });

    const result = await pipeline.processUserInput("echo hi");

    expect(result.actionChain?.state).toBe("completed");
    expect(result.actionChain?.steps).toHaveLength(1);
    expect(result.actionChain?.steps[0].status).toBe("executed");
  });
});
