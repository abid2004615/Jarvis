/**
 * JARVIS Personal Reminders — Scheduler Wiring
 *
 * Connects reminder firing to the EXISTING single scheduler loop via
 * registerSchedulerTickHandler. There is deliberately no second scheduler:
 * reminders run on the same tick as automations.
 *
 * Firing only pushes a bounded notification — there is no execution path here
 * and therefore nothing to bypass.
 */

import { registerSchedulerTickHandler } from "@/lib/automation/scheduler";
import { getReminderManager } from "./manager";

let wired = false;

/** Register reminder firing on the shared scheduler tick (idempotent). */
export function wireRemindersToScheduler(): () => void {
  if (wired) return () => undefined;
  wired = true;
  return registerSchedulerTickHandler(async (now) => {
    const manager = getReminderManager();
    const due = manager.dueReminders(now);
    for (const reminder of due) {
      if (manager.isInFlight(reminder.id)) continue;
      manager.fireReminder(reminder.id);
    }
  });
}

export function resetReminderWiring(): void {
  wired = false;
}
