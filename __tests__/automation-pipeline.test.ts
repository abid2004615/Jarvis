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
      expect(pipeline.getPendingConfirmations()).toHaveLength(0);
    });
  });

  describe("scheduled gated tools", () => {
    test("pauses into WAITING_FOR_CONFIRMATION and does NOT execute", async () => {
      const outcome = await pipeline.executeAutomationTool(
        { toolId: "launch_application", arguments: { application: "Safari" } },
        { automationId: "auto-2", name: "Open Safari", trigger: { type: "daily", at: "09:00" } },
      );

      expect(outcome.status).toBe("waiting_for_confirmation");
      expect(pipeline.getState()).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);
      const pending = pipeline.getPendingConfirmations();
      expect(pending).toHaveLength(1);
      expect(pending[0].name).toBe("launch_application");
      expect(LAUNCH_TOOL.execute).not.toHaveBeenCalled();
    });

    test("approving the pending request executes the tool and records the run", async () => {
      seedAutomation("auto-2", "Open Safari");
      const outcome = await pipeline.executeAutomationTool(
        { toolId: "launch_application", arguments: { application: "Safari" } },
        { automationId: "auto-2", name: "Open Safari", trigger: { type: "daily", at: "09:00" } },
      );

      const pendingId = outcome.pendingConfirmationId!;
      const response = await pipeline.handleConfirmation({ toolId: pendingId, approved: true });

      expect(response.error).toBeUndefined();
      expect(LAUNCH_TOOL.execute).toHaveBeenCalledTimes(1);
      expect(manager.get("auto-2")?.lastRunAt).toBe(1_700_000_000_000);
      expect(manager.get("auto-2")?.consecutiveFailures).toBe(0);
    });

    test("denying the pending request cancels without recording a run", async () => {
      seedAutomation("auto-2", "Open Safari");
      const outcome = await pipeline.executeAutomationTool(
        { toolId: "launch_application", arguments: { application: "Safari" } },
        { automationId: "auto-2", name: "Open Safari", trigger: { type: "daily", at: "09:00" } },
      );

      const pendingId = outcome.pendingConfirmationId!;
      const response = await pipeline.handleConfirmation({ toolId: pendingId, approved: false, reason: "Not now" });

      expect(LAUNCH_TOOL.execute).not.toHaveBeenCalled();
      expect(manager.get("auto-2")?.lastRunAt).toBeUndefined();
      expect(response.message).toContain("Cancelled");
      expect(getNotificationBus().getAll().some((n) => n.title.includes("cancelled"))).toBe(true);
    });
  });

  describe("nested gated wait surfacing", () => {
    test("a safe tool that triggers a gated automation surfaces the pending confirmation", async () => {      seedAutomation("auto-9", "Open Safari", { toolId: "launch_application", arguments: { application: "Safari" } });
      // The safe tool executes a gated automation inside its body, exactly like
      // run_automation_now does. Simulate via the manager's executor path.
      const managerOutcome = await manager.executeAutomation("auto-9");
      expect(managerOutcome.status).toBe("waiting_for_confirmation");

      const pending = pipeline.getPendingConfirmations();
      expect(pending).toHaveLength(1);
      expect(pipeline.getState()).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);
    });

    test("approving the surfaced pending executes through the standard path", async () => {
      seedAutomation("auto-10", "Open Safari", { toolId: "launch_application", arguments: { application: "Safari" } });
      await manager.executeAutomation("auto-10");
      const pending = pipeline.getPendingConfirmations();
      const response = await pipeline.handleConfirmation({ toolId: pending[0].id, approved: true });
      expect(response.error).toBeUndefined();
      expect(LAUNCH_TOOL.execute).toHaveBeenCalledTimes(1);
      expect(manager.get("auto-10")?.lastRunAt).toBe(1_700_000_000_000);
    });

    test("processUserInput surfaces a nested gated wait as pendingConfirmation", async () => {
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
      expect(response.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);
      expect(response.pendingConfirmation).toBeDefined();
      expect(response.pendingConfirmation?.name).toBe("launch_application");
      expect(LAUNCH_TOOL.execute).not.toHaveBeenCalled();

      const confirmed = await pipeline.handleConfirmation({
        toolId: response.pendingConfirmation!.id,
        approved: true,
      });
      expect(confirmed.error).toBeUndefined();
      expect(LAUNCH_TOOL.execute).toHaveBeenCalledTimes(1);
      expect(manager.get("auto-11")?.lastRunAt).toBe(1_700_000_000_000);
    });
  });

  describe("no confirmation bypass", () => {
    test("a gated action cannot be executed without going through confirmation", async () => {      seedAutomation("auto-3", "Open Safari");
      const outcome = await pipeline.executeAutomationTool(
        { toolId: "launch_application", arguments: { application: "Safari" } },
        { automationId: "auto-3", name: "Open Safari", trigger: { type: "interval", minutes: 30 } },
      );

      expect(outcome.status).toBe("waiting_for_confirmation");
      expect(LAUNCH_TOOL.execute).not.toHaveBeenCalled();

      // A second trigger while the first is pending does not re-execute; it
      // stays gated. Simulating "scheduler wants to fire again":
      const again = await pipeline.executeAutomationTool(
        { toolId: "launch_application", arguments: { application: "Safari" } },
        { automationId: "auto-3", name: "Open Safari", trigger: { type: "interval", minutes: 30 } },
      );
      expect(again.status).toBe("waiting_for_confirmation");
      expect(LAUNCH_TOOL.execute).not.toHaveBeenCalled();
    });

    test("approving one pending request never auto-approves the next one", async () => {
      seedAutomation("auto-4", "A");
      seedAutomation("auto-5", "B");
      const first = await pipeline.executeAutomationTool(
        { toolId: "launch_application", arguments: { application: "Safari" } },
        { automationId: "auto-4", name: "A", trigger: { type: "interval", minutes: 30 } },
      );
      await pipeline.handleConfirmation({ toolId: first.pendingConfirmationId!, approved: true });
      expect(LAUNCH_TOOL.execute).toHaveBeenCalledTimes(1);

      const second = await pipeline.executeAutomationTool(
        { toolId: "launch_application", arguments: { application: "Chrome" } },
        { automationId: "auto-5", name: "B", trigger: { type: "interval", minutes: 30 } },
      );
      expect(second.status).toBe("waiting_for_confirmation");
      expect(LAUNCH_TOOL.execute).toHaveBeenCalledTimes(1);
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
