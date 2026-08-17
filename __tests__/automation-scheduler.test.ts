/**
 * JARVIS Automation — Scheduler Tests
 * Controlled ticking, due-fire, duplicate prevention, condition watchers with
 * hysteresis + cooldown, and restart (schedule recompute) behavior.
 */

import { AutomationManager } from "@/lib/automation/manager";
import { AutomationScheduler } from "@/lib/automation/scheduler";
import { InMemoryAutomationStore } from "@/lib/automation/store";
import { getNotificationBus, resetNotificationBus } from "@/lib/automation/notifier";
import type { Automation, AutomationExecutionOutcome } from "@/lib/automation/types";

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "auto-1",
    name: "Test",
    description: "",
    enabled: true,
    trigger: { type: "daily", at: "09:00" },
    action: { toolId: "get_cpu_usage", arguments: {} },
    createdAt: 1,
    updatedAt: 1,
    requiresConfirmation: false,
    consecutiveFailures: 0,
    ...overrides,
  };
}

describe("AutomationScheduler", () => {
  let store: InMemoryAutomationStore;
  let now: number;
  let manager: AutomationManager;
  let scheduler: AutomationScheduler;
  let executor: jest.Mock;

  beforeEach(() => {
    resetNotificationBus();
    now = 1_700_000_000_000;
    store = new InMemoryAutomationStore();
    manager = new AutomationManager({ store, now: () => now });
    executor = jest.fn(async (): Promise<AutomationExecutionOutcome> => ({
      status: "executed",
      message: "done",
    }));
    manager.setExecutor(executor);
    scheduler = new AutomationScheduler({ manager, tickMs: 60_000, now: () => now });
  });

  afterEach(() => {
    scheduler.stop();
  });

  test("fires a due scheduled automation", async () => {
    store.seed([
      makeAutomation({ id: "due", nextRunAt: now - 1000 }),
    ]);
    await scheduler.tick();
    expect(executor).toHaveBeenCalledTimes(1);
  });

  test("does not fire an automation whose next run is in the future", async () => {
    store.seed([
      makeAutomation({ id: "future", nextRunAt: now + 60_000 }),
    ]);
    await scheduler.tick();
    expect(executor).not.toHaveBeenCalled();
  });

  test("does not fire disabled automations", async () => {
    store.seed([makeAutomation({ id: "off", enabled: false, nextRunAt: now - 1000 })]);
    await scheduler.tick();
    expect(executor).not.toHaveBeenCalled();
  });

  test("skips automations already in flight (no overlap)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowExecutor = jest.fn(async (): Promise<AutomationExecutionOutcome> => {
      await gate;
      return { status: "executed", message: "done" };
    });
    manager.setExecutor(slowExecutor);
    store.seed([makeAutomation({ id: "a", nextRunAt: now - 1000 })]);
    store.seed([makeAutomation({ id: "b", nextRunAt: now - 1000 })]);

    const first = scheduler.tick();
    // Immediately start a second tick while the first is still running.
    await scheduler.tick();
    release();
    await first;
    // Only the first tick's executions ran (executor runs serialized).
    expect(slowExecutor).toHaveBeenCalledTimes(1);
  });

  test("advances nextRunAt after a successful run", async () => {
    store.seed([makeAutomation({ id: "a", trigger: { type: "interval", minutes: 30 }, nextRunAt: now - 1 })]);
    await scheduler.tick();
    const after = manager.get("a")!;
    expect(after.lastRunAt).toBe(now);
    expect(after.nextRunAt).toBe(now + 30 * 60_000);
  });

  test("recomputes schedules on restart (start recovery)", () => {
    store.seed([makeAutomation({ id: "a", nextRunAt: undefined })]);
    scheduler.start();
    const after = manager.get("a")!;
    expect(after.nextRunAt).toBeGreaterThan(now);
    scheduler.stop();
  });

  describe("condition watchers", () => {
    function conditionAutomation(overrides: Partial<Automation> = {}): Automation {
      return makeAutomation({
        id: "cond",
        name: "Low battery",
        trigger: { type: "condition", metric: "battery", operator: "<", value: 20 },
        action: { toolId: "notify_user", arguments: { message: "Battery is low" } },
        nextRunAt: now,
        ...overrides,
      });
    }

    test("notifies once when the condition is matched", async () => {
      manager.setConditionReader(() => ({ battery: 19 }));
      store.seed([conditionAutomation()]);

      await scheduler.tick();

      expect(executor).toHaveBeenCalledTimes(1);
      const notifications = getNotificationBus().getAll();
      expect(notifications.length).toBeGreaterThan(0);
      expect(manager.get("cond")?.conditionArmed).toBe(true);
    });

    test("does NOT re-notify while the condition remains true (hysteresis)", async () => {
      manager.setConditionReader(() => ({ battery: 19 }));
      store.seed([conditionAutomation()]);

      await scheduler.tick();
      const afterFirst = getNotificationBus().count();

      // Second poll, still below threshold — must not notify again.
      await scheduler.tick();
      await scheduler.tick();
      expect(getNotificationBus().count()).toBe(afterFirst);
      expect(executor).toHaveBeenCalledTimes(1);
    });

    test("re-arms and notifies again after the condition resets", async () => {
      let battery = 19;
      manager.setConditionReader(() => ({ battery }));
      store.seed([conditionAutomation()]);

      await scheduler.tick();
      expect(getNotificationBus().count()).toBeGreaterThan(0);
      expect(manager.get("cond")?.conditionArmed).toBe(true);

      battery = 21;
      await scheduler.tick();
      expect(manager.get("cond")?.conditionArmed).toBe(false);

      // Advance past the 5-minute notification cooldown, then re-trigger.
      now += 6 * 60_000;
      battery = 19;
      await scheduler.tick();
      const notifications = getNotificationBus().getAll();
      expect(notifications.filter((n) => n.automationId === "cond").length).toBe(2);
    });

    test("honors the notification cooldown", async () => {
      let battery = 19;
      manager.setConditionReader(() => ({ battery }));
      store.seed([conditionAutomation()]);

      await scheduler.tick();
      const afterFirst = getNotificationBus().count();
      expect(afterFirst).toBeGreaterThan(0);

      // Reset, then re-trigger within the cooldown window.
      battery = 21;
      await scheduler.tick();
      battery = 19;
      await scheduler.tick();

      // Still inside the 5-minute cooldown: no second notification, but the
      // condition is armed so it never notifies later while continuously true.
      expect(getNotificationBus().count()).toBe(afterFirst);
    });

    test("does not fire condition when disabled", async () => {
      manager.setConditionReader(() => ({ battery: 10 }));
      store.seed([conditionAutomation({ enabled: false })]);
      await scheduler.tick();
      expect(executor).not.toHaveBeenCalled();
    });
  });
});
