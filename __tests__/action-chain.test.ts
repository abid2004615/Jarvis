/**
 * JARVIS Action Chain — Unit Tests
 * Validates the ActionChain model: ordered planning, risk-based gating,
 * invalid/unknown step handling, and the client-safe observable status.
 * No tools are executed here — the chain only models and validates.
 */

import { ActionChain } from "@/lib/runtime/action-chain";
import { ToolRegistry } from "@/lib/tools/types";
import type { ToolDefinition } from "@/lib/tools/types";
import type { ToolCall } from "@/lib/ai/types";

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

const CPU_TOOL: ToolDefinition = {
  name: "get_system_summary",
  description: "Get CPU, memory, disk, battery and network status",
  inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => ({ cpu: 10 }),
};

function makeRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(ECHO_TOOL);
  registry.register(LAUNCH_TOOL);
  registry.register(CPU_TOOL);
  return registry;
}

function call(name: string, args: Record<string, unknown> = {}): ToolCall {
  return { id: `tc-${Math.random().toString(36).slice(2, 8)}`, name, arguments: args };
}

describe("ActionChain", () => {
  test("plans steps in order with risk-based confirmation gating", () => {
    const chain = new ActionChain(
      [call("echo", { message: "hi" }), call("launch_application", { application: "Safari" })],
      makeRegistry(),
    );

    expect(chain.steps).toHaveLength(2);
    expect(chain.steps[0].toolName).toBe("echo");
    expect(chain.steps[0].requiresConfirmation).toBe(false);
    expect(chain.steps[1].toolName).toBe("launch_application");
    expect(chain.steps[1].requiresConfirmation).toBe(true);
    expect(chain.steps[0].status).toBe("pending");
  });

  test("marks unknown tools as failed without executing them", () => {
    const chain = new ActionChain([call("does_not_exist")], makeRegistry());

    expect(chain.steps[0].status).toBe("failed");
    expect(chain.steps[0].error).toContain("does_not_exist");
    expect(chain.steps[0].requiresConfirmation).toBe(false);
  });

  test("marks malformed arguments as failed without executing them", () => {
    const chain = new ActionChain([call("echo", { wrong: "field" })], makeRegistry());

    expect(chain.steps[0].status).toBe("failed");
    expect(chain.steps[0].error).toContain("Invalid arguments");
  });

  test("exposes human-readable actions for display", () => {
    const chain = new ActionChain(
      [call("launch_application", { application: "Safari" })],
      makeRegistry(),
    );

    expect(chain.steps[0].humanReadableAction).toContain("Safari");
  });

  test("peek / advance / hasRemaining walk the chain in order", () => {
    const chain = new ActionChain(
      [call("echo", { message: "a" }), call("echo", { message: "b" })],
      makeRegistry(),
    );

    expect(chain.hasRemaining()).toBe(true);
    expect(chain.peek()?.toolName).toBe("echo");
    chain.advance();
    expect(chain.peek()?.toolName).toBe("echo");
    chain.advance();
    expect(chain.hasRemaining()).toBe(false);
    expect(chain.peek()).toBeNull();
  });

  test("getStepIndexByPendingToolId locates the waiting step", () => {
    const chain = new ActionChain(
      [call("echo", { message: "a" }), call("launch_application", { application: "Safari" })],
      makeRegistry(),
    );
    chain.steps[1].pendingToolId = "pending-xyz";

    expect(chain.getStepIndexByPendingToolId("pending-xyz")).toBe(1);
    expect(chain.getStepIndexByPendingToolId("missing")).toBe(-1);
  });

  test("toStatus exposes only client-safe data (no args, no results)", () => {
    const chain = new ActionChain(
      [call("launch_application", { application: "Safari" })],
      makeRegistry(),
    );
    chain.state = "waiting_for_confirmation";
    chain.steps[0].status = "executed";
    chain.steps[0].result = { secret: "safari-data" };

    const status = chain.toStatus();
    expect(status.id).toBe(chain.id);
    expect(status.state).toBe("waiting_for_confirmation");
    expect(status.steps).toEqual([
      { toolName: "launch_application", status: "executed", humanReadableAction: expect.any(String) },
    ]);
    expect(JSON.stringify(status)).not.toContain("safari-data");
    expect(JSON.stringify(status)).not.toContain("arguments");
  });

  test("empty tool calls produce an empty chain", () => {
    const chain = new ActionChain([], makeRegistry());
    expect(chain.steps).toHaveLength(0);
    expect(chain.hasRemaining()).toBe(false);
  });
});
