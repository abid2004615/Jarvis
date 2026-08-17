/**
 * JARVIS Personal Tasks — Model helpers
 *
 * Structural validation of stored task records and client-safe projections.
 * Task records are data only — they are never executed.
 */

import type { Task, TaskSummary } from "./types";
import { TASK_PRIORITIES, TASK_STATUSES } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural check for stored task records (loaded from disk). */
export function isTaskLike(value: unknown): value is Task {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  if (typeof value.title !== "string" || value.title.length === 0) return false;
  if (typeof value.status !== "string" || !TASK_STATUSES.includes(value.status as Task["status"])) return false;
  if (typeof value.priority !== "string" || !TASK_PRIORITIES.includes(value.priority as Task["priority"])) return false;
  if (typeof value.createdAt !== "number" || typeof value.updatedAt !== "number") return false;
  if (value.dueAt !== undefined && typeof value.dueAt !== "number") return false;
  if (value.completedAt !== undefined && typeof value.completedAt !== "number") return false;
  return true;
}

/** Client-safe projection: never includes internal fields. */
export function toTaskSummary(task: Task): TaskSummary {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    tags: task.tags ? [...task.tags] : undefined,
  };
}

/** Open tasks due today or overdue, oldest first. */
export function dueOrOverdueTasks(tasks: Task[], now: number): Task[] {
  const endOfToday = new Date(now).setHours(23, 59, 59, 999);
  return tasks
    .filter((t) => isTaskOpen(t) && t.dueAt !== undefined && t.dueAt <= endOfToday)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
}

/** True when a task is still open (not completed/cancelled). */
export function isTaskOpen(task: Task): boolean {
  return task.status !== "completed" && task.status !== "cancelled";
}
