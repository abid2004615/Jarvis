/**
 * JARVIS Personal Reminders — Manager
 *
 * Single authority for reminder CRUD and firing. The manager never executes
 * anything — firing pushes a bounded notification through the shared
 * NotificationBus. It does not import the pipeline or the scheduler (wiring
 * lives in lib/reminders/wiring.ts), so there is no execution path that could
 * bypass confirmation.
 *
 * Reminder storage is separate from automations, tasks, routines, and memory.
 */

import {
  REMINDER_LIMITS,
  type Reminder,
  type ReminderInput,
  type ReminderRepeat,
  type ReminderSummary,
} from "./types";
import { validateReminderInput, validateReminderUpdate } from "./validator";
import { advanceReminderDueAt, toReminderSummary } from "./model";
import { ReminderFileStore, type ReminderStore } from "./store";
import { getNotificationBus } from "@/lib/automation/notifier";

export interface ReminderManagerOptions {
  store?: ReminderStore;
  now?: () => number;
}

export interface ReminderManagerResult {
  reminder?: Reminder;
  error?: string;
}

export interface ReminderFireOutcome {
  fired: boolean;
  message: string;
  reminder?: Reminder;
}

export class ReminderManager {
  private readonly store: ReminderStore;
  private readonly now: () => number;
  private reminders: Reminder[] = [];
  private loaded = false;
  private readonly inFlight: Set<string> = new Set();

  constructor(options: ReminderManagerOptions = {}) {
    this.store = options.store ?? new ReminderFileStore();
    this.now = options.now ?? (() => Date.now());
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.reminders = this.store.load();
    this.loaded = true;
  }

  private persist(): void {
    this.store.save(this.reminders);
  }

  private static deterministicId(now: number): string {
    return `rem-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---------------------------------------------------------------- CRUD ---

  create(input: unknown): ReminderManagerResult {
    this.ensureLoaded();
    const validation = validateReminderInput(input);
    if (!validation.valid) {
      return { error: validation.error ?? "Invalid reminder" };
    }
    if (this.reminders.length >= REMINDER_LIMITS.MAX_REMINDERS) {
      return { error: `Maximum of ${REMINDER_LIMITS.MAX_REMINDERS} reminders reached` };
    }

    const now = this.now();
    const typed = input as ReminderInput;
    const reminder: Reminder = {
      id: ReminderManager.deterministicId(now),
      title: typed.title.trim(),
      dueAt: typed.dueAt,
      repeat: typed.repeat ?? "none",
      taskId: typed.taskId,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      triggeredTimes: 0,
    };

    this.reminders.push(reminder);
    this.persist();
    return { reminder: { ...reminder } };
  }

  list(): ReminderSummary[] {
    this.ensureLoaded();
    return this.reminders.map(toReminderSummary);
  }

  getAll(): Reminder[] {
    this.ensureLoaded();
    return this.reminders.map((r) => ({ ...r }));
  }

  get(id: string): Reminder | undefined {
    this.ensureLoaded();
    const found = this.reminders.find((r) => r.id === id);
    return found ? { ...found } : undefined;
  }

  /** Update mutable fields (title/dueAt/repeat/taskId/enabled). */
  update(id: string, patch: unknown): ReminderManagerResult {
    this.ensureLoaded();
    const index = this.reminders.findIndex((r) => r.id === id);
    if (index < 0) return { error: "Reminder not found" };

    const validation = validateReminderUpdate(patch);
    if (!validation.valid) {
      return { error: validation.error ?? "Invalid update" };
    }

    const current = this.reminders[index];
    const typed = patch as Partial<ReminderInput> & { enabled?: boolean };
    const now = this.now();
    if (typed.title !== undefined) current.title = typed.title.trim();
    if (typed.dueAt !== undefined) current.dueAt = typed.dueAt;
    if (typed.repeat !== undefined) current.repeat = typed.repeat as ReminderRepeat;
    if (typed.taskId !== undefined) current.taskId = typed.taskId;
    if (typed.enabled !== undefined) current.enabled = typed.enabled;
    current.updatedAt = now;

    this.persist();
    return { reminder: { ...current } };
  }

  enable(id: string): ReminderManagerResult {
    return this.update(id, { enabled: true });
  }

  disable(id: string): ReminderManagerResult {
    return this.update(id, { enabled: false });
  }

  /** Disable every reminder linked to a task (task completed/cancelled). */
  disableRemindersForTask(taskId: string): { count: number } {
    this.ensureLoaded();
    let count = 0;
    for (const reminder of this.reminders) {
      if (reminder.taskId === taskId && reminder.enabled) {
        reminder.enabled = false;
        reminder.updatedAt = this.now();
        count += 1;
      }
    }
    if (count > 0) this.persist();
    return { count };
  }

  delete(id: string): { success: boolean; error?: string } {
    this.ensureLoaded();
    const index = this.reminders.findIndex((r) => r.id === id);
    if (index < 0) return { success: false, error: "Reminder not found" };
    this.reminders.splice(index, 1);
    this.inFlight.delete(id);
    this.persist();
    return { success: true };
  }

  deleteAll(): { success: boolean; count: number } {
    this.ensureLoaded();
    const count = this.reminders.length;
    this.reminders = [];
    this.inFlight.clear();
    this.persist();
    return { success: true, count };
  }

  count(): number {
    this.ensureLoaded();
    return this.reminders.length;
  }

  // -------------------------------------------------------------- firing ---

  /** Enabled reminders whose dueAt has passed. */
  dueReminders(now?: number): Reminder[] {
    this.ensureLoaded();
    const t = now ?? this.now();
    return this.reminders
      .filter((r) => r.enabled && r.dueAt <= t)
      .sort((a, b) => a.dueAt - b.dueAt);
  }

  isInFlight(id: string): boolean {
    return this.inFlight.has(id);
  }

  /**
   * Fire one reminder now: push a notification, advance repeat cadence, and
   * disable one-time reminders. Never executes anything else.
   */
  fireReminder(id: string): ReminderFireOutcome {
    this.ensureLoaded();
    const reminder = this.reminders.find((r) => r.id === id);
    if (!reminder) return { fired: false, message: "Reminder not found" };
    if (!reminder.enabled) return { fired: false, message: "Reminder is disabled" };
    if (this.inFlight.has(id)) return { fired: false, message: "Reminder is already firing" };

    this.inFlight.add(id);
    try {
      const now = this.now();
      reminder.firedAt = now;
      reminder.triggeredTimes += 1;

      const repeatLabel =
        reminder.repeat === "daily" ? " (daily)" : reminder.repeat === "weekly" ? " (weekly)" : "";
      getNotificationBus().push({
        title: "Reminder",
        body: `${reminder.title}${repeatLabel}`,
        category: "reminder",
        sourceId: reminder.id,
        dedupeKey: `reminder-${reminder.id}-${reminder.dueAt}`,
      });

      if (reminder.repeat === "none") {
        reminder.enabled = false;
      } else {
        reminder.dueAt = advanceReminderDueAt(reminder, now);
      }
      reminder.updatedAt = now;
      this.persist();
      return { fired: true, message: `Reminder "${reminder.title}" fired.`, reminder: { ...reminder } };
    } finally {
      this.inFlight.delete(id);
    }
  }
}

let instance: ReminderManager | null = null;

export function getReminderManager(): ReminderManager {
  if (!instance) {
    instance = new ReminderManager();
  }
  return instance;
}

export function resetReminderManager(): void {
  instance = null;
}

export function setReminderManager(manager: ReminderManager | null): void {
  instance = manager;
}
