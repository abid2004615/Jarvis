/**
 * JARVIS Personal Reminders — ToolRegistry Tools
 *
 * These tools let the model (and only the server) manage reminders. All inputs
 * are strictly validated server-side; the client cannot call tools.
 *
 * Safety notes:
 *  - create_reminder requires an explicit, concrete dueAt. The model is
 *    instructed to compute concrete timestamps from natural language using
 *    get_current_time, and to ask a clarifying question when ambiguous.
 *  - Reminders are data: firing only ever pushes a bounded notification.
 *  - delete_reminder is confirmation-gated so deletion always flows through
 *    the runtime confirmation system.
 */

import type { ToolDefinition } from "@/lib/tools/types";
import { getReminderManager } from "./manager";

function repeatSchemaHint(): Record<string, unknown> {
  return {
    type: "string",
    enum: ["none", "daily", "weekly"],
    description: "'none' fires once; 'daily'/'weekly' reschedule after firing",
  };
}

export const CREATE_REMINDER_TOOL: ToolDefinition = {
  name: "create_reminder",
  description:
    "Create a reminder that notifies the user at a specific time. dueAt must be a concrete millisecond timestamp " +
    "(use get_current_time to compute). Repeat reschedules after firing. Optionally link to a taskId. " +
    "Ask a clarifying question when the time is ambiguous.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "What to remind about" },
      dueAt: {
        type: "number",
        description: "When to notify, as a millisecond timestamp (must be computed concretely)",
      },
      repeat: repeatSchemaHint(),
      taskId: { type: "string", description: "Optional linked task id" },
    },
    required: ["title", "dueAt"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const result = getReminderManager().create(input);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return {
      success: true,
      reminderId: result.reminder?.id,
      reminder: {
        title: result.reminder?.title,
        dueAt: result.reminder?.dueAt,
        repeat: result.reminder?.repeat,
      },
      message: `Reminder "${result.reminder?.title}" set for ${new Date(result.reminder?.dueAt ?? 0).toLocaleString()}.`,
    };
  },
};

export const LIST_REMINDERS_TOOL: ToolDefinition = {
  name: "list_reminders",
  description: "List reminders, optionally only upcoming (enabled) ones.",
  inputSchema: {
    type: "object",
    properties: {
      upcomingOnly: {
        type: "boolean",
        description: "When true, only enabled reminders with a future dueAt",
      },
    },
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const now = Date.now();
    const upcomingOnly = input.upcomingOnly === true;
    const reminders = getReminderManager().getAll().filter((r) => {
      if (upcomingOnly && (!r.enabled || r.dueAt <= now)) return false;
      return true;
    });
    return { count: reminders.length, reminders };
  },
};

export const GET_REMINDER_TOOL: ToolDefinition = {
  name: "get_reminder",
  description: "Get a single reminder by id.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Reminder id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const found = getReminderManager().get(id);
    if (!found) {
      return { success: false, message: `Reminder '${id}' not found` };
    }
    return { success: true, reminder: found };
  },
};

export const UPDATE_REMINDER_TOOL: ToolDefinition = {
  name: "update_reminder",
  description: "Update a reminder's title, dueAt, repeat, taskId, or enabled state.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Reminder id" },
      title: { type: "string" },
      dueAt: { type: "number" },
      repeat: repeatSchemaHint(),
      taskId: { type: "string" },
      enabled: { type: "boolean" },
    },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const { title, dueAt, repeat, taskId, enabled } = input as {
      title?: string;
      dueAt?: number;
      repeat?: string;
      taskId?: string;
      enabled?: boolean;
    };
    const patch: Record<string, unknown> = {};
    if (title !== undefined) patch.title = title;
    if (dueAt !== undefined) patch.dueAt = dueAt;
    if (repeat !== undefined) patch.repeat = repeat;
    if (taskId !== undefined) patch.taskId = taskId;
    if (enabled !== undefined) patch.enabled = enabled;
    const result = getReminderManager().update(id, patch);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return { success: true, reminderId: id, message: `Reminder "${result.reminder?.title}" updated.` };
  },
};

export const CANCEL_REMINDER_TOOL: ToolDefinition = {
  name: "cancel_reminder",
  description: "Disable a reminder so it will not fire again.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Reminder id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getReminderManager().disable(id);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return { success: true, reminderId: id, message: `Reminder "${result.reminder?.title}" cancelled.` };
  },
};

export const DELETE_REMINDER_TOOL: ToolDefinition = {
  name: "delete_reminder",
  description: "Delete a reminder. Requires user confirmation (confirmation-gated tool).",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Reminder id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getReminderManager().delete(id);
    if (!result.success) {
      return { success: false, message: result.error ?? "Reminder not found" };
    }
    return { success: true, reminderId: id, message: "Reminder deleted." };
  },
};

/** All reminder management tools, registered by the shared registry. */
export function getReminderTools(): ToolDefinition[] {
  return [
    CREATE_REMINDER_TOOL,
    LIST_REMINDERS_TOOL,
    GET_REMINDER_TOOL,
    UPDATE_REMINDER_TOOL,
    CANCEL_REMINDER_TOOL,
    DELETE_REMINDER_TOOL,
  ];
}

export function reminderToolNames(): string[] {
  return getReminderTools().map((t) => t.name);
}
