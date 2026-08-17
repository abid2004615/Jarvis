/**
 * JARVIS Personal Reminders — Tests
 *
 * Time-phrase parsing, reminder CRUD + repeat math, firing through the shared
 * NotificationBus (dedupe, one-time disable, daily/weekly reschedule), and the
 * scheduler-tick wiring that fires due reminders on the SINGLE existing loop.
 */

import { ReminderManager } from "@/lib/reminders/manager";
import { setReminderManager, getReminderManager } from "@/lib/reminders/manager";
import { InMemoryReminderStore } from "@/lib/reminders/store";
import { validateReminderInput, validateReminderUpdate, containsSecret } from "@/lib/reminders/validator";
import { advanceReminderDueAt, isReminderLike, toReminderSummary } from "@/lib/reminders/model";
import { REMINDER_LIMITS, type Reminder } from "@/lib/reminders/types";
import {
  parseReminderTime,
  parseRelativeTime,
  parseTimeOfDayPhrase,
  parseExactDateTime,
} from "@/lib/reminders/time";
import {
  CREATE_REMINDER_TOOL,
  LIST_REMINDERS_TOOL,
  GET_REMINDER_TOOL,
  UPDATE_REMINDER_TOOL,
  CANCEL_REMINDER_TOOL,
  DELETE_REMINDER_TOOL,
} from "@/lib/reminders/tools";
import { wireRemindersToScheduler, resetReminderWiring } from "@/lib/reminders/wiring";
import { AutomationScheduler, clearSchedulerTickHandlers } from "@/lib/automation/scheduler";
import { AutomationManager } from "@/lib/automation/manager";
import { InMemoryAutomationStore } from "@/lib/automation/store";
import { getNotificationBus, resetNotificationBus } from "@/lib/automation/notifier";

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "rem-1",
    title: "Stand up",
    dueAt: NOW,
    repeat: "none",
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    triggeredTimes: 0,
    ...overrides,
  };
}

describe("reminder time helpers", () => {
  test("parses relative phrases deterministically", () => {
    expect(parseRelativeTime("in 30 minutes", NOW)).toBe(NOW + 30 * MINUTE);
    expect(parseRelativeTime("in 2 hours", NOW)).toBe(NOW + 2 * HOUR);
    expect(parseRelativeTime("in 3 days", NOW)).toBe(NOW + 3 * DAY);
    expect(parseRelativeTime("in 1 week", NOW)).toBe(NOW + WEEK);
    expect(parseRelativeTime("in an hour", NOW)).toBe(NOW + HOUR);
    expect(parseRelativeTime("in half an hour", NOW)).toBe(NOW + 30 * MINUTE);
    expect(parseRelativeTime("tomorrow at noon", NOW)).toBeNull();
  });

  test("parses today/tomorrow at a time and rolls past times forward", () => {
    const morning = new Date(2023, 10, 15, 9, 0, 0).getTime();
    expect(parseTimeOfDayPhrase("today at 18:30", morning)).toBe(new Date(2023, 10, 15, 18, 30).getTime());
    expect(parseTimeOfDayPhrase("tomorrow at 08:00", morning)).toBe(new Date(2023, 10, 16, 8, 0).getTime());
    // Bare "at HH:MM" already past today rolls to tomorrow.
    expect(parseTimeOfDayPhrase("at 07:00", morning)).toBe(new Date(2023, 10, 16, 7, 0).getTime());
    expect(parseTimeOfDayPhrase("at 09:30", morning)).toBe(new Date(2023, 10, 15, 9, 30).getTime());
  });

  test("parses exact datetimes and rejects ambiguity", () => {
    expect(parseExactDateTime("2023-11-20 at 15:45")).toBe(new Date(2023, 10, 20, 15, 45).getTime());
    expect(parseExactDateTime("2023-11-20 08:05")).toBe(new Date(2023, 10, 20, 8, 5).getTime());
    expect(parseExactDateTime("sometime soon")).toBeNull();
  });

  test("parseReminderTime tries exact, then time-of-day, then relative", () => {
    expect(parseReminderTime("2023-11-20 at 15:45", NOW)).toBe(new Date(2023, 10, 20, 15, 45).getTime());
    expect(parseReminderTime("in 10 minutes", NOW)).toBe(NOW + 10 * MINUTE);
    expect(parseReminderTime("not a real time", NOW)).toBeNull();
  });
});

describe("reminder validator", () => {
  test("accepts a valid reminder", () => {
    expect(validateReminderInput({ title: "Coffee", dueAt: NOW + HOUR }).valid).toBe(true);
  });

  test("rejects unknown fields and missing title/dueAt", () => {
    expect(validateReminderInput({ title: "x" }).valid).toBe(false);
    expect(validateReminderInput({ dueAt: NOW + 1 }).valid).toBe(false);
    expect(validateReminderInput({ title: "x", dueAt: NOW + 1, firedAt: NOW }).valid).toBe(false);
    expect(validateReminderInput({ title: "x", dueAt: NOW + 1, id: "hack" }).valid).toBe(false);
  });

  test("rejects bad repeat, bad taskId, out-of-range dueAt, and secrets", () => {
    expect(validateReminderInput({ title: "x", dueAt: NOW + 1, repeat: "hourly" }).valid).toBe(false);
    expect(validateReminderInput({ title: "x", dueAt: NOW + 1, taskId: "a".repeat(101) }).valid).toBe(false);
    expect(validateReminderInput({ title: "x", dueAt: -1 }).valid).toBe(false);
    expect(validateReminderInput({ title: "store password", dueAt: NOW + 1 }).valid).toBe(false);
    expect(validateReminderInput({ title: "x", dueAt: NOW + 1, taskId: "my secret token" }).valid).toBe(false);
  });

  test("update patch only allows mutable fields and validates enabled as boolean", () => {
    expect(validateReminderUpdate({ title: "new" }).valid).toBe(true);
    expect(validateReminderUpdate({ enabled: false }).valid).toBe(true);
    expect(validateReminderUpdate({ enabled: "yes" }).valid).toBe(false);
    expect(validateReminderUpdate({ id: "nope" }).valid).toBe(false);
  });

  test("containsSecret is symmetric with the other modules", () => {
    expect(containsSecret("reset my token now").found).toBe(true);
    expect(containsSecret("gsk_abcdefghijklmnopqrstuvwxyz123456").found).toBe(true);
    expect(containsSecret("call the dentist").found).toBe(false);
  });
});

describe("reminder model", () => {
  test("isReminderLike validates stored records", () => {
    expect(isReminderLike(makeReminder())).toBe(true);
    expect(isReminderLike({ ...makeReminder(), repeat: "sometimes" })).toBe(false);
    expect(isReminderLike({ ...makeReminder(), dueAt: "now" })).toBe(false);
  });

  test("toReminderSummary never leaks internal fields", () => {
    const summary = toReminderSummary(makeReminder());
    expect(summary).not.toHaveProperty("triggeredTimes");
    expect(summary).not.toHaveProperty("updatedAt");
  });

  test("advanceReminderDueAt handles none/daily/weekly", () => {
    expect(advanceReminderDueAt(makeReminder({ repeat: "none" }), NOW)).toBe(NOW);
    expect(advanceReminderDueAt(makeReminder({ repeat: "daily" }), NOW)).toBe(NOW + DAY);
    expect(advanceReminderDueAt(makeReminder({ repeat: "weekly" }), NOW)).toBe(NOW + WEEK);
  });
});

describe("reminder manager", () => {
  let store: InMemoryReminderStore;
  let manager: ReminderManager;

  beforeEach(() => {
    resetNotificationBus();
    store = new InMemoryReminderStore();
    manager = new ReminderManager({ store, now: () => NOW });
    setReminderManager(manager);
  });

  afterEach(() => {
    setReminderManager(null);
    resetNotificationBus();
  });

  test("create stores a bounded reminder with defaults", () => {
    const created = manager.create({ title: "  Meeting  ", dueAt: NOW + HOUR });
    expect(created.error).toBeUndefined();
    expect(created.reminder?.title).toBe("Meeting");
    expect(created.reminder?.repeat).toBe("none");
    expect(created.reminder?.enabled).toBe(true);
    expect(created.reminder?.triggeredTimes).toBe(0);
    expect(manager.count()).toBe(1);
  });

  test("enforces the maximum reminder count", () => {
    for (let i = 0; i < REMINDER_LIMITS.MAX_REMINDERS; i += 1) {
      manager.create({ title: `r${i}`, dueAt: NOW + i });
    }
    expect(manager.create({ title: "overflow", dueAt: NOW + 1 }).error).toContain("Maximum");
  });

  test("update, enable, disable round-trip", () => {
    const { reminder } = manager.create({ title: "a", dueAt: NOW + 1 });
    expect(manager.update(reminder!.id, { title: "b", repeat: "daily" }).reminder?.repeat).toBe("daily");
    expect(manager.disable(reminder!.id).reminder?.enabled).toBe(false);
    expect(manager.enable(reminder!.id).reminder?.enabled).toBe(true);
  });

  test("disableRemindersForTask disables linked reminders", () => {
    const linked = manager.create({ title: "a", dueAt: NOW + 1, taskId: "task-9" });
    const other = manager.create({ title: "b", dueAt: NOW + 1, taskId: "task-8" });
    const { count } = manager.disableRemindersForTask("task-9");
    expect(count).toBe(1);
    expect(manager.get(linked.reminder!.id)?.enabled).toBe(false);
    expect(manager.get(other.reminder!.id)?.enabled).toBe(true);
  });

  test("dueReminders returns only enabled reminders whose time passed", () => {
    manager.create({ title: "past", dueAt: NOW - 1 });
    manager.create({ title: "future", dueAt: NOW + 1 });
    const disabled = manager.create({ title: "disabled past", dueAt: NOW - 1 });
    manager.disable(disabled.reminder!.id);
    const due = manager.dueReminders(NOW);
    expect(due.map((r) => r.title)).toEqual(["past"]);
  });

  test("fireReminder pushes a reminder notification and disables one-time", () => {
    const { reminder } = manager.create({ title: "Stand up", dueAt: NOW });
    const outcome = manager.fireReminder(reminder!.id);
    expect(outcome.fired).toBe(true);
    const notifications = getNotificationBus().getAll();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].category).toBe("reminder");
    expect(notifications[0].sourceId).toBe(reminder!.id);
    expect(notifications[0].body).toContain("Stand up");
    expect(manager.get(reminder!.id)?.enabled).toBe(false);
    expect(manager.get(reminder!.id)?.triggeredTimes).toBe(1);
  });

  test("daily/weekly reminders reschedule instead of disabling", () => {
    const daily = manager.create({ title: "daily", dueAt: NOW, repeat: "daily" });
    const weekly = manager.create({ title: "weekly", dueAt: NOW, repeat: "weekly" });
    manager.fireReminder(daily.reminder!.id);
    manager.fireReminder(weekly.reminder!.id);
    expect(manager.get(daily.reminder!.id)?.dueAt).toBe(NOW + DAY);
    expect(manager.get(weekly.reminder!.id)?.dueAt).toBe(NOW + WEEK);
    expect(manager.get(daily.reminder!.id)?.enabled).toBe(true);
    expect(manager.get(weekly.reminder!.id)?.enabled).toBe(true);
  });

  test("firing an unknown/disabled/in-flight reminder is a no-op", () => {
    expect(manager.fireReminder("missing").fired).toBe(false);
    const { reminder } = manager.create({ title: "x", dueAt: NOW });
    manager.disable(reminder!.id);
    expect(manager.fireReminder(reminder!.id).fired).toBe(false);
  });

  test("delete removes and clears in-flight state", () => {
    const { reminder } = manager.create({ title: "x", dueAt: NOW });
    expect(manager.delete(reminder!.id).success).toBe(true);
    expect(manager.count()).toBe(0);
    expect(manager.delete("missing").success).toBe(false);
  });
});

describe("reminder firing on the shared scheduler tick", () => {
  beforeEach(() => {
    resetNotificationBus();
    clearSchedulerTickHandlers();
    resetReminderWiring();
    setReminderManager(new ReminderManager({ store: new InMemoryReminderStore(), now: () => NOW }));
  });

  afterEach(() => {
    resetReminderWiring();
    clearSchedulerTickHandlers();
    setReminderManager(null);
    resetNotificationBus();
  });

  test("a scheduler tick fires due reminders through the wired handler", async () => {
    const reminderManager = getReminderManager();
    reminderManager.create({ title: "Tick", dueAt: NOW });
    wireRemindersToScheduler();

    const automationManager = new AutomationManager({ store: new InMemoryAutomationStore(), now: () => NOW });
    automationManager.setExecutor(async () => ({ status: "executed", message: "ok" }));
    const scheduler = new AutomationScheduler({ manager: automationManager, now: () => NOW });
    await scheduler.tick();
    scheduler.stop();

    const notifications = getNotificationBus().getAll();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].category).toBe("reminder");
    expect(reminderManager.get(reminderManager.getAll()[0].id)?.enabled).toBe(false);
  });

  test("a throwing tick handler never breaks the scheduler loop", async () => {
    wireRemindersToScheduler();
    // A pathological handler after the reminders handler.
    let threw = false;
    const { registerSchedulerTickHandler } = await import("@/lib/automation/scheduler");
    const unregister = registerSchedulerTickHandler(async () => {
      threw = true;
      throw new Error("boom");
    });

    const automationManager = new AutomationManager({ store: new InMemoryAutomationStore(), now: () => NOW });
    automationManager.setExecutor(async () => ({ status: "executed", message: "ok" }));
    const scheduler = new AutomationScheduler({ manager: automationManager, now: () => NOW });
    await expect(scheduler.tick()).resolves.toBeUndefined();
    scheduler.stop();
    unregister();
    expect(threw).toBe(true);
  });

  test("one-time reminders do not fire twice on consecutive ticks", async () => {
    const reminderManager = getReminderManager();
    reminderManager.create({ title: "Once", dueAt: NOW });
    wireRemindersToScheduler();
    const automationManager = new AutomationManager({ store: new InMemoryAutomationStore(), now: () => NOW });
    automationManager.setExecutor(async () => ({ status: "executed", message: "ok" }));
    const scheduler = new AutomationScheduler({ manager: automationManager, now: () => NOW });
    await scheduler.tick();
    await scheduler.tick();
    scheduler.stop();
    expect(getNotificationBus().count()).toBe(1);
  });
});

describe("reminder tools", () => {
  beforeEach(() => {
    resetNotificationBus();
    setReminderManager(new ReminderManager({ store: new InMemoryReminderStore(), now: () => NOW }));
  });

  afterEach(() => {
    setReminderManager(null);
    resetNotificationBus();
  });

  test("create_reminder requires concrete dueAt and returns a projection", async () => {
    const result = await CREATE_REMINDER_TOOL.execute({ title: "Water plants", dueAt: NOW + HOUR });
    expect(result.success).toBe(true);
    expect(result.reminder?.dueAt).toBe(NOW + HOUR);
    expect(result.reminder).not.toHaveProperty("triggeredTimes");
  });

  test("create_reminder without dueAt is rejected", async () => {
    const result = await CREATE_REMINDER_TOOL.execute({ title: "Water plants" });
    expect(result.success).toBe(false);
  });

  test("list/get/update/cancel round-trip", async () => {
    const created = await CREATE_REMINDER_TOOL.execute({ title: "a", dueAt: NOW + HOUR });
    const id = created.reminderId as string;
    expect((await GET_REMINDER_TOOL.execute({ id })).success).toBe(true);
    expect((await UPDATE_REMINDER_TOOL.execute({ id, title: "b" })).success).toBe(true);
    expect((await LIST_REMINDERS_TOOL.execute({})).count).toBe(1);
    expect((await CANCEL_REMINDER_TOOL.execute({ id })).success).toBe(true);
    expect(getReminderManager().get(id)?.enabled).toBe(false);
  });

  test("list_reminders upcomingOnly filters expired/disabled", async () => {
    const now = Date.now();
    await CREATE_REMINDER_TOOL.execute({ title: "past", dueAt: now - 1 });
    await CREATE_REMINDER_TOOL.execute({ title: "future", dueAt: now + HOUR });
    const upcoming = await LIST_REMINDERS_TOOL.execute({ upcomingOnly: true });
    expect(upcoming.count).toBe(1);
    expect(upcoming.reminders[0].title).toBe("future");
  });

  test("delete_reminder is confirmation-gated", async () => {
    expect(DELETE_REMINDER_TOOL.requiresUserConfirmation).toBe(true);
    expect(DELETE_REMINDER_TOOL.riskLevel).toBe("confirmation");
    expect((await DELETE_REMINDER_TOOL.execute({ id: "missing" })).success).toBe(false);
  });
});
