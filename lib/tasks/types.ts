/**
 * JARVIS Personal Tasks — Types
 *
 * Local, bounded task storage. Tasks are data, never executable: fields are
 * validated (no secrets, no commands, no paths) and tasks are separate from
 * memory, conversation context, automations, reminders, and routines.
 */

export type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  tags?: string[];
}

/** Input accepted from the model/API. The client can NEVER set id, timestamps, or status-trust. */
export interface TaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueAt?: number;
  tags?: string[];
}

/** Validation outcome. */
export interface TaskValidationResult {
  valid: boolean;
  error?: string;
}

/** Serialized on-disk shape. */
export interface TaskStoreData {
  version: number;
  updatedAt: number;
  tasks: Task[];
}

/** Client-safe projection: never includes internal fields. */
export interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: number;
  createdAt: number;
  completedAt?: number;
  tags?: string[];
}

export const TASK_LIMITS = {
  MAX_TASKS: 200,
  MAX_TITLE: 200,
  MAX_DESCRIPTION: 1000,
  MAX_TAGS: 10,
  MAX_TAG_LENGTH: 30,
} as const;

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "completed", "cancelled"];
export const TASK_PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

export const TASK_STORAGE_DIR = ".jarvis";
export const TASK_STORAGE_FILE = "tasks.json";

/** Human label for a task status. */
export function taskStatusLabel(status: TaskStatus): string {
  return status.replace("_", " ");
}

/** Human label for a task priority. */
export function taskPriorityLabel(priority: TaskPriority): string {
  return priority;
}
