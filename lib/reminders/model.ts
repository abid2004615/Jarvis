/**
 * JARVIS Personal Reminders — Model helpers
 *
 * Structural validation of stored reminder records, client-safe projections,
 * and repeat scheduling math. Reminder records are data only — never executed.
 */

import type { Reminder, ReminderRepeat, ReminderSummary } from "./types";
import { REMINDER_REPEATS } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural check for stored reminder records (loaded from disk). */
export function isReminderLike(value: unknown): value is Reminder {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  if (typeof value.title !== "string" || value.title.length === 0) return false;
  if (typeof value.dueAt !== "number" || !Number.isFinite(value.dueAt)) return false;
  if (typeof value.repeat !== "string" || !REMINDER_REPEATS.includes(value.repeat as ReminderRepeat)) return false;
  if (typeof value.enabled !== "boolean") return false;
  if (typeof value.createdAt !== "number" || typeof value.updatedAt !== "number") return false;
  if (typeof value.triggeredTimes !== "number") return false;
  if (value.taskId !== undefined && typeof value.taskId !== "string") return false;
  if (value.firedAt !== undefined && typeof value.firedAt !== "number") return false;
  return true;
}

/** Client-safe projection: never includes internal fields. */
export function toReminderSummary(reminder: Reminder): ReminderSummary {
  return {
    id: reminder.id,
    title: reminder.title,
    dueAt: reminder.dueAt,
    repeat: reminder.repeat,
    taskId: reminder.taskId,
    enabled: reminder.enabled,
    createdAt: reminder.createdAt,
    firedAt: reminder.firedAt,
  };
}

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/** Advance a fired reminder's dueAt based on its repeat cadence. */
export function advanceReminderDueAt(reminder: Reminder, from: number): number {
  switch (reminder.repeat) {
    case "daily":
      return from + DAY_MS;
    case "weekly":
      return from + WEEK_MS;
    default:
      // One-time reminders do not advance; they are disabled after firing.
      return reminder.dueAt;
  }
}
