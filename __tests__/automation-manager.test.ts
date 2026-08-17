/**
 * JARVIS Automation — Manager Tests
 * CRUD, derived authorization, execution orchestration, rate limiting,
 * cooldowns, and failure backoff.
 */

import { AutomationManager } from "@/lib/automation/manager";
import { InMemoryAutomationStore } from "@/lib/automation/store";
import { getNotificationBus, resetNotificationBus } from "@/lib/automation/notifier";
import { AUTOMATION_LIMITS, type AutomationExecutionOutcome } from "@/lib/automation/types";

function setup(now = () => 1_700_000_000_000) {
  const store = new InMemoryAutomationStore();
  const manager = new AutomationManager({ store, now });
  return { store, manager, now };
}

function makeExecutor(outcome: Partial<AutomationExecutionOutcome> = {}) {
  return jest.fn(async (): Promise<AutomationExecutionOutcome> => ({
    status: "executed",
    message: "done",
    ...outcome,
  }));
}

describe("AutomationManager", () => {
  beforeEach(() => {
    resetNotificationBus();
  });

  describe("create", () => {
    test("creates a safe automation with derived requiresConfirmation=false", () => {
      const { manager } = setup();
      const result = manager.create({
        name: "Morning CPU",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      });
      expect(result.error).toBeUndefined();
      expect(result.automation?.requiresConfirmation).toBe(false);
      expect(result.automation?.enabled).toBe(true);
      expect(result.automation?.nextRunAt).toBeGreaterThan(1_700_000_000_000);
      expect(manager.count()).toBe(1);
    });

    test("creates a gated automation with derived requiresConfirmation=true", () => {
      const { manager } = setup();
      const result = manager.create({
        name: "Open Safari",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "launch_application", arguments: { application: "Safari" } },
      });
      expect(result.error).toBeUndefined();
      expect(result.automation?.requiresConfirmation).toBe(true);
    });

    test("rejects invalid input", () => {
      const { manager } = setup();
      const result = manager.create({ name: "bad", trigger: { type: "daily", at: "25:00" }, action: { toolId: "get_cpu_usage", arguments: {} } });
      expect(result.error).toBeDefined();
      expect(manager.count()).toBe(0);
    });

    test("rejects secret input", () => {
      const { manager } = setup();
      const result = manager.create({
        name: "bad",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "notify_user", arguments: { message: "password is hunter2" } },
      });
      expect(result.error).toContain("rejected");
      expect(manager.count()).toBe(0);
    });

    test("enforces the maximum number of automations", () => {
      const { manager } = setup();
      for (let i = 0; i < AUTOMATION_LIMITS.MAX_AUTOMATIONS; i += 1) {
        manager.create({
          name: `A${i}`,
          trigger: { type: "daily", at: "09:00" },
          action: { toolId: "get_cpu_usage", arguments: {} },
        });
      }
      const result = manager.create({
        name: "overflow",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      });
      expect(result.error).toContain("Maximum");
      expect(manager.count()).toBe(AUTOMATION_LIMITS.MAX_AUTOMATIONS);
    });
  });

  describe("update / enable / disable / delete", () => {
    test("updates mutable fields", () => {
      const { manager } = setup();
      const { automation } = manager.create({
        name: "Old",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      });
      const id = automation!.id;
      const result = manager.update(id, { name: "New name" });
      expect(result.automation?.name).toBe("New name");
    });

    test("update rejects authorization fields", () => {
      const { manager } = setup();
      const { automation } = manager.create({
        name: "Old",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      });
      const result = manager.update(automation!.id, { requiresConfirmation: false });
      expect(result.error).toContain("Unknown automation field");
    });

    test("enable and disable", () => {
      const { manager } = setup();
      const { automation } = manager.create({
        name: "A",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      });
      expect(manager.disable(automation!.id).automation?.enabled).toBe(false);
      expect(manager.enable(automation!.id).automation?.enabled).toBe(true);
    });

    test("delete removes the automation", () => {
      const { manager } = setup();
      const { automation } = manager.create({
        name: "A",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      });
      expect(manager.delete(automation!.id).success).toBe(true);
      expect(manager.get(automation!.id)).toBeUndefined();
    });

    test("disableAll disables everything without deleting", () => {
      const { manager } = setup();
      manager.create({ name: "A", trigger: { type: "daily", at: "09:00" }, action: { toolId: "get_cpu_usage", arguments: {} } });
      manager.create({ name: "B", trigger: { type: "daily", at: "10:00" }, action: { toolId: "get_battery_status", arguments: {} } });
      const { count } = manager.disableAll();
      expect(count).toBe(2);
      expect(manager.getAll().every((a) => !a.enabled)).toBe(true);
    });
  });

  describe("execution", () => {
    test("executes a safe automation via the injected executor", async () => {
      const { manager } = setup();
      const executor = makeExecutor();
      manager.setExecutor(executor);
      const { automation } = manager.create({
        name: "A",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      });

      const outcome = await manager.executeAutomation(automation!.id);
      expect(outcome.status).toBe("executed");
      expect(executor).toHaveBeenCalledTimes(1);
      expect(manager.get(automation!.id)?.lastRunAt).toBe(1_700_000_000_000);
    });

    test("does not execute a disabled automation", async () => {
      const { manager } = setup();
      const executor = makeExecutor();
      manager.setExecutor(executor);
      const { automation } = manager.create({
        name: "A",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      });
      manager.disable(automation!.id);

      const outcome = await manager.executeAutomation(automation!.id);
      expect(outcome.status).toBe("disabled");
      expect(executor).not.toHaveBeenCalled();
    });

    test("prevents overlapping executions", async () => {
      const { manager } = setup();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const executor = jest.fn(async (): Promise<AutomationExecutionOutcome> => {
        await gate;
        return { status: "executed", message: "done" };
      });
      manager.setExecutor(executor);
      const { automation } = manager.create({
        name: "A",
        trigger: { type: "interval", minutes: 30 },
        action: { toolId: "get_cpu_usage", arguments: {} },
      });

      const first = manager.executeAutomation(automation!.id);
      const second = await manager.executeAutomation(automation!.id);
      expect(second.status).toBe("skipped");
      release();
      await first;
    });

    test("rate limits per-hour executions", async () => {
      const { manager } = setup();
      const executor = makeExecutor();
      manager.setExecutor(executor);
      const { automation } = manager.create({
        name: "A",
        trigger: { type: "interval", minutes: 30 },
        action: { toolId: "get_cpu_usage", arguments: {} },
      });

      for (let i = 0; i < AUTOMATION_LIMITS.MAX_EXECUTIONS_PER_HOUR; i += 1) {
        await manager.executeAutomation(automation!.id);
      }
      const outcome = await manager.executeAutomation(automation!.id);
      expect(outcome.status).toBe("rate_limited");
    });

    test("returns not_found for a missing automation", async () => {
      const { manager } = setup();
      const outcome = await manager.executeAutomation("nope");
      expect(outcome.status).toBe("not_found");
    });

    test("skips when no executor is connected", async () => {
      const { manager } = setup();
      const { automation } = manager.create({
        name: "A",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      });
      const outcome = await manager.executeAutomation(automation!.id);
      expect(outcome.status).toBe("skipped");
    });

    test("surfaces gated outcome as waiting_for_confirmation without recording a run", async () => {
      const { manager } = setup();
      manager.setExecutor(makeExecutor({ status: "waiting_for_confirmation", pendingConfirmationId: "auto-1", message: "Open Safari?" }));
      const { automation } = manager.create({
        name: "Open Safari",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "launch_application", arguments: { application: "Safari" } },
      });

      const outcome = await manager.executeAutomation(automation!.id);
      expect(outcome.status).toBe("waiting_for_confirmation");
      expect(manager.get(automation!.id)?.lastRunAt).toBeUndefined();
      const notifications = getNotificationBus().getAll();
      expect(notifications.some((n) => n.body.includes("Open Safari"))).toBe(true);
    });
  });

  describe("failure backoff", () => {
    test("disables the automation after three consecutive failures and notifies", async () => {
      const { manager } = setup();
      manager.setExecutor(makeExecutor({ status: "failed", message: "boom" }));
      const { automation } = manager.create({
        name: "A",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      });

      for (let i = 0; i < AUTOMATION_LIMITS.MAX_CONSECUTIVE_FAILURES; i += 1) {
        await manager.executeAutomation(automation!.id);
      }

      const after = manager.get(automation!.id)!;
      expect(after.enabled).toBe(false);
      expect(after.lastResult).toBe("disabled");
      expect(after.consecutiveFailures).toBe(AUTOMATION_LIMITS.MAX_CONSECUTIVE_FAILURES);
      expect(getNotificationBus().getAll().some((n) => n.title.includes("disabled"))).toBe(true);
    });

    test("success resets the consecutive failure counter", async () => {
      const { manager } = setup();
      let shouldFail = true;
      manager.setExecutor(
        jest.fn(async (): Promise<AutomationExecutionOutcome> =>
          shouldFail ? { status: "failed", message: "boom" } : { status: "executed", message: "ok" },
        ),
      );
      const { automation } = manager.create({
        name: "A",
        trigger: { type: "daily", at: "09:00" },
        action: { toolId: "get_cpu_usage", arguments: {} },
      });

      await manager.executeAutomation(automation!.id);
      shouldFail = false;
      await manager.executeAutomation(automation!.id);
      expect(manager.get(automation!.id)?.consecutiveFailures).toBe(0);
    });
  });

  describe("condition evaluation", () => {
    test("matches a numeric threshold", () => {
      const { manager } = setup();
      const result = manager.evaluateCondition(
        {
          id: "a",
          name: "Battery",
          description: "",
          enabled: true,
          trigger: { type: "condition", metric: "battery", operator: "<", value: 20 },
          action: { toolId: "notify_user", arguments: { message: "low" } },
          createdAt: 1,
          updatedAt: 1,
          requiresConfirmation: false,
          consecutiveFailures: 0,
        },
        { battery: 19 },
      );
      expect(result.matched).toBe(true);
    });

    test("does not match when above threshold", () => {
      const { manager } = setup();
      const result = manager.evaluateCondition(
        {
          id: "a",
          name: "Battery",
          description: "",
          enabled: true,
          trigger: { type: "condition", metric: "battery", operator: "<", value: 20 },
          action: { toolId: "notify_user", arguments: { message: "low" } },
          createdAt: 1,
          updatedAt: 1,
          requiresConfirmation: false,
          consecutiveFailures: 0,
        },
        { battery: 21 },
      );
      expect(result.matched).toBe(false);
    });

    test("matches application running condition", () => {
      const { manager } = setup();
      const result = manager.evaluateCondition(
        {
          id: "a",
          name: "Safari",
          description: "",
          enabled: true,
          trigger: { type: "condition", metric: "application", operator: "running", value: "Safari" },
          action: { toolId: "notify_user", arguments: { message: "hi" } },
          createdAt: 1,
          updatedAt: 1,
          requiresConfirmation: false,
          consecutiveFailures: 0,
        },
        { applications: ["Safari", "Terminal"] },
      );
      expect(result.matched).toBe(true);
    });

    test("matches application not_running condition", () => {
      const { manager } = setup();
      const result = manager.evaluateCondition(
        {
          id: "a",
          name: "Safari",
          description: "",
          enabled: true,
          trigger: { type: "condition", metric: "application", operator: "not_running", value: "Chrome" },
          action: { toolId: "notify_user", arguments: { message: "hi" } },
          createdAt: 1,
          updatedAt: 1,
          requiresConfirmation: false,
          consecutiveFailures: 0,
        },
        { applications: ["Safari"] },
      );
      expect(result.matched).toBe(true);
    });
  });
});
