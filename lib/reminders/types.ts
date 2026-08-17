/**
 * JARVIS Personal Reminders — Type Definitions
 *
 * Reminders are lightweight user-controlled "notify me at X" records. They are
 * data, never executable, and their storage is separate from automations,
 * tasks, routines, memory, and conversation context.
 *
 * Firing uses the EXISTING single scheduler (no second loop): the reminder
 * manager exposes due/fire methods that the shared scheduler invokes on its
 * tick via a registered handler.
 */

export type ReminderRepeat = "none" | "daily" | "weekly";

export interface Reminder {
  id: string;
  title: string;
  /** Next due time (ms timestamp). */
  dueAt: number;
  repeat: ReminderRepeat;
  /** Optional link to a task id. */
  taskId?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  /** Last time the reminder actually fired. */
  firedAt?: number;
  /** Total number of firings. */
  triggeredTimes: number;
}

/** Input accepted from the model/API. The client can never set id/timestamps. */
export interface ReminderInput {
  title: string;
  dueAt: number;
  repeat?: ReminderRepeat;
  taskId?: string;
}

/** Validation outcome. */
export interface ReminderValidationResult {
  valid: boolean;
  error?: string;
}

/** Client-safe projection. */
export interface ReminderSummary {
  id: string;
  title: string;
  dueAt: number;
  repeat: ReminderRepeat;
  taskId?: string;
  enabled: boolean;
  createdAt: number;
  firedAt?: number;
}

/** Serialized on-disk shape. */
export interface ReminderStoreData {
  version: number;
  updatedAt: number;
  reminders: Reminder[];
}

export const REMINDER_STORAGE_DIR = ".jarvis";
export const REMINDER_STORAGE_FILE = "reminders.json";

export const REMINDER_LIMITS = {
  MAX_REMINDERS: 100,
  MAX_TITLE: 200,
  /** A reminder further than this is rejected as out of range (~100 years). */
  MAX_DUE_AT: 4_102_444_800_000,
} as const;

export const REMINDER_REPEATS: ReminderRepeat[] = ["none", "daily", "weekly"];

/** Human label for a reminder repeat. */
export function reminderRepeatLabel(repeat: ReminderRepeat): string {
  if (repeat === "daily") return "daily";
  if (repeat === "weekly") return "weekly";
  return "once";
}
