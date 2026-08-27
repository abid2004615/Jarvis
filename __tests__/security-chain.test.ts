/**
 * P4 — Action Chain Security Tests.
 * Verifies that action chains never bypass the safety model:
 *  - unallowlisted / arbitrary application names are rejected
 *  - tools execute immediately when allowed by the security model
 *  - malformed arguments are never executed
 *  - security deny-list remains effective
 */

import { JarvisPipeline } from "@/lib/runtime/pipeline";
import type { AssistantLike } from "@/lib/runtime/pipeline";
import { JarvisRuntimeState } from "@/lib/runtime/types";
import { ToolRegistry } from "@/lib/tools/types";
import type { ToolDefinition } from "@/lib/tools/types";
import { getBuiltinTools } from "@/lib/tools/registry";
import type { AssistantContext, AssistantProcessResult } from "@/lib/ai/types";
import { resetConversationContextManager } from "@/lib/runtime/context";

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

    const result = await pipeline.processUserInput("launch /bin/sh");
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

    const result = await pipeline.processUserInput("launch it");
    expect(result.toolsExecuted?.[0].result).toMatchObject({
      success: false,
      message: expect.stringContaining("allowlist") as string,
    });
  });

  test("tools execute immediately when the security model allows", async () => {
    const spy = jest.fn(async () => ({ launched: "Safari" }));
    const registry = new ToolRegistry();
    registry.register({
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
    const assistant = createFake(gatedResult("Safari"));
    const pipeline = new JarvisPipeline({ assistant, registry });

    const result = await pipeline.processUserInput("open safari");
    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.toolsExecuted?.[0].success).toBe(true);
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

  test("unknown tools are recorded as failures without execution", async () => {
    const assistant = createFake({
      response: "Doing something.",
      toolsUsed: ["nonexistent_tool"],
      toolCalls: [{ id: "u1", name: "nonexistent_tool", arguments: {} }],
    });
    const pipeline = new JarvisPipeline({ assistant, registry: new ToolRegistry() });

    const result = await pipeline.processUserInput("do something");

    expect(result.toolsExecuted?.[0]).toMatchObject({ success: false });
  });
});
