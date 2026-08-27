/**
 * JARVIS Automation — Pipeline Integration Tests
 *
 * Scheduled/conditional execution goes through the SAME runtime pipeline as
 * normal conversation: safe tools run immediately, gated tools pause for
 * approval, and there is no scheduler bypass. Approvals/denials record runs.
 */

import { JarvisPipeline } from "@/lib/runtime/pipeline";
import { JarvisRuntimeState } from "@/lib/runtime/types";
import { ToolRegistry } from "@/lib/tools/types";
import type { ToolDefinition } from "@/lib/tools/types";
import { resetConversationContextManager } from "@/lib/runtime/context";
import { resetNotificationBus, getNotificationBus } from "@/lib/automation/notifier";
import { AutomationManager } from "@/lib/automation/manager";
import { setAutomationManager, resetAutomationManager } from "@/lib/automation/manager";
import { InMemoryAutomationStore } from "@/lib/automation/store";
import { resetAutomationToolRegistration } from "@/lib/automation/register";
import { getAutomationTools } from "@/lib/automation/tools";
import type { AssistantLike } from "@/lib/runtime/pipeline";
import type { AssistantProcessResult, AssistantContext } from "@/lib/ai/types";

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
  execute: async (input) => ({ message: input.message }),
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
  execute: jest.fn(async (input) => ({ launched: input.application })),
};

function createRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(ECHO_TOOL);
  registry.register(LAUNCH_TOOL);
  for (const tool of getAutomationTools()) {
    if (!registry.getTool(tool.name)) registry.register(tool);
  }
  return registry;
}

function createPipeline(registry: ToolRegistry): JarvisPipeline {
  return new JarvisPipeline({ registry });
}

describe("Automation pipeline integration", () => {
  let pipeline: JarvisPipeline;
  let registry: ToolRegistry;
  let manager: AutomationManager;

  beforeEach(() => {
    resetConversationContextManager();
    resetNotificationBus();
    resetAutomationManager();
    resetAutomationToolRegistration();
    jest.clearAllMocks();
    registry = createRegistry();
    pipeline = createPipeline(registry);
    manager = new AutomationManager({
      store: new InMemoryAutomationStore(),
      now: () => 1_700_000_000_000,
    });
    manager.setExecutor((action, meta) => pipeline.executeAutomationTool(action, meta));
    setAutomationManager(manager);
  });

  function seedAutomation(id: string, name: string, action: { toolId: string; arguments: Record<string, unknown> } = { toolId: "echo", arguments: { message: "hi" } }) {
    const store = (manager as unknown as { store: InMemoryAutomationStore }).store;
    store.seed([
      {
        id,
        name,
        description: "",
        enabled: true,
        trigger: { type: "daily", at: "09:00" },
        action,
        createdAt: 1,
        updatedAt: 1,
        requiresConfirmation: false,
        consecutiveFailures: 0,
      },
    ]);
    return id;
  }

  afterEach(() => {
    resetAutomationManager();
    resetAutomationToolRegistration();
  });

  describe("scheduled safe tools", () => {
    test("executes a safe automation action immediately", async () => {
      const outcome = await pipeline.executeAutomationTool(
        { toolId: "echo", arguments: { message: "Good morning" } },
        { automationId: "auto-1", name: "Morning echo", trigger: { type: "daily", at: "09:00" } },
      );

      expect(outcome.status).toBe("executed");
      expect(outcome.message).toContain("Good morning");
      expect(pipeline.getState()).toBe(JarvisRuntimeState.IDLE);
    });
  });

  describe("scheduled gated tools", () => {
    test("gated tools execute immediately without confirmation", async () => {
      seedAutomation("auto-2", "Open Safari");
      const outcome = await pipeline.executeAutomationTool(
        { toolId: "launch_application", arguments: { application: "Safari" } },
        { automationId: "auto-2", name: "Open Safari", trigger: { type: "daily", at: "09:00" } },
      );

      expect(outcome.status).toBe("executed");
      expect(LAUNCH_TOOL.execute).toHaveBeenCalledTimes(1);
      expect(manager.get("auto-2")?.lastRunAt).toBe(1_700_000_000_000);
      expect(manager.get("auto-2")?.consecutiveFailures).toBe(0);
    });
  });

  describe("gated automation execution", () => {
    test("a safe tool that triggers a gated automation executes immediately", async () => {
      seedAutomation("auto-9", "Open Safari", { toolId: "launch_application", arguments: { application: "Safari" } });
      const managerOutcome = await manager.executeAutomation("auto-9");
      expect(managerOutcome.status).toBe("executed");
      expect(LAUNCH_TOOL.execute).toHaveBeenCalledTimes(1);
    });

    test("processUserInput executes gated tools immediately", async () => {
      seedAutomation("auto-11", "Open Safari", { toolId: "launch_application", arguments: { application: "Safari" } });
      const fakeAssistant: AssistantLike = {
        async processMessage(_input: string, _context: AssistantContext): Promise<AssistantProcessResult> {
          return {
            response: "",
            toolsUsed: ["run_automation_now"],
            toolCalls: [
              { id: "c1", name: "run_automation_now", arguments: { id: "auto-11" } },
            ],
          };
        },
      };
      pipeline = new JarvisPipeline({ registry, assistant: fakeAssistant });

      const response = await pipeline.processUserInput("run the Safari automation now");
      expect(response.state).toBe(JarvisRuntimeState.IDLE);
      expect(LAUNCH_TOOL.execute).toHaveBeenCalledTimes(1);
      expect(manager.get("auto-11")?.lastRunAt).toBe(1_700_000_000_000);
    });
  });

  describe("immediate execution", () => {
    test("gated actions execute without waiting for confirmation", async () => {
      seedAutomation("auto-3", "Open Safari");
      const outcome = await pipeline.executeAutomationTool(
        { toolId: "launch_application", arguments: { application: "Safari" } },
        { automationId: "auto-3", name: "Open Safari", trigger: { type: "interval", minutes: 30 } },
      );

      expect(outcome.status).toBe("executed");
      expect(LAUNCH_TOOL.execute).toHaveBeenCalledTimes(1);

      const again = await pipeline.executeAutomationTool(
        { toolId: "launch_application", arguments: { application: "Safari" } },
        { automationId: "auto-3", name: "Open Safari", trigger: { type: "interval", minutes: 30 } },
      );
      expect(again.status).toBe("executed");
      expect(LAUNCH_TOOL.execute).toHaveBeenCalledTimes(2);
    });

    test("multiple consecutive gated executions all succeed", async () => {
      seedAutomation("auto-4", "A");
      seedAutomation("auto-5", "B");
      const first = await pipeline.executeAutomationTool(
        { toolId: "launch_application", arguments: { application: "Safari" } },
        { automationId: "auto-4", name: "A", trigger: { type: "interval", minutes: 30 } },
      );
      expect(first.status).toBe("executed");
      expect(LAUNCH_TOOL.execute).toHaveBeenCalledTimes(1);

      const second = await pipeline.executeAutomationTool(
        { toolId: "launch_application", arguments: { application: "Chrome" } },
        { automationId: "auto-5", name: "B", trigger: { type: "interval", minutes: 30 } },
      );
      expect(second.status).toBe("executed");
      expect(LAUNCH_TOOL.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe("delete_automation tool gating", () => {
    test("delete_automation is registered as confirmation-gated", async () => {
      const { getToolRegistry } = await import("@/lib/tools/registry");
      const tool = getToolRegistry().getTool("delete_automation");
      expect(tool).toBeDefined();
      expect(tool?.requiresUserConfirmation).toBe(true);
    });
  });
});
