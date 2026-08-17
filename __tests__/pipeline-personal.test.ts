/**
 * JARVIS Personal Layer — Pipeline Integration Tests
 *
 * The personal layer must NEVER bypass the runtime system:
 *  - constructing a pipeline registers the personal tool set in the shared registry
 *  - routine steps run through the SAME ActionChain as conversation (safe steps
 *    execute in order, confirmation-gated steps pause for approval)
 *  - the routine manager's injected runner is the pipeline (no direct execution)
 *  - reminder firing rides the SINGLE shared scheduler tick
 */

import { JarvisPipeline } from "@/lib/runtime/pipeline";
import { JarvisRuntimeState } from "@/lib/runtime/types";
import { ToolRegistry } from "@/lib/tools/types";
import type { ToolDefinition } from "@/lib/tools/types";
import { getToolRegistry, resetToolRegistry } from "@/lib/tools/registry";
import { resetConversationContextManager } from "@/lib/runtime/context";
import { resetNotificationBus, getNotificationBus } from "@/lib/automation/notifier";
import { resetAutomationManager, setAutomationManager, AutomationManager } from "@/lib/automation/manager";
import { InMemoryAutomationStore } from "@/lib/automation/store";
import { resetTaskToolRegistration } from "@/lib/tasks/register";
import { resetReminderToolRegistration } from "@/lib/reminders/register";
import { resetRoutineToolRegistration } from "@/lib/routines/register";
import { resetBriefingToolRegistration } from "@/lib/briefing/register";
import { resetReminderWiring } from "@/lib/reminders/wiring";
import { resetRoutineWiring } from "@/lib/routines/wiring";
import { clearSchedulerTickHandlers } from "@/lib/automation/scheduler";
import { AutomationScheduler } from "@/lib/automation/scheduler";
import { getRoutineManager, resetRoutineManager, setRoutineManager, RoutineManager } from "@/lib/routines/manager";
import { InMemoryRoutineStore } from "@/lib/routines/store";
import { getReminderManager, setReminderManager, resetReminderManager, ReminderManager } from "@/lib/reminders/manager";
import { InMemoryReminderStore } from "@/lib/reminders/store";

const NOW = 1_700_000_000_000;

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
  execute: jest.fn(async (input) => ({ echoed: input.message })),
};

const GATED_TOOL: ToolDefinition = {
  name: "launch_test_app",
  description: "Gated test tool",
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
  registry.register(GATED_TOOL);
  return registry;
}

describe("Personal layer pipeline integration", () => {
  let registry: ToolRegistry;
  let pipeline: JarvisPipeline;

  beforeEach(() => {
    jest.clearAllMocks();
    resetToolRegistry();
    resetConversationContextManager();
    resetNotificationBus();
    resetAutomationManager();
    resetRoutineManager();
    resetReminderManager();
    resetTaskToolRegistration();
    resetReminderToolRegistration();
    resetRoutineToolRegistration();
    resetBriefingToolRegistration();
    resetReminderWiring();
    resetRoutineWiring();
    clearSchedulerTickHandlers();

    setAutomationManager(new AutomationManager({ store: new InMemoryAutomationStore(), now: () => NOW }));
    setRoutineManager(new RoutineManager({ store: new InMemoryRoutineStore(), now: () => NOW }));
    setReminderManager(new ReminderManager({ store: new InMemoryReminderStore(), now: () => NOW }));

    registry = createRegistry();
    pipeline = new JarvisPipeline({ registry });
  });

  afterEach(() => {
    resetAutomationManager();
    resetRoutineManager();
    resetReminderManager();
    resetReminderWiring();
    resetRoutineWiring();
    clearSchedulerTickHandlers();
    resetToolRegistry();
  });

  describe("tool registration", () => {
    test("constructing a pipeline registers the personal tool set", () => {
      const shared = getToolRegistry();
      for (const name of ["create_task", "list_tasks", "complete_task", "delete_task"]) {
        expect(shared.getTool(name)).toBeDefined();
      }
      for (const name of ["create_reminder", "cancel_reminder", "delete_reminder"]) {
        expect(shared.getTool(name)).toBeDefined();
      }
      for (const name of ["create_routine", "run_routine", "delete_routine"]) {
        expect(shared.getTool(name)).toBeDefined();
      }
      expect(shared.getTool("get_daily_briefing")).toBeDefined();
    });

    test("gated personal tools remain confirmation-gated", () => {
      const shared = getToolRegistry();
      expect(shared.getTool("delete_task")?.requiresUserConfirmation).toBe(true);
      expect(shared.getTool("delete_reminder")?.requiresUserConfirmation).toBe(true);
      expect(shared.getTool("delete_routine")?.requiresUserConfirmation).toBe(true);
      expect(shared.getTool("create_task")?.riskLevel).toBe("safe");
    });
  });

  describe("runRoutineSteps (routine runner)", () => {
    test("executes safe steps in order through the ActionChain", async () => {
      const response = await pipeline.runRoutineSteps(
        [
          { toolId: "echo", arguments: { message: "first" } },
          { toolId: "echo", arguments: { message: "second" } },
        ],
        { routineId: "r1", name: "Morning" },
      );

      expect(ECHO_TOOL.execute).toHaveBeenCalledTimes(2);
      expect(ECHO_TOOL.execute).toHaveBeenNthCalledWith(1, { message: "first" });
      expect(ECHO_TOOL.execute).toHaveBeenNthCalledWith(2, { message: "second" });
      expect(response.state).toBe(JarvisRuntimeState.IDLE);
      expect(pipeline.getPendingConfirmations()).toHaveLength(0);
    });

    test("pauses a confirmation-gated step and does NOT execute it", async () => {
      const response = await pipeline.runRoutineSteps(
        [
          { toolId: "echo", arguments: { message: "hi" } },
          { toolId: "launch_test_app", arguments: { application: "Safari" } },
        ],
        { routineId: "r2", name: "Open apps" },
      );

      expect(response.state).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);
      expect(response.pendingConfirmation).toBeDefined();
      expect(response.pendingConfirmation?.name).toBe("launch_test_app");
      expect(GATED_TOOL.execute).not.toHaveBeenCalled();
      expect(ECHO_TOOL.execute).toHaveBeenCalledTimes(1);
    });

    test("approving the pending step executes it and continues the chain", async () => {
      const response = await pipeline.runRoutineSteps(
        [
          { toolId: "launch_test_app", arguments: { application: "Safari" } },
          { toolId: "echo", arguments: { message: "after" } },
        ],
        { routineId: "r3", name: "Open and confirm" },
      );

      const confirmed = await pipeline.handleConfirmation({
        toolId: response.pendingConfirmation!.id,
        approved: true,
      });

      expect(confirmed.error).toBeUndefined();
      expect(GATED_TOOL.execute).toHaveBeenCalledTimes(1);
      expect(GATED_TOOL.execute).toHaveBeenCalledWith({ application: "Safari" });
      expect(ECHO_TOOL.execute).toHaveBeenCalledWith({ message: "after" });
      expect(pipeline.getState()).toBe(JarvisRuntimeState.IDLE);
    });

    test("denying the pending step marks it denied and continues without executing", async () => {
      const response = await pipeline.runRoutineSteps(
        [
          { toolId: "echo", arguments: { message: "one" } },
          { toolId: "launch_test_app", arguments: { application: "Safari" } },
          { toolId: "echo", arguments: { message: "two" } },
        ],
        { routineId: "r4", name: "Mixed" },
      );

      const denied = await pipeline.handleConfirmation({
        toolId: response.pendingConfirmation!.id,
        approved: false,
        reason: "Not now",
      });

      expect(GATED_TOOL.execute).not.toHaveBeenCalled();
      expect(ECHO_TOOL.execute).toHaveBeenCalledTimes(2);
      expect(denied.message).toContain("Cancelled");
    });
  });

  describe("routine manager runner wiring", () => {
    test("getRoutineManager().runRoutine executes through the pipeline", async () => {
      const manager = getRoutineManager();
      const created = manager.create({
        name: "Standup",
        steps: [{ toolId: "echo", arguments: { message: "stand up" } }],
      });
      const id = created.routine!.id;

      const outcome = await manager.runRoutine(id);

      expect(outcome.success).toBe(true);
      expect(ECHO_TOOL.execute).toHaveBeenCalledWith({ message: "stand up" });
      expect(manager.get(id)?.lastRunAt).toBe(NOW);
      expect(manager.get(id)?.lastRunStatus).toBe("success");
    });

    test("a routine with a gated step surfaces the pipeline confirmation", async () => {
      if (!getToolRegistry().getTool(GATED_TOOL.name)) {
        getToolRegistry().register(GATED_TOOL);
      }
      const manager = getRoutineManager();
      const created = manager.create({
        name: "Gated",
        steps: [{ toolId: "launch_test_app", arguments: { application: "Safari" } }],
      });
      const outcome = await manager.runRoutine(created.routine!.id);

      expect(outcome.status).toBe("waiting_for_confirmation");
      expect(GATED_TOOL.execute).not.toHaveBeenCalled();
      expect(pipeline.getState()).toBe(JarvisRuntimeState.WAITING_FOR_CONFIRMATION);
    });
  });

  describe("reminder wiring on the shared scheduler", () => {
    test("a scheduler tick fires due reminders wired by the pipeline", async () => {
      const reminderManager = getReminderManager();
      reminderManager.create({ title: "Pipeline reminder", dueAt: NOW });

      const automationManager = new AutomationManager({ store: new InMemoryAutomationStore(), now: () => NOW });
      automationManager.setExecutor(async () => ({ status: "executed", message: "ok" }));
      const scheduler = new AutomationScheduler({ manager: automationManager, now: () => NOW });
      await scheduler.tick();
      scheduler.stop();

      const notifications = getNotificationBus().getAll();
      expect(notifications.some((n) => n.category === "reminder" && n.body.includes("Pipeline reminder"))).toBe(true);
      expect(reminderManager.getAll().every((r) => !r.enabled)).toBe(true);
    });
  });
});
