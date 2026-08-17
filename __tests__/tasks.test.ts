/**
 * JARVIS Personal Tasks — Tests
 *
 * Task validation (strict, secret-free, bounded), manager CRUD and status
 * transitions, model projections, and the task tool surface (data-only tools;
 * delete_task is confirmation-gated).
 */

import { TaskManager } from "@/lib/tasks/manager";
import { setTaskManager, getTaskManager } from "@/lib/tasks/manager";
import { InMemoryTaskStore } from "@/lib/tasks/store";
import { validateTaskInput, validateTaskUpdate, containsSecret } from "@/lib/tasks/validator";
import { isTaskLike, toTaskSummary, dueOrOverdueTasks, isTaskOpen } from "@/lib/tasks/model";
import { TASK_LIMITS, type Task } from "@/lib/tasks/types";
import {
  CREATE_TASK_TOOL,
  LIST_TASKS_TOOL,
  GET_TASK_TOOL,
  UPDATE_TASK_TOOL,
  COMPLETE_TASK_TOOL,
  CANCEL_TASK_TOOL,
  DELETE_TASK_TOOL,
} from "@/lib/tasks/tools";

const NOW = 1_700_000_000_000;

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Buy groceries",
    status: "todo",
    priority: "normal",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("tasks validator", () => {
  test("accepts a valid task input", () => {
    expect(validateTaskInput({ title: "Ship report", priority: "high", dueAt: NOW + 86_400_000 }).valid).toBe(true);
  });

  test("rejects unknown fields (client can never set id/status/timestamps)", () => {
    const result = validateTaskInput({ title: "x", status: "completed", id: "hack" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unknown task field 'status'");
  });

  test("rejects empty title, oversized title, and bad priority", () => {
    expect(validateTaskInput({ title: "   " }).valid).toBe(false);
    expect(validateTaskInput({ title: "x".repeat(TASK_LIMITS.MAX_TITLE + 1) }).valid).toBe(false);
    expect(validateTaskInput({ title: "x", priority: "asap" }).valid).toBe(false);
  });

  test("rejects invalid dueAt", () => {
    expect(validateTaskInput({ title: "x", dueAt: -5 }).valid).toBe(false);
    expect(validateTaskInput({ title: "x", dueAt: Number.NaN }).valid).toBe(false);
    expect(validateTaskInput({ title: "x", dueAt: 5e14 }).valid).toBe(false);
  });

  test("rejects secret-like content in any field", () => {
    expect(validateTaskInput({ title: "Store password for wifi" }).valid).toBe(false);
    expect(validateTaskInput({ title: "ok", description: "key: gsk_abcdefgh12345678" }).valid).toBe(false);
    expect(validateTaskInput({ title: "ok", tags: ["secret"] }).valid).toBe(false);
  });

  test("containsSecret detects key and value patterns", () => {
    expect(containsSecret("please reset my password").found).toBe(true);
    expect(containsSecret("token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc").found).toBe(true);
    expect(containsSecret("gsk_abcdefghijklmnopqrstuvwxyz123456").found).toBe(true);
    expect(containsSecret("just a normal note").found).toBe(false);
  });

  test("validates tag limits", () => {
    expect(validateTaskInput({ title: "x", tags: ["a", "b", "c"] }).valid).toBe(true);
    expect(validateTaskInput({ title: "x", tags: new Array(TASK_LIMITS.MAX_TAGS + 1).fill("a") }).valid).toBe(false);
    expect(validateTaskInput({ title: "x", tags: ["too long tag".repeat(10)] }).valid).toBe(false);
  });

  test("update patch only allows mutable fields and re-validates", () => {
    expect(validateTaskUpdate("t1", { title: "New title" }).valid).toBe(true);
    expect(validateTaskUpdate("t1", { status: "completed" }).valid).toBe(false);
    expect(validateTaskUpdate("t1", { id: "nope" }).valid).toBe(false);
    expect(validateTaskUpdate("t1", { priority: "urgent" }).valid).toBe(true);
  });
});

describe("tasks model", () => {
  test("isTaskLike validates stored records", () => {
    expect(isTaskLike(makeTask())).toBe(true);
    expect(isTaskLike({ ...makeTask(), status: "evil" })).toBe(false);
    expect(isTaskLike({ ...makeTask(), createdAt: "soon" })).toBe(false);
    expect(isTaskLike({ id: "x" })).toBe(false);
  });

  test("toTaskSummary never leaks internal fields", () => {
    const task = makeTask({ description: "internal", tags: ["home"] });
    const summary = toTaskSummary(task);
    expect(summary).not.toHaveProperty("description");
    expect(summary.tags).toEqual(["home"]);
  });

  test("dueOrOverdueTasks includes only open tasks due today or earlier", () => {
    const now = new Date(2023, 10, 15, 12, 0, 0).getTime();
    const overdue = makeTask({ id: "a", title: "overdue", dueAt: now - 60_000 });
    const today = makeTask({ id: "b", title: "today", dueAt: now + 60_000 });
    const later = makeTask({ id: "c", title: "later", dueAt: now + 8.64e7 * 2 });
    const done = makeTask({ id: "d", title: "done", status: "completed", dueAt: now - 60_000 });
    const result = dueOrOverdueTasks([later, done, today, overdue], now);
    expect(result.map((t) => t.id)).toEqual(["a", "b"]);
  });

  test("isTaskOpen excludes completed and cancelled", () => {
    expect(isTaskOpen(makeTask())).toBe(true);
    expect(isTaskOpen(makeTask({ status: "completed" }))).toBe(false);
    expect(isTaskOpen(makeTask({ status: "cancelled" }))).toBe(false);
  });
});

describe("tasks manager", () => {
  let store: InMemoryTaskStore;
  let manager: TaskManager;

  beforeEach(() => {
    store = new InMemoryTaskStore();
    manager = new TaskManager({ store, now: () => NOW });
    setTaskManager(manager);
  });

  afterEach(() => {
    setTaskManager(null);
  });

  test("create persists defaults and trims title", () => {
    const created = manager.create({ title: "  Write notes  ", priority: "high", dueAt: NOW + 1000, tags: ["dev"] });
    expect(created.error).toBeUndefined();
    const task = created.task!;
    expect(task.title).toBe("Write notes");
    expect(task.status).toBe("todo");
    expect(task.priority).toBe("high");
    expect(task.id).toMatch(/^task-/);
    expect(manager.count()).toBe(1);
    expect(store.raw).toHaveLength(1);
  });

  test("create rejects invalid input without mutating state", () => {
    const before = manager.count();
    const result = manager.create({ title: "", status: "completed" });
    expect(result.error).toBeDefined();
    expect(manager.count()).toBe(before);
  });

  test("enforces the maximum task count", () => {
    for (let i = 0; i < TASK_LIMITS.MAX_TASKS; i += 1) {
      expect(manager.create({ title: `t${i}` }).error).toBeUndefined();
    }
    const overflow = manager.create({ title: "overflow" });
    expect(overflow.error).toContain("Maximum");
  });

  test("update mutates only allowed fields", () => {
    const { task } = manager.create({ title: "a" });
    const updated = manager.update(task!.id, { title: "b", priority: "urgent", dueAt: NOW + 5 });
    expect(updated.error).toBeUndefined();
    expect(updated.task?.title).toBe("b");
    expect(updated.task?.priority).toBe("urgent");
    expect(updated.task?.updatedAt).toBe(NOW);
  });

  test("update rejects unknown fields and unknown ids", () => {
    const { task } = manager.create({ title: "a" });
    expect(manager.update(task!.id, { status: "completed" }).error).toContain("Unknown");
    expect(manager.update("missing", { title: "x" }).error).toBe("Task not found");
  });

  test("complete sets completedAt; cancel clears it; undo clears it again", () => {
    const { task } = manager.create({ title: "a" });
    const done = manager.complete(task!.id);
    expect(done.task?.status).toBe("completed");
    expect(done.task?.completedAt).toBe(NOW);
    const undone = manager.setStatus(task!.id, "todo");
    expect(undone.task?.completedAt).toBeUndefined();
    const cancelled = manager.cancel(task!.id);
    expect(cancelled.task?.status).toBe("cancelled");
  });

  test("delete removes and reports missing ids", () => {
    const { task } = manager.create({ title: "a" });
    expect(manager.delete(task!.id)).toEqual({ success: true });
    expect(manager.count()).toBe(0);
    expect(manager.delete("missing").success).toBe(false);
  });

  test("openTasks sorts by priority (urgent first) and skips finished tasks", () => {
    manager.create({ title: "low", priority: "low" });
    manager.create({ title: "urgent", priority: "urgent" });
    const done = manager.create({ title: "done", priority: "urgent" });
    manager.complete(done.task!.id);
    const open = manager.openTasks();
    expect(open.map((t) => t.title)).toEqual(["urgent", "low"]);
  });

  test("overdueTasks returns open tasks with dueAt in the past", () => {
    const past = manager.create({ title: "past", dueAt: NOW - 1 });
    manager.create({ title: "future", dueAt: NOW + 1 });
    manager.create({ title: "none" });
    const overdue = manager.overdueTasks(NOW);
    expect(overdue.map((t) => t.id)).toEqual([past.task!.id]);
  });

  test("deleteAll clears the store", () => {
    manager.create({ title: "a" });
    manager.create({ title: "b" });
    expect(manager.deleteAll().count).toBe(2);
    expect(manager.count()).toBe(0);
  });
});

describe("tasks tools", () => {
  beforeEach(() => {
    setTaskManager(new TaskManager({ store: new InMemoryTaskStore(), now: () => NOW }));
  });

  afterEach(() => {
    setTaskManager(null);
  });

  test("create_task executes and returns a bounded projection", async () => {
    const result = await CREATE_TASK_TOOL.execute({ title: "Plan trip", priority: "high" });
    expect(result.success).toBe(true);
    expect(result.task?.title).toBe("Plan trip");
    expect(result.task).not.toHaveProperty("description");
  });

  test("create_task surfaces validation errors", async () => {
    const result = await CREATE_TASK_TOOL.execute({ title: "my api key is gsk_abcdefgh12345678" });
    expect(result.success).toBe(false);
  });

  test("list_tasks filters by status and returns summaries", async () => {
    const created = await CREATE_TASK_TOOL.execute({ title: "a" });
    const id = created.taskId as string;
    await COMPLETE_TASK_TOOL.execute({ id });
    const open = await LIST_TASKS_TOOL.execute({});
    expect(open.count).toBe(0);
    const todo = await LIST_TASKS_TOOL.execute({ status: "todo" });
    expect(todo.count).toBe(0);
    expect(getTaskManager().count()).toBe(1);
  });

  test("get_task, update_task, complete_task, cancel_task round-trip", async () => {
    const created = await CREATE_TASK_TOOL.execute({ title: "a" });
    const id = created.taskId as string;
    expect((await GET_TASK_TOOL.execute({ id })).success).toBe(true);
    expect((await UPDATE_TASK_TOOL.execute({ id, title: "b" })).success).toBe(true);
    expect((await COMPLETE_TASK_TOOL.execute({ id })).success).toBe(true);
    expect((await CANCEL_TASK_TOOL.execute({ id })).success).toBe(true);
    const after = await GET_TASK_TOOL.execute({ id });
    expect(after.task?.status).toBe("cancelled");
  });

  test("gated tools require confirmation and deletes report missing ids", async () => {
    expect(DELETE_TASK_TOOL.requiresUserConfirmation).toBe(true);
    expect(DELETE_TASK_TOOL.riskLevel).toBe("confirmation");
    expect((await DELETE_TASK_TOOL.execute({ id: "nope" })).success).toBe(false);
  });

  test("all task tools are safe data operations (never commands)", () => {
    for (const tool of [CREATE_TASK_TOOL, LIST_TASKS_TOOL, GET_TASK_TOOL, UPDATE_TASK_TOOL, COMPLETE_TASK_TOOL, CANCEL_TASK_TOOL]) {
      expect(tool.riskLevel).toBe("safe");
    }
  });
});
