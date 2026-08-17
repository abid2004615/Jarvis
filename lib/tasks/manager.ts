/**
 * JARVIS Personal Tasks — Manager
 *
 * Single authority for task CRUD, status transitions, and bounded persistence.
 * Tasks are data — the manager never executes anything. The manager does not
 * import the pipeline or the tool registry (no cycles).
 *
 * Task storage is separate from memory, automations, reminders, and routines.
 */

import {
  TASK_LIMITS,
  type Task,
  type TaskInput,
  type TaskPriority,
  type TaskStatus,
  type TaskSummary,
} from "./types";
import { validateTaskInput, validateTaskUpdate } from "./validator";
import { toTaskSummary } from "./model";
import { InMemoryTaskStore, TaskFileStore, type TaskStore } from "./store";

export interface TaskManagerOptions {
  store?: TaskStore;
  now?: () => number;
}

export interface TaskManagerResult {
  task?: Task;
  error?: string;
}

export class TaskManager {
  private readonly store: TaskStore;
  private readonly now: () => number;
  private tasks: Task[] = [];
  private loaded = false;

  constructor(options: TaskManagerOptions = {}) {
    this.store = options.store ?? new TaskFileStore();
    this.now = options.now ?? (() => Date.now());
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.tasks = this.store.load();
    this.loaded = true;
  }

  private persist(): void {
    this.store.save(this.tasks);
  }

  private static deterministicId(now: number): string {
    return `task-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---------------------------------------------------------------- CRUD ---

  create(input: unknown): TaskManagerResult {
    this.ensureLoaded();
    const validation = validateTaskInput(input);
    if (!validation.valid) {
      return { error: validation.error ?? "Invalid task" };
    }
    if (this.tasks.length >= TASK_LIMITS.MAX_TASKS) {
      return { error: `Maximum of ${TASK_LIMITS.MAX_TASKS} tasks reached` };
    }

    const now = this.now();
    const typed = input as TaskInput;
    const task: Task = {
      id: TaskManager.deterministicId(now),
      title: typed.title.trim(),
      description: typed.description?.trim() ?? undefined,
      status: "todo",
      priority: typed.priority ?? "normal",
      dueAt: typed.dueAt,
      createdAt: now,
      updatedAt: now,
      tags: typed.tags && typed.tags.length > 0 ? [...typed.tags] : undefined,
    };

    this.tasks.push(task);
    this.persist();
    return { task: { ...task } };
  }

  list(): TaskSummary[] {
    this.ensureLoaded();
    return this.tasks.map(toTaskSummary);
  }

  getAll(): Task[] {
    this.ensureLoaded();
    return this.tasks.map((t) => ({ ...t }));
  }

  get(id: string): Task | undefined {
    this.ensureLoaded();
    const found = this.tasks.find((t) => t.id === id);
    return found ? { ...found } : undefined;
  }

  /**
   * Update mutable fields. Only title/description/priority/dueAt/tags are
   * accepted; status transitions go through setStatus (complete/cancel).
   */
  update(id: string, patch: unknown): TaskManagerResult {
    this.ensureLoaded();
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index < 0) return { error: "Task not found" };

    const validation = validateTaskUpdate(id, patch);
    if (!validation.valid) {
      return { error: validation.error ?? "Invalid update" };
    }

    const current = this.tasks[index];
    const typed = patch as Partial<TaskInput>;
    const now = this.now();
    if (typed.title !== undefined) current.title = typed.title.trim();
    if (typed.description !== undefined) current.description = typed.description.trim() || undefined;
    if (typed.priority !== undefined) current.priority = typed.priority as TaskPriority;
    if (typed.dueAt !== undefined) current.dueAt = typed.dueAt;
    if (typed.tags !== undefined) current.tags = typed.tags.length > 0 ? [...typed.tags] : undefined;
    current.updatedAt = now;

    this.persist();
    return { task: { ...current } };
  }

  /** Apply an explicit status transition. */
  setStatus(id: string, status: TaskStatus): TaskManagerResult {
    this.ensureLoaded();
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index < 0) return { error: "Task not found" };

    const current = this.tasks[index];
    const now = this.now();
    current.status = status;
    if (status === "completed") {
      current.completedAt = now;
    } else if (current.status !== "completed") {
      current.completedAt = undefined;
    }
    current.updatedAt = now;

    this.persist();
    return { task: { ...current } };
  }

  complete(id: string): TaskManagerResult {
    return this.setStatus(id, "completed");
  }

  cancel(id: string): TaskManagerResult {
    return this.setStatus(id, "cancelled");
  }

  delete(id: string): { success: boolean; error?: string } {
    this.ensureLoaded();
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index < 0) return { success: false, error: "Task not found" };
    this.tasks.splice(index, 1);
    this.persist();
    return { success: true };
  }

  deleteAll(): { success: boolean; count: number } {
    this.ensureLoaded();
    const count = this.tasks.length;
    this.tasks = [];
    this.persist();
    return { success: true, count };
  }

  count(): number {
    this.ensureLoaded();
    return this.tasks.length;
  }

  // --------------------------------------------------------------- queries ---

  /** Open tasks (todo/in_progress), optionally filtered by status. */
  openTasks(status?: TaskStatus): Task[] {
    this.ensureLoaded();
    return this.tasks
      .filter((t) => {
        if (t.status === "completed" || t.status === "cancelled") return false;
        if (status !== undefined && t.status !== status) return false;
        return true;
      })
      .sort((a, b) => {
        const rank: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
        return (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2);
      });
  }

  /** Overdue tasks (open with dueAt in the past). */
  overdueTasks(now?: number): Task[] {
    this.ensureLoaded();
    const t = now ?? this.now();
    return this.tasks
      .filter((task) => task.status !== "completed" && task.status !== "cancelled" && task.dueAt !== undefined && task.dueAt < t)
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  }
}

let instance: TaskManager | null = null;

export function getTaskManager(): TaskManager {
  if (!instance) {
    instance = new TaskManager();
  }
  return instance;
}

export function resetTaskManager(): void {
  instance = null;
}

export function setTaskManager(manager: TaskManager | null): void {
  instance = manager;
}

export { InMemoryTaskStore };
