/**
 * JARVIS Personal Tasks — ToolRegistry Tools
 *
 * These tools let the model (and only the server) manage tasks. All inputs are
 * strictly validated server-side; the client cannot call tools.
 *
 * Tasks are data, never executable: fields are bounded and secret-free, and no
 * task field can become a command, path, or URL.
 *
 * Safety notes:
 *  - create_task/update_task are safe (data-only) but still validate everything.
 *  - delete_task is confirmation-gated so deletion always flows through the
 *    runtime confirmation system.
 *  - complete_task/cancel_task are reversible status transitions (safe).
 */

import type { ToolDefinition } from "@/lib/tools/types";
import { getTaskManager } from "./manager";

function statusSchemaHint(): Record<string, unknown> {
  return {
    type: "string",
    enum: ["todo", "in_progress", "completed", "cancelled"],
    description: "Filter by task status",
  };
}

export const CREATE_TASK_TOOL: ToolDefinition = {
  name: "create_task",
  description:
    "Create a task for the user's personal task list. If the user gives a vague or relative deadline, compute the concrete dueAt timestamp " +
    "and ask for confirmation only when genuinely ambiguous. Tasks are plain data — never commands.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short task title" },
      description: { type: "string", description: "Optional details" },
      priority: {
        type: "string",
        enum: ["low", "normal", "high", "urgent"],
        description: "Default normal",
      },
      dueAt: {
        type: "number",
        description: "Optional due date as a millisecond timestamp (use get_current_time when computing)",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Optional tags",
      },
    },
    required: ["title"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const manager = getTaskManager();
    const result = manager.create(input);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return {
      success: true,
      taskId: result.task?.id,
      task: {
        title: result.task?.title,
        status: result.task?.status,
        priority: result.task?.priority,
        dueAt: result.task?.dueAt,
      },
      message: `Task "${result.task?.title}" created.`,
    };
  },
};

export const LIST_TASKS_TOOL: ToolDefinition = {
  name: "list_tasks",
  description: "List tasks, optionally filtered by status. Open tasks are returned by priority.",
  inputSchema: {
    type: "object",
    properties: {
      status: statusSchemaHint(),
    },
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const status = input.status as "todo" | "in_progress" | undefined;
    const tasks = status ? getTaskManager().openTasks(status) : getTaskManager().openTasks();
    return { count: tasks.length, tasks };
  },
};

export const GET_TASK_TOOL: ToolDefinition = {
  name: "get_task",
  description: "Get a single task by id.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Task id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const found = getTaskManager().get(id);
    if (!found) {
      return { success: false, message: `Task '${id}' not found` };
    }
    return { success: true, task: found };
  },
};

export const UPDATE_TASK_TOOL: ToolDefinition = {
  name: "update_task",
  description: "Update a task's title, description, priority, dueAt, or tags. Use complete_task/cancel_task for status.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Task id" },
      title: { type: "string" },
      description: { type: "string" },
      priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
      dueAt: { type: "number" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const { title, description, priority, dueAt, tags } = input as {
      title?: string;
      description?: string;
      priority?: string;
      dueAt?: number;
      tags?: string[];
    };
    const patch: Record<string, unknown> = {};
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;
    if (priority !== undefined) patch.priority = priority;
    if (dueAt !== undefined) patch.dueAt = dueAt;
    if (tags !== undefined) patch.tags = tags;
    const result = getTaskManager().update(id, patch);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return { success: true, taskId: id, message: `Task "${result.task?.title}" updated.` };
  },
};

export const COMPLETE_TASK_TOOL: ToolDefinition = {
  name: "complete_task",
  description: "Mark a task as completed.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Task id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getTaskManager().complete(id);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return { success: true, taskId: id, message: `Task "${result.task?.title}" completed.` };
  },
};

export const CANCEL_TASK_TOOL: ToolDefinition = {
  name: "cancel_task",
  description: "Mark a task as cancelled (not completed).",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Task id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getTaskManager().cancel(id);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return { success: true, taskId: id, message: `Task "${result.task?.title}" cancelled.` };
  },
};

export const DELETE_TASK_TOOL: ToolDefinition = {
  name: "delete_task",
  description: "Delete a task. Requires user confirmation (confirmation-gated tool).",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Task id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getTaskManager().delete(id);
    if (!result.success) {
      return { success: false, message: result.error ?? "Task not found" };
    }
    return { success: true, taskId: id, message: "Task deleted." };
  },
};

/** All task management tools, registered by the shared registry. */
export function getTaskTools(): ToolDefinition[] {
  return [
    CREATE_TASK_TOOL,
    LIST_TASKS_TOOL,
    GET_TASK_TOOL,
    UPDATE_TASK_TOOL,
    COMPLETE_TASK_TOOL,
    CANCEL_TASK_TOOL,
    DELETE_TASK_TOOL,
  ];
}

export function taskToolNames(): string[] {
  return getTaskTools().map((t) => t.name);
}
