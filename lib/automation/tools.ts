/**
 * JARVIS Automation — ToolRegistry Tools
 *
 * These tools let the model (and only the server) manage automations. All
 * inputs are strictly validated server-side; the client cannot call tools.
 *
 * Safety notes:
 *  - create_automation requires explicitApproval:true — the model is
 *    instructed to only set it when the user explicitly requested a concrete
 *    schedule/condition, and to ask a clarifying question otherwise.
 *  - delete_automation is confirmation-gated (requiresUserConfirmation), so
 *    deletion always flows through the runtime confirmation system.
 *  - Every automation action references a registered tool by ID; automations
 *    themselves are validated by lib/automation/validator.ts.
 */

import type { ToolDefinition } from "@/lib/tools/types";
import { getAutomationManager } from "./manager";

function triggerSchemaHint(): Record<string, unknown> {
  return {
    type: "object",
    description:
      "Trigger: {type:'once'|'daily'|'weekly'|'interval'|'condition', ...}. " +
      "daily: {type:'daily', at:'HH:MM'}; weekly: {type:'weekly', at:'HH:MM', dayOfWeek:0-6}; " +
      "interval: {type:'interval', minutes:N}; " +
      "once: {type:'once', at:'HH:MM'}; " +
      "condition: {type:'condition', metric:'battery'|'cpu'|'memory'|'disk'|'application', operator:'<'|'<='|'>'|'>='|'=='|'running'|'not_running', value:number|string}",
    properties: { type: { type: "string" } },
    required: ["type"],
    additionalProperties: true,
  };
}

function actionSchemaHint(): Record<string, unknown> {
  return {
    type: "object",
    description:
      "Action: {toolId:'get_cpu_usage'|'get_battery_status'|'get_memory_usage'|'get_disk_usage'|'get_system_summary'|'get_running_applications'|'get_frontmost_application'|'get_active_window'|'notify_user'|'recall_user_memory'|'launch_application'|'open_folder'|... , arguments:{}}. " +
      "Control tools (launch_application, open_folder, etc.) will require user confirmation at execution time.",
    properties: { toolId: { type: "string" }, arguments: { type: "object" } },
    required: ["toolId", "arguments"],
    additionalProperties: false,
  };
}

export const CREATE_AUTOMATION_TOOL: ToolDefinition = {
  name: "create_automation",
  description:
    "Create a new user-authorized automation. Use ONLY when the user explicitly requested a concrete schedule or condition " +
    "(e.g. 'every morning at 9 AM tell me the CPU usage' or 'notify me when battery drops below 20%'). " +
    "If the request is vague (e.g. 'monitor my battery'), do NOT call this tool — ask a clarifying question instead. " +
    "Set explicitApproval to true ONLY when the user's latest message explicitly requested this schedule/condition.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short name for the automation, e.g. 'Morning CPU check'" },
      description: { type: "string", description: "Optional one-line description" },
      trigger: triggerSchemaHint(),
      action: actionSchemaHint(),
      explicitApproval: {
        type: "boolean",
        description: "Must be true. Set only when the user explicitly requested this schedule/condition.",
      },
    },
    required: ["name", "trigger", "action", "explicitApproval"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    if (input.explicitApproval !== true) {
      return {
        success: false,
        message:
          "I can create an automation only when you explicitly ask for a specific schedule or condition. What exactly would you like?",
      };
    }
    const manager = getAutomationManager();
    const { name, description, trigger, action } = input as {
      name: string;
      description?: string;
      trigger: unknown;
      action: unknown;
    };
    const result = manager.create({ name, description, trigger, action });
    if (result.error) {
      return { success: false, message: result.error };
    }
    return {
      success: true,
      automationId: result.automation?.id,
      automation: {
        name: result.automation?.name,
        trigger: result.automation?.trigger,
        action: { toolId: result.automation?.action.toolId },
      },
      message: `Automation "${result.automation?.name}" created.`,
    };
  },
};

export const LIST_AUTOMATIONS_TOOL: ToolDefinition = {
  name: "list_automations",
  description: "List all automations (id, name, enabled, trigger, next run, action tool).",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const automations = getAutomationManager().list();
    return { count: automations.length, automations };
  },
};

export const GET_AUTOMATION_TOOL: ToolDefinition = {
  name: "get_automation",
  description: "Get a single automation by id.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Automation id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const manager = getAutomationManager();
    const found = manager.get(id);
    if (!found) {
      return { success: false, message: `Automation '${id}' not found` };
    }
    return { success: true, automation: found };
  },
};

export const UPDATE_AUTOMATION_TOOL: ToolDefinition = {
  name: "update_automation",
  description:
    "Update an automation's name, description, trigger, or action. Enabled state is managed with enable_automation/disable_automation.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Automation id" },
      name: { type: "string" },
      description: { type: "string" },
      trigger: triggerSchemaHint(),
      action: actionSchemaHint(),
    },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const { name, description, trigger, action } = input as {
      name?: string;
      description?: string;
      trigger?: unknown;
      action?: unknown;
    };
    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (trigger !== undefined) patch.trigger = trigger;
    if (action !== undefined) patch.action = action;
    const result = getAutomationManager().update(id, patch);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return { success: true, automationId: id, message: `Automation "${result.automation?.name}" updated.` };
  },
};

export const ENABLE_AUTOMATION_TOOL: ToolDefinition = {
  name: "enable_automation",
  description: "Enable an automation so it can run again.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Automation id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getAutomationManager().enable(id);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return { success: true, automationId: id, message: `Automation "${result.automation?.name}" enabled.` };
  },
};

export const DISABLE_AUTOMATION_TOOL: ToolDefinition = {
  name: "disable_automation",
  description: "Disable an automation so it stops running until re-enabled.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Automation id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getAutomationManager().disable(id);
    if (result.error) {
      return { success: false, message: result.error };
    }
    return { success: true, automationId: id, message: `Automation "${result.automation?.name}" disabled.` };
  },
};

export const DISABLE_ALL_AUTOMATIONS_TOOL: ToolDefinition = {
  name: "disable_all_automations",
  description: "Disable all automations at once. Safe (never deletes anything).",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const { count } = getAutomationManager().disableAll();
    return { success: true, disabled: count, message: `${count} automation(s) disabled.` };
  },
};

export const DELETE_AUTOMATION_TOOL: ToolDefinition = {
  name: "delete_automation",
  description: "Delete an automation. Requires user confirmation (confirmation-gated tool).",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Automation id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const result = getAutomationManager().delete(id);
    if (!result.success) {
      return { success: false, message: result.error ?? "Automation not found" };
    }
    return { success: true, automationId: id, message: "Automation deleted." };
  },
};

export const RUN_AUTOMATION_NOW_TOOL: ToolDefinition = {
  name: "run_automation_now",
  description:
    "Run an automation immediately. Gated actions inside the automation still require user confirmation at execution time.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Automation id" } },
    required: ["id"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const id = String(input.id ?? "");
    const outcome = await getAutomationManager().executeAutomation(id);
    return {
      success: outcome.status === "executed" || outcome.status === "waiting_for_confirmation",
      status: outcome.status,
      message: outcome.message,
      pendingConfirmationId: outcome.pendingConfirmationId,
    };
  },
};

/** All automation management tools, registered by the shared registry. */
export function getAutomationTools(): ToolDefinition[] {
  return [
    CREATE_AUTOMATION_TOOL,
    LIST_AUTOMATIONS_TOOL,
    GET_AUTOMATION_TOOL,
    UPDATE_AUTOMATION_TOOL,
    ENABLE_AUTOMATION_TOOL,
    DISABLE_AUTOMATION_TOOL,
    DISABLE_ALL_AUTOMATIONS_TOOL,
    DELETE_AUTOMATION_TOOL,
    RUN_AUTOMATION_NOW_TOOL,
  ];
}

export function automationToolNames(): string[] {
  return getAutomationTools().map((t) => t.name);
}
